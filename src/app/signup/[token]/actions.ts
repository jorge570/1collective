"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays } from "date-fns";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function signupViaInviteAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("full_name") || "").trim();
  const companyName = String(formData.get("company_name") || "").trim();

  const errorPath = `/signup/${token}?error=`;
  if (!email || !password || !fullName || !companyName) {
    redirect(`${errorPath}${encodeURIComponent("All fields are required.")}`);
  }

  const admin = createAdminClient();
  const supabase = await createClient();

  const { data: link } = await admin
    .from("invite_links")
    .select("id, billing_mode, trial_duration_days, max_redemptions, redemptions, expires_at, disabled_at")
    .eq("token", token)
    .maybeSingle();

  if (!link || link.disabled_at) {
    redirect(`${errorPath}${encodeURIComponent("This invite link is no longer valid.")}`);
    return;
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    redirect(`${errorPath}${encodeURIComponent("This invite link has expired.")}`);
    return;
  }
  if (link.max_redemptions !== null && link.redemptions >= link.max_redemptions) {
    redirect(`${errorPath}${encodeURIComponent("This invite link has reached its redemption limit.")}`);
    return;
  }

  // Create the auth user (no confirmation email needed since we provisioned them via invite)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr || !created.user) {
    redirect(`${errorPath}${encodeURIComponent(createErr?.message || "Could not create account.")}`);
    return;
  }
  const userId = created.user.id;

  // Create tenant
  const baseSlug = slugify(companyName) || "tenant";
  let slug = baseSlug;
  let suffix = 0;
  while (true) {
    const { data: existing } = await admin
      .from("tenants")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const { data: tenant, error: tenantErr } = await admin
    .from("tenants")
    .insert({
      name: companyName,
      slug,
      status: "onboarding",
      created_via_invite_id: link.id,
    })
    .select("id")
    .single();

  if (tenantErr || !tenant) {
    redirect(`${errorPath}${encodeURIComponent(tenantErr?.message || "Could not create workspace.")}`);
    return;
  }

  // Create user profile in our table
  await admin.from("users").insert({
    id: userId,
    tenant_id: tenant.id,
    email,
    full_name: fullName,
  });

  // Membership
  await admin.from("user_tenant_memberships").insert({
    user_id: userId,
    tenant_id: tenant.id,
    is_default: true,
  });

  // Provision per-tenant copies of system roles, copying permissions verbatim.
  const { data: systemRoles } = await admin
    .from("roles")
    .select("id, key, name, description, is_system, is_field, max_seats")
    .is("tenant_id", null);

  if (systemRoles && systemRoles.length > 0) {
    const tenantRolesPayload = systemRoles.map((r) => ({
      tenant_id: tenant.id,
      key: r.key,
      name: r.name,
      description: r.description,
      is_system: r.is_system,
      is_field: r.is_field,
      max_seats: r.max_seats,
    }));
    const { data: newTenantRoles } = await admin
      .from("roles")
      .insert(tenantRolesPayload)
      .select("id, key");

    // Copy permissions
    if (newTenantRoles) {
      const keyToNewRoleId = new Map(newTenantRoles.map((r) => [r.key, r.id] as const));
      const keyToOldRoleId = new Map(systemRoles.map((r) => [r.key, r.id] as const));
      const oldRoleIds = systemRoles.map((r) => r.id);

      const { data: oldPerms } = await admin
        .from("role_permissions")
        .select("role_id, module, can_read, can_write, can_edit, can_delete")
        .in("role_id", oldRoleIds);

      if (oldPerms) {
        const newPermsPayload = oldPerms
          .map((p) => {
            const oldRole = systemRoles.find((r) => r.id === p.role_id);
            if (!oldRole) return null;
            const newRoleId = keyToNewRoleId.get(oldRole.key);
            if (!newRoleId) return null;
            return {
              role_id: newRoleId,
              module: p.module,
              can_read: p.can_read,
              can_write: p.can_write,
              can_edit: p.can_edit,
              can_delete: p.can_delete,
            };
          })
          .filter((x) => x !== null);
        if (newPermsPayload.length > 0) {
          await admin.from("role_permissions").insert(newPermsPayload);
        }
      }

      // Assign the new user as Super Admin
      const superAdminRoleId = keyToNewRoleId.get("super_admin");
      if (superAdminRoleId) {
        await admin.from("user_role_assignments").insert({
          user_id: userId,
          role_id: superAdminRoleId,
          tenant_id: tenant.id,
          assigned_by: userId,
        });
      }
      void keyToOldRoleId;
    }
  }

  // Billing state from invite terms
  const now = new Date();
  let trialEndsAt: string | null = null;
  let cardRequiredAt: string | null = null;
  let billingStatus: "trialing" | "active" | "free_forever" = "trialing";

  if (link.billing_mode === "free_forever") {
    billingStatus = "free_forever";
  } else if (link.billing_mode === "free_trial" && link.trial_duration_days) {
    const ends = addDays(now, link.trial_duration_days);
    trialEndsAt = ends.toISOString();
    cardRequiredAt = addDays(ends, -30).toISOString();
  } else if (link.billing_mode === "paid_immediate") {
    billingStatus = "active";
  }

  await admin.from("tenant_billing").insert({
    tenant_id: tenant.id,
    billing_mode: link.billing_mode,
    trial_started_at: now.toISOString(),
    trial_ends_at: trialEndsAt,
    card_required_at: cardRequiredAt,
    billing_status: billingStatus,
  });

  // Onboarding progress row
  await admin.from("onboarding_progress").insert({
    tenant_id: tenant.id,
    current_step_key: "company_info",
    completed_steps: [],
    step_state: {},
  });

  // Invite redemption
  await admin.from("invite_link_redemptions").insert({
    invite_link_id: link.id,
    tenant_id: tenant.id,
    redeeming_user_id: userId,
  });
  await admin
    .from("invite_links")
    .update({ redemptions: link.redemptions + 1 })
    .eq("id", link.id);

  // Sign the user in
  await supabase.auth.signInWithPassword({ email, password });

  redirect("/onboarding");
}
