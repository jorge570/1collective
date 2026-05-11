import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function RevenuePage() {
  const session = await requireTenantUser();
  const admin = createAdminClient();

  const [{ data: history }, { data: qbo }, { data: financial }] = await Promise.all([
    admin
      .from("revenue_history")
      .select("year, revenue_cents, source")
      .eq("tenant_id", session.tenantId)
      .order("year", { ascending: false }),
    admin
      .from("qbo_connections")
      .select("status, last_synced_at")
      .eq("tenant_id", session.tenantId)
      .maybeSingle(),
    admin
      .from("financial_health_scores")
      .select("overall_score, computed_at, component_scores")
      .eq("tenant_id", session.tenantId)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Revenue</h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        Historical revenue, financial health, and QuickBooks sync.
      </p>

      {!qbo && (
        <Card className="mt-6 border-[var(--color-warning)]">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <div className="font-medium text-sm">QuickBooks not connected</div>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Connect for live revenue, chart of accounts analysis, and
                Financial Health scoring.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/settings/connectors">Connect QuickBooks</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Annual revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(history ?? []).map((r) => (
                <div
                  key={r.year}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{r.year}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{r.source}</Badge>
                    <span className="font-medium">
                      {formatCurrency(r.revenue_cents)}
                    </span>
                  </div>
                </div>
              ))}
              {(!history || history.length === 0) && (
                <p className="py-4 text-center text-xs text-[var(--color-muted-foreground)]">
                  No revenue history recorded.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Financial Health</CardTitle>
            <CardDescription>
              {financial
                ? `Last computed ${new Date(financial.computed_at).toLocaleDateString()}`
                : "Connect QuickBooks to enable Financial Health scoring."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {financial ? (
              <div className="text-5xl font-semibold">
                {financial.overall_score ?? "—"}
                <span className="text-xl text-[var(--color-muted-foreground)]">
                  /100
                </span>
              </div>
            ) : (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Score will appear once data is synced.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
