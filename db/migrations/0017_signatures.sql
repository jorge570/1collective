-- [CC-FOUNDATION] E-signature requests (Phase 4).
-- Polymorphic: a row can target either an estimate (cc_estimates) or a change
-- order (future). For now only estimate signing is wired in the UI.
-- Per-tenant isolation enforced everywhere; the public /sign/[token] flow uses
-- the service role and filters by token, so RLS stays defense-in-depth.

create type cc_signature_target_type as enum ('estimate', 'change_order');

create type cc_signature_status as enum (
  'pending',
  'signed',
  'declined',
  'voided',
  'expired'
);

create table if not exists cc_signature_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  target_type cc_signature_target_type not null,
  target_id uuid not null,
  target_label text not null check (length(target_label) between 1 and 200),
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  description text,
  token text not null check (length(token) = 64),
  signer_email text,
  signer_phone text,
  status cc_signature_status not null default 'pending',
  sent_at timestamptz not null default now(),
  expires_at timestamptz,
  signed_at timestamptz,
  signed_by_name text,
  signed_ip inet,
  signature_data_uri text,
  declined_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint cc_signature_requests_status_invariants check (
    (status = 'signed'
       and signed_at is not null
       and signature_data_uri is not null
       and declined_at is null
       and voided_at is null)
    or (status = 'declined'
       and declined_at is not null
       and signed_at is null
       and voided_at is null)
    or (status = 'voided'
       and voided_at is not null
       and signed_at is null)
    or (status in ('pending', 'expired')
       and signed_at is null
       and declined_at is null
       and voided_at is null)
  )
);

create unique index cc_signature_requests_token_unique on cc_signature_requests(token);
create unique index cc_signature_requests_one_pending_per_target
  on cc_signature_requests(target_type, target_id)
  where status = 'pending';
create index cc_signature_requests_tenant_idx on cc_signature_requests(tenant_id, created_at desc);
create index cc_signature_requests_target_idx on cc_signature_requests(target_type, target_id);

alter table cc_signature_requests enable row level security;
revoke all on cc_signature_requests from anon, authenticated;

create policy cc_signature_requests_tenant_select on cc_signature_requests
  for select using (tenant_id = current_tenant_id());
