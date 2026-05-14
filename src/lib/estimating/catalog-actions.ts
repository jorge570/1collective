"use server";

// [CC-FOUNDATION] Catalog CRUD + "insert into estimate" Server Actions.
// All writes are tenant-scoped; catalog rows are soft-deleted by setting
// is_active=false so historical estimates that referenced them can still
// resolve a name in audit views.

import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isModuleEnabled } from "@/foundational/registry";
import { actionError, actionOk, parseForm, type ActionResult } from "@/lib/validation";
import { log } from "@/lib/log";
import {
  catalogItemIdSchema,
  createCatalogItemSchema,
  updateCatalogItemSchema,
  addLineItemFromCatalogSchema,
} from "./catalog-schemas";
import {
  lineItemTotalCents,
  MAX_LINE_ITEMS,
  quantityToTenThousandths,
  taxCents,
  tenThousandthsToDecimalString,
} from "./schemas";

type Admin = ReturnType<typeof createAdminClient>;

function ensureEnabled() {
  if (!isModuleEnabled("estimating")) {
    throw new Error("Estimating module is disabled");
  }
}

async function recomputeEstimateTotals(
  admin: Admin,
  tenantId: string,
  estimateId: string,
  taxRateBps: number
) {
  const { data: items, error } = await admin
    .from("cc_estimate_line_items")
    .select("total_cents")
    .eq("estimate_id", estimateId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`Could not load line items: ${error.message}`);
  const subtotal = (items ?? []).reduce((sum, li) => sum + Number(li.total_cents), 0);
  const tax = taxCents(subtotal, taxRateBps);
  const { error: upErr } = await admin
    .from("cc_estimates")
    .update({ subtotal_cents: subtotal, tax_cents: tax, total_cents: subtotal + tax })
    .eq("id", estimateId)
    .eq("tenant_id", tenantId);
  if (upErr) throw new Error(`Could not update totals: ${upErr.message}`);
}

export async function createCatalogItem(
  formData: FormData
): Promise<ActionResult<{ catalog_item_id: string }>> {
  ensureEnabled();
  const session = await requireTenantUser();

  const parsed = parseForm(createCatalogItemSchema, formData);
  if (!parsed.ok) return parsed;

  const admin = createAdminClient();
  const id = crypto.randomUUID();
  const { error } = await admin.from("cc_estimate_catalog_items").insert({
    id,
    tenant_id: session.tenantId,
    name: parsed.data.name,
    description: parsed.data.description,
    unit: parsed.data.unit,
    default_price_cents: parsed.data.default_price,
    category: parsed.data.category,
    is_active: true,
  });
  if (error) {
    log.error("catalog.create.failed", {
      tenant_id: session.tenantId,
      err: error.message,
    });
    return actionError("Could not create catalog item.");
  }
  log.info("catalog.create.success", {
    tenant_id: session.tenantId,
    catalog_item_id: id,
  });
  revalidatePath("/app/estimating/catalog");
  return actionOk({ catalog_item_id: id });
}

export async function updateCatalogItem(formData: FormData): Promise<ActionResult> {
  ensureEnabled();
  const session = await requireTenantUser();

  const parsed = parseForm(updateCatalogItemSchema, formData);
  if (!parsed.ok) return parsed;

  const admin = createAdminClient();
  const { error } = await admin
    .from("cc_estimate_catalog_items")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      unit: parsed.data.unit,
      default_price_cents: parsed.data.default_price,
      category: parsed.data.category,
      is_active: parsed.data.is_active,
    })
    .eq("id", parsed.data.catalog_item_id)
    .eq("tenant_id", session.tenantId);
  if (error) {
    log.error("catalog.update.failed", {
      tenant_id: session.tenantId,
      err: error.message,
    });
    return actionError("Could not save catalog item.");
  }
  revalidatePath("/app/estimating/catalog");
  revalidatePath(`/app/estimating/catalog/${parsed.data.catalog_item_id}`);
  return actionOk();
}

export async function deactivateCatalogItem(formData: FormData): Promise<ActionResult> {
  ensureEnabled();
  const session = await requireTenantUser();
  const parsed = catalogItemIdSchema.safeParse({
    catalog_item_id: formData.get("catalog_item_id"),
  });
  if (!parsed.success) return actionError("Invalid catalog item id.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("cc_estimate_catalog_items")
    .update({ is_active: false })
    .eq("id", parsed.data.catalog_item_id)
    .eq("tenant_id", session.tenantId);
  if (error) return actionError("Could not deactivate catalog item.");
  revalidatePath("/app/estimating/catalog");
  return actionOk();
}

export async function reactivateCatalogItem(formData: FormData): Promise<ActionResult> {
  ensureEnabled();
  const session = await requireTenantUser();
  const parsed = catalogItemIdSchema.safeParse({
    catalog_item_id: formData.get("catalog_item_id"),
  });
  if (!parsed.success) return actionError("Invalid catalog item id.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("cc_estimate_catalog_items")
    .update({ is_active: true })
    .eq("id", parsed.data.catalog_item_id)
    .eq("tenant_id", session.tenantId);
  if (error) return actionError("Could not reactivate catalog item.");
  revalidatePath("/app/estimating/catalog");
  return actionOk();
}

export async function addLineItemFromCatalog(formData: FormData): Promise<ActionResult> {
  ensureEnabled();
  const session = await requireTenantUser();

  const parsed = addLineItemFromCatalogSchema.safeParse({
    estimate_id: formData.get("estimate_id"),
    catalog_item_id: formData.get("catalog_item_id"),
    quantity: formData.get("quantity") ?? "1",
  });
  if (!parsed.success) return actionError("Invalid catalog selection.");

  const admin = createAdminClient();

  const { data: estimate } = await admin
    .from("cc_estimates")
    .select("id, tenant_id, status, tax_rate_bps")
    .eq("id", parsed.data.estimate_id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!estimate) return actionError("Estimate not found.");

  const { data: item } = await admin
    .from("cc_estimate_catalog_items")
    .select("id, name, description, unit, default_price_cents, is_active")
    .eq("id", parsed.data.catalog_item_id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!item) return actionError("Catalog item not found.");
  if (!item.is_active) return actionError("That catalog item is inactive.");

  let qtyTt: number;
  try {
    qtyTt = quantityToTenThousandths(parsed.data.quantity);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Invalid quantity.");
  }

  const { count, error: countErr } = await admin
    .from("cc_estimate_line_items")
    .select("id", { count: "exact", head: true })
    .eq("estimate_id", parsed.data.estimate_id)
    .eq("tenant_id", session.tenantId);
  if (countErr) return actionError("Could not load line items.");
  if ((count ?? 0) >= MAX_LINE_ITEMS) {
    return actionError(`This estimate already has the maximum ${MAX_LINE_ITEMS} line items.`);
  }

  const unitPriceCents = Number(item.default_price_cents);
  const total = lineItemTotalCents(qtyTt, unitPriceCents);
  const description = item.description ? `${item.name} — ${item.description}` : item.name;

  const { error } = await admin.from("cc_estimate_line_items").insert({
    estimate_id: parsed.data.estimate_id,
    tenant_id: session.tenantId,
    position: count ?? 0,
    description,
    quantity: tenThousandthsToDecimalString(qtyTt),
    unit: item.unit,
    unit_price_cents: unitPriceCents,
    total_cents: total,
  });
  if (error) return actionError("Could not add line item.");

  await recomputeEstimateTotals(
    admin,
    session.tenantId,
    parsed.data.estimate_id,
    estimate.tax_rate_bps
  );
  revalidatePath(`/app/estimating/${parsed.data.estimate_id}`);
  return actionOk();
}
