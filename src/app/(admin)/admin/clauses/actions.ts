"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformOperator } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createClauseAction(formData: FormData) {
  const operator = await requirePlatformOperator();
  const title = String(formData.get("title") || "").trim();
  const clauseText = String(formData.get("clause_text") || "").trim();
  const linkedId = String(formData.get("linked_checklist_item_id") || "") || null;
  const tagsRaw = String(formData.get("tags") || "").trim();
  const tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  if (!title || !clauseText) return;

  const admin = createAdminClient();
  await admin.from("admin_clause_library").insert({
    title,
    clause_text: clauseText,
    linked_checklist_item_id: linkedId,
    tags,
    is_active: true,
    created_by: operator.userId,
  });

  revalidatePath("/admin/clauses");
}

export async function toggleClauseAction(formData: FormData) {
  await requirePlatformOperator();
  const id = String(formData.get("clause_id") || "");
  if (!id) return;

  const admin = createAdminClient();
  const { data: c } = await admin
    .from("admin_clause_library")
    .select("is_active")
    .eq("id", id)
    .single();

  await admin
    .from("admin_clause_library")
    .update({ is_active: !c?.is_active })
    .eq("id", id);

  revalidatePath("/admin/clauses");
}
