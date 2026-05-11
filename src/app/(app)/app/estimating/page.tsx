import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calculator } from "lucide-react";

export default function EstimatingPage() {
  return (
    <div className="p-8">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Estimating</h1>
        <Badge variant="warning">Coming Soon</Badge>
      </div>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        Trade-aware estimating, takeoffs, buyout, and PO issuance.
      </p>

      <Card className="mt-8">
        <CardHeader>
          <div className="flex items-start gap-3">
            <Calculator className="mt-1 h-5 w-5 text-[var(--color-muted-foreground)]" />
            <div>
              <CardTitle className="text-base">Coming in a future release</CardTitle>
              <CardDescription className="mt-1">
                Estimating is the next major module. When it ships, you&apos;ll get:
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li>• Trade-aware quantity takeoff with assemblies per discipline</li>
            <li>• Labor and material pricing with regional adjustments</li>
            <li>• Markup, overhead, and bid assembly</li>
            <li>• Buyout workflow with vendor commitment tracking</li>
            <li>• PO issuance and commitment-to-budget reconciliation</li>
            <li>• Trade-specific bid templates and proposal generation</li>
          </ul>
          <p className="mt-6 text-xs text-[var(--color-muted-foreground)]">
            This module is intentionally separated so the rest of the platform
            ships first. Your data model and CRM are designed to integrate with
            Estimating from day one once it&apos;s built.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
