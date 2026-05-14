-- [CC-FOUNDATION] Invoicing: schema + atomic per-tenant per-year numbering.
-- Mirrors the estimating tables and counter pattern (0013 + 0014). Adds an
-- optional source_estimate_id so accepted estimates can be converted into a
-- draft invoice without losing the link back to where the work was won.

create type cc_invoice_status as enum (
  'draft',
  'sent',
  'partial',
  'paid',
  'overdue',
  'void'
);

create table if not exists cc_invoice_number_counters (
  tenant_id uuid not null references tenants(id) on delete cascade,
  year integer not null check (year between 2000 and 9999),
  last_seq integer not null default 0 check (last_seq >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, year)
);

alter table cc_invoice_number_counters enable row level security;
revoke all on cc_invoice_number_counters from anon, authenticated;

create or replace function cc_next_invoice_seq(p_tenant uuid, p_year integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq integer;
begin
  insert into cc_invoice_number_counters as c (tenant_id, year, last_seq)
  values (p_tenant, p_year, 1)
  on conflict (tenant_id, year) do update
    set last_seq = c.last_seq + 1,
        updated_at = now()
  returning c.last_seq into v_seq;
  return v_seq;
end
$$;

revoke all on function cc_next_invoice_seq(uuid, integer) from public, anon, authenticated;
grant execute on function cc_next_invoice_seq(uuid, integer) to service_role;

create table if not exists cc_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  invoice_number text not null,
  title text not null check (length(title) between 1 and 200),
  company_id uuid references companies(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  source_estimate_id uuid references cc_estimates(id) on delete set null,
  status cc_invoice_status not null default 'draft',
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  tax_rate_bps integer not null default 0 check (tax_rate_bps between 0 and 10000),
  tax_cents bigint not null default 0 check (tax_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  amount_paid_cents bigint not null default 0 check (amount_paid_cents >= 0),
  due_date date,
  sent_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  notes text,
  terms text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cc_invoices_number_per_tenant_unique unique (tenant_id, invoice_number),
  constraint cc_invoices_id_tenant_unique unique (id, tenant_id)
);

create index if not exists cc_invoices_tenant_status_idx
  on cc_invoices (tenant_id, status, created_at desc)
  where deleted_at is null;

alter table cc_invoices enable row level security;
revoke all on cc_invoices from anon, authenticated;

create trigger cc_invoices_updated_at
  before update on cc_invoices
  for each row execute function set_updated_at();

create table if not exists cc_invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null,
  tenant_id uuid not null references tenants(id) on delete cascade,
  position integer not null default 0,
  description text not null check (length(description) between 1 and 500),
  quantity numeric(12,4) not null check (quantity > 0),
  unit text not null default 'ea' check (length(unit) between 1 and 16),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  created_at timestamptz not null default now(),
  constraint cc_invoice_line_items_invoice_tenant_fkey
    foreign key (invoice_id, tenant_id)
    references cc_invoices (id, tenant_id)
    on delete cascade
);

create index if not exists cc_invoice_line_items_invoice_idx
  on cc_invoice_line_items (invoice_id, position);

alter table cc_invoice_line_items enable row level security;
revoke all on cc_invoice_line_items from anon, authenticated;

-- Race-safe idempotency for estimate -> invoice conversion: at most one
-- non-deleted invoice per source_estimate_id per tenant. Without this,
-- two concurrent "Convert to invoice" clicks could both pass the
-- maybeSingle() existence check and double-bill the customer.
create unique index if not exists cc_invoices_one_active_per_source_estimate
  on cc_invoices (tenant_id, source_estimate_id)
  where source_estimate_id is not null and deleted_at is null;

-- Atomic payment recording. Read-modify-write in app code can race under
-- concurrent payments and overwrite amount_paid_cents. This function does
-- the bounds check + balance update + status flip in a single statement
-- under row-level lock, so two simultaneous "Record payment" clicks
-- always observe a consistent total.
create or replace function cc_record_invoice_payment(
  p_invoice_id uuid,
  p_tenant_id uuid,
  p_delta_cents bigint
)
returns table (amount_paid_cents bigint, total_cents bigint, status cc_invoice_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_paid bigint;
begin
  if p_delta_cents <= 0 then
    raise exception 'payment must be positive' using errcode = '22023';
  end if;

  select i.total_cents, i.amount_paid_cents
    into v_total, v_paid
    from cc_invoices i
    where i.id = p_invoice_id and i.tenant_id = p_tenant_id and i.deleted_at is null
    for update;

  if not found then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;

  if v_paid + p_delta_cents > v_total then
    raise exception 'payment exceeds remaining balance' using errcode = '22003';
  end if;

  update cc_invoices i
    set amount_paid_cents = v_paid + p_delta_cents,
        status = case
          when v_paid + p_delta_cents = v_total then 'paid'::cc_invoice_status
          when v_paid + p_delta_cents > 0 then 'partial'::cc_invoice_status
          else i.status
        end,
        paid_at = case
          when v_paid + p_delta_cents = v_total then now()
          else i.paid_at
        end
    where i.id = p_invoice_id and i.tenant_id = p_tenant_id
    returning i.amount_paid_cents, i.total_cents, i.status
    into amount_paid_cents, total_cents, status;
  return next;
end
$$;

revoke all on function cc_record_invoice_payment(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function cc_record_invoice_payment(uuid, uuid, bigint) to service_role;
