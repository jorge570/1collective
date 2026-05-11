import { requirePlatformOperator } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { createChecklistItemAction, toggleChecklistItemAction, reorderChecklistAction } from "./actions";

export default async function ChecklistPage() {
  await requirePlatformOperator();
  const admin = createAdminClient();

  const { data: items } = await admin
    .from("admin_checklist_items")
    .select("*")
    .order("order_index", { ascending: true });

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contract checklist</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          The authoritative list Pre-Con AI uses when reviewing tenant contracts.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add new checklist item</CardTitle>
          <CardDescription>
            Items appear in the order shown below; use the reorder controls to
            change priority.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createChecklistItemAction} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="Pay-when-paid clause"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  name="category"
                  placeholder="payment_terms"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Plain-language explanation</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                placeholder="Why this clause matters and what to look for…"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="priority_default">Default priority</Label>
                <select
                  id="priority_default"
                  name="priority_default"
                  defaultValue="high"
                  className="flex h-9 w-full rounded-md border bg-[var(--color-background)] px-3 text-sm"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="order_index">Order index</Label>
                <Input
                  id="order_index"
                  name="order_index"
                  type="number"
                  defaultValue={(items?.length ?? 0) * 10}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit">Add item</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {(items ?? []).map((item) => (
          <Card key={item.id} className={!item.is_active ? "opacity-60" : ""}>
            <CardContent className="flex items-start justify-between gap-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    #{item.order_index}
                  </span>
                  <Badge variant={priorityVariant(item.priority_default)}>
                    {item.priority_default}
                  </Badge>
                  {item.category && (
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {item.category}
                    </span>
                  )}
                </div>
                <div className="mt-1 font-medium">{item.title}</div>
                {item.description && (
                  <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
                    {item.description}
                  </p>
                )}
              </div>
              <div className="flex flex-shrink-0 items-start gap-2">
                <form action={reorderChecklistAction}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <input type="hidden" name="direction" value="up" />
                  <Button type="submit" variant="ghost" size="sm">
                    ↑
                  </Button>
                </form>
                <form action={reorderChecklistAction}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <input type="hidden" name="direction" value="down" />
                  <Button type="submit" variant="ghost" size="sm">
                    ↓
                  </Button>
                </form>
                <form action={toggleChecklistItemAction}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <Button type="submit" variant="outline" size="sm">
                    {item.is_active ? "Disable" : "Enable"}
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}
        {(!items || items.length === 0) && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">
              No checklist items yet. Add the first to start configuring Pre-Con
              review.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function priorityVariant(p: string): "destructive" | "warning" | "secondary" {
  if (p === "critical") return "destructive";
  if (p === "high") return "warning";
  return "secondary";
}
