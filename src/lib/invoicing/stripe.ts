// [CC-FOUNDATION] Stripe Checkout for tenant→customer invoice payments.
// Distinct from the SaaS subscription billing on tenant_billing. Customer
// receives a public /pay/[token] link, clicks Pay, gets redirected to a
// hosted Stripe Checkout. The webhook closes the loop by calling
// cc_record_invoice_payment under tenant ownership.

"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { actionError, actionOk, type ActionResult } from "@/lib/validation";
import { isModuleEnabled } from "@/foundational/registry";
import { log } from "@/lib/log";
import { publicBaseUrl } from "@/lib/url";
import { getStripe } from "@/lib/stripe/client";
import { MissingCredentialsError } from "@/lib/integrations/base";

const TOKEN_BYTES = 32;
const LINK_TTL_DAYS = 90;

function newToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("hex");
}

export async function issueInvoicePayLink(
  formData: FormData
): Promise<ActionResult<{ link: string; token: string }>> {
  if (!isModuleEnabled("invoicing")) return actionError("Invoicing is disabled.");
  const session = await requireTenantUser();
  const invoiceId = String(formData.get("invoice_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return actionError("Invalid invoice id.");

  const admin = createAdminClient();
  const { data: inv } = await admin
    .from("cc_invoices")
    .select("id, status, total_cents, amount_paid_cents")
    .eq("id", invoiceId)
    .eq("tenant_id", session.tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!inv) return actionError("Invoice not found.");
  if (inv.status === "void") return actionError("Cannot create a pay link for a voided invoice.");
  if (inv.status === "draft") return actionError("Send the invoice before creating a pay link.");
  if (Number(inv.amount_paid_cents) >= Number(inv.total_cents)) {
    return actionError("This invoice is already fully paid.");
  }

  const nowIso = new Date().toISOString();

  // Reuse an active (unused, unrevoked, unexpired) link if one exists.
  const { data: live } = await admin
    .from("cc_invoice_payment_links")
    .select("token")
    .eq("invoice_id", invoiceId)
    .eq("tenant_id", session.tenantId)
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", nowIso)
    .maybeSingle();
  if (live?.token) {
    return actionOk({ link: `${publicBaseUrl()}/pay/${live.token}`, token: live.token });
  }

  // Revoke any unused-but-expired link so the one-active-per-invoice partial
  // unique index does not block a fresh insert.
  await admin
    .from("cc_invoice_payment_links")
    .update({ revoked_at: nowIso })
    .eq("invoice_id", invoiceId)
    .eq("tenant_id", session.tenantId)
    .is("used_at", null)
    .is("revoked_at", null);

  const token = newToken();
  const expiresAt = new Date(Date.now() + LINK_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  const { error } = await admin.from("cc_invoice_payment_links").insert({
    tenant_id: session.tenantId,
    invoice_id: invoiceId,
    token,
    expires_at: expiresAt,
  });
  if (error) {
    log.error("pay_link.insert.failed", { invoice_id: invoiceId, err: error.message });
    return actionError("Could not create pay link.");
  }
  revalidatePath(`/app/invoicing/${invoiceId}`);
  log.info("pay_link.issued", { invoice_id: invoiceId });
  return actionOk({ link: `${publicBaseUrl()}/pay/${token}`, token });
}

export async function startInvoiceCheckout(token: string): Promise<{ url: string } | { error: string; status: number }> {
  if (!/^[0-9a-f]{64}$/i.test(token)) return { error: "Invalid token.", status: 400 };
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("cc_invoice_payment_links")
    .select("id, tenant_id, invoice_id, expires_at, used_at, revoked_at, stripe_checkout_session_id")
    .eq("token", token)
    .maybeSingle();
  if (!link) return { error: "Pay link not found.", status: 404 };
  if (link.used_at) return { error: "This pay link has already been used.", status: 410 };
  if (link.revoked_at) return { error: "This pay link has been revoked.", status: 410 };
  if (new Date(link.expires_at) <= new Date()) return { error: "Pay link expired.", status: 410 };

  const { data: inv } = await admin
    .from("cc_invoices")
    .select("id, invoice_number, title, total_cents, amount_paid_cents, status")
    .eq("id", link.invoice_id)
    .eq("tenant_id", link.tenant_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!inv) return { error: "Invoice not found.", status: 404 };
  if (inv.status === "void") return { error: "Invoice has been voided.", status: 410 };
  const remaining = Number(inv.total_cents) - Number(inv.amount_paid_cents);
  if (remaining <= 0) return { error: "Invoice is already fully paid.", status: 410 };

  let stripe: ReturnType<typeof getStripe>;
  try {
    stripe = getStripe();
  } catch (err) {
    if (err instanceof MissingCredentialsError) {
      return { error: "Online payments are not configured for this workspace yet.", status: 503 };
    }
    throw err;
  }

  // If a Checkout Session was already created for this link, return its URL
  // instead of creating a second one. Open Sessions remain valid until paid
  // or expired by Stripe (~24h); we only mint a new one if the prior one is
  // no longer reachable. This eliminates the replay-create-many bug.
  if (link.stripe_checkout_session_id) {
    try {
      const prior = await stripe.checkout.sessions.retrieve(link.stripe_checkout_session_id);
      if (prior.status === "open" && prior.url) {
        return { url: prior.url };
      }
      if (prior.status === "complete") {
        return { error: "This pay link has already been used.", status: 410 };
      }
    } catch (err) {
      log.warn("invoice.checkout.retrieve.failed", {
        session_id: link.stripe_checkout_session_id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      success_url: `${publicBaseUrl()}/pay/${token}/done`,
      cancel_url: `${publicBaseUrl()}/pay/${token}`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: remaining,
            product_data: {
              name: `${inv.invoice_number} — ${inv.title}`,
            },
          },
        },
      ],
      payment_intent_data: {
        metadata: {
          cc_invoice_id: inv.id,
          cc_tenant_id: link.tenant_id,
          cc_pay_link_id: link.id,
        },
      },
      metadata: {
        cc_invoice_id: inv.id,
        cc_tenant_id: link.tenant_id,
        cc_pay_link_id: link.id,
      },
    },
    { idempotencyKey: `pay_link:${link.id}` }
  );

  await admin
    .from("cc_invoice_payment_links")
    .update({ stripe_checkout_session_id: session.id, claimed_at: new Date().toISOString() })
    .eq("id", link.id)
    .eq("tenant_id", link.tenant_id);

  await admin
    .from("cc_invoices")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", inv.id)
    .eq("tenant_id", link.tenant_id);

  log.info("invoice.checkout.created", { invoice_id: inv.id, session_id: session.id });
  return { url: session.url ?? "" };
}
