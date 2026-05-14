import type { Metadata } from "next";
import { requireTenantUser } from "@/lib/auth/session";
import { ModuleShellPreview } from "@/components/app-shell/module-shell-preview";

export const metadata: Metadata = { title: "Invoicing" };

export default async function InvoicingPage() {
  await requireTenantUser();
  return (
    <ModuleShellPreview
      title="Invoicing"
      description="Native invoices, payments, and ledger. QuickBooks Online sync configures inside this page."
      primaryActionLabel="Create invoice"
      stats={[
        { label: "Outstanding", value: "$0", helper: "Across all customers" },
        { label: "Paid (30d)", value: "$0" },
        { label: "Overdue", value: "0", helper: "Invoices past due" },
        { label: "Draft", value: "0" },
      ]}
      emptyTitle="No invoices yet"
      emptyHint="Once Invoicing is enabled, drafts and sent invoices will appear here."
    />
  );
}
