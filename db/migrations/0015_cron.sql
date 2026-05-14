-- [CC-FOUNDATION] Cron audit trail.
-- Every scheduled job records a row here at start and on completion. The
-- (job_name, idempotency_key) unique index lets the runner safely retry on
-- transient failure without double-executing side effects.

create type cc_cron_status as enum ('running', 'succeeded', 'failed', 'skipped');

create table if not exists cc_cron_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  idempotency_key text not null,
  tenant_id uuid references tenants(id) on delete cascade,
  status cc_cron_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb
);

create unique index if not exists cc_cron_runs_job_idem_unique
  on cc_cron_runs (job_name, idempotency_key);

create index if not exists cc_cron_runs_started_at_idx
  on cc_cron_runs (started_at desc);

create index if not exists cc_cron_runs_tenant_started_idx
  on cc_cron_runs (tenant_id, started_at desc)
  where tenant_id is not null;

alter table cc_cron_runs enable row level security;
revoke all on cc_cron_runs from anon, authenticated;
-- Cron audit is service-role only; tenants never read it directly.
