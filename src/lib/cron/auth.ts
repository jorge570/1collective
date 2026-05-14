// [CC-FOUNDATION] Cron request authentication.
// Scheduled jobs hit /api/cron/[job] with the shared secret in the
// X-Cron-Secret header. Comparison is timing-safe so an attacker cannot
// learn the secret one byte at a time.

import { timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/integrations/base";

export function verifyCronSecret(provided: string | null): boolean {
  const env = requireEnv("Cron", ["CRON_SHARED_SECRET"]);
  const expected = env.CRON_SHARED_SECRET;
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
