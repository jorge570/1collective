// [CC-FOUNDATION] Adapter: invoice row + line items -> generateDocumentPdf input.
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDocumentPdf, type DocumentPdfData, type PdfBrand } from "@/lib/pdf/document-pdf";
import { centsToDollars } from "@/lib/estimating/schemas";

export interface RenderInvoicePdfArgs {
  admin: SupabaseClient;
  tenantId: string;
  invoiceId: string;
}

export async function renderInvoicePdf({
  admin,
  tenantId,
  invoiceId,
}: RenderInvoicePdfArgs): Promise<{ buffer: Buffer; invoiceNumber: string }> {
  const { data: invoice, error: iErr } = await admin
    .from("cc_invoices")
    .select(
      "id, tenant_id, invoice_number, title, status, subtotal_cents, tax_rate_bps, tax_cents, total_cents, amount_paid_cents, due_date, notes, terms, created_at, company_id"
    )
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (iErr) throw new Error(`Could not load invoice: ${iErr.message}`);
  if (!invoice) throw new Error("Invoice not found.");

  const [{ data: items, error: liErr }, { data: tenant, error: tErr }, companyResult] =
    await Promise.all([
      admin
        .from("cc_invoice_line_items")
        .select("position, description, quantity, unit, unit_price_cents, total_cents")
        .eq("invoice_id", invoice.id)
        .eq("tenant_id", tenantId)
        .order("position", { ascending: true }),
      admin
        .from("tenants")
        .select("name, primary_color_hex")
        .eq("id", tenantId)
        .maybeSingle(),
      invoice.company_id
        ? admin
            .from("companies")
            .select("name")
            .eq("id", invoice.company_id)
            .eq("tenant_id", tenantId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
  if (liErr) throw new Error(`Could not load line items: ${liErr.message}`);
  if (tErr) throw new Error(`Could not load tenant: ${tErr.message}`);

  const brand: PdfBrand = { accent: tenant?.primary_color_hex || "#0A0A0A" };
  const totalDollars = centsToDollars(invoice.total_cents);
  const paidDollars = centsToDollars(Number(invoice.amount_paid_cents));
  const balanceDollars = Math.max(0, totalDollars - paidDollars);

  const composedNotes = composeNotes({
    subtotal_cents: invoice.subtotal_cents,
    tax_rate_bps: invoice.tax_rate_bps,
    tax_cents: invoice.tax_cents,
    notes: invoice.notes,
    terms: invoice.terms,
  });

  const data: DocumentPdfData = {
    type: "invoice",
    docNumber: invoice.invoice_number,
    jobName: invoice.title,
    status: invoice.status,
    createdAt: invoice.created_at,
    dueDate: invoice.due_date ?? undefined,
    total: totalDollars,
    amountPaid: paidDollars,
    balance: balanceDollars,
    notes: composedNotes,
    companyName: tenant?.name ?? "Your Company",
    customerName: companyResult?.data?.name ?? "Customer",
    lineItems: (items ?? []).map((li) => ({
      description: li.description,
      quantity: Number(li.quantity),
      unit_price: centsToDollars(li.unit_price_cents),
      total: centsToDollars(li.total_cents),
    })),
  };

  const buffer = await generateDocumentPdf(data, brand);
  return { buffer, invoiceNumber: invoice.invoice_number };
}

interface NotesSource {
  subtotal_cents: number;
  tax_rate_bps: number;
  tax_cents: number;
  notes: string | null;
  terms: string | null;
}

function composeNotes(src: NotesSource): string | undefined {
  const lines: string[] = [];
  if (src.tax_rate_bps > 0) {
    const ratePct = (src.tax_rate_bps / 100).toFixed(2).replace(/\.?0+$/, "");
    lines.push(
      `Subtotal: $${centsToDollars(src.subtotal_cents).toFixed(2)}    Tax (${ratePct}%): $${centsToDollars(src.tax_cents).toFixed(2)}`
    );
  }
  if (src.notes?.trim()) lines.push(src.notes.trim());
  if (src.terms?.trim()) lines.push("Terms: " + src.terms.trim());
  return lines.length > 0 ? lines.join("\n\n") : undefined;
}
