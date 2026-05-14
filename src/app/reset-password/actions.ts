"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function resetPasswordAction(formData: FormData) {
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  const errPath = "/reset-password?error=";
  if (password.length < 8) {
    redirect(`${errPath}${encodeURIComponent("Password must be at least 8 characters.")}`);
  }
  if (password !== confirm) {
    redirect(`${errPath}${encodeURIComponent("Passwords do not match.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(`${errPath}${encodeURIComponent(error.message)}`);
  }
  redirect("/app");
}
