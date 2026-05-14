// [CC-FOUNDATION] Invoicing zod schemas.
// Mirrors estimating schemas; reuses the same decimal-safe parsers so 1.005
// rounds deterministically across estimating + invoicing.
import { z } from "zod";
import {
  moneyDollarsToCents,
  percentToBps,
  quantityToTenThousandths,
} from "@/lib/estimating/schemas";

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "partial",
  "paid",
  "overdue",
  "void",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const MAX_INVOICE_LINE_ITEMS = 200;

const optionalUuid = z
  .string()
  .uuid()
  .or(z.literal(""))
  .transform((v) => (v === "" ? null : v));

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const moneyField = z
  .union([z.string(), z.number()])
  .transform((v) => moneyDollarsToCents(v));

const quantityField = z
  .union([z.string(), z.number()])
  .transform((v) => quantityToTenThousandths(v));

const taxRateField = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => percentToBps(v ?? null));

export const createInvoiceSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  company_id: optionalUuid.optional(),
  project_id: optionalUuid.optional(),
  source_estimate_id: optionalUuid.optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be a date.")
    .or(z.literal(""))
    .optional()
    .transform((v) => (v ? v : null)),
  notes: optionalText(4000),
  terms: optionalText(4000),
  tax_rate_percent: taxRateField,
});

export const updateInvoiceSchema = createInvoiceSchema.extend({
  invoice_id: z.string().uuid(),
});

export const invoiceIdSchema = z.object({
  invoice_id: z.string().uuid(),
});

export const invoiceLineItemBaseSchema = z.object({
  invoice_id: z.string().uuid(),
  description: z.string().trim().min(1, "Description is required.").max(500),
  quantity: quantityField,
  unit: z.string().trim().min(1).max(16).default("ea"),
  unit_price: moneyField,
});

export const createInvoiceLineItemSchema = invoiceLineItemBaseSchema;

export const updateInvoiceLineItemSchema = invoiceLineItemBaseSchema.extend({
  line_item_id: z.string().uuid(),
});

export const invoiceLineItemIdSchema = z.object({
  line_item_id: z.string().uuid(),
});

export const setInvoiceStatusSchema = z.object({
  invoice_id: z.string().uuid(),
  status: z.enum(INVOICE_STATUSES),
});

export const recordInvoicePaymentSchema = z.object({
  invoice_id: z.string().uuid(),
  amount: moneyField,
});

export const convertEstimateToInvoiceSchema = z.object({
  estimate_id: z.string().uuid(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be a date.")
    .or(z.literal(""))
    .optional()
    .transform((v) => (v ? v : null)),
});
