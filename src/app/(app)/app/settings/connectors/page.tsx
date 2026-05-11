import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ExternalLink, CheckCircle2, Circle } from "lucide-react";

export default async function ConnectorsPage() {
  const session = await requireTenantUser();
  const admin = createAdminClient();

  const [
    { data: gdrive },
    { data: qbo },
    { data: emailAccts },
    { data: bidsSetup },
  ] = await Promise.all([
    admin
      .from("google_drive_connections")
      .select("status, google_account_email")
      .eq("tenant_id", session.tenantId)
      .maybeSingle(),
    admin
      .from("qbo_connections")
      .select("status, realm_id, last_synced_at")
      .eq("tenant_id", session.tenantId)
      .maybeSingle(),
    admin
      .from("email_accounts")
      .select("provider, email_address, status")
      .eq("tenant_id", session.tenantId),
    admin
      .from("tenant_bids_setup")
      .select("status, target_address")
      .eq("tenant_id", session.tenantId)
      .maybeSingle(),
  ]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Connectors</h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        Connect external services. None are required to use One Collective, but
        each unlocks specific functionality.
      </p>

      <div className="mt-8 space-y-4">
        <ConnectorCard
          title="Google Workspace"
          description="Required for Gmail (CRM communications), Drive (file management), and the bids@ sending alias."
          connected={!!gdrive}
          connectedSummary={gdrive?.google_account_email ?? undefined}
          actionLabel={gdrive ? "Manage" : "Connect Google Workspace"}
          actionHref="#"
          actionDisabled
          helperText={
            gdrive
              ? undefined
              : "Don't have a Workspace account yet?"
          }
          helperLink={
            gdrive
              ? undefined
              : { label: "Create one", href: "https://workspace.google.com/" }
          }
        />

        <ConnectorCard
          title="QuickBooks Online"
          description="Read-only sync of revenue, chart of accounts, and financial data. We never write to your QuickBooks."
          connected={!!qbo}
          connectedSummary={qbo?.realm_id ? `Realm ${qbo.realm_id}` : undefined}
          actionLabel={qbo ? "Reconnect" : "Connect QuickBooks"}
          actionHref="#"
          actionDisabled
        />

        <ConnectorCard
          title="Bids@ email"
          description="Outbound automated emails (proposals, bid follow-ups) send from this address. Hosted on your Workspace domain."
          connected={bidsSetup?.status === "verified"}
          connectedSummary={bidsSetup?.target_address ?? undefined}
          actionLabel="Configure"
          actionHref="#"
          actionDisabled
        />

        <ConnectorCard
          title="Personal email (Gmail / Outlook)"
          description="Each team member connects their own mailbox for manual CRM sends and inbox sync."
          connected={(emailAccts?.length ?? 0) > 0}
          connectedSummary={
            emailAccts && emailAccts.length > 0
              ? `${emailAccts.length} account${emailAccts.length === 1 ? "" : "s"} connected`
              : undefined
          }
          actionLabel="Connect mailbox"
          actionHref="#"
          actionDisabled
        />
      </div>

      <p className="mt-8 text-xs text-[var(--color-muted-foreground)]">
        Connector buttons activate as each integration is wired in. Database
        plumbing is in place — OAuth flows are the next implementation pass.
      </p>
    </div>
  );
}

function ConnectorCard({
  title,
  description,
  connected,
  connectedSummary,
  actionLabel,
  actionHref,
  actionDisabled,
  helperText,
  helperLink,
}: {
  title: string;
  description: string;
  connected: boolean;
  connectedSummary?: string;
  actionLabel: string;
  actionHref: string;
  actionDisabled?: boolean;
  helperText?: string;
  helperLink?: { label: string; href: string };
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              {connected ? (
                <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
              ) : (
                <Circle className="h-4 w-4 text-[var(--color-muted-foreground)]" />
              )}
              <CardTitle className="text-base">{title}</CardTitle>
              {connected ? (
                <Badge variant="success">Connected</Badge>
              ) : (
                <Badge variant="secondary">Not connected</Badge>
              )}
            </div>
            <CardDescription className="mt-1">{description}</CardDescription>
            {connectedSummary && (
              <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                {connectedSummary}
              </div>
            )}
          </div>
          <Button
            asChild
            variant={connected ? "outline" : "default"}
            size="sm"
            disabled={actionDisabled}
          >
            {actionDisabled ? (
              <span className="opacity-50">{actionLabel}</span>
            ) : (
              <Link href={actionHref}>{actionLabel}</Link>
            )}
          </Button>
        </div>
        {helperText && helperLink && (
          <div className="mt-2 text-xs">
            {helperText}{" "}
            <Link
              href={helperLink.href}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {helperLink.label}
              <ExternalLink className="ml-0.5 inline h-3 w-3" />
            </Link>
          </div>
        )}
      </CardHeader>
      <CardContent />
    </Card>
  );
}
