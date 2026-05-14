// [CC-FOUNDATION] Cron job runner.
// Executes a registered job inside an audit envelope:
//   1. Insert a `running` row keyed by (job_name, idempotency_key). Unique
//      collision => the job already ran for this slot; we skip cleanly.
//   2. Invoke the handler.
//   3. Patch the row to `succeeded` or `failed` with duration + error.
// Handlers that throw never leave a `running` row hanging.

import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { getCronJob, type CronJob } from "./registry";
import type { CronJobContext } from "./types";

export interface RunJobInput {
  jobName: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
}

export type RunJobOutcome =
  | { status: "succeeded"; runId: string; durationMs: number; result: Record<string, unknown> }
  | { status: "skipped_duplicate"; idempotencyKey: string }
  | { status: "skipped_by_handler"; runId: string; result: Record<string, unknown> }
  | { status: "failed"; runId: string; error: string }
  | { status: "audit_update_failed"; runId: string; error: string }
  | { status: "unknown_job" };

export async function runCronJob(input: RunJobInput): Promise<RunJobOutcome> {
  const job = getCronJob(input.jobName);
  if (!job) {
    log.warn("cron.unknown_job", { job_name: input.jobName });
    return { status: "unknown_job" };
  }
  const startedAt = new Date();
  const idempotencyKey = input.idempotencyKey ?? defaultKey(job, startedAt);
  const admin = createAdminClient();

  const { data: inserted, error: insertErr } = await admin
    .from("cc_cron_runs")
    .insert({
      job_name: job.name,
      idempotency_key: idempotencyKey,
      status: "running",
      started_at: startedAt.toISOString(),
      payload: input.payload ?? {},
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      log.info("cron.duplicate_skip", {
        job_name: job.name,
        idempotency_key: idempotencyKey,
      });
      return { status: "skipped_duplicate", idempotencyKey };
    }
    log.error("cron.audit_insert_failed", {
      job_name: job.name,
      err: insertErr.message,
    });
    throw new Error(`Could not insert cron audit row: ${insertErr.message}`);
  }

  const ctx: CronJobContext = {
    admin,
    jobName: job.name,
    idempotencyKey,
    payload: input.payload ?? {},
    startedAt,
  };

  try {
    const out = await job.handler(ctx);
    const durationMs = Date.now() - startedAt.getTime();
    const upd = await admin
      .from("cc_cron_runs")
      .update({
        status: out.status,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        result: out.result ?? {},
      })
      .eq("id", inserted.id);
    if (upd.error) {
      log.error("cron.audit_update_failed", {
        job_name: job.name,
        run_id: inserted.id,
        err: upd.error.message,
      });
      return {
        status: "audit_update_failed",
        runId: inserted.id,
        error: upd.error.message,
      };
    }
    log.info("cron.completed", {
      job_name: job.name,
      run_id: inserted.id,
      status: out.status,
      duration_ms: durationMs,
    });
    if (out.status === "skipped") {
      return {
        status: "skipped_by_handler",
        runId: inserted.id,
        result: out.result ?? {},
      };
    }
    return {
      status: "succeeded",
      runId: inserted.id,
      durationMs,
      result: out.result ?? {},
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown cron failure";
    const durationMs = Date.now() - startedAt.getTime();
    const upd = await admin
      .from("cc_cron_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        error_message: message.slice(0, 2000),
      })
      .eq("id", inserted.id);
    if (upd.error) {
      log.error("cron.audit_update_failed", {
        job_name: job.name,
        run_id: inserted.id,
        err: upd.error.message,
        original_handler_error: message,
      });
      return {
        status: "audit_update_failed",
        runId: inserted.id,
        error: `${message} (audit update also failed: ${upd.error.message})`,
      };
    }
    log.error("cron.failed", {
      job_name: job.name,
      run_id: inserted.id,
      err: message,
    });
    return { status: "failed", runId: inserted.id, error: message };
  }
}

function defaultKey(job: CronJob, now: Date): string {
  if (job.defaultIdempotencyKey) return job.defaultIdempotencyKey(now);
  return `${job.name}:${now.toISOString()}`;
}
