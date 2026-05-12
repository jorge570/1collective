-- One Collective: Storage bucket policies.
-- The buckets themselves are created in db/bootstrap.mjs (via the storage API);
-- this migration installs the RLS policies that govern who can read/write
-- objects in each bucket.

-- ============================================================
-- LOGOS bucket (public read, tenant-scoped write)
-- Path convention: tenants/{tenant_id}/logo-{timestamp}.{ext}
-- ============================================================

drop policy if exists "logos: public read" on storage.objects;
create policy "logos: public read"
  on storage.objects for select
  using (bucket_id = 'logos');

drop policy if exists "logos: tenant write" on storage.objects;
create policy "logos: tenant write"
  on storage.objects for insert
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = 'tenants'
    and (storage.foldername(name))[2]::uuid = current_tenant_id()
  );

drop policy if exists "logos: tenant update" on storage.objects;
create policy "logos: tenant update"
  on storage.objects for update
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = 'tenants'
    and (storage.foldername(name))[2]::uuid = current_tenant_id()
  );

drop policy if exists "logos: tenant delete" on storage.objects;
create policy "logos: tenant delete"
  on storage.objects for delete
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = 'tenants'
    and (storage.foldername(name))[2]::uuid = current_tenant_id()
  );

-- ============================================================
-- CONTRACTS bucket (private; tenant-scoped read+write)
-- Path convention: tenants/{tenant_id}/contracts/{contract_id}/v{version}.pdf
-- ============================================================

drop policy if exists "contracts: tenant read" on storage.objects;
create policy "contracts: tenant read"
  on storage.objects for select
  using (
    bucket_id = 'contracts'
    and (
      (storage.foldername(name))[2]::uuid = current_tenant_id()
      or is_platform_operator()
    )
  );

drop policy if exists "contracts: tenant write" on storage.objects;
create policy "contracts: tenant write"
  on storage.objects for insert
  with check (
    bucket_id = 'contracts'
    and (storage.foldername(name))[1] = 'tenants'
    and (storage.foldername(name))[2]::uuid = current_tenant_id()
  );

drop policy if exists "contracts: tenant delete" on storage.objects;
create policy "contracts: tenant delete"
  on storage.objects for delete
  using (
    bucket_id = 'contracts'
    and (storage.foldername(name))[2]::uuid = current_tenant_id()
  );

-- ============================================================
-- DOCUMENTS bucket (private; tenant-scoped)
-- Path convention: tenants/{tenant_id}/...
-- General-purpose tenant documents (anything not contracts/logos).
-- ============================================================

drop policy if exists "documents: tenant read" on storage.objects;
create policy "documents: tenant read"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[2]::uuid = current_tenant_id()
      or is_platform_operator()
    )
  );

drop policy if exists "documents: tenant write" on storage.objects;
create policy "documents: tenant write"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'tenants'
    and (storage.foldername(name))[2]::uuid = current_tenant_id()
  );

drop policy if exists "documents: tenant delete" on storage.objects;
create policy "documents: tenant delete"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[2]::uuid = current_tenant_id()
  );
