import { requirePlatformOperator } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClauseAction, toggleClauseAction } from "./actions";

export default async function ClauseLibraryPage() {
  await requirePlatformOperator();
  const admin = createAdminClient();

  const [{ data: clauses }, { data: checklistItems }] = await Promise.all([
    admin.from("admin_clause_library").select("*").order("created_at", { ascending: false }),
    admin
      .from("admin_checklist_items")
      .select("id, title")
      .eq("is_active", true)
      .order("order_index"),
  ]);

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clause library</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Curated suggested-replacement language Pre-Con AI offers tenants when
          flagging contracts.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add clause</CardTitle>
          <CardDescription>
            Link each clause to a checklist item so flagged findings can suggest
            it automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createClauseAction} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="Standard pay-when-paid clause"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="linked_checklist_item_id">Linked checklist item</Label>
                <select
                  id="linked_checklist_item_id"
                  name="linked_checklist_item_id"
                  className="flex h-9 w-full rounded-md border bg-[var(--color-background)] px-3 text-sm"
                >
                  <option value="">— None —</option>
                  {(checklistItems ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clause_text">Clause text</Label>
              <Textarea
                id="clause_text"
                name="clause_text"
                rows={8}
                placeholder="Enter the actual contract language…"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                name="tags"
                placeholder="payment_terms, subcontract, indemnity"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit">Add clause</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {(clauses ?? []).map((c) => (
          <Card key={c.id} className={!c.is_active ? "opacity-60" : ""}>
            <CardContent className="space-y-2 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="font-medium">{c.title}</div>
                <form action={toggleClauseAction}>
                  <input type="hidden" name="clause_id" value={c.id} />
                  <Button type="submit" variant="outline" size="sm">
                    {c.is_active ? "Disable" : "Enable"}
                  </Button>
                </form>
              </div>
              <pre className="whitespace-pre-wrap rounded bg-[var(--color-muted)] p-3 text-xs">
                {c.clause_text}
              </pre>
              {c.tags && c.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {c.tags.map((tag: string) => (
                    <span
                      key={tag}
                      className="rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {(!clauses || clauses.length === 0) && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">
              No clauses yet. Add the first to start populating Pre-Con
              suggestions.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
