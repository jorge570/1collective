# Merge Plan: Contractor Command → One Collective

**Status:** DRAFT — awaiting your approval. No migration code has been written.
**Source:** `/tmp/cc_source/artifacts/{api-server,mobile,marketing}` (extracted from `attached_assets/contractor_command_source_1778711942469.zip`).
**Target:** `/home/runner/workspace` (this repo).

---

## 0. Top-priority blocking decisions

The spec assumes One Collective is a "pure UI shell with no backend, no API routes, and no data models." **That premise is wrong.** Before I write a single line of migration code I need explicit decisions on the items below, because they change everything downstream.

### D1 — One Collective is already a functional multi-tenant SaaS backend.

It has:

- **50+ Postgres tables** in `db/migrations/0001_init.sql` covering tenants, users, projects, contracts, companies, communications, automations, billing, drive integrations, onboarding progress, etc.
- **Row-level security** in `db/migrations/0002_rls.sql` enforcing tenant isolation by `tenant_id` JWT claim.
- **Working Server Actions** for tenant management (`/admin/tenants`), invite link generation (`/admin/invite-links`), checklist + clause library, multi-step onboarding flow (`/onboarding/[step]`).
- **A working Stripe webhook handler** with idempotency at `src/app/api/webhooks/stripe/route.ts`.
- **A real session layer** at `src/lib/auth/session.ts` distinguishing platform operators, tenant users, and field roles.
- A **JWT custom-access-token hook** (`db/migrations/0006_jwt_claim.sql`) that injects `tenant_id` into every token.

This is a meaningfully built platform. The only reason it isn't working live is that nobody has run the SQL migrations against the Supabase project yet (the schema exists in source but not in the database).

**Decision needed.** Pick one approach:

- **Option A — "1collective wins":** Keep 1collective's multi-tenant Supabase architecture (Auth, RLS, tenancy, Server Actions). Port CC's *domain logic* into it but adapt every CC feature to: (a) live under a `tenant_id`, (b) use Supabase Auth instead of JWT/bcrypt, (c) be invoked from Server Actions / route handlers instead of Express routes. Conflicting tables (e.g. CC `users` vs 1collective `users`) collapse into 1collective's existing schema. CC features without a 1collective UI counterpart (AI agents, voice, SMS, vault, etc.) are flagged as "no UI counterpart" and deferred per the spec.

  **Recommended.** Keeps the multi-tenant model (which CC lacks), preserves the work already done, and matches the spec's instruction to "wire features into One Collective's existing UI."

- **Option B — "CC wins":** Replace 1collective's backend wholesale with CC's Express server. Lose multi-tenancy, RLS, the onboarding flow, and the Stripe wiring. The 1collective Next.js frontend would call out to a separate Express API. Larger blast radius; throws away substantial existing work.

- **Option C — "Greenfield merge":** Start a third backend that takes the best of both. Cleanest in theory, slowest in practice, and most likely to drift.

**My recommendation: Option A.** All subsequent sections of this plan assume A. If you pick B or C, the plan needs to be rewritten before I touch anything.

### D2 — Auth model conflict.

| Dimension | Contractor Command | One Collective |
|---|---|---|
| Auth provider | Hand-rolled JWT + bcrypt | Supabase Auth |
| User identifier | `TEXT` (timestamp+random) | UUID from `auth.users` |
| Multi-tenancy | None — every record `user_id`-scoped | `tenant_id` everywhere + RLS |
| RBAC mechanism | `is_admin` boolean + `subscription_tier` (field / commander / empire) | Roles table + `platform_operator` table + `is_field_role` JWT claim |
| Session invalidation | `token_version` column + 5-min in-memory cache | Supabase refresh tokens + cookies |
| Password reset | 6-digit code via Twilio SMS or Nodemailer SMTP | Supabase magic link / OTP (built-in) |

These cannot co-exist. Under Option A, **Supabase Auth wins.** That means:

- CC `users` table gets *deleted* during port. CC features that referenced `users.id` are rewritten to use `auth.users.id` (UUID) plus 1collective's `users` table for app-side profile/role data.
- CC `subscription_tier` (field/commander/empire) maps onto 1collective's existing role/billing model. 1collective uses `tenant_billing.billing_status` (trialing/active/past_due/cancelled/free_forever) — there is no per-tier feature gating today. **You need to decide:** keep CC's tier gating (port `requireTier()` middleware as a server-side helper), or drop it and gate by tenant role only.
- CC's password reset code flow becomes redundant — Supabase already does this. CC's Twilio-SMS-reset is the only thing Supabase doesn't replicate; if you need SMS reset specifically, that's a separate decision.
- CC mobile app's `cc_auth_token` SecureStore key becomes a Supabase session token. Mobile API client (`mobile/lib/api.ts`) must be rewritten — but mobile UI is out of scope for this migration anyway.

### D3 — Database — both are Postgres. No engine conflict.

- CC: Postgres via Drizzle ORM (with most queries written as raw `sql`...` template literals — Drizzle is essentially a query runner, not a schema source-of-truth).
- 1collective: Postgres via Supabase, raw SQL migrations under `db/migrations/`.

**Decision needed:** keep raw-SQL migrations as the source of truth (1collective's current convention), or introduce Drizzle's schema-builder for type safety on the new ported tables. **Recommendation: stay raw-SQL** — matches `replit.md` ("no premature abstractions") and avoids fragmenting the schema definition across two systems. CC's Drizzle dependency comes along but is used only as a query runner where helpful.

### D4 — Reference image (`image.png`) is missing.

The spec references an image listing the 14 onboarding modules. It was not attached. The 14 module names from the spec text are the only source I have, so the audits below are based on those names alone. If the image contains additional detail (subfields, priorities beyond what's already flagged in the text), please attach it before approving the plan.

### D5 — Repository scope.

CC zip contains three apps: `api-server`, `mobile`, `marketing`. Per spec, mobile UI is excluded. **Confirm:**

- `api-server` → port (this is the meat).
- `mobile/lib/` → port the offline-sync queue, push notifications, voice dictation utilities only if they have a server-side or shared component. The mobile UI (everything under `mobile/app/`) is excluded.
- `marketing` → exclude entirely (it's a 62-file marketing site, not feature logic).

---

## 1. Architecture summary

### Contractor Command — `api-server`

- **Runtime:** Node.js 18+ ESM, Express, TypeScript.
- **DB:** Postgres via Drizzle (mostly raw SQL through `db.execute(sql\`...\`)`).
- **Schema management:** Inline `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` calls scattered across `src/index.ts` (2,231 lines) and individual route files. **No migrations directory.** Schema is assembled at boot.
- **Routes:** 136 route files in `src/routes/` mounted under `/api`.
- **Auth:** `src/middleware/auth.ts` — JWT bearer token + bcrypt + 5-min in-memory token-version cache.
- **Cron:** Custom `setInterval`-based scheduler in `src/cron/` — morning briefing, overdue invoice alerts, estimate follow-ups, low-inventory alerts, change-order reminders.
- **Lib clients:** `stripeClient`, `twilio`, `sms`, `email`, `push` (Expo), `pdfGenerator` (pdfkit), `objectStorage` (GCS), `amberPublisher` (FB/IG/GBP), `encryption`, `notificationLog`.
- **No package.json found in the zip** (zip omitted manifests). Dependency list reverse-engineered from imports: `express`, `drizzle-orm`, `pg`, `bcryptjs`, `jsonwebtoken`, `zod`, `stripe`, `twilio`, `nodemailer`, `pdfkit`, `expo-server-sdk` (via `lib/push.ts`), `@google-cloud/storage`, `@anthropic-ai/sdk`, `openai`. Vitest for tests. Confirm the omission was intentional and let me know if you can attach the manifests.

### Contractor Command — `mobile`

Expo Router app. Non-UI logic lives in `mobile/lib/`:
- `api.ts` — fetch wrapper with offline queueing, ETag-style cache, conflict detection.
- `syncQueue.ts` — offline write queue with conflict resolution.
- `offlineState.ts` — connection state tracker.
- `notifications.ts` — Expo push registration.
- `useVoiceDictation.ts`, `useNetworkMonitor.ts`, `useOfflineAwareSubmit.ts` — hooks; React-Native-specific.
- `pdfExport.ts`, `excelExport.ts`, `shareUtils.ts`, `sentry.ts` — utilities.

Most of this is RN-specific and doesn't translate to a Next.js web app. The portable concepts (offline sync queue, conflict resolution) could be useful if you want offline-first PWA support later, but that's not in scope.

### One Collective

- **Runtime:** Next.js 16.2.6 (App Router), React 19, TypeScript, Tailwind 4.
- **DB:** Supabase Postgres + Auth + Storage. RLS-enforced multi-tenancy.
- **Schema:** 6 raw-SQL migrations in `db/migrations/`. Bootstrap script at `db/bootstrap.mjs`.
- **Routes/Actions:** Server Components + Server Actions for all data mutations. One API route (`/api/webhooks/stripe`).
- **Auth:** Supabase Auth via `@supabase/ssr`. Session shape in `src/lib/auth/session.ts`. Route gating in `src/proxy.ts`.
- **No cron yet.** No background workers. (Both will need to be added when porting CC's scheduled jobs — see §5.)

---

## 2. Feature inventory audit — 14 onboarding modules in CC

Based on the `image.png` module list in the spec, audited against `/tmp/cc_source/artifacts/api-server/src/routes/`. Status legend: ✅ exists fully · 🟡 partial · ❌ missing (new build).

| # | Module | CC status | Evidence | Notes |
|---|---|---|---|---|
| 1 | General Info (Name, Logo, Location, Radius) | ✅ | `users` table cols (company_name, city, state, etc.); profile routes in `src/routes/auth.ts` | No service-radius column found — likely 🟡. |
| 2 | Business Type | ✅ | `users.trade` text column | Free text, not enum. |
| 3 | Purpose / Core Values | ❌ | No table or route found | **NEW BUILD.** |
| 4 | Vision (Long Term) | ❌ | No table or route found | **NEW BUILD.** |
| 5 | Annual Rev (Current) | 🟡 | Implicit via `invoices` aggregation | No "company revenue snapshot" model. |
| 6 | Backlog / WIP | 🟡 | `projects` + `estimates` tables | No "WIP report" query. |
| 7 | Estimate Software / Buyout *(priority)* | ✅ | `routes/estimates.ts`, `routes/estimates-public.ts`, `routes/recurring-invoices.ts` | Buyout-specific logic needs verification. |
| 8 | Est. Folder Structures | ❌ | No folder-template model in CC | **NEW BUILD** in CC. (1collective DOES have `folder_templates` — see §3.) |
| 9 | Est & CRM (Plug In) | ✅ | `routes/leads.ts`, `routes/customers.ts`, `routes/referrals.ts` | |
| 10 | Precon (Contract Review, Pre-Job Checklist) | 🟡 | Some `routes/contracts*.ts` exist | Pre-job checklist not located in CC. |
| 11 | Recruiting *(priority)* | ❌ | No recruiting route found | **NEW BUILD.** |
| 12 | Manpower Logistics | 🟡 | `routes/employees.ts`, `routes/crew-chat.ts`, `routes/scheduling*.ts` | Scope unclear — verify in deep audit. |
| 13 | Project Process / Project Mgmt / Equipment Mgmt | ✅ | `projects`, `project_materials`, `change_orders` | Equipment specifically not found. |
| 14 | Org Board | ❌ | No org-chart model found | **NEW BUILD.** |

**Items flagged for explicit decision before implementation:**
- #3 Purpose / Core Values — NEW BUILD (also has UI in 1collective — see §3)
- #4 Vision Long-Term — NEW BUILD (also has UI in 1collective)
- #11 Recruiting — NEW BUILD (priority flagged in spec); no UI counterpart in 1collective
- #14 Org Board — NEW BUILD; no UI counterpart in 1collective

---

## 3. UI counterpart audit — 14 modules vs One Collective

| # | Module | 1collective UI page | UI status | Backed by data model? |
|---|---|---|---|---|
| 1 | General Info | `/onboarding/[step]` company-info + branding | ✅ | ✅ `tenants`, `tenant_locations` |
| 2 | Business Type | onboarding company-info | ✅ | ✅ `trade_types[]` enum on `tenants` |
| 3 | Purpose / Core Values | `/app/branding` | ✅ | ✅ branding tables |
| 4 | Vision | `/app/branding` | ✅ | ✅ |
| 5 | Annual Rev | `/app/revenue` | ✅ | ✅ `revenue_history` |
| 6 | Backlog / WIP | `/app/precon` (partial) | 🟡 | ✅ `projects`, `contracts` |
| 7 | Estimating | `/app/estimating` | 🟡 (UI only, "Soon" badge) | ❌ no models |
| 8 | Folder Structures | `/admin/templates` | ✅ | ✅ `folder_templates` |
| 9 | CRM | `/app/crm` | ✅ | ✅ `companies`, `projects` |
| 10 | Precon | `/app/precon`, `/admin/checklist`, `/admin/clauses` | ✅ | ✅ `contracts`, `contract_checklist_items`, `clauses` |
| 11 | Recruiting | none | ❌ MISSING | ❌ |
| 12 | Manpower | `/app/team` (basic) | 🟡 | 🟡 `project_assignments` |
| 13 | Project Mgmt | `/app/precon`, `/app/crm` | 🟡 | ✅ `projects` |
| 14 | Org Board | none | ❌ MISSING | ❌ |

**UI-counterpart-missing flags (per spec, do NOT build headless services for these without explicit decision):**
- #11 Recruiting → no UI in 1collective
- #14 Org Board → no UI in 1collective
- #7 Estimating → page exists but is a stub with "Soon" badge — counts as no real UI counterpart for full estimating flow

**Modules from CC that have NO 14-list mapping but are present in code (massive scope creep risk):**
- AI agents: Daniella (AI receptionist with Twilio voice), Serana (AI calls), Amber (AI publisher) — `routes/{daniella,serana,amber*,aiPhotoEstimate,aiStaff,aiVoice,aiIntelligence,aiUsage}.ts`
- Password vault — `routes/vault.ts`
- Insurance, licenses, education modules
- Customer portal + employee portal (mobile-only screens)
- Real-estate / renovation projects (`renovation_projects` table) — appears to be a different product line embedded in CC
- Booking widget, calendar sync (Google Calendar), QuickBooks sync, social publishing (FB/IG/GBP), Vapi AI voice integration

**Per spec:** every CC feature without a 1collective UI counterpart MUST be flagged and decided on before porting. The bulleted CC-only features above are all in that bucket. **You need to triage them: port / defer / drop.** I propose deferring all of them to a later phase (port only what maps to a 1collective UI page first; revisit AI/voice/portals later). Confirm.

---

## 4. Foundational code identification & feature-toggle strategy

Proposing:

1. **Directory namespace** for all ported domain code: `src/foundational/` at the project root. Subdirectories mirror feature concern (`src/foundational/estimates/`, `src/foundational/leads/`, etc.) — *not* CC's directory layout.
2. **File header tag** on every ported file:
   ```ts
   // [CC-FOUNDATION] Source: api-server/src/routes/estimates.ts
   // Ported YYYY-MM-DD; adapted to: Supabase Auth, multi-tenant RLS, Server Actions.
   ```
3. **Module registry** at `src/foundational/registry.ts` listing every ported module with a flag:
   ```ts
   export const FOUNDATIONAL_MODULES = {
     estimates:    { enabled: true,  source: "cc/routes/estimates.ts" },
     leads:        { enabled: true,  source: "cc/routes/leads.ts" },
     daniella_ai:  { enabled: false, source: "cc/routes/daniella.ts" },
     ...
   } as const;
   ```
4. **Server Actions** in 1collective check the registry before invoking foundational code; flipping `enabled: false` cleanly disables a feature without removing the code.
5. Database tables added by foundational code prefixed `cc_` (e.g. `cc_estimates`, `cc_leads`) ONLY where they don't merge into an existing 1collective table. Prefixed tables let you `DROP` them cleanly to disable a feature. Tables that merge (e.g. CC's `projects` → 1collective's existing `projects`) are NOT prefixed; they're additive columns/joins on the existing table.

This satisfies the spec's "instantly identify which code originated from Contractor Command" + "enable or disable Contractor Command-sourced features independently" requirements.

**Decision needed:** approve this scheme, or specify alternate naming/tagging.

---

## 5. API integration inventory

Every external service called by CC. **All credentials will be left blank** in the port; each integration gets a documented placeholder.

| Service | Where used in CC | Env vars required | 1collective status |
|---|---|---|---|
| Stripe | `lib/stripeClient.ts`, `routes/billing*.ts` | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_FIELD`, `STRIPE_PRICE_ID_COMMANDER`, `STRIPE_PRICE_ID_EMPIRE` | Already integrated. CC's tier-priced products may conflict with 1collective's existing pricing model — see D2. |
| Twilio (SMS) | `lib/twilio.ts`, `lib/sms.ts` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Not present. Will be added blank. |
| Twilio (Voice for Daniella) | `routes/daniella.ts` | Same Twilio creds + `TWILIO_VOICE_*` config | Defer pending §3 decision on AI features. |
| Vapi (AI Voice) | `routes/aiVoice.ts` | `VAPI_PRIVATE_KEY`, `VAPI_PUBLIC_KEY` | Defer. |
| Anthropic | `routes/aiIntelligence.ts`, `routes/aiStaff.ts`, etc. | `AI_INTEGRATIONS_ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | Not present. Defer pending AI decision. |
| OpenAI | various AI routes | `OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_API_KEY` | Defer. |
| SMTP / Nodemailer | `routes/auth.ts` (password reset), notifications | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Not present in 1collective. Replace with Supabase Auth's built-in email for password flows; keep generic SMTP for non-auth notifications. |
| Google Cloud Storage | `lib/objectStorage.ts` | GCS service account JSON or `GOOGLE_APPLICATION_CREDENTIALS` | 1collective uses Supabase Storage. **Recommendation: drop GCS, use Supabase Storage instead.** |
| QuickBooks Online | `routes/quickbooks*.ts`, `quickbooks_tokens` table | `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_ENVIRONMENT` | Not present. Will be added blank. |
| Google Calendar | `routes/calendarSync.ts` | OAuth client creds | Not present. |
| Google Drive | `routes/drive*.ts` (CC) | OAuth client creds | 1collective has `google_drive_connections` table — different shape. Reconcile. |
| Google Business Profile | `lib/amberPublisher.ts` | OAuth | Defer (Amber AI). |
| Facebook / Instagram | `lib/amberPublisher.ts` | Meta Graph API tokens | Defer (Amber AI). |
| Expo Push | `lib/push.ts` | `EXPO_ACCESS_TOKEN` (optional) | Defer — mobile-only. |
| Sentry | `mobile/lib/sentry.ts` | `SENTRY_DSN` | Mobile-only; defer. |

**Abstraction approach:** every external client lives at `src/lib/integrations/<service>.ts` exporting a single factory function. Factory throws a clear `MissingCredentialsError` at the top of every code path that needs creds, never at module-import time. This guarantees blank creds = clear runtime error, not a silent broken feature.

```ts
// src/lib/integrations/twilio.ts
// [CC-FOUNDATION] Source: api-server/src/lib/twilio.ts
export function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new MissingCredentialsError("Twilio", ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]);
  }
  return twilio(sid, token);
}
```

`.env.example` gets every required key documented with where to obtain it.

---

## 6. Conflict matrix (concrete code-level conflicts to resolve at port time)

| Conflict | Resolution under Option A |
|---|---|
| `users` table schema | Drop CC `users` table entirely. CC features rewritten to join `auth.users` (UUID) + 1collective `users` (profile/role). User-id type changes from CC's `TEXT` to UUID — every foreign key on every ported table must be updated. |
| `projects` table | Merge: 1collective's `projects` is canonical. Add CC's missing columns (`actual_costs`, `phases` JSONB, etc.) via a new migration. CC code rewritten to query the merged shape. |
| `subscription_tier` | Either map to a new `tenants.feature_tier` enum + role-aware feature gating, or drop tier gating. **Decision needed (D2).** |
| `is_admin` | Maps to 1collective's `platform_operators` table. CC's admin routes rewrite to call `requirePlatformOperator()`. |
| `requireAuth` middleware | Replaced by 1collective's `getSession()` / `requireTenantUser()` / `requirePlatformOperator()` — Server Actions don't use Express middleware. Each ported route becomes a Server Action (or App Router route handler if the call is from the mobile app via REST). |
| `requireTier(tier)` middleware | Becomes a server-side helper `requireFeature("estimating")` that checks the tenant's enabled module set. |
| Schema-at-boot (CC's inline `CREATE TABLE IF NOT EXISTS`) | Convert each CC schema fragment into a numbered SQL migration in `db/migrations/00NN_cc_*.sql`. Run via `db/bootstrap.mjs`. |
| Express routes | Two destinations: (a) data mutations called from 1collective UI → Server Actions in `src/foundational/<feature>/actions.ts`. (b) Endpoints needed by external callers (e.g. mobile, webhooks) → App Router route handlers under `src/app/api/cc/<resource>/route.ts`. Decide per route. |
| Custom `setInterval` cron | Next.js doesn't host long-running processes well. Options: (a) Vercel Cron-style scheduled route handlers triggered by an external scheduler (cron-job.org, GitHub Actions, Supabase scheduled functions), (b) Supabase pg_cron (Postgres-native), (c) deploy a separate worker process. **Decision needed.** Recommendation: Supabase pg_cron + database-level functions for things that can be SQL, and external HTTP triggers for things that need code. |
| `genId()` (TEXT id from timestamp+random) | Replace all new IDs with UUIDs to match 1collective convention. CC's existing-data import (none, fresh start) sidesteps the migration problem. |
| Password reset (Twilio SMS or SMTP) | Use Supabase Auth's built-in email reset. Drop CC's `password_reset_codes` table. |
| Bcrypt password hashing | Drop. Supabase Auth handles password storage. |

---

## 7. Phased execution plan (post-approval)

Each phase is a separate review checkpoint. Nothing is committed until you approve the staged changes for that phase.

**Phase 0 — Apply 1collective's existing schema** (prerequisite, not strictly migration work)
- Run the existing 6 migrations against Supabase via `db/bootstrap.mjs`.
- Provision your operator account.
- Required so we have a working baseline to merge CC into.
- **You still need to provide `DATABASE_URL` for this** — no way around it.

**Phase 1 — Merge plan approval** ← *current step.*

**Phase 2 — Foundational scaffolding**
- Create `src/foundational/` directory + `registry.ts` skeleton.
- Create `src/lib/integrations/` factories with blank-cred error wiring.
- Add `MissingCredentialsError` class.
- Update `replit.md` to document the foundational tagging convention.
- No business logic ported yet.

**Phase 3 — Schema migration (additive only)**
- Generate `db/migrations/0007_cc_schema.sql` containing all CC tables that don't conflict with 1collective. Tables prefixed `cc_` where applicable. CC `users`/`projects` reconciliation migrations (additive columns) generated separately.
- No data migration scripts (no CC production data per spec).

**Phase 4 — Auth bridge**
- Adapter helpers that translate 1collective session → "CC-style request context" (tenant_id, user_id, role) for ported code that expects a single user_id. Avoids rewriting every ported function for multi-tenancy by hand.

**Phase 5 — Port domain modules with UI counterparts** (one feature at a time)
- CRM/Leads, Estimating, Precon, Project Mgmt, Folder Structures, Branding, Revenue.
- Per module: port services + business logic + tests; wire to existing 1collective UI via Server Actions.
- Stop at the end of each module for review.

**Phase 6 — Cron/scheduler decision execution** (depending on D-decision).

**Phase 7 — UI-less feature triage** (AI agents, vault, voice, social publishing, etc.).
- Each item gets its own port/defer/drop decision *before* I touch its code.

**Phase 8 — Cleanup, docs, post-merge tests.**

---

## 8. What I will NOT do without an explicit go-ahead

- Touch any UI file under `src/app/` or `src/components/` (per spec).
- Commit anything to git (per spec).
- Hardcode any credential anywhere.
- Port any CC feature flagged as "no UI counterpart" or "NEW BUILD" in §2/§3.
- Pick between Option A/B/C in §0 D1 — that's your call.
- Apply schema to the live Supabase database without `DATABASE_URL`.

---

## 9. What I need from you to start Phase 2

1. **Approve Option A** (or specify B/C).
2. **Decide D2** — keep CC's tier gating or drop it.
3. **Decide D3** — stay raw-SQL migrations (recommended) or introduce Drizzle schema builder.
4. **Confirm D5** — exclude `mobile/` UI and `marketing/` entirely.
5. **Triage the CC-only features in §3** (AI agents, vault, voice, social, etc.) — port-now / defer / drop. Default if unanswered: defer all.
6. **Approve §4 foundational tagging scheme** or specify alternate.
7. **Decide §6 cron strategy** — Supabase pg_cron + external HTTP triggers (recommended), or deploy a separate worker.
8. *(Nice-to-have)* Attach `image.png` if the 14-module list has detail beyond the spec text.
9. *(Still-pending)* Provide `DATABASE_URL` so Phase 0 can complete in parallel.

When you approve, I'll start Phase 2.
