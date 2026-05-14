// [CC-FOUNDATION] Per-tenant, per-year invoice numbering: INV-YYYY-NNNN.
// Atomic via cc_next_invoice_seq() in Postgres.
import type { SupabaseClient } from "@supabase/supabase-js";

const PREFIX = "INV";

export async function nextInvoiceNumber(
  admin: SupabaseClient,
  tenantId: string,
  now: Date = new Date()
): Promise<string> {
  const year = now.getUTCFullYear();
  const { data, error } = await admin.rpc("cc_next_invoice_seq", {
    p_tenant: tenantId,
    p_year: year,
  });
  if (error || typeof data !== "number") {
    throw new Error(`Could not allocate invoice number: ${error?.message ?? "no row"}`);
  }
  return formatNumber(year, data);
}

export function formatNumber(year: number, seq: number): string {
  return `${PREFIX}-${year}-${seq.toString().padStart(4, "0")}`;
}
