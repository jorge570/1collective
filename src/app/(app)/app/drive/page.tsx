import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function DrivePage() {
  const session = await requireTenantUser();
  const admin = createAdminClient();

  const { data: connection } = await admin
    .from("google_drive_connections")
    .select("status, google_account_email, root_folder_id, last_synced_at")
    .eq("tenant_id", session.tenantId)
    .maybeSingle();

  if (!connection) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Drive</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Connect Google Drive to enable shared file management for your team.
        </p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Google Drive not connected</CardTitle>
            <CardDescription>
              We push a templated folder structure into your Drive on first
              connect (Accounting, Operations, HR placeholders for now —
              trade-specific templates coming next).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/app/settings/connectors">Go to connectors</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Drive</h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        Files indexed from your connected Google Drive.
      </p>
      <Card className="mt-6">
        <CardContent className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">
          Drive file browser — wiring after OAuth credentials are configured.
        </CardContent>
      </Card>
    </div>
  );
}
