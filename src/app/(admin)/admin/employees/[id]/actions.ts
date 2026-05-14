"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformOperator } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_ROLES = new Set([
  "super",
  "account_manager",
  "support",
  "readonly",
]);

function backToEmployee(operatorId: string, msg: string): never {
  redirect(
    `/admin/employees/${operatorId}?error=${encodeURIComponent(msg)}`
  );
}

export async function updateOperatorProfileAction(formData: FormData) {
  const session = await requirePlatformOperator();
  const operatorId = String(formData.get("operator_id") || "");
  if (!operatorId) return;

  const isSelf = operatorId === session.userId;
  const isSuper = session.operatorRole === "super";
  if (!isSelf && !isSuper) {
    backToEmployee(operatorId, "You can only edit your own profile.");
  }

  const fullName = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) backToEmployee(operatorId, "Email is required.");

  const admin = createAdminClient();
  await admin
    .from("platform_operators")
    .update({
      full_name: fullName || null,
      email,
    })
    .eq("id", operatorId);
  await admin.auth.admin.updateUserById(operatorId, { email });

  await admin.from("audit_log").insert({
    tenant_id: null,
    actor_user_id: session.userId,
    actor_role: "platform_operator",
    action: "operator_profile_updated",
    entity_type: "platform_operator",
    entity_id: operatorId,
    after: { full_name: fullName || null, email },
  });

  revalidatePath(`/admin/employees/${operatorId}`);
  revalidatePath("/admin/employees");
}

export async function setOperatorRoleAction(formData: FormData) {
  const session = await requirePlatformOperator();
  if (session.operatorRole !== "super") {
    backToEmployee(
      String(formData.get("operator_id") || ""),
      "Only super operators can change roles."
    );
  }

  const operatorId = String(formData.get("operator_id") || "");
  const newRole = String(formData.get("operator_role") || "");
  if (!operatorId || !ALLOWED_ROLES.has(newRole)) {
    backToEmployee(operatorId, "Invalid role.");
  }
  if (operatorId === session.userId) {
    backToEmployee(operatorId, "You can't change your own role.");
  }

  const admin = createAdminClient();
  await admin
    .from("platform_operators")
    .update({ operator_role: newRole })
    .eq("id", operatorId);

  await admin.from("audit_log").insert({
    tenant_id: null,
    actor_user_id: session.userId,
    actor_role: "platform_operator",
    action: "operator_role_changed",
    entity_type: "platform_operator",
    entity_id: operatorId,
    after: { operator_role: newRole },
  });

  revalidatePath(`/admin/employees/${operatorId}`);
  revalidatePath("/admin/employees");
}

export async function assignTenantToOperatorAction(formData: FormData) {
  const session = await requirePlatformOperator();
  if (session.operatorRole !== "super") {
    backToEmployee(
      String(formData.get("operator_id") || ""),
      "Only super operators can assign tenants."
    );
  }

  const operatorId = String(formData.get("operator_id") || "");
  const tenantId = String(formData.get("tenant_id") || "");
  if (!operatorId || !tenantId) return;

  const admin = createAdminClient();

  // Check existing (active or removed) record. If a "removed" row exists,
  // un-remove it; otherwise insert a new one.
  const { data: existing } = await admin
    .from("operator_tenant_assignments")
    .select("id, removed_at")
    .eq("operator_id", operatorId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (existing) {
    if (existing.removed_at !== null) {
      await admin
        .from("operator_tenant_assignments")
        .update({ removed_at: null, assigned_by: session.userId })
        .eq("id", existing.id);
    }
    // else: already active, no-op
  } else {
    await admin.from("operator_tenant_assignments").insert({
      operator_id: operatorId,
      tenant_id: tenantId,
      assigned_by: session.userId,
    });
  }

  await admin.from("audit_log").insert({
    tenant_id: tenantId,
    actor_user_id: session.userId,
    actor_role: "platform_operator",
    action: "operator_assigned_to_tenant",
    entity_type: "platform_operator",
    entity_id: operatorId,
    after: { tenant_id: tenantId },
  });

  revalidatePath(`/admin/employees/${operatorId}`);
  revalidatePath("/admin/employees");
}

export async function unassignTenantFromOperatorAction(formData: FormData) {
  const session = await requirePlatformOperator();
  if (session.operatorRole !== "super") {
    backToEmployee(
      String(formData.get("operator_id") || ""),
      "Only super operators can unassign tenants."
    );
  }

  const operatorId = String(formData.get("operator_id") || "");
  const tenantId = String(formData.get("tenant_id") || "");
  if (!operatorId || !tenantId) return;

  const admin = createAdminClient();
  await admin
    .from("operator_tenant_assignments")
    .update({ removed_at: new Date().toISOString() })
    .eq("operator_id", operatorId)
    .eq("tenant_id", tenantId)
    .is("removed_at", null);

  await admin.from("audit_log").insert({
    tenant_id: tenantId,
    actor_user_id: session.userId,
    actor_role: "platform_operator",
    action: "operator_unassigned_from_tenant",
    entity_type: "platform_operator",
    entity_id: operatorId,
    after: { tenant_id: tenantId },
  });

  revalidatePath(`/admin/employees/${operatorId}`);
  revalidatePath("/admin/employees");
}
