// [CC-FOUNDATION] Cron job context + result types.
// Kept in their own file to avoid circular imports between registry and runner.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface CronJobContext {
  admin: SupabaseClient;
  jobName: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  startedAt: Date;
}

export interface CronJobResult {
  status: "succeeded" | "skipped";
  result?: Record<string, unknown>;
}
