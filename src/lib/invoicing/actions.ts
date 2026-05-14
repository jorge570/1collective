"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isModuleEnabled } from "@/foundational/registry";
import { actionError, actionOk, parseForm, type ActionResult } from "@/lib/validation";
import { log } from "@/lib/log";
import {
  createInvoiceSchema,
  createInvoiceLineItemSchema,
  invoiceIdSchema,
  invoiceLineItemIdSchema,
  recordInvoicePaymentSchema,
  setInvoiceStatusSchema,
  updateInvoiceSchema,
  updateInvoiceLineItemSchema,
  MAX_INVOICE_LINE_ITEMS,
} from "./schemas";
import {
  lineItemTotalCents,
  taxCents,
  tenThousandthsToDecimalString,
} from "@/lib/estimating/schemas";
import { nextInvoiceNumber } from "./numbering";
import { renderInvoicePdf } from "./pdf";

type Admin = ReturnType<typeof createAdminClient>;

function ensureEnabled() {
  if (!isModuleEnabled("invoicing")) {
    throw new Error("Invoicing module is disabled");
  }
}

async function loadOwnedInvoice(admin: Admin, tenantId: string, invoiceId: string) {
  const { data } = await admin
    .from("cc_invoices")
    .select("id, tenant_id, status, tax_rate_bps, total_cents, amount_paid_cents")
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) throw new Error("Invoice not found");
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

async function assertEstimateOwned(
  admin: Admin,
  tenantId: string,
  estimateId: string | null
) {
  if (!estimateId) return;
  const { data } = await admin
    .from("cc_estimates")
    .select("id")
    .eq("id", estimateId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) throw new Error("Source estimate does not belong to this workspace.");
}

async function recomputeInvoiceTotals(
  admin: Admin,
  tenantId: string,
  invoiceId: string,
  taxRateBps: number
) {
  const { data: items, error } = await admin
    .from("cc_invoice_line_items")
    .select("total_cents")
    .eq("invoice_id", invoiceId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`Could not load line items: ${error.message}`);
  const subtotal = (items ?? []).reduce((sum, li) => sum + Number(li.total_cents), 0);
  const tax = taxCents(subtotal, taxRateBps);
  const { error: upErr } = await admin
    .from("cc_invoices")
    .update({ subtotal_cents: subtotal, tax_cents: tax, total_cents: subtotal + tax })
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId);
  if (upErr) throw new Error(`Could not update totals: ${upErr.message}`);
}

export async function createInvoice(
  formData: FormData
): Promise<ActionResult<{ invoice_id: string }>> {
  ensureEnabled();
  const session = await requireTenantUser();

  const parsed = parseForm(createInvoiceSchema, formData);
  if (!parsed.ok) return parsed;

  const admin = createAdminClient();
  await assertCompanyOwned(admin, session.tenantId, parsed.data.company_id ?? null);
  await assertProjectOwned(admin, session.tenantId, parsed.data.project_id ?? null);
  await assertEstimateOwned(admin, session.tenantId, parsed.data.source_estimate_id ?? null);

  for (let attempt = 0; attempt < 3; attempt++) {
    const invoiceNumber = await nextInvoiceNumber(admin, session.tenantId);
    const id = crypto.randomUUID();
    const { error } = await admin.from("cc_invoices").insert({
      id,
      tenant_id: session.tenantId,
      invoice_number: invoiceNumber,
      title: parsed.data.title,
      company_id: parsed.data.company_id ?? null,
      project_id: parsed.data.project_id ?? null,
      source_estimate_id: parsed.data.source_estimate_id ?? null,
      status: "draft",
      tax_rate_bps: parsed.data.tax_rate_percent,
      due_date: parsed.data.due_date,
      notes: parsed.data.notes,
      terms: parsed.data.terms,
      created_by: session.userId,
    });
    if (!error) {
      log.info("invoice.create.success", {
        tenant_id: session.tenantId,
        invoice_id: id,
        invoice_number: invoiceNumber,
      });
      revalidatePath("/app/invoicing");
      return actionOk({ invoice_id: id });
    }
    if (error.code !== "23505") {
      log.error("invoice.create.failed", {
        tenant_id: session.tenantId,
        err: error.message,
      });
      return actionError("Could not create invoice. Please try again.");
    }
    log.warn("invoice.create.number_collision_retrying", {
      tenant_id: session.tenantId,
      attempt,
    });
  }
  return actionError("Could not allocate an invoice number. Please try again.");
}

export async function updateInvoice(formData: FormData): Promise<ActionResult> {
  ensureEnabled();
  const session = await requireTenantUser();

  const parsed = parseForm(updateInvoiceSchema, formData);
  if (!parsed.ok) return parsed;

  const admin = createAdminClient();
  await loadOwnedInvoice(admin, session.tenantId, parsed.data.invoice_id);
  await assertCompanyOwned(admin, session.tenantId, parsed.data.company_id ?? null);
  await assertProjectOwned(admin, session.tenantId, parsed.data.project_id ?? null);

  const { error } = await admin
    .from("cc_invoices")
    .update({
      title: parsed.data.title,
      company_id: parsed.data.company_id ?? null,
      project_id: parsed.data.project_id ?? null,
      tax_rate_bps: parsed.data.tax_rate_percent,
      due_date: parsed.data.due_date,
      notes: parsed.data.notes,
      terms: parsed.data.terms,
    })
    .eq("id", parsed.data.invoice_id)
    .eq("tenant_id", session.tenantId);
  if (error) return actionError("Could not save changes. Please try again.");

  await recomputeInvoiceTotals(
    admin,
    session.tenantId,
    parsed.data.invoice_id,
    parsed.data.tax_rate_percent
  );
  revalidatePath(`/app/invoicing/${parsed.data.invoice_id}`);
  revalidatePath("/app/invoicing");
  return actionOk();
}

export async function deleteInvoice(formData: FormData): Promise<void> {
  ensureEnabled();
  const session = await requireTenantUser();
  const parsed = invoiceIdSchema.safeParse({ invoice_id: formData.get("invoice_id") });
  if (!parsed.success) throw new Error("Invalid invoice id");

  const admin = createAdminClient();
  await loadOwnedInvoice(admin, session.tenantId, parsed.data.invoice_id);
  const { error } = await admin
    .from("cc_invoices")
    .delete()
    .eq("id", parsed.data.invoice_id)
    .eq("tenant_id", session.tenantId);
  if (error) throw new Error("Could not delete invoice.");
  revalidatePath("/app/invoicing");
  redirect("/app/invoicing");
}

export async function setInvoiceStatus(formData: FormData): Promise<ActionResult> {
  ensureEnabled();
  const session = await requireTenantUser();

  const parsed = setInvoiceStatusSchema.safeParse({
    invoice_id: formData.get("invoice_id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return actionError("Invalid status update.");

  if (parsed.data.status === "paid" || parsed.data.status === "partial") {
    return actionError(
      "Use 'Record payment' to mark an invoice as paid or partially paid."
    );
  }

  const admin = createAdminClient();
  const inv = await loadOwnedInvoice(admin, session.tenantId, parsed.data.invoice_id);

  if (Number(inv.amount_paid_cents) > 0 && parsed.data.status !== "void") {
    return actionError(
      "This invoice has recorded payments. Refund or void it instead of changing its status."
    );
  }

  const now = new Date().toISOString();
  const patch: Record<string, string | null> = { status: parsed.data.status };
  if (parsed.data.status === "sent") patch.sent_at = now;
  if (parsed.data.status === "void") patch.voided_at = now;

  const { error } = await admin
    .from("cc_invoices")
    .update(patch)
    .eq("id", parsed.data.invoice_id)
    .eq("tenant_id", session.tenantId);
  if (error) return actionError("Could not update status.");
  revalidatePath(`/app/invoicing/${parsed.data.invoice_id}`);
  revalidatePath("/app/invoicing");
  return actionOk();
}

export async function recordInvoicePayment(formData: FormData): Promise<ActionResult> {
  ensureEnabled();
  const session = await requireTenantUser();

  const parsed = parseForm(recordInvoicePaymentSchema, formData);
  if (!parsed.ok) return parsed;

  if (parsed.data.amount <= 0) return actionError("Payment amount must be greater than zero.");

  const admin = createAdminClient();
  const { error } = await admin.rpc("cc_record_invoice_payment", {
    p_invoice_id: parsed.data.invoice_id,
    p_tenant_id: session.tenantId,
    p_delta_cents: parsed.data.amount,
  });
  if (error) {
    if (error.code === "22003") {
      return actionError("Payment exceeds remaining balance on this invoice.");
    }
    if (error.code === "P0002") {
      return actionError("Invoice not found.");
    }
    return actionError("Could not record payment.");
  }
  revalidatePath(`/app/invoicing/${parsed.data.invoice_id}`);
  revalidatePath("/app/invoicing");
  return actionOk();
}

export async function addInvoiceLineItem(formData: FormData): Promise<ActionResult> {
  ensureEnabled();
  const session = await requireTenantUser();

  const parsed = parseForm(createInvoiceLineItemSchema, formData);
  if (!parsed.ok) return parsed;

  const admin = createAdminClient();
  const inv = await loadOwnedInvoice(admin, session.tenantId, parsed.data.invoice_id);

  const { count, error: countErr } = await admin
    .from("cc_invoice_line_items")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", parsed.data.invoice_id)
    .eq("tenant_id", session.tenantId);
  if (countErr) return actionError("Could not load line items.");
  if ((count ?? 0) >= MAX_INVOICE_LINE_ITEMS) {
    return actionError(`This invoice already has the maximum ${MAX_INVOICE_LINE_ITEMS} line items.`);
  }

  const total = lineItemTotalCents(parsed.data.quantity, parsed.data.unit_price);
  const { error } = await admin.from("cc_invoice_line_items").insert({
    invoice_id: parsed.data.invoice_id,
    tenant_id: session.tenantId,
    position: count ?? 0,
    description: parsed.data.description,
    quantity: tenThousandthsToDecimalString(parsed.data.quantity),
    unit: parsed.data.unit,
    unit_price_cents: parsed.data.unit_price,
    total_cents: total,
  });
  if (error) return actionError("Could not add line item.");

  await recomputeInvoiceTotals(
    admin,
    session.tenantId,
    parsed.data.invoice_id,
    inv.tax_rate_bps
  );
  revalidatePath(`/app/invoicing/${parsed.data.invoice_id}`);
  return actionOk();
}

export async function updateInvoiceLineItem(formData: FormData): Promise<ActionResult> {
  ensureEnabled();
  const session = await requireTenantUser();

  const parsed = parseForm(updateInvoiceLineItemSchema, formData);
  if (!parsed.ok) return parsed;

  const admin = createAdminClient();
  const inv = await loadOwnedInvoice(admin, session.tenantId, parsed.data.invoice_id);

  const total = lineItemTotalCents(parsed.data.quantity, parsed.data.unit_price);
  const { error } = await admin
    .from("cc_invoice_line_items")
    .update({
      description: parsed.data.description,
      quantity: tenThousandthsToDecimalString(parsed.data.quantity),
      unit: parsed.data.unit,
      unit_price_cents: parsed.data.unit_price,
      total_cents: total,
    })
    .eq("id", parsed.data.line_item_id)
    .eq("tenant_id", session.tenantId)
    .eq("invoice_id", parsed.data.invoice_id);
  if (error) return actionError("Could not update line item.");

  await recomputeInvoiceTotals(
    admin,
    session.tenantId,
    parsed.data.invoice_id,
    inv.tax_rate_bps
  );
  revalidatePath(`/app/invoicing/${parsed.data.invoice_id}`);
  return actionOk();
}

export async function deleteInvoiceLineItem(formData: FormData): Promise<void> {
  ensureEnabled();
  const session = await requireTenantUser();

  const parsed = invoiceLineItemIdSchema
    .extend({ invoice_id: invoiceIdSchema.shape.invoice_id })
    .safeParse({
      line_item_id: formData.get("line_item_id"),
      invoice_id: formData.get("invoice_id"),
    });
  if (!parsed.success) throw new Error("Invalid line item id");

  const admin = createAdminClient();
  const inv = await loadOwnedInvoice(admin, session.tenantId, parsed.data.invoice_id);

  const { error } = await admin
    .from("cc_invoice_line_items")
    .delete()
    .eq("id", parsed.data.line_item_id)
    .eq("tenant_id", session.tenantId)
    .eq("invoice_id", parsed.data.invoice_id);
  if (error) throw new Error("Could not delete line item.");

  await recomputeInvoiceTotals(
    admin,
    session.tenantId,
    parsed.data.invoice_id,
    inv.tax_rate_bps
  );
  revalidatePath(`/app/invoicing/${parsed.data.invoice_id}`);
}

export async function downloadInvoicePdf(formData: FormData): Promise<void> {
  ensureEnabled();
  const session = await requireTenantUser();

  const parsed = invoiceIdSchema.safeParse({ invoice_id: formData.get("invoice_id") });
  if (!parsed.success) throw new Error("Invalid invoice id");

  const admin = createAdminClient();
  await loadOwnedInvoice(admin, session.tenantId, parsed.data.invoice_id);

  const { buffer, invoiceNumber } = await renderInvoicePdf({
    admin,
    tenantId: session.tenantId,
    invoiceId: parsed.data.invoice_id,
  });

  log.info("invoice.pdf.generated", {
    tenant_id: session.tenantId,
    invoice_id: parsed.data.invoice_id,
    bytes: buffer.length,
  });

  const path = `vault/${session.tenantId}/invoice-${parsed.data.invoice_id}-${Date.now()}.pdf`;
  const { error: upErr } = await admin.storage
    .from("documents")
    .upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (upErr) throw new Error("Could not stage PDF for download.");

  const { data: signed, error: sErr } = await admin.storage
    .from("documents")
    .createSignedUrl(path, 60, { download: `${invoiceNumber}.pdf` });
  if (sErr || !signed) throw new Error("Could not sign PDF download link.");

  redirect(signed.signedUrl);
}
