# Pre-publish blockers

Tracks every item that must be resolved before `1collective` can be published
to a real customer environment. This list is the merge gate referenced from
`docs/BUILD_PLAN.md`. Each row says exactly what is missing, what unblocks it,
and which build phase it belongs to.

## How to read this file

- **Status** — `BLOCKED` (waiting on a credential/manual step the user must
  perform), `TODO` (code work I can do unattended once unblocked), `READY` (in
  the codebase, just needs verification before publish).
- **Owner** — `user` (you must do it; usually adding a secret) or `agent`
  (I can do it once the predecessor is unblocked).
- **Phase** — corresponds to `docs/BUILD_PLAN.md`.

---

## 1. Credentials and one-time setup the user must provide

| # | Status   | Phase | What                                                                                                | How to unblock                                                                                                                                                   |
| - | -------- | ----- | --------------------------------------------------------------------------------------------------- | -----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1 | BLOCKED  | 1.0   | Apply migrations `0011`–`0018` to the live Supabase database (creates `cc_estimates`, counters, `cc_cron_runs`, e-sign, billing automation tables, etc.) | Add `SUPABASE_DB_URL` secret (Postgres connection string from Supabase project settings → Database → Connection string → URI). I will then run the migrations.  |
| 2 | BLOCKED  | 1.1   | Cron dispatcher returns 503 in dev because the shared secret is unset.                              | Generate `openssl rand -base64 32` and save as `CRON_SHARED_SECRET` in Replit Secrets.                                                                            |
| 3 | BLOCKED  | 2.2   | Estimate "send" email cannot be delivered.                                                          | Add `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` (a verified sender on your Resend domain).                                                                          |
| 4 | BLOCKED  | 3.2   | Subscription billing (Stripe Checkout, webhook, Customer Portal) cannot run.                        | Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_STANDARD`. After the webhook is deployed, register its URL in Stripe and paste the signing secret. |
| 5 | BLOCKED  | 6     | OAuth providers (QuickBooks Online, Google, Meta, Vapi) for tenant integrations.                    | Each provider needs its own `*_CLIENT_ID` / `*_CLIENT_SECRET` set when that integration is turned on. Tracked in `src/foundational/registry.ts`.                  |
| 6 | BLOCKED  | 9     | AI features (Daniella receptionist, Serana follow-up, Amber social).                                | Add `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY`, plus per-feature provider keys (Vapi, Twilio) when those modules are enabled.                                    |

## 2. Code work I can do unattended (no user action required)

| # | Status | Phase | What                                                                                                                | Notes                                                                                                                                                |
| - | ------ | ----- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| A | DONE   | 4     | Public e-signature page at `/sign/[token]` with accept/decline/SVG signature capture, IP+UA capture, status invariant. Migration 0017 + `src/lib/signatures/*` + `src/app/sign/[token]` + `src/app/api/sign/[token]/{accept,decline}`. Estimate detail page exposes Send-for-signature with optional email/phone; delivery degrades cleanly when Resend/Twilio creds are blank. **Open follow-ups:** signed PDF snapshot to Vault, change-order target_type wiring, audit trail UI. |
| B | DONE   | 2.3   | "Convert to invoice" button on accepted estimates (creates a draft invoice). Wired in `src/lib/invoicing/actions.ts` + estimate detail page. |                                                                                                                                                |
| C | DONE   | 3.1   | Invoice module: schema (migrations 0016/0018) + atomic numbering counter + builder UI + branded PDF.                | Reuses `src/lib/pdf/document-pdf.ts` and the same counter pattern as estimating.                                                                  |
| D | DONE   | 3.2   | Stripe webhook handler (idempotent via `integration_events`), Customer Portal redirect action, public `/pay/[token]` Checkout pay link, recurring schedules cron, overdue/late-payment reminders cron. | All code paths unit-tested. Live verification is still gated on row 4 (Stripe credentials).                                                       |
| E | TODO   | 4     | Time tracking (clock-in / clock-out, weekly approvals, GPS stamp).                                                  | Self-contained; no external credentials.                                                                                                             |
| F | TODO   | 5     | Files vault (folder UX, signed-URL downloads, retention policies, audit log).                                       | Storage bucket is already provisioned; only UI work remains.                                                                                         |
| G | TODO   | 7     | Marketing/Sales/Delivery dashboards (KPIs, pipeline funnel, ageing AR).                                             | Reads from existing tables; no external credentials.                                                                                                 |
| H | TODO   | 8     | Settings: brand kit (logo, colors, default terms), tenant roles, invitation flow.                                   | Invite email send is gated on row 3 (Resend).                                                                                                        |
| I | TODO   | 11    | Audit log viewer in admin portal.                                                                                   | Backed by `cc_audit_events`.                                                                                                                         |
| J | TODO   | 12    | Production Supabase project pinning (RLS sanity check, anon-key rotation drill, backup verification).               | Procedural — once row 1 is done I can run the verification queries.                                                                                  |

## 3. Operational checks for publish day

- Re-run the full test suite, lint, and typecheck (`npm test && npm run lint && npm run typecheck`).
- Smoke `/api/cron/heartbeat` against the deployed URL with the production `CRON_SHARED_SECRET`.
- Confirm Stripe webhook signature verification succeeds end-to-end with a `stripe trigger` event.
- Verify `cc_audit_events` is being written for at least one user-visible action per module.
- Open `/app/integrations` and confirm every "Setup required" banner has been resolved or intentionally deferred.

## 4. What ships ready today (no blockers)

- Tenant authentication, dev-login switch, sidebar navigation.
- Estimating: estimate CRUD, line items with safe decimal money, atomic numbering counter, totals recompute, status transitions, PDF download, catalog UI, e-signature flow with public `/sign/[token]` page.
- Invoicing: invoice CRUD, line items, atomic numbering counter, manual payment recording, branded PDF, convert-from-accepted-estimate, Stripe Checkout pay links via `/pay/[token]` (webhook-reconciled, idempotent), Customer Portal redirect, recurring schedules (`recurring_invoices_daily` cron) and overdue/late-payment reminders (`invoice_overdue_daily` cron).
- Cron infrastructure (audit table, runner, registry, dispatcher route, heartbeat job, idempotency contract).
- Foundational module registry with `MissingCredentialsError` pattern so unset secrets surface as friendly "Setup required" banners instead of crashes.
