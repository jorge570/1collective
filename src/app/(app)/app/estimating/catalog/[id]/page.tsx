import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isModuleEnabled } from "@/foundational/registry";
import { ModuleStatus } from "@/components/app-shell/module-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { centsToDollars } from "@/lib/estimating/schemas";
import { updateCatalogItem } from "@/lib/estimating/catalog-actions";

export const metadata: Metadata = { title: "Edit catalog item" };

async function handleSave(formData: FormData) {
  "use server";
  const r = await updateCatalogItem(formData);
  if (!r.ok) throw new Error(r.error);
  redirect("/app/estimating/catalog");
}

export default async function CatalogItemEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  const { id } = await params;
  const admin = createAdminClient();
  const { data: item } = await admin
    .from("cc_estimate_catalog_items")
    .select("id, tenant_id, name, description, unit, default_price_cents, category, is_active")
    .eq("id", id)
    .maybeSingle();

  if (!item || item.tenant_id !== session.tenantId) notFound();

  const defaultPriceDollars = centsToDollars(Number(item.default_price_cents)).toFixed(2);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Edit catalog item</h1>
        <Button variant="ghost" asChild>
          <Link href="/app/estimating/catalog">Cancel</Link>
        </Button>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">{item.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleSave} className="space-y-4">
            <input type="hidden" name="catalog_item_id" value={item.id} />

            <div>
              <label className="block text-sm font-medium" htmlFor="name">
                Name
              </label>
              <input
                id="name"
                name="name"
                required
                defaultValue={item.name}
                className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium" htmlFor="description">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={item.description ?? ""}
                className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium" htmlFor="category">
                  Category
                </label>
                <input
                  id="category"
                  name="category"
                  defaultValue={item.category ?? ""}
                  className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium" htmlFor="unit">
                  Unit
                </label>
                <input
                  id="unit"
                  name="unit"
                  required
                  defaultValue={item.unit}
                  className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium" htmlFor="default_price">
                  Default price
                </label>
                <input
                  id="default_price"
                  name="default_price"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  defaultValue={defaultPriceDollars}
                  className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="is_active"
                name="is_active"
                type="checkbox"
                defaultChecked={item.is_active}
                className="h-4 w-4"
              />
              <label htmlFor="is_active" className="text-sm">
                Active (show in the picker on estimates)
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit">Save changes</Button>
              <Button type="button" variant="ghost" asChild>
                <Link href="/app/estimating/catalog">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
