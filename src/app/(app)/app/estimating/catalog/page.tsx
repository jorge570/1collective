import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isModuleEnabled } from "@/foundational/registry";
import { ModuleStatus } from "@/components/app-shell/module-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { centsToDollars } from "@/lib/estimating/schemas";
import {
  createCatalogItem,
  deactivateCatalogItem,
  reactivateCatalogItem,
} from "@/lib/estimating/catalog-actions";

export const metadata: Metadata = { title: "Estimate catalog" };

function fmtMoney(cents: number): string {
  return centsToDollars(cents).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

async function handleCreate(formData: FormData) {
  "use server";
  const r = await createCatalogItem(formData);
  if (!r.ok) throw new Error(r.error);
  redirect("/app/estimating/catalog");
}

async function handleDeactivate(formData: FormData) {
  "use server";
  const r = await deactivateCatalogItem(formData);
  if (!r.ok) throw new Error(r.error);
}

async function handleReactivate(formData: FormData) {
  "use server";
  const r = await reactivateCatalogItem(formData);
  if (!r.ok) throw new Error(r.error);
}

export default async function CatalogPage() {
  const session = await requireTenantUser();

  if (!isModuleEnabled("estimating")) {
    return (
      <ModuleStatus
        kind="coming_soon"
        title="Estimating"
        description="Module not yet enabled."
      />
    );
  }

  const admin = createAdminClient();
  const { data: items } = await admin
    .from("cc_estimate_catalog_items")
    .select("id, name, description, unit, default_price_cents, category, is_active")
    .eq("tenant_id", session.tenantId)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  const rows = items ?? [];
  const active = rows.filter((r) => r.is_active);
  const inactive = rows.filter((r) => !r.is_active);

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estimate catalog</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Reusable line items you can drop into any estimate. Set a default unit price; per-estimate
            quantities and prices stay editable.
          </p>
        </div>
        <Button variant="ghost" asChild>
          <Link href="/app/estimating">Back to estimates</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a catalog item</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleCreate} className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            <input
              name="name"
              required
              placeholder="Name (e.g. 'Excavator hour')"
              className="sm:col-span-4 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
            <input
              name="category"
              placeholder="Category (optional)"
              className="sm:col-span-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
            <input
              name="unit"
              defaultValue="ea"
              className="sm:col-span-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
            <input
              name="default_price"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="Default price"
              className="sm:col-span-2 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
            <Button type="submit" className="sm:col-span-2" size="sm">
              Add to catalog
            </Button>
            <textarea
              name="description"
              rows={2}
              placeholder="Description (optional, shown alongside the line item)"
              className="sm:col-span-12 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Catalog ({active.length} active{inactive.length ? `, ${inactive.length} inactive` : ""})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted-foreground)]">
              No catalog items yet. Add one above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3 text-right">Default price</th>
                    <th className="py-2 pr-3">Unit</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--color-border)]/50">
                      <td className="py-2 pr-3">
                        <Link
                          href={`/app/estimating/catalog/${row.id}`}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {row.name}
                        </Link>
                        {row.description ? (
                          <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                            {row.description}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 text-[var(--color-muted-foreground)]">
                        {row.category ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-right font-medium">
                        {fmtMoney(Number(row.default_price_cents))}
                      </td>
                      <td className="py-2 pr-3 text-[var(--color-muted-foreground)]">{row.unit}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={row.is_active ? "default" : "outline"}>
                          {row.is_active ? "active" : "inactive"}
                        </Badge>
                      </td>
                      <td className="py-2 text-right">
                        <form
                          action={row.is_active ? handleDeactivate : handleReactivate}
                          className="inline"
                        >
                          <input type="hidden" name="catalog_item_id" value={row.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            {row.is_active ? "Deactivate" : "Reactivate"}
                          </Button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
