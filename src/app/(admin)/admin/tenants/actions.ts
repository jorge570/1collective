"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformOperator } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays } from "date-fns";

export async function extendTrialAction(formData: FormData) {
  await requirePlatformOperator();
  const tenantId = String(formData.get("tenant_id") || "");
  if (!tenantId) return;

  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("tenant_billing")
    .select("trial_ends_at, trial_extended_count")
    .eq("tenant_id", tenantId)
    .single();

  const newEnd = addDays(
    billing?.trial_ends_at ? new Date(billing.trial_ends_at) : new Date(),
    30
  );

  await admin
    .from("tenant_billing")
    .update({
      trial_ends_at: newEnd.toISOString(),
      card_required_at: addDays(newEnd, -30).toISOString(),
      trial_extended_count: (billing?.trial_extended_count ?? 0) + 1,
    })
    .eq("tenant_id", tenantId);

  await admin.from("billing_events").insert({
    tenant_id: tenantId,
    event_type: "trial_extended",
    payload: { extended_to: newEnd.toISOString() },
  });

  revalidatePath("/admin/tenants");
}

export async function suspendTenantAction(formData: FormData) {
  await requirePlatformOperator();
  const tenantId = String(formData.get("tenant_id") || "");
  if (!tenantId) return;

  const admin = createAdminClient();
  await admin.from("tenants").update({ status: "suspended" }).eq("id", tenantId);
  revalidatePath("/admin/tenants");
}

export async function reactivateTenantAction(formData: FormData) {
  await requirePlatformOperator();
  const tenantId = String(formData.get("tenant_id") || "");
  if (!tenantId) return;

  const admin = createAdminClient();
  await admin.from("tenants").update({ status: "active" }).eq("id", tenantId);
  revalidatePath("/admin/tenants");
}
