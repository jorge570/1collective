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
      default:
        // Unhandled event types are logged but not errors
        break;
    }

    await admin
      .from("integration_events")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("provider", "stripe")
      .eq("external_event_id", event.id);
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
