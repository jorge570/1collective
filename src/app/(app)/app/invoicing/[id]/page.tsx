import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isModuleEnabled } from "@/foundational/registry";
import { ModuleStatus } from "@/components/app-shell/module-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { centsToDollars } from "@/lib/estimating/schemas";
import {
  addInvoiceLineItem,
  deleteInvoice,
  deleteInvoiceLineItem,
  downloadInvoicePdf,
  recordInvoicePayment,
  setInvoiceStatus,
  updateInvoice,
} from "@/lib/invoicing/actions";
import { issueInvoicePayLink } from "@/lib/invoicing/stripe";

async function issuePayLinkForm(formData: FormData): Promise<void> {
  "use server";
  const r = await issueInvoicePayLink(formData);
  if (!r.ok) throw new Error(r.error);
}

async function addLineItemForm(formData: FormData): Promise<void> {
  "use server";
  const r = await addInvoiceLineItem(formData);
  if (!r.ok) throw new Error(r.error);
}

async function updateInvoiceForm(formData: FormData): Promise<void> {
  "use server";
  const r = await updateInvoice(formData);
  if (!r.ok) throw new Error(r.error);
}

async function setInvoiceStatusForm(formData: FormData): Promise<void> {
  "use server";
  const r = await setInvoiceStatus(formData);
  if (!r.ok) throw new Error(r.error);
}

async function recordPaymentForm(formData: FormData): Promise<void> {
  "use server";
  const r = await recordInvoicePayment(formData);
  if (!r.ok) throw new Error(r.error);
}

export const metadata: Metadata = { title: "Invoice" };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  sent: "default",
  partial: "default",
  paid: "default",
  overdue: "destructive",
  void: "outline",
};

function fmtMoney(cents: number): string {
  return centsToDollars(cents).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireTenantUser();

  if (!isModuleEnabled("invoicing")) {
    return (
      <ModuleStatus kind="coming_soon" title="Invoicing" description="Module not yet enabled." />
    );
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: invoice } = await admin
    .from("cc_invoices")
    .select(
      "id, tenant_id, invoice_number, title, status, company_id, project_id, source_estimate_id, subtotal_cents, tax_rate_bps, tax_cents, total_cents, amount_paid_cents, due_date, sent_at, paid_at, voided_at, notes, terms, created_at"
    )
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!invoice) notFound();

  const [{ data: items }, { data: companies }] = await Promise.all([
    admin
      .from("cc_invoice_line_items")
      .select("id, position, description, quantity, unit, unit_price_cents, total_cents")
      .eq("invoice_id", invoice.id)
      .eq("tenant_id", session.tenantId)
      .order("position", { ascending: true }),
    admin
      .from("companies")
      .select("id, name")
      .eq("tenant_id", session.tenantId)
      .is("deleted_at", null)
      .order("name"),
  ]);

  const lineItems = items ?? [];
  const taxRatePercent = invoice.tax_rate_bps / 100;
  const balanceCents = Number(invoice.total_cents) - Number(invoice.amount_paid_cents);

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{invoice.title}</h1>
            <Badge variant={STATUS_VARIANT[invoice.status] ?? "secondary"}>{invoice.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {invoice.invoice_number} · created {formatDate(invoice.created_at)}
            {invoice.source_estimate_id ? (
              <>
                {" · "}
                <Link
                  href={`/app/estimating/${invoice.source_estimate_id}`}
                  className="underline-offset-2 hover:underline"
                >
                  from estimate
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex gap-2">
          <form action={downloadInvoicePdf}>
            <input type="hidden" name="invoice_id" value={invoice.id} />
            <Button type="submit" variant="outline">
              Download PDF
            </Button>
          </form>
          <Button variant="ghost" asChild>
            <Link href="/app/invoicing">Back</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Line items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {lineItems.length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted-foreground)]">
                  No line items yet. Add one below.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                      <tr className="border-b border-[var(--color-border)]">
                        <th className="py-2 pr-3">Description</th>
                        <th className="py-2 pr-3 text-right">Qty</th>
                        <th className="py-2 pr-3 text-right">Unit price</th>
                        <th className="py-2 pr-3 text-right">Total</th>
                        <th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((li) => (
                        <tr key={li.id} className="border-b border-[var(--color-border)]/50">
                          <td className="py-2 pr-3">{li.description}</td>
                          <td className="py-2 pr-3 text-right">
                            {Number(li.quantity)} {li.unit}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {fmtMoney(Number(li.unit_price_cents))}
                          </td>
                          <td className="py-2 pr-3 text-right font-medium">
                            {fmtMoney(Number(li.total_cents))}
                          </td>
                          <td className="py-2 text-right">
                            <form action={deleteInvoiceLineItem} className="inline">
                              <input type="hidden" name="line_item_id" value={li.id} />
                              <input type="hidden" name="invoice_id" value={invoice.id} />
                              <Button type="submit" variant="ghost" size="sm">
                                Remove
                              </Button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <form action={addLineItemForm} className="grid grid-cols-12 gap-2 pt-3">
                <input type="hidden" name="invoice_id" value={invoice.id} />
                <input
                  name="description"
                  required
                  placeholder="Description"
                  className="col-span-5 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                />
                <input
                  name="quantity"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  defaultValue="1"
                  placeholder="Qty"
                  className="col-span-2 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                />
                <input
                  name="unit"
                  defaultValue="ea"
                  className="col-span-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                />
                <input
                  name="unit_price"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="Unit price"
                  className="col-span-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                />
                <Button type="submit" className="col-span-1" size="sm">
                  Add
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoice details</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateInvoiceForm} className="space-y-3">
                <input type="hidden" name="invoice_id" value={invoice.id} />
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    Title
                  </label>
                  <input
                    name="title"
                    required
                    defaultValue={invoice.title}
                    className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                      Customer
                    </label>
                    <select
                      name="company_id"
                      defaultValue={invoice.company_id ?? ""}
                      className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                    >
                      <option value="">— None —</option>
                      {(companies ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                      Due date
                    </label>
                    <input
                      type="date"
                      name="due_date"
                      defaultValue={invoice.due_date ?? ""}
                      className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                      Tax rate (%)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      max="100"
                      name="tax_rate_percent"
                      defaultValue={taxRatePercent}
                      className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    Notes
                  </label>
                  <textarea
                    name="notes"
                    rows={3}
                    defaultValue={invoice.notes ?? ""}
                    className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    Terms
                  </label>
                  <textarea
                    name="terms"
                    rows={2}
                    defaultValue={invoice.terms ?? ""}
                    className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                  />
                </div>
                <div className="pt-2">
                  <Button type="submit" size="sm">
                    Save changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Totals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--color-muted-foreground)]">Subtotal</span>
                <span>{fmtMoney(Number(invoice.subtotal_cents))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-muted-foreground)]">
                  Tax ({taxRatePercent}%)
                </span>
                <span>{fmtMoney(Number(invoice.tax_cents))}</span>
              </div>
              <div className="flex justify-between border-t border-[var(--color-border)] pt-2 font-medium">
                <span>Total</span>
                <span>{fmtMoney(Number(invoice.total_cents))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-muted-foreground)]">Paid</span>
                <span>{fmtMoney(Number(invoice.amount_paid_cents))}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Balance</span>
                <span>{fmtMoney(balanceCents)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(["draft", "sent", "overdue", "void"] as const).map((s) => (
                <form key={s} action={setInvoiceStatusForm} className="block">
                  <input type="hidden" name="invoice_id" value={invoice.id} />
                  <input type="hidden" name="status" value={s} />
                  <Button
                    type="submit"
                    variant={invoice.status === s ? "default" : "outline"}
                    size="sm"
                    className="w-full justify-start"
                  >
                    Mark as {s}
                  </Button>
                </form>
              ))}
            </CardContent>
          </Card>

          {balanceCents > 0 && invoice.status !== "draft" && invoice.status !== "void" ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Online payment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  Generates a public Stripe Checkout link for the customer.
                  Reuses an active link if one exists.
                </p>
                <form action={issuePayLinkForm}>
                  <input type="hidden" name="invoice_id" value={invoice.id} />
                  <Button type="submit" size="sm" variant="outline" className="w-full">
                    Generate pay link
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Record payment</CardTitle>
            </CardHeader>
            <CardContent>
              {balanceCents <= 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  This invoice is fully paid.
                </p>
              ) : (
                <form action={recordPaymentForm} className="space-y-2">
                  <input type="hidden" name="invoice_id" value={invoice.id} />
                  <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    Amount (max {fmtMoney(balanceCents)})
                  </label>
                  <input
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={(balanceCents / 100).toFixed(2)}
                    required
                    placeholder="0.00"
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                  />
                  <Button type="submit" size="sm" className="w-full">
                    Record payment
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <form action={deleteInvoice}>
                <input type="hidden" name="invoice_id" value={invoice.id} />
                <Button type="submit" variant="ghost" size="sm" className="w-full text-red-600">
                  Delete invoice
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
