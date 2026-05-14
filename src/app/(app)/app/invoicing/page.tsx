import type { Metadata } from "next";
import Link from "next/link";
import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isModuleEnabled } from "@/foundational/registry";
import { ModuleStatus } from "@/components/app-shell/module-status";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { centsToDollars } from "@/lib/estimating/schemas";

export const metadata: Metadata = { title: "Invoicing" };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  sent: "default",
  partial: "default",
  paid: "default",
  overdue: "destructive",
  void: "outline",
};

function fmtMoney(cents: number): string {
  return centsToDollars(cents).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function InvoicingPage() {
  const session = await requireTenantUser();

  if (!isModuleEnabled("invoicing")) {
    return (
      <ModuleStatus
        kind="coming_soon"
        title="Invoicing"
        description="Issue invoices, track payments, and download branded PDFs."
      />
    );
  }

  const admin = createAdminClient();
  const { data: invoices } = await admin
    .from("cc_invoices")
    .select(
      "id, invoice_number, title, status, total_cents, amount_paid_cents, due_date, created_at"
    )
    .eq("tenant_id", session.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const rows = invoices ?? [];
  const open = rows.filter((r) => r.status === "draft" || r.status === "sent" || r.status === "partial");
  const paid = rows.filter((r) => r.status === "paid");
  const outstandingCents = open.reduce(
    (s, r) => s + (Number(r.total_cents) - Number(r.amount_paid_cents)),
    0
  );
  const collectedCents = rows.reduce((s, r) => s + Number(r.amount_paid_cents), 0);

  const stats = [
    { label: "Open invoices", value: open.length.toString() },
    { label: "Outstanding", value: fmtMoney(outstandingCents) },
    { label: "Collected", value: fmtMoney(collectedCents) },
    { label: "Paid count", value: paid.length.toString() },
  ];

  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoicing</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Send branded invoices, record payments, and keep an eye on what is outstanding.
          </p>
        </div>
        <Button asChild>
          <Link href="/app/invoicing/new">New invoice</Link>
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="py-4">
              <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                {s.label}
              </div>
              <div className="mt-1 text-2xl font-semibold tracking-tight">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardContent>
          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--color-border)] py-12 text-center text-sm text-[var(--color-muted-foreground)]">
              No invoices yet. Click <span className="font-medium">New invoice</span> to create your
              first one — or convert an accepted estimate from the estimate detail page.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="py-2 pr-3">Number</th>
                    <th className="py-2 pr-3">Title</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 pr-3 text-right">Balance</th>
                    <th className="py-2 pr-3">Due</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const balance =
                      Number(row.total_cents) - Number(row.amount_paid_cents);
                    return (
                      <tr key={row.id} className="border-b border-[var(--color-border)]/50">
                        <td className="py-2 pr-3 font-mono text-xs">{row.invoice_number}</td>
                        <td className="py-2 pr-3">
                          <Link
                            href={`/app/invoicing/${row.id}`}
                            className="font-medium underline-offset-2 hover:underline"
                          >
                            {row.title}
                          </Link>
                          <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                            created {formatDate(row.created_at)}
                          </p>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"}>
                            {row.status}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 text-right font-medium">
                          {fmtMoney(Number(row.total_cents))}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {balance > 0 ? fmtMoney(balance) : "—"}
                        </td>
                        <td className="py-2 pr-3 text-[var(--color-muted-foreground)]">
                          {row.due_date ? formatDate(row.due_date) : "—"}
                        </td>
                        <td className="py-2 text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/app/invoicing/${row.id}`}>Open</Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
