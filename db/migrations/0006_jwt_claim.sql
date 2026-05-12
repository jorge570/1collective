-- One Collective: Inject tenant_id and is_field_role into the auth JWT.
--
-- Supabase's "custom_access_token_hook" lets us augment the JWT at sign-in
-- with claims that RLS policies can read via auth.jwt().
--
-- After applying this migration, go to:
--   Supabase Dashboard → Authentication → Hooks → Custom Access Token Hook
-- and enable `public.custom_access_token_hook` as the active hook.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_user_id uuid := (event ->> 'user_id')::uuid;
  v_tenant_id uuid;
  v_is_field boolean := false;
  v_role_keys text[];
  v_claims jsonb := event -> 'claims';
begin
  -- Look up tenant from users table (tenant users)
  select tenant_id into v_tenant_id
  from public.users
  where id = v_user_id;

  if v_tenant_id is null then
    -- Maybe a platform operator: no tenant claim, but mark them.
    if exists (select 1 from public.platform_operators where id = v_user_id) then
      v_claims := v_claims || jsonb_build_object('is_platform_operator', true);
    end if;
  else
    -- Collect role keys + field flag
    select
      coalesce(array_agg(r.key), array[]::text[]),
      coalesce(bool_or(r.is_field), false)
    into v_role_keys, v_is_field
    from public.user_role_assignments ura
    join public.roles r on r.id = ura.role_id
    where ura.user_id = v_user_id
      and ura.tenant_id = v_tenant_id;

    v_claims := v_claims
      || jsonb_build_object('tenant_id', v_tenant_id::text)
      || jsonb_build_object('role_keys', to_jsonb(v_role_keys))
      || jsonb_build_object('is_field_role', v_is_field);
  end if;

  return jsonb_build_object('claims', v_claims);
end;
$$;

-- Grant the auth admin role the right to invoke the hook
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select on public.users to supabase_auth_admin;
grant select on public.platform_operators to supabase_auth_admin;
grant select on public.user_role_assignments to supabase_auth_admin;
grant select on public.roles to supabase_auth_admin;

-- Allow supabase_auth_admin to bypass RLS on these tables when populating claims.
alter table public.users force row level security;
alter table public.platform_operators force row level security;
alter table public.user_role_assignments force row level security;
alter table public.roles force row level security;

drop policy if exists auth_admin_read on public.users;
create policy auth_admin_read on public.users
  for select to supabase_auth_admin
  using (true);

drop policy if exists auth_admin_read on public.platform_operators;
create policy auth_admin_read on public.platform_operators
  for select to supabase_auth_admin
  using (true);

drop policy if exists auth_admin_read on public.user_role_assignments;
create policy auth_admin_read on public.user_role_assignments
  for select to supabase_auth_admin
  using (true);

drop policy if exists auth_admin_read on public.roles;
create policy auth_admin_read on public.roles
  for select to supabase_auth_admin
  using (true);
