import { markStepCompleteAction } from "@/lib/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload } from "lucide-react";

export function ContractsStep({ tenantId }: { tenantId: string }) {
  void tenantId;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload historical contracts</CardTitle>
          <CardDescription>
            We&apos;ll parse them in the background and pre-populate your CRM with
            clients, projects, and pipeline data. Anything we can&apos;t confidently
            extract will land in your &quot;Finish Setup&quot; list after onboarding.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border-2 border-dashed border-[var(--color-border)] p-8 text-center">
            <Upload className="mx-auto h-8 w-8 text-[var(--color-muted-foreground)]" />
            <p className="mt-3 text-sm font-medium">
              File upload UI — coming online when storage is wired
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              Drag and drop PDFs here, or click to browse. Bulk uploads supported.
            </p>
          </div>
          <p className="mt-4 text-xs text-[var(--color-muted-foreground)]">
            Skip for now if you don&apos;t have contracts to upload. You can do this
            anytime from the Pre-Con section.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <form action={markStepCompleteAction}>
          <input type="hidden" name="step_key" value="contracts" />
          <Button type="submit">Skip for now and continue</Button>
        </form>
      </div>
    </div>
  );
}
