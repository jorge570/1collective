"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isModuleEnabled } from "@/foundational/registry";
import { actionError, actionOk, parseForm, type ActionResult } from "@/lib/validation";
import { log } from "@/lib/log";
import {
  createEstimateSchema,
  createLineItemSchema,
  estimateIdSchema,
  lineItemIdSchema,
  lineItemTotalCents,
  MAX_LINE_ITEMS,
  setStatusSchema,
  taxCents,
  tenThousandthsToDecimalString,
  updateEstimateSchema,
  updateLineItemSchema,
} from "./schemas";
import { nextEstimateNumber } from "./numbering";
import { renderEstimatePdf } from "./pdf";

type Admin = ReturnType<typeof createAdminClient>;

function ensureEnabled() {
  if (!isModuleEnabled("estimating")) {
    throw new Error("Estimating module is disabled");
  }
}

async function loadOwnedEstimate(admin: Admin, tenantId: string, estimateId: string) {
  const { data } = await admin
    .from("cc_estimates")
    .select("id, tenant_id, status, tax_rate_bps")
    .eq("id", estimateId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) throw new Error("Estimate not found");
  return data;
}

async function assertCompanyOwned(admin: Admin, tenantId: string, companyId: string | null) {
  if (!companyId) return;
  const { data } = await admin
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) throw new Error("Selected customer does not belong to this workspace.");
}

async function assertProjectOwned(admin: Admin, tenantId: string, projectId: string | null) {
  if (!projectId) return;
  const { data } = await admin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) throw new Error("Selected project does not belong to this workspace.");
}

async function recomputeTotals(
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
  const total = subtotal + tax;
  const { error: upErr } = await admin
    .from("cc_estimates")
    .update({ subtotal_cents: subtotal, tax_cents: tax, total_cents: total })
    .eq("id", estimateId)
    .eq("tenant_id", tenantId);
  if (upErr) throw new Error(`Could not update totals: ${upErr.message}`);
}

export async function createEstimate(
  formData: FormData
): Promise<ActionResult<{ estimate_id: string }>> {
  ensureEnabled();
  const session = await requireTenantUser();

  const parsed = parseForm(createEstimateSchema, formData);
  if (!parsed.ok) return parsed;

  const admin = createAdminClient();
  await assertCompanyOwned(admin, session.tenantId, parsed.data.company_id ?? null);
  await assertProjectOwned(admin, session.tenantId, parsed.data.project_id ?? null);

  // Defense in depth: even though numbering is now atomic in Postgres, retry
  // on the (vanishingly unlikely) unique-key collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const estimateNumber = await nextEstimateNumber(admin, session.tenantId);
    const id = crypto.randomUUID();
    const { error } = await admin.from("cc_estimates").insert({
      id,
      tenant_id: session.tenantId,
      estimate_number: estimateNumber,
      title: parsed.data.title,
      company_id: parsed.data.company_id ?? null,
      project_id: parsed.data.project_id ?? null,
      status: "draft",
      tax_rate_bps: parsed.data.tax_rate_percent,
      valid_until: parsed.data.valid_until,
      notes: parsed.data.notes,
      terms: parsed.data.terms,
      created_by: session.userId,
    });
    if (!error) {
      log.info("estimate.create.success", {
        tenant_id: session.tenantId,
        estimate_id: id,
        estimate_number: estimateNumber,
      });
      revalidatePath("/app/estimating");
      return actionOk({ estimate_id: id });
    }
    if (error.code !== "23505") {
      log.error("estimate.create.failed", {
        tenant_id: session.tenantId,
        err: error.message,
      });
      return actionError("Could not create estimate. Please try again.");
    }
    log.warn("estimate.create.number_collision_retrying", {
      tenant_id: session.tenantId,
      attempt,
    });
  }
  return actionError("Could not allocate an estimate number. Please try again.");
}

export async function updateEstimate(formData: FormData): Promise<ActionResult> {
  ensureEnabled();
  const session = await requireTenantUser();

  const parsed = parseForm(updateEstimateSchema, formData);
  if (!parsed.ok) return parsed;

  const admin = createAdminClient();
  await loadOwnedEstimate(admin, session.tenantId, parsed.data.estimate_id);
  await assertCompanyOwned(admin, session.tenantId, parsed.data.company_id ?? null);
  await assertProjectOwned(admin, session.tenantId, parsed.data.project_id ?? null);

  const { error } = await admin
    .from("cc_estimates")
    .update({
      title: parsed.data.title,
      company_id: parsed.data.company_id ?? null,
      project_id: parsed.data.project_id ?? null,
      tax_rate_bps: parsed.data.tax_rate_percent,
      valid_until: parsed.data.valid_until,
      notes: parsed.data.notes,
      terms: parsed.data.terms,
    })
    .eq("id", parsed.data.estimate_id)
    .eq("tenant_id", session.tenantId);
  if (error) {
    return actionError("Could not save changes. Please try again.");
  }

  await recomputeTotals(
    admin,
    session.tenantId,
    parsed.data.estimate_id,
    parsed.data.tax_rate_percent
  );
  revalidatePath(`/app/estimating/${parsed.data.estimate_id}`);
  revalidatePath("/app/estimating");
  return actionOk();
}

export async function deleteEstimate(formData: FormData): Promise<void> {
  ensureEnabled();
  const session = await requireTenantUser();
  const parsed = estimateIdSchema.safeParse({ estimate_id: formData.get("estimate_id") });
  if (!parsed.success) throw new Error("Invalid estimate id");

  const admin = createAdminClient();
  await loadOwnedEstimate(admin, session.tenantId, parsed.data.estimate_id);
  const { error } = await admin
    .from("cc_estimates")
    .delete()
    .eq("id", parsed.data.estimate_id)
    .eq("tenant_id", session.tenantId);
  if (error) throw new Error("Could not delete estimate.");
  revalidatePath("/app/estimating");
  redirect("/app/estimating");
}

export async function setEstimateStatus(formData: FormData): Promise<ActionResult> {
  ensureEnabled();
  const session = await requireTenantUser();

  const parsed = setStatusSchema.safeParse({
    estimate_id: formData.get("estimate_id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return actionError("Invalid status update.");

  const admin = createAdminClient();
  await loadOwnedEstimate(admin, session.tenantId, parsed.data.estimate_id);

  const now = new Date().toISOString();
  const patch: Record<string, string | null> = { status: parsed.data.status };
  if (parsed.data.status === "sent") patch.sent_at = now;
  if (parsed.data.status === "accepted") patch.accepted_at = now;
  if (parsed.data.status === "declined") patch.declined_at = now;

  const { error } = await admin
    .from("cc_estimates")
    .update(patch)
    .eq("id", parsed.data.estimate_id)
    .eq("tenant_id", session.tenantId);
  if (error) return actionError("Could not update status.");
  revalidatePath(`/app/estimating/${parsed.data.estimate_id}`);
  revalidatePath("/app/estimating");
  return actionOk();
}

export async function addLineItem(formData: FormData): Promise<ActionResult> {
  ensureEnabled();
  const session = await requireTenantUser();

  const parsed = parseForm(createLineItemSchema, formData);
  if (!parsed.ok) return parsed;

  const admin = createAdminClient();
  const estimate = await loadOwnedEstimate(admin, session.tenantId, parsed.data.estimate_id);

  const { count, error: countErr } = await admin
    .from("cc_estimate_line_items")
    .select("id", { count: "exact", head: true })
    .eq("estimate_id", parsed.data.estimate_id)
    .eq("tenant_id", session.tenantId);
  if (countErr) return actionError("Could not load line items.");
  if ((count ?? 0) >= MAX_LINE_ITEMS) {
    return actionError(`This estimate already has the maximum ${MAX_LINE_ITEMS} line items.`);
  }

  const total = lineItemTotalCents(parsed.data.quantity, parsed.data.unit_price);
  const { error } = await admin.from("cc_estimate_line_items").insert({
    estimate_id: parsed.data.estimate_id,
    tenant_id: session.tenantId,
    position: count ?? 0,
    description: parsed.data.description,
    quantity: tenThousandthsToDecimalString(parsed.data.quantity),
    unit: parsed.data.unit,
    unit_price_cents: parsed.data.unit_price,
    total_cents: total,
  });
  if (error) return actionError("Could not add line item.");

  await recomputeTotals(
    admin,
    session.tenantId,
    parsed.data.estimate_id,
    estimate.tax_rate_bps
  );
  revalidatePath(`/app/estimating/${parsed.data.estimate_id}`);
  return actionOk();
}

export async function updateLineItem(formData: FormData): Promise<ActionResult> {
  ensureEnabled();
  const session = await requireTenantUser();

  const parsed = parseForm(updateLineItemSchema, formData);
  if (!parsed.ok) return parsed;

  const admin = createAdminClient();
  const estimate = await loadOwnedEstimate(admin, session.tenantId, parsed.data.estimate_id);

  const total = lineItemTotalCents(parsed.data.quantity, parsed.data.unit_price);
  const { error } = await admin
    .from("cc_estimate_line_items")
    .update({
      description: parsed.data.description,
      quantity: tenThousandthsToDecimalString(parsed.data.quantity),
      unit: parsed.data.unit,
      unit_price_cents: parsed.data.unit_price,
      total_cents: total,
    })
    .eq("id", parsed.data.line_item_id)
    .eq("tenant_id", session.tenantId)
    .eq("estimate_id", parsed.data.estimate_id);
  if (error) return actionError("Could not update line item.");

  await recomputeTotals(
    admin,
    session.tenantId,
    parsed.data.estimate_id,
    estimate.tax_rate_bps
  );
  revalidatePath(`/app/estimating/${parsed.data.estimate_id}`);
  return actionOk();
}

export async function deleteLineItem(formData: FormData): Promise<void> {
  ensureEnabled();
  const session = await requireTenantUser();

  const parsed = lineItemIdSchema
    .extend({ estimate_id: estimateIdSchema.shape.estimate_id })
    .safeParse({
      line_item_id: formData.get("line_item_id"),
      estimate_id: formData.get("estimate_id"),
    });
  if (!parsed.success) throw new Error("Invalid line item id");

  const admin = createAdminClient();
  const estimate = await loadOwnedEstimate(admin, session.tenantId, parsed.data.estimate_id);

  const { error } = await admin
    .from("cc_estimate_line_items")
    .delete()
    .eq("id", parsed.data.line_item_id)
    .eq("tenant_id", session.tenantId)
    .eq("estimate_id", parsed.data.estimate_id);
  if (error) throw new Error("Could not delete line item.");

  await recomputeTotals(
    admin,
    session.tenantId,
    parsed.data.estimate_id,
    estimate.tax_rate_bps
  );
  revalidatePath(`/app/estimating/${parsed.data.estimate_id}`);
}

export async function downloadEstimatePdf(formData: FormData): Promise<void> {
  ensureEnabled();
  const session = await requireTenantUser();

  const parsed = estimateIdSchema.safeParse({ estimate_id: formData.get("estimate_id") });
  if (!parsed.success) throw new Error("Invalid estimate id");

  const admin = createAdminClient();
  await loadOwnedEstimate(admin, session.tenantId, parsed.data.estimate_id);

  const { buffer, estimateNumber } = await renderEstimatePdf({
    admin,
    tenantId: session.tenantId,
    estimateId: parsed.data.estimate_id,
  });

  log.info("estimate.pdf.generated", {
    tenant_id: session.tenantId,
    estimate_id: parsed.data.estimate_id,
    bytes: buffer.length,
  });

  const path = `vault/${session.tenantId}/estimate-${parsed.data.estimate_id}-${Date.now()}.pdf`;
  const { error: upErr } = await admin.storage
    .from("documents")
    .upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (upErr) throw new Error("Could not stage PDF for download.");

  const { data: signed, error: sErr } = await admin.storage
    .from("documents")
    .createSignedUrl(path, 60, { download: `${estimateNumber}.pdf` });
  if (sErr || !signed) throw new Error("Could not sign PDF download link.");

  redirect(signed.signedUrl);
}

import { convertEstimateToInvoiceSchema } from "@/lib/invoicing/schemas";
import { nextInvoiceNumber } from "@/lib/invoicing/numbering";

export async function convertEstimateToInvoice(
  formData: FormData
): Promise<ActionResult<{ invoice_id: string }>> {
  ensureEnabled();
  if (!isModuleEnabled("invoicing")) {
    return actionError("Invoicing module is disabled.");
  }
  const session = await requireTenantUser();

  const parsed = parseForm(convertEstimateToInvoiceSchema, formData);
  if (!parsed.ok) return parsed;

  const admin = createAdminClient();
  const { data: estimate } = await admin
    .from("cc_estimates")
    .select(
      "id, tenant_id, title, status, company_id, project_id, subtotal_cents, tax_rate_bps, tax_cents, total_cents, notes, terms"
    )
    .eq("id", parsed.data.estimate_id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!estimate) return actionError("Estimate not found.");
  if (estimate.status !== "accepted") {
    return actionError("Only accepted estimates can be converted to an invoice.");
  }

  const { data: existing } = await admin
    .from("cc_invoices")
    .select("id")
    .eq("tenant_id", session.tenantId)
    .eq("source_estimate_id", estimate.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) {
    return actionError("This estimate has already been converted to an invoice.");
  }

  const { data: items, error: liErr } = await admin
    .from("cc_estimate_line_items")
    .select("position, description, quantity, unit, unit_price_cents, total_cents")
    .eq("estimate_id", estimate.id)
    .eq("tenant_id", session.tenantId)
    .order("position", { ascending: true });
  if (liErr) return actionError("Could not load line items.");

  let invoiceId = "";
  let allocated = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const invoiceNumber = await nextInvoiceNumber(admin, session.tenantId);
    const id = crypto.randomUUID();
    const { error } = await admin.from("cc_invoices").insert({
      id,
      tenant_id: session.tenantId,
      invoice_number: invoiceNumber,
      title: estimate.title,
      company_id: estimate.company_id,
      project_id: estimate.project_id,
      source_estimate_id: estimate.id,
      status: "draft",
      subtotal_cents: estimate.subtotal_cents,
      tax_rate_bps: estimate.tax_rate_bps,
      tax_cents: estimate.tax_cents,
      total_cents: estimate.total_cents,
      due_date: parsed.data.due_date,
      notes: estimate.notes,
      terms: estimate.terms,
      created_by: session.userId,
    });
    if (!error) {
      invoiceId = id;
      allocated = true;
      log.info("estimate.convert.success", {
        tenant_id: session.tenantId,
        estimate_id: estimate.id,
        invoice_id: id,
        invoice_number: invoiceNumber,
      });
      break;
    }
    if (error.code === "23505") {
      const detail = `${error.message} ${"details" in error ? (error as { details?: string }).details ?? "" : ""}`;
      if (detail.includes("source_estimate")) {
        return actionError("This estimate has already been converted to an invoice.");
      }
      continue;
    }
    log.error("estimate.convert.failed", {
      tenant_id: session.tenantId,
      estimate_id: estimate.id,
      err: error.message,
    });
    return actionError("Could not create invoice from estimate.");
  }
  if (!allocated) {
    return actionError("Could not allocate an invoice number. Please try again.");
  }

  if ((items ?? []).length > 0) {
    const rows = (items ?? []).map((li) => ({
      invoice_id: invoiceId,
      tenant_id: session.tenantId,
      position: li.position,
      description: li.description,
      quantity: li.quantity,
      unit: li.unit,
      unit_price_cents: li.unit_price_cents,
      total_cents: li.total_cents,
    }));
    const { error: insErr } = await admin.from("cc_invoice_line_items").insert(rows);
    if (insErr) {
      await admin
        .from("cc_invoices")
        .delete()
        .eq("id", invoiceId)
        .eq("tenant_id", session.tenantId);
      return actionError("Could not copy line items to invoice.");
    }
  }

  revalidatePath("/app/invoicing");
  revalidatePath(`/app/estimating/${estimate.id}`);
  return actionOk({ invoice_id: invoiceId });
}
