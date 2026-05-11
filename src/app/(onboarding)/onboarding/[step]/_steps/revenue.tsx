import { saveRevenueAction } from "@/lib/onboarding/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export async function RevenueStep({ tenantId }: { tenantId: string }) {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("revenue_history")
    .select("year, revenue_cents")
    .eq("tenant_id", tenantId)
    .order("year", { ascending: false });

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);
  const byYear = new Map<number, number>(
    (existing || []).map((r) => [r.year, r.revenue_cents] as const)
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">QuickBooks (recommended)</CardTitle>
          <CardDescription>
            Connect QuickBooks Online for a live, read-only pull of your revenue
            history and chart of accounts. We never write to your QuickBooks
            data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" disabled>
            Connect QuickBooks (coming soon)
          </Button>
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            You can also connect later from Settings → Connectors.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Or enter manually</CardTitle>
          <CardDescription>
            Last 5–10 years of revenue. Leave any year blank to skip.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveRevenueAction} className="space-y-4">
            <div className="space-y-2">
              {years.map((y, idx) => (
                <div key={y} className="flex items-center gap-3">
                  <input type="hidden" name={`year_${idx}`} value={y} />
                  <Label className="w-16 text-sm">{y}</Label>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-muted-foreground)]">
                      $
                    </span>
                    <Input
                      name={`revenue_${idx}`}
                      type="number"
                      step="1"
                      min="0"
                      placeholder="0"
                      defaultValue={byYear.get(y) ? byYear.get(y)! / 100 : ""}
                      className="pl-7"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button type="submit">Save and continue</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
