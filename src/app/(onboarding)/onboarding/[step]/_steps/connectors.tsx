import { markStepCompleteAction } from "@/lib/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

export function ConnectorsStep({ tenantId }: { tenantId: string }) {
  void tenantId;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google Workspace</CardTitle>
          <CardDescription>
            Required to unlock Gmail (CRM communications) and Google Drive (file
            management) for your team.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Don&apos;t have a Google Workspace account yet? You&apos;ll need one for the
            <code className="mx-1 rounded bg-[var(--color-muted)] px-1 text-xs">bids@yourdomain</code>
            sending address and your team&apos;s shared Drive.
          </p>
          <Button asChild variant="outline">
            <Link href="https://workspace.google.com/" target="_blank" rel="noreferrer">
              Set up Google Workspace
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Once you have a Workspace account, come back to Settings → Connectors
            to grant One Collective access.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">QuickBooks Online</CardTitle>
          <CardDescription>
            Read-only connection to pull revenue, chart of accounts, and financial
            data. We never write back to your QuickBooks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" disabled>
            Connect QuickBooks (coming soon)
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <form action={markStepCompleteAction}>
          <input type="hidden" name="step_key" value="connectors" />
          <Button type="submit">Skip and continue</Button>
        </form>
      </div>
    </div>
  );
}
