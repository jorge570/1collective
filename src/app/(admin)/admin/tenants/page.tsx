import { requirePlatformOperator } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { extendTrialAction, suspendTenantAction, reactivateTenantAction } from "./actions";
import { Button } from "@/components/ui/button";

export default async function TenantsPage() {
  await requirePlatformOperator();
  const admin = createAdminClient();

  const { data: tenants } = await admin
    .from("tenants")
    .select(`
      id, name, slug, status, created_at,
      tenant_billing (
        billing_mode, billing_status, trial_ends_at, trial_extended_count
      )
    `)
    .order("created_at", { ascending: false });

  type TenantRow = {
    id: string;
    name: string;
    slug: string;
    status: string;
    created_at: string;
    tenant_billing:
      | {
          billing_mode: string;
          billing_status: string;
          trial_ends_at: string | null;
          trial_extended_count: number;
        }
      | { billing_mode: string; billing_status: string; trial_ends_at: string | null; trial_extended_count: number }[]
      | null;
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        All workspaces on the platform.
      </p>

      <div className="mt-6 rounded-lg border bg-[var(--color-background)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Billing</th>
              <th className="px-4 py-3 font-medium">Trial ends</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(tenants ?? []).map((t: TenantRow) => {
              const billing = Array.isArray(t.tenant_billing)
                ? t.tenant_billing[0]
                : t.tenant_billing;
              return (
                <tr key={t.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium">{t.name}</td>
                  <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                    {t.slug}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={tenantStatusVariant(t.status)}>{t.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {billing?.billing_mode ?? "—"}
                    {billing?.billing_status && (
                      <span className="ml-1 text-[var(--color-muted-foreground)]">
                        ({billing.billing_status})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {billing?.trial_ends_at ? formatDate(billing.trial_ends_at) : "—"}
                    {billing?.trial_extended_count
                      ? ` (+${billing.trial_extended_count})`
                      : ""}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
                    {formatDate(t.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {billing?.billing_status === "trialing" && (
                        <form action={extendTrialAction}>
                          <input type="hidden" name="tenant_id" value={t.id} />
                          <Button size="sm" variant="outline" type="submit">
                            +30 days
                          </Button>
                        </form>
                      )}
                      {t.status === "suspended" ? (
                        <form action={reactivateTenantAction}>
                          <input type="hidden" name="tenant_id" value={t.id} />
                          <Button size="sm" variant="outline" type="submit">
                            Reactivate
                          </Button>
                        </form>
                      ) : (
                        <form action={suspendTenantAction}>
                          <input type="hidden" name="tenant_id" value={t.id} />
                          <Button size="sm" variant="outline" type="submit">
                            Suspend
                          </Button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {(!tenants || tenants.length === 0) && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-[var(--color-muted-foreground)]"
                >
                  No tenants yet. Generate an invite link to onboard your first
                  customer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function tenantStatusVariant(
  s: string
): "default" | "success" | "warning" | "destructive" | "secondary" {
  switch (s) {
    case "active":
      return "success";
    case "onboarding":
      return "secondary";
    case "trial_expired":
      return "warning";
    case "suspended":
      return "destructive";
    default:
      return "default";
  }
}
