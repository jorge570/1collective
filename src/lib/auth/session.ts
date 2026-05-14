import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SessionContext =
  | { kind: "anonymous" }
  | {
      kind: "tenant_user";
      userId: string;
      email: string;
      tenantId: string;
      tenantSlug: string;
      tenantStatus: string;
      roleKeys: string[];
      isFieldRole: boolean;
      onboardingComplete: boolean;
      passwordResetRequired: boolean;
    }
  | {
      kind: "platform_operator";
      userId: string;
      email: string;
      operatorRole: string;
      passwordResetRequired: boolean;
    };

export const getSession = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData.user;
  if (!authUser) return { kind: "anonymous" };

  // Admin client to look up operator vs tenant role membership (bypasses RLS for this lookup).
  const admin = createAdminClient();

  const { data: operator } = await admin
    .from("platform_operators")
    .select("id, email, operator_role, password_reset_required")
    .eq("id", authUser.id)
    .maybeSingle();

  if (operator) {
    return {
      kind: "platform_operator",
      userId: operator.id,
      email: operator.email,
      operatorRole: operator.operator_role,
      passwordResetRequired: !!operator.password_reset_required,
    };
  }

  const { data: profile } = await admin
    .from("users")
    .select("id, email, tenant_id, password_reset_required")
    .eq("id", authUser.id)
    .maybeSingle();

  if (!profile || !profile.tenant_id) {
    return { kind: "anonymous" };
  }

  const [{ data: tenant }, { data: assignments }, { data: onboarding }] =
    await Promise.all([
      admin
        .from("tenants")
        .select("id, slug, status")
        .eq("id", profile.tenant_id)
        .maybeSingle(),
      admin
        .from("user_role_assignments")
        .select("role_id, roles!inner(key, is_field)")
        .eq("user_id", authUser.id)
        .eq("tenant_id", profile.tenant_id),
      admin
        .from("onboarding_progress")
        .select("completed_at")
        .eq("tenant_id", profile.tenant_id)
        .maybeSingle(),
    ]);

  if (!tenant) return { kind: "anonymous" };

  type RoleRow = { roles: { key: string; is_field: boolean } | { key: string; is_field: boolean }[] };
  const roleKeys: string[] = [];
  let isFieldRole = false;
  for (const a of (assignments ?? []) as RoleRow[]) {
    const r = Array.isArray(a.roles) ? a.roles[0] : a.roles;
    if (r) {
      roleKeys.push(r.key);
      if (r.is_field) isFieldRole = true;
    }
  }

  return {
    kind: "tenant_user",
    userId: profile.id,
    email: profile.email,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantStatus: tenant.status,
    roleKeys,
    isFieldRole,
    onboardingComplete: !!onboarding?.completed_at,
    passwordResetRequired: !!profile.password_reset_required,
  };
});

export async function requireTenantUser() {
  const session = await getSession();
  if (session.kind !== "tenant_user") {
    throw new Error("Unauthorized: tenant user required");
  }
  return session;
}

export async function requirePlatformOperator() {
  const session = await getSession();
  if (session.kind !== "platform_operator") {
    throw new Error("Unauthorized: platform operator required");
  }
  return session;
}
