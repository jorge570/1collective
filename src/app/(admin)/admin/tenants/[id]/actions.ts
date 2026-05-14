"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformOperator } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays } from "date-fns";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function updateTenantProfileAction(formData: FormData) {
  await requirePlatformOperator();
  const tenantId = String(formData.get("tenant_id") || "");
  if (!tenantId) return;

  const name = String(formData.get("name") || "").trim();
  const rawSlug = String(formData.get("slug") || "").trim();
  const googleDomain = String(formData.get("google_workspace_domain") || "").trim();
  const trades = formData.getAll("trade_types").map(String);

  if (!name) return;
  const slug = slugify(rawSlug || name);

  const admin = createAdminClient();
  await admin
    .from("tenants")
    .update({
      name,
      slug,
      google_workspace_domain: googleDomain || null,
      trade_types: trades,
    })
    .eq("id", tenantId);

  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath(`/admin/tenants`);
}

export async function setTenantStatusAction(formData: FormData) {
  await requirePlatformOperator();
  const tenantId = String(formData.get("tenant_id") || "");
  const status = String(formData.get("status") || "");
  if (!tenantId || !status) return;

  const allowed = new Set(["onboarding", "active", "suspended", "trial_expired"]);
  if (!allowed.has(status)) return;

  const admin = createAdminClient();
  await admin.from("tenants").update({ status }).eq("id", tenantId);

  await admin.from("billing_events").insert({
    tenant_id: tenantId,
    event_type: "status_changed",
    payload: { new_status: status },
  });

  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath(`/admin/tenants`);
}

export async function extendTrialDaysAction(formData: FormData) {
  await requirePlatformOperator();
  const tenantId = String(formData.get("tenant_id") || "");
  const daysRaw = Number(formData.get("days"));
  if (!tenantId || !Number.isFinite(daysRaw) || daysRaw <= 0) return;
  const days = Math.min(Math.floor(daysRaw), 365 * 5);

  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("tenant_billing")
    .select("trial_ends_at, trial_extended_count")
    .eq("tenant_id", tenantId)
    .single();

  const base = billing?.trial_ends_at ? new Date(billing.trial_ends_at) : new Date();
  const newEnd = addDays(base, days);

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
    payload: { extended_to: newEnd.toISOString(), by_days: days },
  });

  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath(`/admin/tenants`);
}

export async function setCustomTrialEndAction(formData: FormData) {
  await requirePlatformOperator();
  const tenantId = String(formData.get("tenant_id") || "");
  const dateStr = String(formData.get("trial_end") || "");
  if (!tenantId || !dateStr) return;

  // Treat the form-supplied date as end-of-day UTC so a trial set to 2026-06-30
  // expires at the end of June 30 rather than at 00:00.
  const newEnd = new Date(`${dateStr}T23:59:59.000Z`);
  if (isNaN(newEnd.getTime())) return;

  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("tenant_billing")
    .select("trial_extended_count")
    .eq("tenant_id", tenantId)
    .single();

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
    event_type: "trial_end_set",
    payload: { new_trial_end: newEnd.toISOString() },
  });

  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath(`/admin/tenants`);
}
