// [CC-FOUNDATION] Cron job declarations.
// New scheduled jobs register themselves here. Importing this module from a
// route or tests guarantees the registry is populated before lookups run.

import { defaultHourlyKey, registerCronJob } from "./registry";

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
}
