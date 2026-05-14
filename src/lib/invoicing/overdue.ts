// [CC-FOUNDATION] Overdue invoice scanner.
// Cron job: every UTC day, find sent/partial invoices whose due_date has
// passed and bucket them into 1 / 7 / 14 / 30-day reminder lanes. Sends a
// best-effort email if Resend is configured; otherwise records a
// `skipped_no_channel` audit row so operators can still see what *would*
// have gone out. The (invoice_id, kind, sent_on_date) unique index in
// 0018 prevents duplicate reminders if the cron job double-fires.

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { MissingCredentialsError } from "@/lib/integrations/base";
import { log } from "@/lib/log";
import { publicBaseUrl } from "@/lib/url";

export type ReminderKind = "overdue_1" | "overdue_7" | "overdue_14" | "overdue_30";

export const REMINDER_BUCKETS: Array<{ kind: ReminderKind; days: number }> = [
  { kind: "overdue_1", days: 1 },
  { kind: "overdue_7", days: 7 },
  { kind: "overdue_14", days: 14 },
  { kind: "overdue_30", days: 30 },
];

export function bucketForDaysOverdue(daysOverdue: number): ReminderKind | null {
  // Largest matching bucket the invoice has crossed today.
  let pick: ReminderKind | null = null;
  for (const b of REMINDER_BUCKETS) {
    if (daysOverdue >= b.days) pick = b.kind;
  }
  return pick;
}

type Admin = ReturnType<typeof createAdminClient>;

interface OverdueRow {
  id: string;
  tenant_id: string;
  invoice_number: string;
  title: string;
  total_cents: number;
  amount_paid_cents: number;
  due_date: string;
  status: string;
  company_id: string | null;
}

export interface OverdueRunOutcome {
  scanned: number;
  status_updated: number;
  reminders_sent: number;
  reminders_skipped: number;
  errors: number;
}

export async function scanOverdueInvoices(
  admin: Admin,
  now: Date = new Date()
): Promise<OverdueRunOutcome> {
  const today = utcDate(now);
  const { data, error } = await admin
    .from("cc_invoices")
    .select("id, tenant_id, invoice_number, title, total_cents, amount_paid_cents, due_date, status, company_id")
    .in("status", ["sent", "partial", "overdue"])
    .not("due_date", "is", null)
    .lt("due_date", today)
    .is("deleted_at", null)
    .limit(1000);
  if (error) throw new Error(`overdue scan failed: ${error.message}`);

  const out: OverdueRunOutcome = {
    scanned: data?.length ?? 0,
    status_updated: 0,
    reminders_sent: 0,
    reminders_skipped: 0,
    errors: 0,
  };

  for (const inv of (data ?? []) as OverdueRow[]) {
    const remaining = Number(inv.total_cents) - Number(inv.amount_paid_cents);
    if (remaining <= 0) continue;
    if (inv.status !== "overdue") {
      const { error: upErr } = await admin
        .from("cc_invoices")
        .update({ status: "overdue" })
        .eq("id", inv.id)
        .eq("tenant_id", inv.tenant_id)
        .in("status", ["sent", "partial"]);
      if (!upErr) out.status_updated += 1;
    }

    const daysOverdue = daysBetween(new Date(inv.due_date), now);
    const bucket = bucketForDaysOverdue(daysOverdue);
    if (!bucket) continue;

    const recipient = await resolveRecipientEmail(admin, inv.tenant_id, inv.company_id);
    const sentOnDate = today;
    const channel = recipient ? "email" : "none";
    const insert = await admin.from("cc_invoice_reminders").insert({
      tenant_id: inv.tenant_id,
      invoice_id: inv.id,
      kind: bucket,
      sent_on_date: sentOnDate,
      channel,
      delivery_status: recipient ? "sent" : "skipped_no_channel",
    });
    if (insert.error) {
      // 23505 = duplicate (already sent today). Treat as success-skip.
      if (insert.error.code === "23505") continue;
      out.errors += 1;
      log.warn("overdue.audit_insert_failed", { invoice_id: inv.id, err: insert.error.message });
      continue;
    }

    if (!recipient) {
      out.reminders_skipped += 1;
      continue;
    }

    try {
      await sendEmail({
        to: recipient,
        subject: `Reminder: invoice ${inv.invoice_number} is past due`,
        text: overdueEmailText(inv, daysOverdue, remaining),
      });
      out.reminders_sent += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const skip = err instanceof MissingCredentialsError;
      await admin
        .from("cc_invoice_reminders")
        .update({
          delivery_status: skip ? "skipped_no_channel" : "failed",
          delivery_error: msg.slice(0, 500),
        })
        .eq("invoice_id", inv.id)
        .eq("kind", bucket)
        .eq("sent_on_date", sentOnDate);
      if (skip) out.reminders_skipped += 1;
      else out.errors += 1;
    }
  }

  return out;
}

function utcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(due: Date, now: Date): number {
  const ms = now.getTime() - due.getTime();
  return Math.floor(ms / (24 * 3600 * 1000));
}

function overdueEmailText(inv: OverdueRow, daysOverdue: number, remaining: number): string {
  const dollars = (remaining / 100).toFixed(2);
  return [
    `Hi,`,
    ``,
    `This is a reminder that invoice ${inv.invoice_number} ("${inv.title}") is ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} past due.`,
    ``,
    `Balance due: $${dollars}`,
    ``,
    `If you've already paid, please disregard this message. Otherwise reply to this email to arrange payment.`,
    ``,
    `— sent automatically by ${publicBaseUrl()}`,
  ].join("\n");
}

async function resolveRecipientEmail(
  admin: Admin,
  tenantId: string,
  companyId: string | null
): Promise<string | null> {
  if (!companyId) return null;
  const { data } = await admin
    .from("companies")
    .select("billing_email, primary_email, email")
    .eq("id", companyId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return null;
  const candidate = (data as Record<string, string | null>).billing_email
    ?? (data as Record<string, string | null>).primary_email
    ?? (data as Record<string, string | null>).email;
  return candidate && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}
