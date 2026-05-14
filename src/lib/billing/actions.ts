// [CC-FOUNDATION] Billing actions. Today: Stripe Customer Portal redirect.
// Subscription Checkout for the SaaS itself lives here when we wire it up.

"use server";

import { redirect } from "next/navigation";
import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { actionError, type ActionResult } from "@/lib/validation";
import { log } from "@/lib/log";
import { getStripe } from "@/lib/stripe/client";
import { MissingCredentialsError } from "@/lib/integrations/base";
import { publicBaseUrl } from "@/lib/url";

export async function createPortalSession(): Promise<ActionResult<never>> {
  const session = await requireTenantUser();
  if (!session.roleKeys.includes("super_admin")) {
    return actionError("Only Super Admins can manage billing.");
  }

  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("tenant_billing")
    .select("stripe_customer_id")
    .eq("tenant_id", session.tenantId)
    .maybeSingle();

  if (!billing?.stripe_customer_id) {
    return actionError("No Stripe customer is linked to this workspace yet.");
  }

  let url: string;
  try {
    const stripe = getStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: billing.stripe_customer_id,
      return_url: `${publicBaseUrl()}/app/billing`,
    });
    url = portal.url;
  } catch (err) {
    if (err instanceof MissingCredentialsError) {
      return actionError("Stripe is not configured yet. Add STRIPE_SECRET_KEY in Settings → Integrations.");
    }
    log.error("billing.portal.failed", {
      tenant_id: session.tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return actionError("Could not open the Stripe portal. Please try again.");
  }

  log.info("billing.portal.opened", { tenant_id: session.tenantId });
  redirect(url);
}
