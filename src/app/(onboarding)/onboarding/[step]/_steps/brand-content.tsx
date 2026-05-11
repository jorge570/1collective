import { saveBrandContentAction } from "@/lib/onboarding/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

export async function BrandContentStep({ tenantId }: { tenantId: string }) {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("brand_content")
    .select("purpose, vision, mission, core_values")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const valuesAsText = Array.isArray(existing?.core_values)
    ? (existing.core_values as Array<{ title: string; description?: string }>)
        .map((v) => (v.description ? `${v.title}: ${v.description}` : v.title))
        .join("\n")
    : "";

  return (
    <form action={saveBrandContentAction} className="space-y-6">
      <Card>
        <CardContent className="space-y-4 py-6">
          <div className="space-y-1.5">
            <Label htmlFor="purpose">Purpose</Label>
            <Textarea
              id="purpose"
              name="purpose"
              rows={3}
              placeholder="Why does the company exist? What problem are you really solving?"
              defaultValue={existing?.purpose ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mission">Mission</Label>
            <Textarea
              id="mission"
              name="mission"
              rows={3}
              placeholder="What you do, who you do it for, and how."
              defaultValue={existing?.mission ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vision">Vision</Label>
            <Textarea
              id="vision"
              name="vision"
              rows={3}
              placeholder="Where the company is headed in the next 5–10 years."
              defaultValue={existing?.vision ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="core_values">Core values</Label>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              One per line. Format: <code>Value name: short description</code>.
            </p>
            <Textarea
              id="core_values"
              name="core_values"
              rows={6}
              placeholder={"Integrity: We do what we said we'd do.\nSafety: Nobody gets hurt on our jobs.\nCraftsmanship: Quality work, every time."}
              defaultValue={valuesAsText}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit">Save and continue</Button>
      </div>
    </form>
  );
}
