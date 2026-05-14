# 1collective — Master Build Plan

_Authoritative end-to-end plan to fully build the app. Supersedes the older
phase numbering that pre-dated the Contractor Command (CC) port. ROADMAP.md
is kept as historical context._

## 0. Operating principles (locked)

1. **Assembly-line before publish.** Nothing ships to real tenants until the
   full path from sale → delivery → invoice → payment → reporting works
   end-to-end and survives architect review. No half-built verticals exposed.
2. **"Errors will not be tolerated" quality bar.** Every shipped module must
   pass: lint, `tsc --noEmit`, vitest, an architect pass with no
   CRITICAL/HIGH findings, and a tenant-isolation review.
3. **Invite-only signup.** No public registration until billing + trial
   lifecycle are proven against real Stripe.
4. **Edits over new files.** Extend existing modules whenever possible.
   No speculative util layers. No comments unless explaining a non-obvious why.
5. **Foundational module convention.** Anything ported from CC or built fresh
   for the post-merge buildout lives under `src/foundational/`, is tagged
   `// [CC-FOUNDATION]`, registered in `src/foundational/registry.ts` with
   `enabled` flag and `requiredCredentials`. CC-only tables prefix `cc_`;
   tables that extend an existing 1collective table stay un-prefixed and add
   columns additively.
6. **Money discipline.** Cents stored as `bigint`, tax as basis points.
   Parse user input as strings via decimal-safe helpers
   (`src/lib/estimating/schemas.ts`); never round-trip money through
   `Number` parsing. Reuse the same helpers as new financial modules land.
7. **Tenant isolation by construction.** Every cross-table reference must be
   tenant-coupled (composite FK or trigger), every action validates
   ownership, every recompute filters by `tenant_id`. RLS is defense in
   depth, not the only line.
8. **No UI emojis.** Plain typography only.

## 1. Snapshot — where we are today

**Migrations applied locally (0001 → 0014):** auth, RLS, field-role views,
seed, storage, JWT claim, security hardening, helper revoke, logos listing,
view security invoker, foundational, vault, estimating, estimating
hardening. **Migrations 0011-0014 not yet applied to live Supabase**
(blocked on `SUPABASE_DB_URL`).

**Registry (`src/foundational/registry.ts`):**

| Module | enabled | Source | Notes |
|---|---|---|---|
| `integrations_oauth` | ✅ | new | Encrypted token store |
| `vault` | ✅ | new | RLS + signed URLs, IDOR-hardened |
| `estimating` | ✅ partial | cc | Builder + line items + branded PDF + catalog + e-sign (Phase 4); accepted→invoice handoff live |
| `e_signature` | ✅ live | cc | Token-based public sign page at `/sign/[token]` with SVG signature capture; accept flips estimate to accepted, declined recorded; email/SMS delivery best-effort and degrades cleanly when credentials are blank |
| `crm` | ✅ shell | merge | Schema + page shell; detail views pending |
| `ai_core`, `ai_phone_daniella`, `ai_phone_serana`, `social_amber`, `booking`, `google_sync`, `quickbooks_sync`, `invoicing`, `projects`, `manpower` | ❌ | — | Page shells only |

**Layer-zero libs:** `src/lib/pdf/`, `src/lib/email/` (Resend),
`src/lib/sms/` (Twilio). 86 tests pass. `/api/dev/sample-pdf` returns 200 /
3051 bytes. Dev-only `/api/dev/*` is gated by
`NODE_ENV !== "production" && ENABLE_DEV_LOGIN === "1"`.

**Surface coverage vs CC:** ~5% (per `docs/cc_port_gap_audit.md`).

## 2. Dependency graph (read top-to-bottom)

```
Phase 1  Layer-zero finish (cron, live-Supabase migrations, operator seed)
   │
Phase 2  Estimating finish  (catalog UI, e-sign, accepted→invoice handoff)
   │                              │
Phase 3  Invoicing + Stripe ──────┘   (depends on cron for recurring)
   │
Phase 4  Construction billing     (AIA, retainage, lien waivers, draws, vendor invoices)
   │           │
Phase 5  Projects vertical        (job costing, change orders w/ e-sign reuse)
   │
Phase 6  Crew operations          (timeclock, chat, safety, COI, licenses)
   │
Phase 7  Equipment / fleet        (equipment, maintenance, mileage, inventory)
   │
Phase 8  CRM detail + comms       (Gmail/Outlook/Twilio sub-accts, conversations)
   │
Phase 9  Sales/marketing auto     (funnels, campaigns, sequences, reviews, automation rules)
   │
Phase 10 AI catalog               (ai_core → Daniella → Serana → Amber → 20+ AI tools)
   │
Phase 11 External surfaces        (booking widget, customer portal, employee portal)
   │
Phase 12 Compliance + analytics   (P&L, profitability, exports, content library)
   │
Phase 13 Mobile (Expo)            (197-screen field app, push notifications)
   │
Pre-publish gate
```

Sequencing rationale:
- **Estimating → Invoicing → AIA** preserves the contract-to-cash flow.
- **Cron and ai_core** are gating infra — done early so later phases never
  block on them.
- **AI catalog (Phase 10) intentionally late.** Every prior vertical
  generates the data AI tools need (estimates, invoices, project history,
  crew time, customer comms). Building AI before the data exists produces
  toys, not differentiation.
- **External surfaces (Phase 11) after internal verticals** so tenants have
  real content to expose to customers.

## 3. Phased execution

Each phase lists: deliverables, acceptance criteria, new tables/files,
credentials to obtain, risks, exit signal.

### Phase 1 — Layer-zero finish

**Deliverables**
- `src/lib/cron/` — scheduled job dispatcher (Replit Scheduled Deployments
  + a `cron_runs` audit table; per-job idempotency keys). `MissingCredentialsError`
  pattern when `CRON_SHARED_SECRET` is unset.
- Apply `0011_foundational.sql` → `0014_estimating_hardening.sql` to live
  Supabase via `node db/apply.mjs` (needs `SUPABASE_DB_URL`).
- Seed first `platform_operators` row.
- Generate the first invite link end-to-end and walk through
  `/onboarding`.
- Push notifications: **deferred** to Phase 13 (mobile prerequisite).

**Acceptance**
- A test cron job fires on schedule, writes a `cron_runs` row, and respects
  idempotency on re-fire.
- A fresh tenant can be invited and finish onboarding without console
  errors.
- Migration set applied; remote Supabase schema matches `db/all_migrations.sql`.

**Credentials**: `SUPABASE_DB_URL`, `CRON_SHARED_SECRET`.

**Risk**: Replit's scheduled deployments must be configured per environment;
document in `docs/INFRA.md`.

**Exit signal**: cron-driven recurring invoice scaffolding can be safely
unblocked in Phase 3.

### Phase 2 — Finish Estimating

**Deliverables**
- Catalog UI at `/app/estimating/catalog` for `cc_estimate_catalog_items`
  (CRUD, search, "insert into estimate" action).
- Public e-signature flow: token-based `/e/estimate/[token]` accept/decline
  page; new `cc_estimate_signatures` table (signer name, IP, UA, signed_at,
  status); status transitions `sent → accepted | declined`. Tokens stored
  hashed; rate-limited; expire with the estimate's `valid_until`.
- "Convert accepted estimate to invoice" Server Action (creates Phase 3
  dependency point — implement the call site even before Invoicing exists,
  guarded by `isModuleEnabled("invoicing")`).
- Email send via Resend with the branded PDF attached.

**Acceptance**
- Customer can open the e-sign link, accept/decline, and the estimate
  status updates atomically with a signature row written.
- Catalog lookup → 1-click line-item insert recomputes totals without
  re-validating already-accepted estimates.
- 100% of new code has tests; architect re-review PASS (no HIGH).

**Credentials**: `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`,
`PUBLIC_APP_BASE_URL`.

**Risk**: token replay, signature repudiation. Mitigation: signed,
single-use tokens; signature row immutable after write.

### Phase 3 — Invoicing + Stripe

**Deliverables**
- Tables: `cc_invoices`, `cc_invoice_line_items`, `cc_payments`,
  `cc_invoice_number_counters` (mirror estimating numbering pattern, atomic
  via SQL function).
- Server actions: `createInvoice`, `createInvoiceFromEstimate`,
  `sendInvoice`, `recordPayment`, `voidInvoice`.
- Stripe Checkout session for "Pay now" and Customer Portal link for card
  management.
- Webhook handler extended for `payment_intent.succeeded`,
  `invoice.payment_failed`, `customer.subscription.*` (already scaffolded).
- Recurring invoices: `cc_recurring_invoice_schedules` + cron job.
- Branded invoice PDF (reuse `src/lib/pdf/document-pdf.ts`, type `invoice`).

**Acceptance**
- Estimate accepted → "Create invoice" produces a draft invoice with all
  line items copied at the locked-in prices.
- Send invoice → customer email contains a Stripe Checkout link → paying
  marks the invoice paid via webhook with idempotent processing.
- Recurring schedule fires monthly via cron, creates a new invoice, sends
  email; failures retried with exponential backoff.
- Money math is float-safe (reuse `moneyDollarsToCents`,
  `lineItemTotalCents`).

**Credentials**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PUBLISHABLE_KEY`, Stripe Product + Price IDs.

**Risk**: webhook idempotency, partial payments, refunds. Use Stripe event
ID as idempotency key in `stripe_events` table.

### Phase 4 — Construction-billing differentiator

This is the wedge that distinguishes 1collective from a generic invoicing app.

**Deliverables**
- `cc_aia_pay_apps` (G702 + G703 schedule of values), with PDF generator.
- `cc_retainage` (per-project retention %, accrual ledger).
- `cc_lien_waivers` (conditional/unconditional, partial/final), e-sign reuse.
- `cc_draw_schedules` (progress-billing milestones, percent-complete pulls
  from project data).
- `cc_vendor_invoices`, `cc_sub_payments`.

**Acceptance**
- A pay app can be built from a project's schedule of values, exported as a
  G702/G703-compliant PDF, e-signed by GC and owner.
- Retainage withheld is automatically deducted from the pay app and tracked
  to release.
- Lien waivers generated per pay app, e-signed, archived in Vault.

**Credentials**: none new (reuses Stripe + Email + PDF + e-sign infra).

**Risk**: AIA forms are licensed; we generate a functionally-equivalent
form with our own template + clearly label it. Legal review before publish.

### Phase 5 — Projects vertical

**Deliverables**
- Extend `projects` (un-prefixed; additive columns) with CC operational
  fields: status enum, contract value, start/finish dates, % complete,
  superintendent, etc.
- New: `cc_daily_logs`, `cc_field_reports`, `cc_project_photos` (Vault-backed),
  `cc_job_costs`, `cc_change_orders` (e-sign reuse), `cc_submittals`,
  `cc_permits`, `cc_warranties`.
- WIP report aggregating across projects.
- `cc_project_equipment` (links Phase 7 equipment to a project).

**Acceptance**
- Field role can submit a daily log + photos from a phone-sized viewport.
- Change order workflow: draft → send → e-sign → applied to contract value
  and pay app schedule.
- WIP report matches manual spot checks for at least 3 sample projects.

**Risk**: photo storage cost. Mitigation: image-optimize on upload, archive
old photos to cheaper tier after 1 year.

### Phase 6 — Crew operations (Manpower)

**Deliverables**
- `cc_employees` (extends `users` for crew-only fields), `cc_crew_assignments`,
  `cc_timeclock_punches` (with optional geofence per project),
  `cc_payroll_periods` + CSV export, `cc_time_off_requests`.
- `cc_crew_chat_channels` + `cc_crew_chat_messages` (per-project + per-tenant).
- `cc_safety_incidents`, `cc_incident_reports`.
- COI tracker: `cc_certificates_of_insurance` with expiration alerts (cron).
- `cc_licenses` (worker certifications) with expiration alerts.

**Acceptance**
- Crew can punch in/out from `/app/manpower/timeclock` with geofence
  enforcement when a project radius is set.
- Payroll period can be closed and exported to CSV in a format compatible
  with at least one common payroll provider (Gusto/ADP).
- COI/license expirations trigger reminder emails 30/14/7/1 days out.

### Phase 7 — Equipment / fleet

**Deliverables**
- `cc_equipment`, `cc_equipment_maintenance`, `cc_equipment_checkouts`
  (assigned to crew or project), `cc_fleet_vehicles`, `cc_mileage_logs`,
  `cc_inventory_items`, `cc_materials_orders`.

**Acceptance**
- Equipment can be checked out to a project, with maintenance reminders
  driven by hours-used or calendar.
- Mileage logs roll up per vehicle and per employee for tax export.

### Phase 8 — CRM detail + communications

**Deliverables**
- CRM detail views: company → contacts → projects → activity timeline.
- Gmail OAuth (per user) + Gmail API push notifications for inbound sync.
- Outlook Graph API parallel.
- `bids@[tenant]` verification flow + send-as.
- Per-tenant Twilio sub-accounts (existing `src/lib/sms/`); inbound SMS
  webhook → `cc_sms_conversations` + `cc_sms_messages`; consent tracking
  in `cc_sms_consents` (TCPA compliance).
- Activity timeline aggregation across email, SMS, calls, notes.

**Credentials**: `GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI`,
Microsoft Graph credentials, master Twilio account.

**Risk**: TCPA compliance is non-negotiable. No SMS sends without an
explicit consent record. Audit logging on every send.

### Phase 9 — Sales / marketing automation

**Deliverables**
- `cc_funnels`, `cc_campaigns`, `cc_followup_sequences` (cron-driven).
- `cc_reviews`, `cc_review_requests` with Google/Yelp/FB targeting.
- `cc_referrals`.
- Automation rule engine: `cc_automation_rules` + dispatcher
  (event-sourced from CRM + Projects + Invoicing events).
- Per-client and per-contact schedules; bid-value thresholds.

**Acceptance**
- Awarded bid → triggers a configurable post-bid follow-up cadence over
  30 days, sending email + SMS at correct intervals, respecting consent.
- Review requests sent N days after invoice paid; click-through tracked.

### Phase 10 — AI catalog

**Prerequisite gate**: enable `ai_core` first.

**Deliverables (in order)**
1. `src/lib/ai/` — Anthropic + OpenAI clients with per-tenant usage
   metering (`cc_ai_usage_ledger`), cost caps, model fallbacks.
2. **Daniella** (inbound AI receptionist): Twilio voice webhook → AI
   response → call routing.
3. **Serana** (outbound AI calls): Vapi-driven follow-ups, payment
   chasers, appointment confirmations.
4. **Amber** (social composer): Meta + Instagram + GBP posting.
5. **20+ AI mobile tools** — bidding coach, cashflow, change-order
   assistant, CLV, contract builder, contract review, crew optimizer,
   draft estimate, late-payment, lead pipeline, negotiate, profitability,
   seasonal, sentiment, sub scorecard, tax, upsell, voicemail triage.
   These ship one-by-one; each must pass an architect review and a
   "wrong-answer cost" assessment before being exposed.

**Credentials**: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `VAPI_PRIVATE_KEY`,
`VAPI_PUBLIC_KEY`, `META_APP_ID/SECRET/REDIRECT`,
`GOOGLE_BUSINESS_*` scopes already in `google_sync`.

**Risk**: AI hallucination on financial advice or contract review. Every
AI surface ships with: a "show your work" panel, a confidence indicator,
and a hard rule that AI never auto-modifies financial records — only
suggests.

### Phase 11 — External surfaces

**Deliverables**
- Public booking widget: `/book/[tenant]` with Google Calendar availability.
- Customer portal: per-customer login, see their estimates / invoices /
  documents / pay invoices / approve change orders.
- Employee portal: mobile-first crew view (timeclock, daily logs, chat).
- Public document URLs (token-based): estimates, invoices, change orders,
  pay apps, lien waivers.
- Custom domain support per tenant (CNAME + Let's Encrypt via Replit).

### Phase 12 — Compliance + analytics + content

**Deliverables**
- Analytics: P&L dashboard, profitability per project, AR aging, MRR/churn
  for operators.
- Data export (CSV + JSON) per tenant — required for GDPR-style requests.
- `cc_content_library`, `cc_playbook`, `cc_education` (operator-curated +
  per-tenant private).
- Cross-tenant patterns ETL → `cross_tenant_contract_patterns`
  (anonymized, weekly).
- Audit log enrichment via DB triggers on critical tables.

### Phase 13 — Mobile (Expo)

**Deliverables**
- Expo RN app sharing the Supabase backend.
- Field-role offline-first daily log + checklist completion (queue + sync).
- Push notifications enabled (closes Phase 1.5 deferral).
- 197 CC screens are aspirational; ship the field-role 30 first.

## 4. Cross-cutting work (run continuously, not a single phase)

- **Validation skill**: register `lint`, `typecheck`, `test`, `build`,
  `migration-lint` as named checks. CI must run all five.
- **Architect review** at end of every vertical, not just at gate.
- **Security**: dependency audit + SAST + RLS audit per phase (use
  `security_scan` skill). Threat-model new external surfaces (e-sign
  endpoints, booking widget, customer portal, public document URLs)
  before each goes live.
- **Performance**: index hot paths (CRM kanban, communication timeline,
  estimate/invoice line item recomputes, audit log queries). Add
  `EXPLAIN`-driven validation at end of Phases 5, 8, 9.
- **Observability**: structured `log.info/warn/error` already in place;
  add Sentry or equivalent error tracking + an uptime monitor before
  publish. Per-tenant metrics dashboard for operators.
- **Backups + DR**: Supabase PITR enabled; weekly logical dumps to a
  separate bucket; restore-from-backup rehearsal before publish.
- **Docs**: keep `docs/cc_port_gap_audit.md`, `replit.md`, and
  `db/all_migrations.sql` in sync after every phase. Add `docs/INFRA.md`
  in Phase 1 covering cron config, secrets management, region selection.

## 5. Pre-publish gate (the assembly-line finish line)

Do not flip from invite-only to public until **all** of the following are
green:

| Gate | How verified |
|---|---|
| All enabled modules have: tests + lint + typecheck + architect PASS | `npm run lint && npm test && npm run typecheck`; architect log per module |
| Migrations applied to staging and production Supabase | `node db/apply.mjs` against both; schema diff = 0 |
| Stripe in live mode with Product + Price provisioned | Test card runs end-to-end through invoicing + recurring |
| Trial lifecycle fully exercised | New tenant signs up → trial → 30/14/7/1 day reminders fire → expiry locks workspace → card add unlocks |
| Tenant isolation audit | Manual: cross-tenant probe on every `cc_*` table; RLS + composite FK + action-level ownership checks all present |
| Public surfaces threat-modeled | E-sign, booking, customer portal, employee portal — `threat_modeling` skill output reviewed |
| Security scans clean | `security_scan` skill: zero CRITICAL, zero HIGH unresolved |
| Backups + DR rehearsal | Restore from backup to a scratch project succeeds |
| Observability live | Error tracking + uptime monitor wired; on-call rotation defined |
| Legal | ToS, Privacy, DPA, AIA-form disclaimer, TCPA SMS consent flow published |
| Performance | Each list page under 300ms p95 with seed data; PDF generation under 2s p95; webhook handler under 500ms p95 |
| Docs | `replit.md`, `BUILD_PLAN.md`, `cc_port_gap_audit.md` reflect shipped reality |

When every row is green, flip the registry's externally-facing flags,
remove invite-only gating from `/signup`, and publish via Replit
Autoscale per `.local/skills/deployment`.

## 6. Estimating order-of-operations summary (next 6 work units)

Per the locked principles, the immediate forward path is:

1. Phase 1.1 — `src/lib/cron/` + apply 0011-0014 to live Supabase.
2. Phase 2.1 — Estimating catalog UI.
3. Phase 2.2 — Estimating e-signature + signed PDF archival to Vault.
4. Phase 2.3 — Estimating → Invoice handoff stub (creates a Phase 3
   integration point even before invoicing exists).
5. Phase 3.1 — Invoice schema + builder + PDF (no Stripe yet).
6. Phase 3.2 — Stripe Checkout + webhook idempotency + Customer Portal.

Each unit ends with: 100% tests, architect PASS, registry flag flipped to
`enabled: true` only when the vertical is actually usable end-to-end (not
when just the schema exists).
