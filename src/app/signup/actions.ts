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

const TRIAL_DAYS = 14;

export async function signupAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("full_name") || "").trim();
  const companyName = String(formData.get("company_name") || "").trim();

  const errPath = "/signup?error=";
  if (!email || !password || !fullName || !companyName) {
    redirect(`${errPath}${encodeURIComponent("All fields are required.")}`);
  }
  if (password.length < 8) {
    redirect(`${errPath}${encodeURIComponent("Password must be at least 8 characters.")}`);
  }

  const admin = createAdminClient();
  const supabase = await createClient();

  // Disallow if email already in use anywhere in the system.
  const { data: existingUser } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingUser) {
    redirect(`${errPath}${encodeURIComponent("An account with this email already exists. Try signing in instead.")}`);
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr || !created.user) {
    redirect(`${errPath}${encodeURIComponent(createErr?.message || "Could not create account.")}`);
    return;
  }
  const userId = created.user.id;

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
    .insert({ name: companyName, slug, status: "onboarding" })
    .select("id")
    .single();
  if (tenantErr || !tenant) {
    await admin.auth.admin.deleteUser(userId);
    redirect(`${errPath}${encodeURIComponent(tenantErr?.message || "Could not create workspace.")}`);
    return;
  }

  await admin.from("users").insert({
    id: userId,
    tenant_id: tenant.id,
    email,
    full_name: fullName,
  });

  await admin.from("user_tenant_memberships").insert({
    user_id: userId,
    tenant_id: tenant.id,
    is_default: true,
  });

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

    if (newTenantRoles) {
      const keyToNewRoleId = new Map(newTenantRoles.map((r) => [r.key, r.id] as const));
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

      const superAdminRoleId = keyToNewRoleId.get("super_admin");
      if (superAdminRoleId) {
        await admin.from("user_role_assignments").insert({
          user_id: userId,
          role_id: superAdminRoleId,
          tenant_id: tenant.id,
          assigned_by: userId,
        });
      }
    }
  }

  const now = new Date();
  const trialEndsAt = addDays(now, TRIAL_DAYS).toISOString();
  await admin.from("tenant_billing").insert({
    tenant_id: tenant.id,
    billing_mode: "free_trial",
    trial_started_at: now.toISOString(),
    trial_ends_at: trialEndsAt,
    card_required_at: trialEndsAt,
    billing_status: "trialing",
  });

  await admin.from("onboarding_progress").insert({
    tenant_id: tenant.id,
    current_step_key: "company_info",
    completed_steps: [],
    step_state: {},
  });

  await supabase.auth.signInWithPassword({ email, password });
  redirect("/onboarding");
}
