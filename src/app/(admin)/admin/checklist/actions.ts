"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformOperator } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createChecklistItemAction(formData: FormData) {
  const operator = await requirePlatformOperator();
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const category = String(formData.get("category") || "").trim() || null;
  const priority = String(formData.get("priority_default") || "high");
  const orderIndex = Number(formData.get("order_index") || 0);

  if (!title) return;

  const admin = createAdminClient();
  await admin.from("admin_checklist_items").insert({
    title,
    description,
    category,
    priority_default: priority,
    order_index: orderIndex,
    is_active: true,
    created_by: operator.userId,
  });

  revalidatePath("/admin/checklist");
}

export async function toggleChecklistItemAction(formData: FormData) {
  await requirePlatformOperator();
  const itemId = String(formData.get("item_id") || "");
  if (!itemId) return;

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("admin_checklist_items")
    .select("is_active")
    .eq("id", itemId)
    .single();

  await admin
    .from("admin_checklist_items")
    .update({ is_active: !current?.is_active })
    .eq("id", itemId);

  revalidatePath("/admin/checklist");
}

export async function reorderChecklistAction(formData: FormData) {
  await requirePlatformOperator();
  const itemId = String(formData.get("item_id") || "");
  const direction = String(formData.get("direction") || "");
  if (!itemId || !["up", "down"].includes(direction)) return;

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("admin_checklist_items")
    .select("id, order_index")
    .eq("id", itemId)
    .single();
  if (!current) return;

  const op = direction === "up" ? "<" : ">";
  const sortDir = direction === "up" ? "desc" : "asc";

  const { data: neighbor } = await admin
    .from("admin_checklist_items")
    .select("id, order_index")
    .filter("order_index", op, current.order_index)
    .order("order_index", { ascending: sortDir === "asc" })
    .limit(1)
    .maybeSingle();

  if (!neighbor) return;

  await admin
    .from("admin_checklist_items")
    .update({ order_index: neighbor.order_index })
    .eq("id", current.id);
  await admin
    .from("admin_checklist_items")
    .update({ order_index: current.order_index })
    .eq("id", neighbor.id);

  revalidatePath("/admin/checklist");
}
