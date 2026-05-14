// [CC-FOUNDATION] Catalog item zod schemas. Keeps catalog form parsing out of
// the main estimating schemas file; reuses the same decimal-safe money parser.
import { z } from "zod";
import { moneyDollarsToCents } from "./schemas";

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v : null));

const moneyField = z
  .union([z.string(), z.number()])
  .transform((v) => moneyDollarsToCents(v));

export const createCatalogItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  description: optionalText(2000),
  unit: z.string().trim().min(1).max(16).default("ea"),
  default_price: moneyField,
  category: optionalText(100),
});

export const updateCatalogItemSchema = createCatalogItemSchema.extend({
  catalog_item_id: z.string().uuid(),
  is_active: z
    .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

export const catalogItemIdSchema = z.object({
  catalog_item_id: z.string().uuid(),
});

export const addLineItemFromCatalogSchema = z.object({
  estimate_id: z.string().uuid(),
  catalog_item_id: z.string().uuid(),
  quantity: z.union([z.string(), z.number()]),
});
