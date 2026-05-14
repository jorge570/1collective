import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, getStripeWebhookSecret());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = createAdminClient();

  // Idempotency: skip if already processed
  const { data: existing } = await admin
    .from("integration_events")
    .select("id, status")
    .eq("provider", "stripe")
    .eq("external_event_id", event.id)
    .maybeSingle();
  if (existing?.status === "processed") {
    return NextResponse.json({ received: true, idempotent: true });
  }

  await admin.from("integration_events").upsert(
    {
      provider: "stripe",
      external_event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
      status: "received",
    },
    { onConflict: "provider,external_event_id" }
  );

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionCanceled(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, event.id);
        break;
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent, event.id);
        break;
      default:
        // Unhandled event types are logged but not errors
        break;
    }

    // Do NOT clobber a `needs_attention` status that a handler set
    // (e.g. overpayment in applyInvoicePayment). The processed timestamp is
    // still useful for ops, so it is written unconditionally.
    await admin
      .from("integration_events")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("provider", "stripe")
      .eq("external_event_id", event.id)
      .neq("status", "needs_attention");
    await admin
      .from("integration_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider", "stripe")
      .eq("external_event_id", event.id)
      .eq("status", "needs_attention");
  } catch (err) {
    await admin
      .from("integration_events")
      .update({ status: "failed" })
      .eq("provider", "stripe")
      .eq("external_event_id", event.id);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleSubscriptionChange(sub: Stripe.Subscription) {
  const admin = createAdminClient();
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const { data: billing } = await admin
    .from("tenant_billing")
    .select("tenant_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (!billing) return;

  const status =
    sub.status === "active" || sub.status === "trialing"
      ? "active"
      : sub.status === "past_due"
        ? "past_due"
        : sub.status === "canceled"
          ? "cancelled"
          : "active";

  await admin
    .from("tenant_billing")
    .update({
      stripe_subscription_id: sub.id,
      billing_status: status,
    })
    .eq("tenant_id", billing.tenant_id);

  await admin.from("billing_events").insert({
    tenant_id: billing.tenant_id,
    event_type: `subscription.${sub.status}`,
    stripe_event_id: sub.id,
    payload: { subscription_id: sub.id, status: sub.status },
  });
}

async function handleSubscriptionCanceled(sub: Stripe.Subscription) {
  const admin = createAdminClient();
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const { data: billing } = await admin
    .from("tenant_billing")
    .select("tenant_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (!billing) return;

  await admin
    .from("tenant_billing")
    .update({ billing_status: "cancelled" })
    .eq("tenant_id", billing.tenant_id);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const admin = createAdminClient();
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const { data: billing } = await admin
    .from("tenant_billing")
    .select("tenant_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (!billing) return;

  await admin
    .from("tenant_billing")
    .update({ last_payment_at: new Date().toISOString(), billing_status: "active" })
    .eq("tenant_id", billing.tenant_id);
}

async function applyInvoicePayment(
  admin: ReturnType<typeof createAdminClient>,
  args: { invoiceId: string; tenantId: string; eventId: string; amount: number }
): Promise<{ applied: number; unapplied: number }> {
  const { invoiceId, tenantId, eventId, amount } = args;
  const { data: inv, error: invErr } = await admin
    .from("cc_invoices")
    .select("total_cents, amount_paid_cents")
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (invErr) throw new Error(`invoice_lookup_failed: ${invErr.message}`);
  if (!inv) throw new Error(`invoice_not_found: ${invoiceId}`);

  const remaining = Math.max(0, Number(inv.total_cents) - Number(inv.amount_paid_cents));
  const applied = Math.min(amount, remaining);
  const unapplied = amount - applied;

  if (applied > 0) {
    const { error } = await admin.rpc("cc_record_invoice_payment", {
      p_invoice_id: invoiceId,
      p_tenant_id: tenantId,
      p_delta_cents: applied,
    });
    if (error) throw new Error(`record_payment failed: ${error.message}`);
  }

  if (unapplied > 0) {
    await admin
      .from("integration_events")
      .update({
        status: "needs_attention",
        payload_extras: {
          cc_invoice_id: invoiceId,
          cc_tenant_id: tenantId,
          unapplied_overpayment_cents: unapplied,
          stripe_amount_cents: amount,
          invoice_remaining_cents: remaining,
        },
      })
      .eq("provider", "stripe")
      .eq("external_event_id", eventId);
  }

  return { applied, unapplied };
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, eventId: string) {
  if (session.payment_status !== "paid") return;
  const invoiceId = session.metadata?.cc_invoice_id;
  const tenantId = session.metadata?.cc_tenant_id;
  const payLinkId = session.metadata?.cc_pay_link_id;
  if (!invoiceId || !tenantId) return;
  const amount = session.amount_total ?? 0;
  if (amount <= 0) return;

  const admin = createAdminClient();
  await applyInvoicePayment(admin, { invoiceId, tenantId, eventId, amount });

  const piId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;
  if (piId) {
    await admin
      .from("cc_invoices")
      .update({ stripe_payment_intent_id: piId })
      .eq("id", invoiceId)
      .eq("tenant_id", tenantId);
  }
  if (payLinkId) {
    await admin
      .from("cc_invoice_payment_links")
      .update({ used_at: new Date().toISOString() })
      .eq("id", payLinkId)
      .eq("tenant_id", tenantId);
  }
}

async function handlePaymentIntentSucceeded(intent: Stripe.PaymentIntent, eventId: string) {
  // Defense-in-depth: if checkout.session.completed never fires (e.g.
  // off-session payment, manual capture), the payment intent webhook will.
  // Idempotent because (a) the integration_events row is upserted by event
  // id at the top of POST(), and (b) we short-circuit when the same
  // payment_intent_id is already recorded on the invoice.
  const invoiceId = intent.metadata?.cc_invoice_id;
  const tenantId = intent.metadata?.cc_tenant_id;
  if (!invoiceId || !tenantId) return;
  if (intent.status !== "succeeded") return;
  const amount = intent.amount_received ?? 0;
  if (amount <= 0) return;

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("cc_invoices")
    .select("stripe_payment_intent_id")
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (existing?.stripe_payment_intent_id === intent.id) return;

  await applyInvoicePayment(admin, { invoiceId, tenantId, eventId, amount });

  await admin
    .from("cc_invoices")
    .update({ stripe_payment_intent_id: intent.id })
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const admin = createAdminClient();
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const { data: billing } = await admin
    .from("tenant_billing")
    .select("tenant_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (!billing) return;

  await admin
    .from("tenant_billing")
    .update({ billing_status: "past_due" })
    .eq("tenant_id", billing.tenant_id);
}
