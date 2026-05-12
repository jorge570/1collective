# One Collective

Operations software for the trades — back-office platform for blue-collar businesses (construction, HVAC, plumbing, electrical, landscaping, remodeling, and general contracting).

## What it is

One Collective is the back-office backbone for blue-collar business owners across construction trades. The platform serves multi-industry companies (e.g., a pipe trades company handling plumbing, mechanical pipe, and fire protection; a GC employing subcontractors across disciplines) and replaces the patchwork of spreadsheets, texts, paper, and disconnected SaaS tools that operators are stuck with today.

> One Collective is an independent product. It is offered to members of the Construct Collective but is not owned by or part of Construct Collective.

## Modules

1. **Customer Onboarding** — phased walkthrough that builds out the tenant config
2. **Purpose, Core Values, Vision** — conversational brand-content capture
3. **Revenue & Contract Backlog** — manual / CSV / live QuickBooks pull, Financial Health scoring
4. **Estimating** — *placeholder, coming next phase*
5. **Google Drive Connector** — per-tenant OAuth + dashboard file browser
6. **Folder Structure Templates** — trade-specific templates pushed to Drive
7. **Full CRM** — companies, contacts, multi-stage pipeline, Gmail/Outlook/Twilio
8. **Pre-Con** — AI contract review with admin checklist + clause library
9. **Cross-Module Branding & Doc Generation** — logo, colors, About Us
10. **Multi-Tenant, Multi-Trade, Multi-Region** — single platform serving any trade in any region

## Tech stack

- **Frontend:** Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Backend/DB:** Supabase (Postgres + Auth + Storage + Row-Level Security)
- **AI:** Anthropic Claude API
- **Payments:** Stripe (subscriptions, with trial logic managed in our DB)
- **Email:** Gmail / Outlook OAuth per tenant; Resend for platform transactional
- **SMS:** Twilio (operator-hosted, per-user numbers)
- **Accounting:** QuickBooks Online API (read-only)
- **Hosting:** Replit Autoscale

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev
```

App runs at http://localhost:5000.

## Database setup

Apply migrations against your Supabase project:

**Option A (recommended for first run):** paste each file in `db/migrations/` into the Supabase SQL Editor in order (0001 → 0004).

**Option B:** set `DATABASE_URL` in `.env.local` to the direct Postgres connection string from Supabase, then:
```bash
node db/apply.mjs
```

See `db/README.md` for details.

## Documentation

- `docs/BUILD_PLAN.md` — module-by-module phasing and acceptance criteria
- `docs/ASSET_REQUEST.md` — exactly what operator inputs are needed for each phase
- `docs/ROADMAP.md` — prioritized phase ordering with rationale
- `db/README.md` — schema, RLS, migration workflow

## Architecture highlights

- **Three auth gates**: anonymous, tenant user, platform operator — enforced in middleware and at the data layer via RLS
- **Multi-tenant isolation**: every tenant-owned row carries `tenant_id`; RLS uses a JWT custom claim
- **Field-role data-layer isolation**: field roles query a `projects_field_safe` security-barrier view that returns sensitive columns as NULL unless `project_field_overrides` grants visibility
- **Admin Portal**: same Next.js app at `/admin/*`, separate operator authentication, separate RLS policies
- **Trial logic in our DB, not Stripe**: free trials of arbitrary length with no card required are handled by `tenant_billing.trial_ends_at`; Stripe only enters the picture when a card is added
- **Working loop**: Claude Code edits → push to GitHub → Replit pulls → preview updates

## Source of truth

GitHub: https://github.com/1-Collective/1collective

## Code style

- No comments unless explaining a non-obvious *why*
- No premature abstractions
- No error handling for cases that can't happen — validate only at boundaries
- Edit existing files rather than creating new ones when possible
- No emojis in UI copy
