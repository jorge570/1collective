import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BrandingPage() {
  const session = await requireTenantUser();
  const admin = createAdminClient();

  const [{ data: tenant }, { data: brand }] = await Promise.all([
    admin
      .from("tenants")
      .select("name, primary_color_hex, secondary_color_hex, trade_types")
      .eq("id", session.tenantId)
      .single(),
    admin
      .from("brand_content")
      .select("purpose, mission, vision, core_values")
      .eq("tenant_id", session.tenantId)
      .maybeSingle(),
  ]);

  type CoreValue = { title: string; description?: string };
  const coreValues = Array.isArray(brand?.core_values)
    ? (brand.core_values as CoreValue[])
    : [];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Branding</h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        Your logo, colors, purpose, and values — applied across the dashboard
        and outbound documents.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Brand</CardTitle>
            <CardDescription>{tenant?.name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                Primary color
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className="inline-block h-6 w-6 rounded border"
                  style={{ backgroundColor: tenant?.primary_color_hex ?? "transparent" }}
                />
                <span className="font-mono text-sm">
                  {tenant?.primary_color_hex ?? "—"}
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                Secondary color
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className="inline-block h-6 w-6 rounded border"
                  style={{ backgroundColor: tenant?.secondary_color_hex ?? "transparent" }}
                />
                <span className="font-mono text-sm">
                  {tenant?.secondary_color_hex ?? "—"}
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                Trades
              </div>
              <div className="mt-1 text-sm">
                {tenant?.trade_types?.length ? tenant.trade_types.join(", ") : "—"}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Purpose, mission, vision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                Purpose
              </div>
              <p className="mt-1">{brand?.purpose ?? "—"}</p>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                Mission
              </div>
              <p className="mt-1">{brand?.mission ?? "—"}</p>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                Vision
              </div>
              <p className="mt-1">{brand?.vision ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Core values</CardTitle>
        </CardHeader>
        <CardContent>
          {coreValues.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">—</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {coreValues.map((v, i) => (
                <li key={i}>
                  <strong>{v.title}</strong>
                  {v.description ? `: ${v.description}` : ""}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
