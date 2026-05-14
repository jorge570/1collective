import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { differenceInDays } from "date-fns";
import { createPortalSession } from "@/lib/billing/actions";

async function openPortalForm(): Promise<void> {
  "use server";
  const r = await createPortalSession();
  if (!r.ok) throw new Error(r.error);
}

export default async function BillingPage() {
  const session = await requireTenantUser();
  const isSuperAdmin = session.roleKeys.includes("super_admin");

  if (!isSuperAdmin) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <Card className="mt-6">
          <CardContent className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">
            Billing access is restricted to Super Admins.
          </CardContent>
        </Card>
      </div>
    );
  }

  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("tenant_billing")
    .select("*")
    .eq("tenant_id", session.tenantId)
    .single();

  const trialEnd = billing?.trial_ends_at ? new Date(billing.trial_ends_at) : null;
  const daysRemaining = trialEnd ? differenceInDays(trialEnd, new Date()) : null;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        Subscription, trial, and payment method.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current plan</CardTitle>
            <CardDescription>{billing?.billing_mode ?? "—"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-muted-foreground)]">Status</span>
              <Badge variant="secondary">{billing?.billing_status ?? "—"}</Badge>
            </div>
            {billing?.trial_started_at && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-muted-foreground)]">
                  Trial started
                </span>
                <span>{formatDate(billing.trial_started_at)}</span>
              </div>
            )}
            {trialEnd && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-muted-foreground)]">
                  Trial ends
                </span>
                <span>
                  {formatDate(trialEnd)}
                  {daysRemaining !== null && daysRemaining >= 0 && (
                    <span className="ml-1 text-xs text-[var(--color-muted-foreground)]">
                      ({daysRemaining}d left)
                    </span>
                  )}
                </span>
              </div>
            )}
            {billing?.trial_extended_count ? (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-muted-foreground)]">
                  Trial extensions
                </span>
                <span>{billing.trial_extended_count}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment method</CardTitle>
            <CardDescription>
              {billing?.stripe_customer_id
                ? "Card on file via Stripe."
                : "No card on file yet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {billing?.stripe_customer_id ? (
              <form action={openPortalForm}>
                <Button type="submit" variant="outline">
                  Manage in Stripe Customer Portal
                </Button>
              </form>
            ) : (
              <Button disabled>Add credit card (Stripe wiring coming next)</Button>
            )}
            {!billing?.stripe_customer_id && trialEnd && (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                A card is required 30 days before your trial ends to keep your
                workspace running without interruption.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
