# One Collective — Prioritized Roadmap

## Phase 0 ✓ Foundation (current state)
- Auth, multi-tenant, RLS, roles & permissions, admin portal foundation,
  Stripe webhook scaffolding, onboarding walkthrough, dashboard shell.

## Phase 1 — Make it real (1–2 weeks)
- Apply migrations to live Supabase
- Create the first operator account
- Generate the first invite link
- Onboard the first real test tenant through the walkthrough
- Validate every screen renders with real data
- Fix the inevitable papercuts

## Phase 2 — Pre-Con AI (3–4 weeks) — the wedge feature
This is the most differentiated module — start here once foundation is solid.
- Supabase Storage bucket for contract PDFs (private, RLS-gated)
- PDF upload UI with progress
- Edge Function: pdf-parse extraction
- Claude extraction → `contract_versions.extracted_data`
- Claude review against `admin_checklist_items` + `admin_clause_library`
- Three-tab Pre-Con UI: Flagged Clause Report, Annotated PDF, Pre-Job Checklist
- Health score calculation + dynamic update
- Re-upload + diff workflow
- Auto-generation of Pre-Job Checklist on project Awarded transition

## Phase 3 — Branding & document generation (1–2 weeks)
- Logo upload + Supabase Storage
- Color picker UI in onboarding step 1 + Settings/Branding
- About Us template editor (drag-drop sections)
- Branded proposal/estimate PDF generation (using react-pdf-renderer)

## Phase 4 — Google Workspace + Drive (2–3 weeks)
- Google OAuth app setup
- Per-tenant Drive connection with admin grant
- Folder template push on connect
- Drive file browser in dashboard with in-browser PDF + Excel viewers
- Replace placeholder folder templates with real trade-specific structures

## Phase 5 — CRM + Communications (4–6 weeks) — the largest module
- Gmail OAuth + push notifications for inbound sync
- Outlook Graph API parallel implementation
- bids@[tenantdomain] verification flow + send-as wiring
- Twilio account + sub-account per tenant + number provisioning
- SMS send + inbound webhook
- Activity timeline aggregation
- Automation engine: rule editor UI + pg_cron dispatcher
- Per-client and per-contact automation schedules
- Bid value threshold logic
- Project-pipeline-aware triggers (post-bid follow-up cadence)

## Phase 6 — Revenue + QuickBooks (3–4 weeks)
- QuickBooks Online OAuth
- Initial pull of revenue history + chart of accounts
- Chart of accounts recommendations via Claude analysis
- Daily sync via pg_cron + Edge Function
- Financial Health score (combined trends + margin + AR aging + backlog)
- WIP report assembly from `projects` table (currently underlying data exists)
- CSV upload alternative for revenue

## Phase 7 — Billing-real (1–2 weeks)
- Stripe Product + Price configured
- Add-card flow via Stripe Checkout
- Customer Portal link
- Trial expiry handler (transition tenant_status to `trial_expired`, lock to /app/billing)
- Resend email warnings at trial-end - 30, - 14, - 7, - 1 days
- Operator-side accounting reports (MRR, churn, etc.) in Admin Portal

## Phase 8 — Estimating (Module 4) — multi-month module
Reserved. Full plan in `docs/BUILD_PLAN.md`.

## Phase 9 — Cross-tenant intelligence
- ETL: anonymize patterns from `contract_flags` and `admin_clause_library` →
  populate `cross_tenant_contract_patterns`
- Pre-Con AI gap-filling from cross-tenant data
- Trends dashboard (e.g., "clauses 80% of pipe trades use that you're missing")

## Phase 10 — Polish & scale
- Mobile-first review of field-role screens
- PWA manifest + service worker for field-role offline checklist completion
- Audit log enrichment with DB triggers
- Performance: indexes for hot paths (CRM kanban, communication timeline)
- Multi-region support (data residency)
- Custom domain support per tenant

---

## Ordering rationale

Pre-Con first (Phase 2) because:
1. It's the most differentiated feature — defines what makes One Collective unique
2. The data model is already built and waiting
3. Admin Portal already supports configuring it
4. It can ship before CRM is fully done — operators can upload contracts and
   get reviews without having clients fully populated

CRM is large (Phase 5) and depends on the most external integrations (Gmail,
Outlook, Twilio, Google Workspace). Sequencing it later gives time to mature
each integration without blocking the wedge feature.

Revenue/QBO (Phase 6) comes after CRM because Financial Health analysis is
most useful when there's project pipeline data to correlate it with.

Estimating (Phase 8) is multi-month and deliberately deferred. It's
high-value but the rest of the platform can ship and generate revenue first.
