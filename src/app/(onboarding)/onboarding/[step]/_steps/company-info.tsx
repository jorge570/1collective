import { saveCompanyInfoAction } from "@/lib/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const TRADE_OPTIONS = [
  ["plumbing", "Plumbing"],
  ["mechanical", "Mechanical"],
  ["fire_protection", "Fire Protection"],
  ["concrete", "Concrete"],
  ["steel", "Steel"],
  ["electrical", "Electrical"],
  ["general_contracting", "General Contracting"],
  ["hvac", "HVAC"],
  ["landscaping", "Landscaping"],
  ["roofing", "Roofing"],
  ["masonry", "Masonry"],
  ["other", "Other"],
] as const;

interface Tenant {
  id: string;
  name: string;
  primary_color_hex: string | null;
  secondary_color_hex: string | null;
  trade_types: string[] | null;
}

export function CompanyInfoStep({ tenant }: { tenant: Tenant | null }) {
  const selectedTrades = new Set(tenant?.trade_types ?? []);

  return (
    <form action={saveCompanyInfoAction} className="space-y-6">
      <Card>
        <CardContent className="space-y-4 py-6">
          <div className="space-y-1.5">
            <Label htmlFor="name">Company name</Label>
            <Input id="name" name="name" defaultValue={tenant?.name ?? ""} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="primary_color_hex">Primary brand color (HEX)</Label>
              <Input
                id="primary_color_hex"
                name="primary_color_hex"
                placeholder="#1B3A6F"
                defaultValue={tenant?.primary_color_hex ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="secondary_color_hex">Secondary brand color (HEX)</Label>
              <Input
                id="secondary_color_hex"
                name="secondary_color_hex"
                placeholder="#F2A900"
                defaultValue={tenant?.secondary_color_hex ?? ""}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-6">
          <div>
            <Label>Trades you work in</Label>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              Multi-select. Configures folder templates, CRM fields, and contract
              review for your trades.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TRADE_OPTIONS.map(([value, label]) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm hover:bg-[var(--color-accent)]"
              >
                <input
                  type="checkbox"
                  name="trade_types"
                  value={value}
                  defaultChecked={selectedTrades.has(value)}
                  className="h-4 w-4"
                />
                {label}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit">Save and continue</Button>
      </div>
    </form>
  );
}
