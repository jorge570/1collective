"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/auth/session";

function backWithError(msg: string): never {
  redirect(`/set-password?error=${encodeURIComponent(msg)}`);
}

export async function setOwnPasswordAction(formData: FormData) {
  const session = await getSession();
  if (session.kind === "anonymous") redirect("/login");

  const newPassword = String(formData.get("new_password") || "");
  const confirm = String(formData.get("confirm_password") || "");
  if (!newPassword || newPassword.length < 8) {
    backWithError("Password must be at least 8 characters.");
  }
  if (newPassword !== confirm) {
    backWithError("Passwords do not match.");
  }

  // 1. Update the Supabase auth password using the user's own session.
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) backWithError(error.message);

  // 2. Clear the password_reset_required flag in whichever profile applies.
  const admin = createAdminClient();
  if (session.kind === "platform_operator") {
    await admin
      .from("platform_operators")
      .update({ password_reset_required: false })
      .eq("id", session.userId);
  } else {
    await admin
      .from("users")
      .update({ password_reset_required: false })
      .eq("id", session.userId);
  }

  // 3. Audit log entry.
  await admin.from("audit_log").insert({
    tenant_id: session.kind === "tenant_user" ? session.tenantId : null,
    actor_user_id: session.userId,
    actor_role:
      session.kind === "platform_operator" ? "platform_operator" : "tenant_user",
    action: "user_completed_password_reset",
    entity_type: "user",
    entity_id: session.userId,
  });

  // 4. Bounce to the normal landing page.
  redirect(session.kind === "platform_operator" ? "/admin" : "/app");
}
