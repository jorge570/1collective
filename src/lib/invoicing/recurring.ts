// [CC-FOUNDATION] Recurring invoice schedules.
// A schedule owns a template (line items, tax rate, terms, due-date offset).
// The cron job materializeDueSchedules() copies the template into a fresh
// draft invoice every time next_run_at <= now() and advances next_run_at by
// the frequency. Idempotent on a per-(schedule, run-day) basis via the
// cron audit table.

"use server";

import crypto from "crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { actionError, actionOk, parseForm, type ActionResult } from "@/lib/validation";
import { isModuleEnabled } from "@/foundational/registry";
import { log } from "@/lib/log";
import { lineItemTotalCents, taxCents, tenThousandthsToDecimalString } from "@/lib/estimating/schemas";
import { nextInvoiceNumber } from "./numbering";
import {
  type Frequency,
  scheduleTemplateSchema,
  createScheduleSchema,
  advanceNextRun,
} from "./frequencies";

export async function createRecurringSchedule(
  formData: FormData
): Promise<ActionResult<{ schedule_id: string }>> {
  if (!isModuleEnabled("invoicing")) return actionError("Invoicing is disabled.");
  const session = await requireTenantUser();

  const raw = formData.get("payload");
  if (typeof raw !== "string") return actionError("Missing payload.");
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return actionError("Malformed payload.");
  }
  const parsed = createScheduleSchema.safeParse(payload);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid schedule.");

  const admin = createAdminClient();
  const id = crypto.randomUUID();
  const { error } = await admin.from("cc_recurring_invoice_schedules").insert({
    id,
    tenant_id: session.tenantId,
    name: parsed.data.name,
    company_id: parsed.data.company_id ?? null,
    project_id: parsed.data.project_id ?? null,
    frequency: parsed.data.frequency,
    next_run_at: parsed.data.next_run_at.toISOString(),
    template: parsed.data.template,
    created_by: session.userId,
  });
  if (error) {
    log.error("recurring.create.failed", { tenant_id: session.tenantId, err: error.message });
    return actionError("Could not create schedule.");
  }
  revalidatePath("/app/invoicing");
  return actionOk({ schedule_id: id });
}

export async function setRecurringScheduleActive(
  formData: FormData
): Promise<ActionResult> {
  if (!isModuleEnabled("invoicing")) return actionError("Invoicing is disabled.");
  const session = await requireTenantUser();
  const setActiveSchema = z.object({
    schedule_id: z.string().uuid(),
    active: z.coerce.boolean(),
  });
  const parsed = parseForm(setActiveSchema, formData);
  if (!parsed.ok) return parsed;

  const admin = createAdminClient();
  const { error } = await admin
    .from("cc_recurring_invoice_schedules")
    .update({ active: parsed.data.active })
    .eq("id", parsed.data.schedule_id)
    .eq("tenant_id", session.tenantId);
  if (error) return actionError("Could not update schedule.");
  revalidatePath("/app/invoicing");
  return actionOk();
}

export interface MaterializeOutcome {
  scanned: number;
  created: number;
  errors: Array<{ schedule_id: string; error: string }>;
}

type Admin = ReturnType<typeof createAdminClient>;

export async function materializeDueSchedules(
  admin: Admin,
  now: Date = new Date()
): Promise<MaterializeOutcome> {
  const { data: due, error } = await admin
    .from("cc_recurring_invoice_schedules")
    .select("id, tenant_id, frequency, next_run_at, template, name, company_id, project_id")
    .eq("active", true)
    .is("deleted_at", null)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(`recurring scan failed: ${error.message}`);

  const out: MaterializeOutcome = { scanned: due?.length ?? 0, created: 0, errors: [] };
  for (const sch of due ?? []) {
    try {
      await materializeOne(admin, sch);
      out.created += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.errors.push({ schedule_id: sch.id, error: msg });
      log.error("recurring.materialize.failed", { schedule_id: sch.id, err: msg });
    }
  }
  return out;
}

async function materializeOne(
  admin: Admin,
  sch: {
    id: string;
    tenant_id: string;
    frequency: Frequency;
    next_run_at: string;
    template: unknown;
    company_id: string | null;
    project_id: string | null;
  }
) {
  const tpl = scheduleTemplateSchema.parse(sch.template);
  const newNextRun = advanceNextRun(new Date(sch.next_run_at), sch.frequency);

  // Conditional advance — wins the race against a concurrent run for this same
  // schedule. The runner.ts cron audit row also protects against same-slot
  // double-execution, but this is defense in depth across multiple schedules.
  const { data: claimed, error: claimErr } = await admin
    .from("cc_recurring_invoice_schedules")
    .update({ last_run_at: new Date().toISOString(), next_run_at: newNextRun.toISOString() })
    .eq("id", sch.id)
    .eq("tenant_id", sch.tenant_id)
    .eq("next_run_at", sch.next_run_at)
    .select("id")
    .maybeSingle();
  if (claimErr) throw new Error(`schedule claim failed: ${claimErr.message}`);
  if (!claimed) return; // someone else advanced this schedule

  for (let attempt = 0; attempt < 3; attempt++) {
    const invoiceNumber = await nextInvoiceNumber(admin, sch.tenant_id);
    const id = crypto.randomUUID();
    const dueDate = new Date(Date.now() + tpl.due_date_offset_days * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    const subtotal = tpl.line_items.reduce(
      (s, li) => s + lineItemTotalCents(li.quantity, li.unit_price),
      0
    );
    const tax = taxCents(subtotal, tpl.tax_rate_percent);
    const { error: insErr } = await admin.from("cc_invoices").insert({
      id,
      tenant_id: sch.tenant_id,
      invoice_number: invoiceNumber,
      title: tpl.title,
      company_id: sch.company_id,
      project_id: sch.project_id,
      status: "draft",
      tax_rate_bps: tpl.tax_rate_percent,
      subtotal_cents: subtotal,
      tax_cents: tax,
      total_cents: subtotal + tax,
      due_date: dueDate,
      notes: tpl.notes ?? null,
      terms: tpl.terms ?? null,
    });
    if (insErr) {
      if (insErr.code === "23505") continue;
      throw new Error(`invoice insert failed: ${insErr.message}`);
    }
    for (let i = 0; i < tpl.line_items.length; i++) {
      const li = tpl.line_items[i];
      await admin.from("cc_invoice_line_items").insert({
        invoice_id: id,
        tenant_id: sch.tenant_id,
        position: i,
        description: li.description,
        quantity: tenThousandthsToDecimalString(li.quantity),
        unit: li.unit,
        unit_price_cents: li.unit_price,
        total_cents: lineItemTotalCents(li.quantity, li.unit_price),
      });
    }
    await admin
      .from("cc_recurring_invoice_schedules")
      .update({ last_invoice_id: id })
      .eq("id", sch.id)
      .eq("tenant_id", sch.tenant_id);
    log.info("recurring.materialized", {
      schedule_id: sch.id,
      invoice_id: id,
      invoice_number: invoiceNumber,
    });
    return;
  }
  throw new Error("could not allocate invoice number after 3 attempts");
}
