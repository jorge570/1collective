// [CC-FOUNDATION] Cron job declarations.
// New scheduled jobs register themselves here. Importing this module from a
// route or tests guarantees the registry is populated before lookups run.

import { defaultDailyKey, defaultHourlyKey, registerCronJob } from "./registry";
import { materializeDueSchedules } from "@/lib/invoicing/recurring";
import { scanOverdueInvoices } from "@/lib/invoicing/overdue";

let registered = false;

export function ensureCronJobsRegistered(): void {
  if (registered) return;
  registered = true;

  registerCronJob({
    name: "heartbeat",
    description:
      "Smoke-check job that proves the cron pipeline is wired end to end. Safe to run on any schedule.",
    schedule: "0 * * * *",
    defaultIdempotencyKey: (now) => defaultHourlyKey("heartbeat", now),
    handler: async () => ({ status: "succeeded", result: { ok: true } }),
  });

  registerCronJob({
    name: "recurring_invoices_daily",
    description:
      "Materializes due rows from cc_recurring_invoice_schedules into draft invoices. Idempotent per UTC day.",
    schedule: "0 2 * * *",
    defaultIdempotencyKey: (now) => defaultDailyKey("recurring_invoices_daily", now),
    handler: async (ctx) => {
      const out = await materializeDueSchedules(ctx.admin, ctx.startedAt);
      return {
        status: "succeeded",
        result: { scanned: out.scanned, created: out.created, error_count: out.errors.length },
      };
    },
  });

  registerCronJob({
    name: "invoice_overdue_daily",
    description:
      "Marks past-due invoices overdue and sends bucketed reminders (1/7/14/30 days). Best-effort email; degrades cleanly when Resend is blank.",
    schedule: "0 13 * * *",
    defaultIdempotencyKey: (now) => defaultDailyKey("invoice_overdue_daily", now),
    handler: async (ctx) => {
      const out = await scanOverdueInvoices(ctx.admin, ctx.startedAt);
      return { status: "succeeded", result: { ...out } };
    },
  });
}
