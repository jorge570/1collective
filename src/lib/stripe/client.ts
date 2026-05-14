import "server-only";
import Stripe from "stripe";
import { MissingCredentialsError } from "@/lib/integrations/base";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new MissingCredentialsError("Stripe", ["STRIPE_SECRET_KEY"]);
    }
    stripeClient = new Stripe(key, {
      apiVersion: "2026-04-22.dahlia",
      typescript: true,
    });
  }
  return stripeClient;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new MissingCredentialsError("Stripe", ["STRIPE_WEBHOOK_SECRET"]);
  }
  return secret;
}
