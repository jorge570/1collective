"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformOperator } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

function rand(len = 20): string {
  // URL-safe characters; avoid ambiguous (0/O, 1/I/l)
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%^&*";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function backToUserWithError(
  tenantId: string,
  userId: string,
  msg: string
): never {
  redirect(
    `/admin/tenants/${tenantId}/users/${userId}?error=${encodeURIComponent(msg)}`
  );
}

export async function updateUserProfileAction(formData: FormData) {
  await requirePlatformOperator();
  const tenantId = String(formData.get("tenant_id") || "");
  const userId = String(formData.get("user_id") || "");
  if (!tenantId || !userId) return;

  const fullName = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone_e164") || "").trim();

  const admin = createAdminClient();

  await admin
    .from("users")
    .update({
      full_name: fullName || null,
      email,
      phone_e164: phone || null,
    })
    .eq("id", userId)
    .eq("tenant_id", tenantId);

  // Keep auth.users in sync so future sign-ins use the new email
  await admin.auth.admin.updateUserById(userId, { email });

  revalidatePath(`/admin/tenants/${tenantId}/users/${userId}`);
  revalidatePath(`/admin/tenants/${tenantId}`);
}

export async function setUserPasswordAction(formData: FormData) {
  await requirePlatformOperator();
  const tenantId = String(formData.get("tenant_id") || "");
  const userId = String(formData.get("user_id") || "");
  const newPassword = String(formData.get("new_password") || "");
  const forceReset = formData.get("force_reset_after") != null;
  if (!tenantId || !userId || !newPassword) return;
  if (newPassword.length < 8) {
    backToUserWithError(tenantId, userId, "Password too short.");
  }

  const admin = createAdminClient();

  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (error) backToUserWithError(tenantId, userId, error.message);

  await admin
    .from("users")
    .update({ password_reset_required: forceReset })
    .eq("id", userId)
    .eq("tenant_id", tenantId);

  await admin.from("audit_log").insert({
    tenant_id: tenantId,
    actor_user_id: null,
    actor_role: "platform_operator",
    action: "set_user_password",
    entity_type: "user",
    entity_id: userId,
    after: { force_reset_after: forceReset },
  });

  revalidatePath(`/admin/tenants/${tenantId}/users/${userId}`);
}

export async function generateRandomPasswordAction(formData: FormData) {
  await requirePlatformOperator();
  const tenantId = String(formData.get("tenant_id") || "");
  const userId = String(formData.get("user_id") || "");
  if (!tenantId || !userId) return;

  const newPassword = rand(20);
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (error) backToUserWithError(tenantId, userId, error.message);

  await admin
    .from("users")
    .update({ password_reset_required: true })
    .eq("id", userId)
    .eq("tenant_id", tenantId);

  await admin.from("audit_log").insert({
    tenant_id: tenantId,
    actor_user_id: null,
    actor_role: "platform_operator",
    action: "generate_random_password",
    entity_type: "user",
    entity_id: userId,
    after: { force_reset_after: true },
  });

  // Show the password once via a query param. Operator copies + relays to user.
  redirect(
    `/admin/tenants/${tenantId}/users/${userId}?temp_password=${encodeURIComponent(
      newPassword
    )}`
  );
}

export async function toggleForcePasswordResetAction(formData: FormData) {
  await requirePlatformOperator();
  const tenantId = String(formData.get("tenant_id") || "");
  const userId = String(formData.get("user_id") || "");
  const value = String(formData.get("value") || "").toLowerCase() === "true";
  if (!tenantId || !userId) return;

  const admin = createAdminClient();
  await admin
    .from("users")
    .update({ password_reset_required: value })
    .eq("id", userId)
    .eq("tenant_id", tenantId);

  await admin.from("audit_log").insert({
    tenant_id: tenantId,
    actor_user_id: null,
    actor_role: "platform_operator",
    action: "toggle_force_password_reset",
    entity_type: "user",
    entity_id: userId,
    after: { password_reset_required: value },
  });

  revalidatePath(`/admin/tenants/${tenantId}/users/${userId}`);
}
