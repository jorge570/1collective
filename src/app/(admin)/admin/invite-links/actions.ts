"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { requirePlatformOperator } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createInviteLinkAction(formData: FormData) {
  const operator = await requirePlatformOperator();
  const billingMode = String(formData.get("billing_mode") || "free_trial");
  const trialDuration = Number(formData.get("trial_duration_days") || 120);
  const maxRedemptions = Number(formData.get("max_redemptions") || 1);
  const notes = String(formData.get("notes") || "").trim() || null;

  const admin = createAdminClient();
  await admin.from("invite_links").insert({
    token: nanoid(24),
    billing_mode: billingMode,
    trial_duration_days: billingMode === "free_trial" ? trialDuration : null,
    max_redemptions: maxRedemptions > 0 ? maxRedemptions : null,
    notes,
    created_by: operator.userId,
  });

  revalidatePath("/admin/invite-links");
}

export async function disableInviteLinkAction(formData: FormData) {
  await requirePlatformOperator();
  const linkId = String(formData.get("link_id") || "");
  if (!linkId) return;

  const admin = createAdminClient();
  await admin
    .from("invite_links")
    .update({ disabled_at: new Date().toISOString() })
    .eq("id", linkId);

  revalidatePath("/admin/invite-links");
}
