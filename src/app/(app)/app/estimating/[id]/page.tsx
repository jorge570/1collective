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
  addLineItem,
  convertEstimateToInvoice,
  deleteEstimate,
  deleteLineItem,
  downloadEstimatePdf,
  setEstimateStatus,
  updateEstimate,
} from "@/lib/estimating/actions";
import { addLineItemFromCatalog } from "@/lib/estimating/catalog-actions";
import {
  requestEstimateSignature,
  voidSignatureRequest,
} from "@/lib/signatures/actions";
import { deliveryStatus } from "@/lib/signatures/delivery";

async function requestSignatureForm(formData: FormData): Promise<void> {
  "use server";
  const r = await requestEstimateSignature(formData);
  if (!r.ok) throw new Error(r.error);
}

async function voidSignatureForm(formData: FormData): Promise<void> {
  "use server";
  const r = await voidSignatureRequest(formData);
  if (!r.ok) throw new Error(r.error);
}

async function addLineItemForm(formData: FormData): Promise<void> {
  "use server";
  const r = await addLineItem(formData);
  if (!r.ok) throw new Error(r.error);
}

async function addLineItemFromCatalogForm(formData: FormData): Promise<void> {
  "use server";
  const r = await addLineItemFromCatalog(formData);
  if (!r.ok) throw new Error(r.error);
}

async function updateEstimateForm(formData: FormData): Promise<void> {
  "use server";
  const r = await updateEstimate(formData);
  if (!r.ok) throw new Error(r.error);
}

async function setEstimateStatusForm(formData: FormData): Promise<void> {
  "use server";
  const r = await setEstimateStatus(formData);
  if (!r.ok) throw new Error(r.error);
}

export const metadata: Metadata = { title: "Estimate" };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  sent: "default",
  accepted: "default",
  declined: "destructive",
  expired: "outline",
};

function fmtMoney(cents: number): string {
  return centsToDollars(cents).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireTenantUser();

  if (!isModuleEnabled("estimating")) {
    return <ModuleStatus kind="coming_soon" title="Estimating" description="Module not yet enabled." />;
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: estimate } = await admin
    .from("cc_estimates")
    .select(
      "id, tenant_id, estimate_number, title, status, company_id, project_id, subtotal_cents, tax_rate_bps, tax_cents, total_cents, valid_until, sent_at, accepted_at, declined_at, notes, terms, created_at"
    )
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();

  if (!estimate) notFound();

  const [
    { data: items },
    { data: companies },
    { data: catalog },
    { data: latestSig },
  ] = await Promise.all([
    admin
      .from("cc_estimate_line_items")
      .select("id, position, description, quantity, unit, unit_price_cents, total_cents")
      .eq("estimate_id", estimate.id)
      .eq("tenant_id", session.tenantId)
      .order("position", { ascending: true }),
    admin
      .from("companies")
      .select("id, name")
      .eq("tenant_id", session.tenantId)
      .is("deleted_at", null)
      .order("name"),
    admin
      .from("cc_estimate_catalog_items")
      .select("id, name, unit, default_price_cents, category")
      .eq("tenant_id", session.tenantId)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    admin
      .from("cc_signature_requests")
      .select("id, token, status, signer_email, signer_phone, sent_at, signed_at, signed_by_name, declined_at, voided_at, expires_at")
      .eq("tenant_id", session.tenantId)
      .eq("target_type", "estimate")
      .eq("target_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lineItems = items ?? [];
  const catalogItems = catalog ?? [];
  const taxRatePercent = estimate.tax_rate_bps / 100;
  const sig = latestSig;
  const delivery = deliveryStatus();

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{estimate.title}</h1>
            <Badge variant={STATUS_VARIANT[estimate.status] ?? "secondary"}>{estimate.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {estimate.estimate_number} · created {formatDate(estimate.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          {estimate.status === "accepted" ? (
            <form
              action={async (formData: FormData) => {
                "use server";
                const r = await convertEstimateToInvoice(formData);
                if (!r.ok) throw new Error(r.error);
                const { redirect } = await import("next/navigation");
                redirect(`/app/invoicing/${r.data.invoice_id}`);
              }}
            >
              <input type="hidden" name="estimate_id" value={estimate.id} />
              <Button type="submit">Convert to invoice</Button>
            </form>
          ) : null}
          <form action={downloadEstimatePdf}>
            <input type="hidden" name="estimate_id" value={estimate.id} />
            <Button type="submit" variant="outline">
              Download PDF
            </Button>
          </form>
          <Button variant="ghost" asChild>
            <Link href="/app/estimating">Back</Link>
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
                            <form action={deleteLineItem} className="inline">
                              <input type="hidden" name="line_item_id" value={li.id} />
                              <input type="hidden" name="estimate_id" value={estimate.id} />
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

              {catalogItems.length > 0 ? (
                <form
                  action={addLineItemFromCatalogForm}
                  className="grid grid-cols-12 gap-2 border-t border-[var(--color-border)]/60 pt-3"
                >
                  <input type="hidden" name="estimate_id" value={estimate.id} />
                  <select
                    name="catalog_item_id"
                    required
                    className="col-span-7 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                  >
                    <option value="">Add from catalog…</option>
                    {catalogItems.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.category ? `[${c.category}] ` : ""}
                        {c.name} ({c.unit}, ${(Number(c.default_price_cents) / 100).toFixed(2)})
                      </option>
                    ))}
                  </select>
                  <input
                    name="quantity"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    defaultValue="1"
                    placeholder="Qty"
                    className="col-span-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                  />
                  <Button type="submit" className="col-span-2" size="sm" variant="outline">
                    Add from catalog
                  </Button>
                </form>
              ) : null}

              <form action={addLineItemForm} className="grid grid-cols-12 gap-2 pt-3">
                <input type="hidden" name="estimate_id" value={estimate.id} />
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
              <CardTitle className="text-base">Estimate details</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateEstimateForm} className="space-y-3">
                <input type="hidden" name="estimate_id" value={estimate.id} />
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    Title
                  </label>
                  <input
                    name="title"
                    required
                    defaultValue={estimate.title}
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
                      defaultValue={estimate.company_id ?? ""}
                      className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                    >
                      <option value="">— No customer linked —</option>
                      {(companies ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                      Valid until
                    </label>
                    <input
                      name="valid_until"
                      type="date"
                      defaultValue={estimate.valid_until ?? ""}
                      className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    Tax rate (%)
                  </label>
                  <input
                    name="tax_rate_percent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    defaultValue={taxRatePercent}
                    className="mt-1 w-32 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    Notes
                  </label>
                  <textarea
                    name="notes"
                    rows={3}
                    defaultValue={estimate.notes ?? ""}
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
                    defaultValue={estimate.terms ?? ""}
                    className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit">Save changes</Button>
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
              <Row label="Subtotal" value={fmtMoney(estimate.subtotal_cents)} />
              <Row
                label={`Tax (${taxRatePercent.toFixed(2).replace(/\.?0+$/, "")}%)`}
                value={fmtMoney(estimate.tax_cents)}
              />
              <div className="mt-2 flex items-center justify-between border-t border-[var(--color-border)] pt-2 text-base font-semibold">
                <span>Total</span>
                <span>{fmtMoney(estimate.total_cents)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <StatusButtons estimateId={estimate.id} current={estimate.status} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Signature</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <SignaturePanel
                estimateId={estimate.id}
                estimateStatus={estimate.status}
                sig={sig}
                delivery={delivery}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Danger zone</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={deleteEstimate}>
                <input type="hidden" name="estimate_id" value={estimate.id} />
                <Button type="submit" variant="destructive" size="sm">
                  Delete estimate
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-muted-foreground)]">{label}</span>
      <span>{value}</span>
    </div>
  );
}

type SignatureRow = {
  id: string;
  token: string;
  status: "pending" | "signed" | "declined" | "voided" | "expired";
  signer_email: string | null;
  signer_phone: string | null;
  sent_at: string;
  signed_at: string | null;
  signed_by_name: string | null;
  declined_at: string | null;
  voided_at: string | null;
  expires_at: string | null;
};

function SignaturePanel({
  estimateId,
  estimateStatus,
  sig,
  delivery,
}: {
  estimateId: string;
  estimateStatus: string;
  sig: SignatureRow | null;
  delivery: { emailReady: boolean; smsReady: boolean };
}) {
  const inactive = estimateStatus === "accepted" || estimateStatus === "declined" || estimateStatus === "expired";
  const pending = sig && sig.status === "pending";

  if (pending) {
    const link = `/sign/${sig.token}`;
    return (
      <div className="space-y-3">
        <div>
          <Badge variant="default">Awaiting signature</Badge>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Sent {formatDate(sig.sent_at)}
            {sig.signer_email ? ` to ${sig.signer_email}` : ""}
            {sig.signer_phone ? ` · ${sig.signer_phone}` : ""}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">Signing link</p>
          <a href={link} target="_blank" rel="noreferrer" className="break-all text-xs text-blue-600 hover:underline">
            {link}
          </a>
        </div>
        <form action={voidSignatureForm}>
          <input type="hidden" name="signature_id" value={sig.id} />
          <Button type="submit" variant="outline" size="sm" className="w-full">
            Void request
          </Button>
        </form>
      </div>
    );
  }

  if (sig && sig.status === "signed") {
    return (
      <div className="space-y-2">
        <Badge variant="default">Signed</Badge>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Signed {sig.signed_at ? formatDate(sig.signed_at) : ""}
          {sig.signed_by_name ? ` by ${sig.signed_by_name}` : ""}.
        </p>
      </div>
    );
  }

  if (inactive) {
    return (
      <p className="text-xs text-[var(--color-muted-foreground)]">
        Estimate is {estimateStatus}. Reopen to draft to send a new signature request.
      </p>
    );
  }

  return (
    <form action={requestSignatureForm} className="space-y-2">
      <input type="hidden" name="estimate_id" value={estimateId} />
      <input
        name="signer_email"
        type="email"
        placeholder="Customer email (optional)"
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
      />
      <input
        name="signer_phone"
        type="tel"
        placeholder="Customer phone (optional, E.164)"
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
      />
      <Button type="submit" size="sm" className="w-full">
        Send for signature
      </Button>
      {!delivery.emailReady && !delivery.smsReady ? (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Email and SMS delivery are not configured. The signing link will still be created and visible here for manual sharing.
        </p>
      ) : !delivery.emailReady ? (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Email delivery not configured — only SMS will be sent automatically.
        </p>
      ) : !delivery.smsReady ? (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          SMS delivery not configured — only email will be sent automatically.
        </p>
      ) : null}
    </form>
  );
}

function StatusButtons({ estimateId, current }: { estimateId: string; current: string }) {
  const transitions: Array<{ to: string; label: string; show: boolean }> = [
    { to: "sent", label: "Mark as sent", show: current === "draft" },
    { to: "accepted", label: "Mark accepted", show: current === "sent" },
    { to: "declined", label: "Mark declined", show: current === "sent" },
    { to: "draft", label: "Reopen as draft", show: current !== "draft" },
  ];
  return (
    <div className="flex flex-col gap-2">
      {transitions
        .filter((t) => t.show)
        .map((t) => (
          <form key={t.to} action={setEstimateStatusForm}>
            <input type="hidden" name="estimate_id" value={estimateId} />
            <input type="hidden" name="status" value={t.to} />
            <Button type="submit" variant="outline" size="sm" className="w-full">
              {t.label}
            </Button>
          </form>
        ))}
    </div>
  );
}
