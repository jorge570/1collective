// [CC-FOUNDATION] Public, no-auth invoice payment page.
// The 64-hex token is the only authorization. Renders a minimal summary
// (invoice number, balance due) and posts to /api/pay/[token]/checkout
// which creates the Stripe Checkout Session on the server.

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

interface PageProps {
  params: Promise<{ token: string }>;
}

async function loadByToken(token: string) {
  if (!/^[0-9a-f]{64}$/i.test(token)) return null;
  const admin = createAdminClient();
  const { data: link } = await admin
    .from("cc_invoice_payment_links")
    .select("invoice_id, tenant_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();
  if (!link) return null;
  const { data: inv } = await admin
    .from("cc_invoices")
    .select("invoice_number, title, total_cents, amount_paid_cents, status")
    .eq("id", link.invoice_id)
    .eq("tenant_id", link.tenant_id)
    .maybeSingle();
  if (!inv) return null;
  const { data: tenant } = await admin
    .from("tenants")
    .select("name")
    .eq("id", link.tenant_id)
    .maybeSingle();
  return { link, inv, tenant };
}

export default async function PayPage({ params }: PageProps) {
  const { token } = await params;
  const loaded = await loadByToken(token);
  if (!loaded) notFound();
  const { link, inv, tenant } = loaded;

  const expired = new Date(link.expires_at) <= new Date();
  const used = !!link.used_at;
  const remaining = Number(inv.total_cents) - Number(inv.amount_paid_cents);
  const fullyPaid = remaining <= 0 || inv.status === "paid";
  const voided = inv.status === "void";
  const blocked = expired || used || fullyPaid || voided;

  const dollars = (Math.max(0, remaining) / 100).toFixed(2);

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-gray-500">
          {tenant?.name ?? "Workspace"}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {inv.invoice_number}
        </h1>
        <p className="mt-0.5 text-sm text-gray-600">{inv.title}</p>

        <div className="mt-6 rounded-md bg-gray-50 p-4">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Amount due</span>
            <span className="font-medium text-gray-900">${dollars}</span>
          </div>
        </div>

        {blocked ? (
          <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {voided
              ? "This invoice has been voided."
              : fullyPaid
                ? "This invoice is fully paid. Thank you."
                : used
                  ? "This payment link has already been used."
                  : "This payment link has expired."}
          </div>
        ) : (
          <form action={`/api/pay/${token}/checkout`} method="post" className="mt-6">
            <button
              type="submit"
              className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Pay with card
            </button>
            <p className="mt-3 text-center text-xs text-gray-500">
              You will be redirected to Stripe to complete payment securely.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
