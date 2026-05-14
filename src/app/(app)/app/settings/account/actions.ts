"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const PATH = "/app/settings/account";

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://1-collective.replit.app";
}

export async function changePasswordAction(formData: FormData) {
  const current = String(formData.get("current_password") || "");
  const next = String(formData.get("new_password") || "");
  const confirm = String(formData.get("confirm_password") || "");

  if (next.length < 8) {
    redirect(`${PATH}?error=${encodeURIComponent("New password must be at least 8 characters.")}`);
  }
  if (next !== confirm) {
    redirect(`${PATH}?error=${encodeURIComponent("New passwords do not match.")}`);
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.email) {
    redirect(`/login?error=${encodeURIComponent("Session expired.")}`);
  }

  // Re-verify current password before allowing change.
  const verify = await supabase.auth.signInWithPassword({
    email: userData.user!.email!,
    password: current,
  });
  if (verify.error) {
    redirect(`${PATH}?error=${encodeURIComponent("Current password is incorrect.")}`);
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    redirect(`${PATH}?error=${encodeURIComponent(error.message)}`);
  }
  redirect(`${PATH}?success=password`);
}

export async function changeEmailAction(formData: FormData) {
  const newEmail = String(formData.get("new_email") || "").trim().toLowerCase();
  if (!newEmail) {
    redirect(`${PATH}?error=${encodeURIComponent("New email is required.")}`);
  }

  const supabase = await createClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(PATH)}`,
    }
  );
  if (error) {
    redirect(`${PATH}?error=${encodeURIComponent(error.message)}`);
  }
  redirect(`${PATH}?success=email`);
}
