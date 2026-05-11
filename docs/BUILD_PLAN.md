# One Collective — Build Plan

Module-by-module phasing, dependencies, and acceptance criteria.

## Phase 0 — Foundation (this commit)

**Done:**
- Next.js 16 + TS + Tailwind v4 + shadcn/ui scaffold
- Supabase Auth + Postgres + RLS multi-tenant isolation
- Three auth gates (anon, tenant_user, platform_operator) with disjointness constraint
- Role/permission model (8 system roles seeded; per-tenant role copies on signup)
- Field-role data-layer isolation (RLS + security-barrier view + per-project field overrides)
- Stripe webhook handler scaffolded with idempotency
- Invite-link-driven signup with trial logic in our DB (not Stripe)
- Onboarding walkthrough (resumable, summary screen, jump-to-step)
- Admin Portal: tenant management, invite links, checklist CRUD, clause library CRUD, folder template browsing
- Tenant dashboard shell with all 10 modules navigable

**Remaining for foundation completeness:**
- [ ] Apply the four SQL migrations against the live Supabase project (manual via SQL Editor, or `node db/apply.mjs` with DATABASE_URL)
- [ ] Provision a `platform_operators` row for Jorge to access the Admin Portal
- [ ] Generate the first invite link via Admin Portal and use it to onboard the first test tenant
- [ ] Wire Stripe secret keys when ready to enable real billing

## Phase 1 — Onboarding & Branding (Modules 1, 2, 9)

**Module 1: Customer Onboarding**
- Acceptance:
  - User can complete all 6 walkthrough steps end to end
  - Drop-off and resume works across devices/sessions
  - Trade-type selections drive folder template options downstream
  - Logo upload to Supabase Storage with public URL
  - HQ locations with service radius UI (multi-row form)
- Dependencies: Supabase Storage bucket `logos` (public-read) provisioned

**Module 2: Purpose, Values, Vision**
- Acceptance:
  - Conversational chat UI using Claude API for guided articulation
  - Versioning: each save creates a new `brand_content_versions` row, `current_version_id` updated
  - About Us page template editor (drag-drop sections)
- Dependencies: `ANTHROPIC_API_KEY` in env (already present)

**Module 9: Cross-Module Branding**
- Acceptance:
  - Tenant primary/secondary colors propagate as CSS custom properties at the layout level
  - Generated proposals/estimates embed the About Us template
- Dependencies: Module 1 (logo, colors) and Module 2 (about us content) complete

## Phase 2 — Revenue & QuickBooks (Module 3)

**Module 3: Revenue & Contract Backlog**
- Acceptance:
  - Manual entry: works (already in onboarding)
  - CSV upload: parses, validates, inserts into `revenue_history`
  - QuickBooks OAuth connect button works, lands at `qbo_connections`
  - Initial sync: pulls revenue history + chart of accounts → snapshots
  - Chart of accounts recommendations generated via Claude analysis
  - WIP report aggregates from `projects` showing all required fields
  - Financial Health score generated daily via pg_cron + Edge Function
- Dependencies: QBO OAuth app credentials, Stripe live (for FH paid feature gating later)

## Phase 3 — CRM (Module 7)

**Module 7: Full CRM**
- Acceptance:
  - Companies + contacts + projects CRUD
  - Pipeline kanban (already scaffolded — needs drag-drop)
  - Activity timeline per company, contact, and project
  - Gmail OAuth per user; inbound + outbound sync via Gmail API push notifications
  - Outlook parallel implementation
  - Twilio sub-account per tenant; phone provisioning per user; SMS send + inbound webhook
  - `bids@[tenantdomain]` setup flow with verification step
  - Automation engine: rules editor, per-client/per-contact schedules, pg_cron dispatcher
- Dependencies: Google OAuth, Microsoft OAuth, Twilio API, master Twilio account

## Phase 4 — Pre-Con (Module 8)

**Module 8: Pre-Con**
- Acceptance:
  - PDF upload → Supabase Storage → Edge Function parses with `pdf-parse`
  - Claude extraction of structured contract data into `contract_versions.extracted_data`
  - AI review against `admin_checklist_items` + `admin_clause_library` + cross-tenant patterns
  - Three tabs working: Flagged Clause Report, Annotated PDF (with redlining), Pre-Job Checklist
  - Health score calculated from flag tier weights, updates on resolve/accept/dismiss
  - Re-upload triggers diff vs prior version
  - Field roles can access Pre-Job Checklist on their assigned projects only (enforced by RLS)
- Dependencies: `ANTHROPIC_API_KEY`, Supabase Storage `contracts` bucket (private), pdf-lib + react-pdf-highlighter, all three Admin Portal data sources populated

## Phase 5 — Drive & Folder Templates (Modules 5, 6)

**Module 5: Google Drive Connector**
- Acceptance:
  - Per-tenant OAuth flow
  - Root folder created in tenant Drive
  - Drive folder/file tree rendered in dashboard
  - PDF viewer (react-pdf) + Excel editor (luckysheet) embedded
- Dependencies: Google OAuth credentials

**Module 6: Folder Template Push**
- Acceptance:
  - On Drive connect, selected trade template auto-creates folder structure in Drive
  - Admin Portal: full template editor (add/edit/reorder/delete nodes)
  - Re-apply / repair button if structure drifts
- Dependencies: Module 5; trade-specific template content from operator

## Phase 6 — Estimating (Module 4)

Reserved. Placeholder is in place. Build sequence when phase opens:
1. Trade-aware assemblies tables
2. Quantity takeoff UI
3. Labor + material pricing with region adjustment
4. Markup, overhead, bid assembly
5. Buyout workflow (PO issuance, vendor commitments)
6. Integration with CRM project pipeline (Awarded → triggers estimating data carry-over)

## Phase 7 — Billing & Tenant Lifecycle (cross-cutting)

- Acceptance:
  - 30-day-before-trial-ends prompt visible at the top of every authenticated view (already scaffolded; needs cron to also email a warning)
  - Card add flow via Stripe Checkout session
  - Customer Portal link for managing card / subscription
  - Trial expiry: automatic transition to `trial_expired` + workspace locked to billing/login pages only
  - Admin Portal trial extension extends `card_required_at` proportionally (already done)
- Dependencies: Stripe live keys, Stripe Product + Price configured, Resend for trial warning emails

## Phase 8 — Mobile-first field role (cross-cutting)

- Acceptance:
  - Responsive layouts already work; needs explicit mobile-first review for field role pages
  - PWA manifest + service worker for home-screen install
  - Offline-safe pre-job checklist completion (queues writes, syncs on reconnect)

## Cross-cutting infrastructure to add later

- **Background workers:** decide pg_cron vs Inngest per workload; document in `docs/INFRA.md`
- **Audit log enrichment:** triggers on the critical tables to populate `audit_log` automatically
- **Anonymized cross-tenant patterns:** ETL job that mines `contract_flags` + `admin_clause_library` and populates `cross_tenant_contract_patterns` weekly
- **Email delivery monitoring:** track bounces from Gmail/Outlook send attempts; flag in CRM
- **Backups:** Supabase point-in-time recovery enabled; weekly logical dumps to a separate bucket
