# Database & Supabase bootstrap

PostgreSQL hosted on Supabase. Multi-tenant via row-level security.

## Files

- `migrations/0001_init.sql` — enums, ~50 tables, indexes, foreign keys
- `migrations/0002_rls.sql` — RLS policies + helper functions
- `migrations/0003_field_views.sql` — field-role security-barrier view
- `migrations/0004_seed.sql` — system role templates + placeholder folder templates
- `migrations/0005_storage.sql` — Storage bucket RLS policies (logos, contracts, documents)
- `migrations/0006_jwt_claim.sql` — Auth hook that injects `tenant_id` and `is_field_role` into JWTs

## One-shot bootstrap

The `bootstrap.mjs` script applies every migration in order, creates the
Storage buckets, and provisions the first platform operator account.

### Prereqs

`.env.local` must include:

```
NEXT_PUBLIC_SUPABASE_URL=https://....supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres
```

Get `DATABASE_URL` from **Supabase Dashboard → Project Settings → Database → Connection string** (URI, mode: Session).

### Run

```bash
node db/bootstrap.mjs
```

The script is idempotent — re-running skips already-applied work. At the
end it prints the operator email + password for the Admin Portal.

### Optional env

- `OPERATOR_EMAIL` — operator account to provision (default: `jorge@jwallerenterprise.com`)
- `OPERATOR_PASSWORD` — set a known password instead of having one generated

## After bootstrap: enable the JWT custom claim hook

The RLS policies read `tenant_id` from the JWT. To populate that claim,
Supabase needs the auth hook turned on:

1. Supabase Dashboard → **Authentication → Hooks**
2. Find **Custom Access Token Hook**
3. Enable, choose function `public.custom_access_token_hook`
4. Save

Without this, server-side `getSession()` still works (it uses the admin
client to look up tenant info), but direct client-side queries that rely
on RLS will not see tenant data.

## Conventions

- All tenant-owned tables have `tenant_id uuid NOT NULL` and an RLS policy filtering on `current_tenant_id()`.
- All tables have `created_at`/`updated_at` and an `updated_at` trigger.
- Soft delete via `deleted_at` on user-facing entities. Hard delete on ephemeral.
- Money stored as `bigint` cents.
- Field roles must query the `projects_field_safe` view, never `projects` directly.
- Platform operator data (`admin_*`, `invite_links`, `cross_tenant_contract_patterns`) is RLS-gated to `is_platform_operator()`.

## Storage buckets

| Bucket | Public | Use | Path |
|---|---|---|---|
| `logos` | yes | Tenant brand logos | `tenants/{tenant_id}/logo-{ts}.{ext}` |
| `contracts` | no | Contract PDFs (versioned) | `tenants/{tenant_id}/contracts/{contract_id}/v{n}.pdf` |
| `documents` | no | General tenant documents | `tenants/{tenant_id}/...` |

All buckets have RLS policies that scope writes by `tenant_id` extracted
from the object path.

## Adding a new migration

1. Create `migrations/00NN_description.sql` with the next sequential number.
2. Write idempotent or strictly forward-only SQL — no destructive operations without an explicit data migration plan.
3. Re-run `node db/bootstrap.mjs` — already-applied migrations are skipped.
