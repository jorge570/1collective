"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEV_LOGIN_EMAIL, DEV_LOGIN_PASSWORD, isDevLoginEnabled } from "./dev-config";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/app");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect(next);
}

export async function devLoginAction(formData: FormData) {
  if (!isDevLoginEnabled()) {
    redirect(`/login?error=${encodeURIComponent("Developer login is disabled")}`);
  }
  const next = String(formData.get("next") || "/app");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: DEV_LOGIN_EMAIL,
    password: DEV_LOGIN_PASSWORD,
  });
  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(
        `Dev login failed: ${error.message}. Run scripts/seed-dev-account.mjs.`
      )}`
    );
  }
  redirect(next);
}
