import { requirePlatformOperator } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function FolderTemplatesPage() {
  await requirePlatformOperator();
  const admin = createAdminClient();

  const { data: templates } = await admin
    .from("admin_folder_templates")
    .select(`
      id, name, trade_type, is_placeholder, created_at,
      admin_folder_template_nodes (id, name, order_index, parent_node_id)
    `)
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Folder templates</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Templates pushed to each tenant&apos;s Google Drive on connection. Trade-
          specific templates not yet supplied — placeholders shown below.
        </p>
      </div>

      <div className="space-y-4">
        {(templates ?? []).map((t) => {
          const nodes = Array.isArray(t.admin_folder_template_nodes)
            ? t.admin_folder_template_nodes
            : [];
          return (
            <Card key={t.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{t.name}</CardTitle>
                  {t.is_placeholder && <Badge variant="warning">placeholder</Badge>}
                </div>
                <CardDescription>
                  {t.trade_type ?? "Universal (any trade)"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {nodes
                    .filter((n) => !n.parent_node_id)
                    .sort((a, b) => a.order_index - b.order_index)
                    .map((node) => (
                      <li key={node.id} className="flex items-center gap-2">
                        <span className="text-[var(--color-muted-foreground)]">📁</span>
                        {node.name}
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
        {(!templates || templates.length === 0) && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">
              No folder templates yet.
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Add new trade template</CardTitle>
          <CardDescription>
            Per-trade folder template editor coming next. For now, templates
            seeded in <code>0004_seed.sql</code> can be edited directly via SQL.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
