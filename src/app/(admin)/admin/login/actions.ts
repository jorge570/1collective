"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function adminLoginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !authData.user) {
    redirect(
      `/admin/login?error=${encodeURIComponent(error?.message || "Sign in failed")}`
    );
    return;
  }

  // Verify the user is a platform operator. If not, sign back out and bounce.
  const admin = createAdminClient();
  const { data: operator } = await admin
    .from("platform_operators")
    .select("id")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (!operator) {
    await supabase.auth.signOut();
    redirect(
      `/admin/login?error=${encodeURIComponent("This account is not authorized for admin access.")}`
    );
  }

  redirect("/admin");
}
