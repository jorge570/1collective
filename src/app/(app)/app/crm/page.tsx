import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

const STAGE_ORDER = [
  ["prospect", "Prospect"],
  ["active_bid", "Active Bid"],
  ["awarded", "Awarded"],
  ["in_progress", "In Progress"],
  ["complete", "Complete"],
  ["archived", "Archived"],
] as const;

export default async function CRMPage() {
  const session = await requireTenantUser();
  if (session.isFieldRole) return null;

  const admin = createAdminClient();
  const { data: projects } = await admin
    .from("projects")
    .select(`
      id, name, stage, contract_value_cents, percent_complete,
      companies (name)
    `)
    .eq("tenant_id", session.tenantId)
    .order("stage_entered_at", { ascending: false });

  const byStage = new Map<string, typeof projects>();
  for (const [key] of STAGE_ORDER) byStage.set(key, [] as never);
  for (const p of projects ?? []) {
    const arr = byStage.get(p.stage) ?? [];
    arr.push(p);
    byStage.set(p.stage, arr);
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight">CRM</h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        Project pipeline across all clients.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {STAGE_ORDER.map(([stage, label]) => {
          const items = byStage.get(stage) ?? [];
          return (
            <Card key={stage}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide">
                    {label}
                  </CardTitle>
                  <Badge variant="secondary">{items.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.length === 0 && (
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    No projects.
                  </p>
                )}
                {items.map((p) => {
                  const companyName = Array.isArray(p.companies)
                    ? p.companies[0]?.name
                    : (p.companies as { name: string } | null)?.name;
                  return (
                    <div key={p.id} className="rounded-md border p-2">
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-[var(--color-muted-foreground)]">
                        {companyName ?? "—"}
                      </div>
                      {p.contract_value_cents !== null && (
                        <div className="mt-1 text-xs">
                          {formatCurrency(p.contract_value_cents)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {projects && projects.length === 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-base">No projects yet</CardTitle>
            <CardDescription>
              Upload historical contracts from Pre-Con and we&apos;ll auto-populate
              your CRM with clients, projects, and pipeline stage.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
