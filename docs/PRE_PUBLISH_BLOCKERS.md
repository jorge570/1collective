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
| 1 | BLOCKED  | 1.0   | Apply migrations `0011`–`0015` to the live Supabase database (creates `cc_estimates`, counters, `cc_cron_runs`, etc.) | Add `SUPABASE_DB_URL` secret (Postgres connection string from Supabase project settings → Database → Connection string → URI). I will then run the migrations.  |
| 2 | BLOCKED  | 1.1   | Cron dispatcher returns 503 in dev because the shared secret is unset.                              | Generate `openssl rand -base64 32` and save as `CRON_SHARED_SECRET` in Replit Secrets.                                                                            |
| 3 | BLOCKED  | 2.2   | Estimate "send" email cannot be delivered.                                                          | Add `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` (a verified sender on your Resend domain).                                                                          |
| 4 | BLOCKED  | 3.2   | Subscription billing (Stripe Checkout, webhook, Customer Portal) cannot run.                        | Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_STANDARD`. After the webhook is deployed, register its URL in Stripe and paste the signing secret. |
| 5 | BLOCKED  | 6     | OAuth providers (QuickBooks Online, Google, Meta, Vapi) for tenant integrations.                    | Each provider needs its own `*_CLIENT_ID` / `*_CLIENT_SECRET` set when that integration is turned on. Tracked in `src/foundational/registry.ts`.                  |
| 6 | BLOCKED  | 9     | AI features (Daniella receptionist, Serana follow-up, Amber social).                                | Add `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY`, plus per-feature provider keys (Vapi, Twilio) when those modules are enabled.                                    |

## 2. Code work I can do unattended (no user action required)

| # | Status | Phase | What                                                                                                                | Notes                                                                                                                                                |
| - | ------ | ----- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| A | TODO   | 2.2   | Public e-signature page at `/e/estimate/[token]` with accept / decline / signature capture and signed PDF snapshot. | Schema + token issuance can ship without Resend; the actual outbound email step is gated on row 3.                                                   |
| B | TODO   | 2.3   | "Convert to invoice" button on accepted estimates (creates a draft invoice).                                        | Depends on Phase 3.1 invoice schema landing first.                                                                                                   |
| C | TODO   | 3.1   | Invoice module: schema + numbering counter + builder UI + PDF (mirrors estimating).                                 | Reuse the counter pattern from `cc_estimate_number_counters` and the PDF renderer from `src/lib/estimating/pdf.ts`.                                  |
| D | TODO   | 3.2   | Stripe webhook handler with idempotency (uses the same audit pattern as cron) and Customer Portal redirect action.  | Webhook code can be written and unit-tested ahead of credentials; live verification is gated on row 4.                                                |
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
- Estimating: estimate CRUD, line items with safe decimal money, atomic numbering counter, totals recompute, status transitions, PDF download, **and the catalog UI (this commit).**
- Cron infrastructure (audit table, runner, registry, dispatcher route, heartbeat job, idempotency contract).
- Foundational module registry with `MissingCredentialsError` pattern so unset secrets surface as friendly "Setup required" banners instead of crashes.
