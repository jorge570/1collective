// [CC-FOUNDATION] Cron job registry.
// Every scheduled job is declared here with its handler, schedule (informational
// — the actual schedule is configured in the deployment platform), and an
// optional default idempotency-key generator. The dispatcher (runner.ts) looks
// up jobs from this registry by name, so unknown job names always 404 instead
// of executing arbitrary code.

import type { CronJobContext, CronJobResult } from "./types";

export interface CronJob {
  name: string;
  description: string;
  schedule: string;
  handler: (ctx: CronJobContext) => Promise<CronJobResult>;
  defaultIdempotencyKey?: (now: Date) => string;
}

const REGISTRY = new Map<string, CronJob>();

export function registerCronJob(job: CronJob): void {
  if (REGISTRY.has(job.name)) {
    throw new Error(`Cron job "${job.name}" is already registered.`);
  }
  REGISTRY.set(job.name, job);
}

export function getCronJob(name: string): CronJob | undefined {
  return REGISTRY.get(name);
}

export function listCronJobs(): CronJob[] {
  return Array.from(REGISTRY.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function resetCronRegistryForTests(): void {
  REGISTRY.clear();
}

export function defaultDailyKey(jobName: string, now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${jobName}:${y}-${m}-${d}`;
}

export function defaultHourlyKey(jobName: string, now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  return `${jobName}:${y}-${m}-${d}T${h}`;
}
