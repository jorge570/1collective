// [CC-FOUNDATION] Pure helpers for recurring invoice schedules.
// Kept separate from recurring.ts (which is "use server") so tests can
// import these without dragging in the server-only runtime.

import { z } from "zod";

export const FREQUENCIES = ["weekly", "biweekly", "monthly", "quarterly", "yearly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const scheduleTemplateSchema = z.object({
  title: z.string().min(1).max(200),
  tax_rate_percent: z.coerce.number().int().min(0).max(10000),
  due_date_offset_days: z.coerce.number().int().min(0).max(365).default(30),
  notes: z.string().max(2000).optional().nullable(),
  terms: z.string().max(2000).optional().nullable(),
  line_items: z
    .array(
      z.object({
        description: z.string().min(1).max(500),
        quantity: z.coerce.number().int().positive(),
        unit: z.string().min(1).max(16).default("ea"),
        unit_price: z.coerce.number().int().nonnegative(),
      })
    )
    .min(1)
    .max(50),
});
export type ScheduleTemplate = z.infer<typeof scheduleTemplateSchema>;

export const createScheduleSchema = z.object({
  name: z.string().min(1).max(200),
  company_id: z.string().uuid().optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
  frequency: z.enum(FREQUENCIES),
  next_run_at: z.coerce.date(),
  template: scheduleTemplateSchema,
});

export function advanceNextRun(from: Date, freq: Frequency): Date {
  const d = new Date(from.getTime());
  switch (freq) {
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      return d;
    case "biweekly":
      d.setUTCDate(d.getUTCDate() + 14);
      return d;
    case "monthly":
      d.setUTCMonth(d.getUTCMonth() + 1);
      return d;
    case "quarterly":
      d.setUTCMonth(d.getUTCMonth() + 3);
      return d;
    case "yearly":
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      return d;
  }
}
