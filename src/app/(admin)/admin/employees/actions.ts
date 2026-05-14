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

function backToList(msg?: string, invited?: string): never {
  const params = new URLSearchParams();
  if (msg) params.set("error", msg);
  if (invited) params.set("invited", invited);
  const qs = params.toString();
  redirect(`/admin/employees${qs ? `?${qs}` : ""}`);
}

export async function inviteOperatorAction(formData: FormData) {
  const session = await requirePlatformOperator();
  if (session.operatorRole !== "super") {
    backToList("Only super operators can invite new operators.");
  }

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") || "").trim();
  const operatorRole = String(formData.get("operator_role") || "");
  if (!email) backToList("Email is required.");
  if (!ALLOWED_ROLES.has(operatorRole)) backToList("Invalid role.");

  const admin = createAdminClient();

  // 1. Send Supabase auth invite email. This creates the auth.users row.
  const { data: invited, error: inviteErr } =
    await admin.auth.admin.inviteUserByEmail(email);
  if (inviteErr || !invited?.user) {
    backToList(inviteErr?.message ?? "Failed to send invite.");
  }

  // 2. Create the platform_operators row. (The DB trigger ensures this user
  //    is NOT also a tenant user.)
  const { error: insertErr } = await admin.from("platform_operators").insert({
    id: invited.user.id,
    email,
    full_name: fullName || null,
    operator_role: operatorRole,
  });
  if (insertErr) backToList(insertErr.message);

  await admin.from("audit_log").insert({
    tenant_id: null,
    actor_user_id: session.userId,
    actor_role: "platform_operator",
    action: "operator_invited",
    entity_type: "platform_operator",
    entity_id: invited.user.id,
    after: { email, operator_role: operatorRole },
  });

  revalidatePath("/admin/employees");
  backToList(undefined, email);
}
