import { requirePlatformOperator } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminOverviewPage() {
  await requirePlatformOperator();
  const admin = createAdminClient();

  const [
    { count: tenantCount },
    { count: activeTrialCount },
    { count: inviteCount },
    { count: checklistCount },
    { count: clauseCount },
  ] = await Promise.all([
    admin.from("tenants").select("id", { count: "exact", head: true }),
    admin
      .from("tenant_billing")
      .select("id", { count: "exact", head: true })
      .eq("billing_status", "trialing"),
    admin
      .from("invite_links")
      .select("id", { count: "exact", head: true })
      .is("disabled_at", null),
    admin
      .from("admin_checklist_items")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    admin
      .from("admin_clause_library")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
  ]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        Platform-wide health and configuration.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Tenants" value={tenantCount ?? 0} />
        <StatCard label="On trial" value={activeTrialCount ?? 0} />
        <StatCard label="Active invite links" value={inviteCount ?? 0} />
        <StatCard label="Checklist items" value={checklistCount ?? 0} />
        <StatCard label="Clause library" value={clauseCount ?? 0} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
