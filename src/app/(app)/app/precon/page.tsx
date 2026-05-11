import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/utils";

export default async function PreConPage() {
  const session = await requireTenantUser();
  const admin = createAdminClient();

  if (session.isFieldRole) {
    const { data: checklists } = await admin
      .from("pre_job_checklists")
      .select(`
        id, generated_at, project_id,
        projects (name)
      `)
      .eq("tenant_id", session.tenantId)
      .order("generated_at", { ascending: false });

    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Pre-job checklists</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Your assigned projects&apos; mobilization checklists.
        </p>

        <div className="mt-6 space-y-2">
          {(checklists ?? []).map((c) => {
            const projectName = Array.isArray(c.projects)
              ? c.projects[0]?.name
              : (c.projects as { name: string } | null)?.name;
            return (
              <Card key={c.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <div className="font-medium">{projectName ?? "Project"}</div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">
                      Generated {formatDate(c.generated_at)}
                    </div>
                  </div>
                  <Badge variant="secondary">Open</Badge>
                </CardContent>
              </Card>
            );
          })}
          {(!checklists || checklists.length === 0) && (
            <Card>
              <CardContent className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">
                No pre-job checklists yet. They&apos;ll appear here as your assigned
                projects move to the Awarded stage.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  const { data: contracts } = await admin
    .from("contracts")
    .select(`
      id, title, status, health_score, total_versions, created_at,
      projects (name),
      companies:counterparty_company_id (name)
    `)
    .eq("tenant_id", session.tenantId)
    .order("created_at", { ascending: false });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Pre-Con</h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        Contract review, flagged findings, and pre-job checklists.
      </p>

      <Tabs defaultValue="contracts" className="mt-6">
        <TabsList>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="checklists">Pre-job checklists</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
        </TabsList>

        <TabsContent value="contracts">
          <div className="space-y-2">
            {(contracts ?? []).map((c) => {
              const projectName = Array.isArray(c.projects)
                ? c.projects[0]?.name
                : (c.projects as { name: string } | null)?.name;
              const counterparty = Array.isArray(c.companies)
                ? c.companies[0]?.name
                : (c.companies as { name: string } | null)?.name;
              return (
                <Card key={c.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <div className="font-medium">{c.title}</div>
                      <div className="text-xs text-[var(--color-muted-foreground)]">
                        {projectName ?? "—"} · {counterparty ?? "—"} · v{c.total_versions}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.health_score !== null && (
                        <Badge variant={healthVariant(c.health_score)}>
                          Health {c.health_score}/100
                        </Badge>
                      )}
                      <Badge variant="secondary">{c.status}</Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {(!contracts || contracts.length === 0) && (
              <Card>
                <CardContent className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">
                  No contracts yet. Upload one from the Upload tab to run a
                  Pre-Con review.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="checklists">
          <Card>
            <CardContent className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">
              Pre-job checklists generate automatically when a project moves to
              the &quot;Awarded&quot; stage.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload contract</CardTitle>
              <CardDescription>
                PDF only. We&apos;ll parse it, run the Pre-Con review against the
                checklist + clause library, and surface findings in 3 tabs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border-2 border-dashed p-8 text-center">
                <p className="text-sm font-medium">
                  Contract upload UI — wiring after Supabase Storage bucket is
                  configured
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function healthVariant(score: number): "destructive" | "warning" | "success" {
  if (score < 50) return "destructive";
  if (score < 80) return "warning";
  return "success";
}
