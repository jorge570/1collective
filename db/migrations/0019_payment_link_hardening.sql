-- [CC-FOUNDATION] Hardens cc_invoice_payment_links against three classes of bug
-- found in code review of 0018:
--   1. Replayable POST /api/pay/[token]/checkout could create multiple Stripe
--      Checkout Sessions per invoice; we now persist session id on the link
--      and use Stripe idempotency keys.
--   2. Re-issuing a pay link after expiry violated the one-active-per-invoice
--      unique index because the predicate only excluded `used_at`. Adds
--      `revoked_at` so expired links can be explicitly revoked before insert.
--   3. Provides an explicit `claimed_at` timestamp for observability.

alter table cc_invoice_payment_links
  add column if not exists revoked_at timestamptz,
  add column if not exists claimed_at timestamptz,
  add column if not exists stripe_checkout_session_id text;

drop index if exists cc_invoice_payment_links_one_active_per_invoice;

create unique index if not exists cc_invoice_payment_links_one_active_per_invoice
  on cc_invoice_payment_links (tenant_id, invoice_id)
  where used_at is null and revoked_at is null;

create index if not exists cc_invoice_payment_links_session_idx
  on cc_invoice_payment_links (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- Side-channel for the Stripe webhook to flag overpayment / partial-apply
-- conditions on an integration_events row without losing the original
-- payload. Read by ops dashboards (Phase 11 audit log viewer).
alter table integration_events
  add column if not exists payload_extras jsonb;

create index if not exists integration_events_needs_attention_idx
  on integration_events (provider, status)
  where status = 'needs_attention';
