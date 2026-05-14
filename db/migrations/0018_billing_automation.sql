-- [CC-FOUNDATION] Recurring invoices, public pay links, overdue reminders.
-- Builds on 0016_invoicing.sql. Service-role only; tenants never read these
-- tables directly. All cross-table refs are tenant-coupled. Stripe-related
-- columns are nullable so the schema is usable before Stripe credentials land.

create type cc_recurring_frequency as enum ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly');

create table if not exists cc_recurring_invoice_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  company_id uuid references companies(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  frequency cc_recurring_frequency not null,
  next_run_at timestamptz not null,
  active boolean not null default true,
  template jsonb not null default '{}'::jsonb,
  last_invoice_id uuid references cc_invoices(id) on delete set null,
  last_run_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cc_recurring_schedule_id_tenant_unique unique (id, tenant_id)
);

create index if not exists cc_recurring_schedule_due_idx
  on cc_recurring_invoice_schedules (next_run_at)
  where active = true and deleted_at is null;

create index if not exists cc_recurring_schedule_tenant_idx
  on cc_recurring_invoice_schedules (tenant_id, active, next_run_at)
  where deleted_at is null;

alter table cc_recurring_invoice_schedules enable row level security;
revoke all on cc_recurring_invoice_schedules from anon, authenticated;

create trigger cc_recurring_schedule_updated_at
  before update on cc_recurring_invoice_schedules
  for each row execute function set_updated_at();

-- Stripe payment metadata on cc_invoices. Nullable so the column drops in
-- before any Stripe credentials are configured.
alter table cc_invoices
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_checkout_session_id text;

create unique index if not exists cc_invoices_stripe_payment_intent_unique
  on cc_invoices (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- Token-based public payment page (mirrors cc_signature_requests).
-- A 64-char hex token is the only authorization a customer presents to the
-- public /pay/[token] page; rate-limited and expiring with the invoice's
-- due_date + 90 days.
create table if not exists cc_invoice_payment_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  invoice_id uuid not null,
  token text not null unique check (length(token) = 64),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint cc_invoice_payment_links_invoice_tenant_fkey
    foreign key (invoice_id, tenant_id)
    references cc_invoices (id, tenant_id)
    on delete cascade
);

create index if not exists cc_invoice_payment_links_invoice_idx
  on cc_invoice_payment_links (invoice_id);

-- One active (unused, unexpired) link per invoice. A second issuance just
-- re-uses the existing live link instead of cluttering the table.
create unique index if not exists cc_invoice_payment_links_one_active_per_invoice
  on cc_invoice_payment_links (tenant_id, invoice_id)
  where used_at is null;

alter table cc_invoice_payment_links enable row level security;
revoke all on cc_invoice_payment_links from anon, authenticated;

-- Reminder audit trail. Inserted by the overdue cron job on every send;
-- the (invoice_id, kind, sent_on_date) unique key prevents duplicate
-- reminders if the cron job double-fires within the same UTC day.
create table if not exists cc_invoice_reminders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  invoice_id uuid not null,
  kind text not null check (kind in ('overdue_1', 'overdue_7', 'overdue_14', 'overdue_30')),
  sent_at timestamptz not null default now(),
  sent_on_date date not null default (now() at time zone 'utc')::date,
  channel text not null check (channel in ('email', 'sms', 'none')),
  delivery_status text not null default 'sent' check (delivery_status in ('sent', 'failed', 'skipped_no_channel')),
  delivery_error text,
  constraint cc_invoice_reminders_invoice_tenant_fkey
    foreign key (invoice_id, tenant_id)
    references cc_invoices (id, tenant_id)
    on delete cascade
);

create unique index if not exists cc_invoice_reminders_one_per_kind_per_day
  on cc_invoice_reminders (invoice_id, kind, sent_on_date);

create index if not exists cc_invoice_reminders_invoice_idx
  on cc_invoice_reminders (invoice_id, sent_at desc);

alter table cc_invoice_reminders enable row level security;
revoke all on cc_invoice_reminders from anon, authenticated;
