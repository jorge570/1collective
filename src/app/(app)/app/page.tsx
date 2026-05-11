import Link from "next/link";
import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export default async function DashboardPage() {
  const session = await requireTenantUser();
  const admin = createAdminClient();

  const [
    { count: projectCount },
    { count: openSetupTaskCount },
    { count: contractCount },
    { count: companyCount },
    { data: setupTasks },
  ] = await Promise.all([
    admin
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", session.tenantId),
    admin
      .from("setup_tasks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", session.tenantId)
      .eq("status", "open"),
    admin
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", session.tenantId),
    admin
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", session.tenantId),
    admin
      .from("setup_tasks")
      .select("id, title, description, task_type, priority")
      .eq("tenant_id", session.tenantId)
      .eq("status", "open")
      .order("priority", { ascending: false })
      .limit(5),
  ]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        Overview of your workspace.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Active projects" value={projectCount ?? 0} href="/app/precon" />
        <StatCard label="Clients" value={companyCount ?? 0} href="/app/crm" />
        <StatCard label="Contracts" value={contractCount ?? 0} href="/app/precon" />
        <StatCard
          label="Open setup tasks"
          value={openSetupTaskCount ?? 0}
          href="#setup-tasks"
        />
      </div>

      {setupTasks && setupTasks.length > 0 && (
        <Card id="setup-tasks" className="mt-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Finish setup</CardTitle>
                <CardDescription>
                  Items flagged during onboarding that need your input.
                </CardDescription>
              </div>
              <Badge variant="secondary">{setupTasks.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {setupTasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0"
                >
                  <div>
                    <div className="font-medium text-sm">{t.title}</div>
                    {t.description && (
                      <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                        {t.description}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={taskHref(t.task_type)}>
                      Resolve <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {(!setupTasks || setupTasks.length === 0) && (
        <Card className="mt-8">
          <CardContent className="flex items-center gap-3 py-6">
            <CheckCircle2 className="h-5 w-5 text-[var(--color-success)]" />
            <div>
              <div className="font-medium text-sm">Setup is clean</div>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                No outstanding setup tasks. Your workspace is fully configured.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
            {label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold">{value}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

function taskHref(taskType: string): string {
  switch (taskType) {
    case "complete_contract":
      return "/app/precon";
    case "connect_drive":
    case "connect_gmail":
    case "connect_qbo":
    case "configure_bids_email":
      return "/app/settings/connectors";
    case "review_brand_content":
      return "/app/branding";
    case "invite_team":
      return "/app/team";
    default:
      return "/app";
  }
}
