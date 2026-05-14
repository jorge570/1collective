import { NextRequest, NextResponse } from "next/server";
import { ensureCronJobsRegistered, runCronJob, verifyCronSecret } from "@/lib/cron";
import { MissingCredentialsError } from "@/lib/integrations/base";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ job: string }> }
) {
  try {
    const ok = verifyCronSecret(request.headers.get("x-cron-secret"));
    if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } catch (err) {
    if (err instanceof MissingCredentialsError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }

  ensureCronJobsRegistered();

  const { job } = await context.params;
  const idempotencyKey = request.headers.get("x-idempotency-key") ?? undefined;
  let payload: Record<string, unknown> = {};
  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      const body = await request.json();
      if (body && typeof body === "object" && !Array.isArray(body)) {
        payload = body as Record<string, unknown>;
      }
    } catch {
      return NextResponse.json({ error: "invalid_json_body" }, { status: 400 });
    }
  }

  const outcome = await runCronJob({ jobName: job, idempotencyKey, payload });

  switch (outcome.status) {
    case "unknown_job":
      return NextResponse.json({ error: "unknown_job", job }, { status: 404 });
    case "skipped_duplicate":
      return NextResponse.json({
        status: "skipped_duplicate",
        idempotency_key: outcome.idempotencyKey,
      });
    case "skipped_by_handler":
      return NextResponse.json({
        status: "skipped",
        run_id: outcome.runId,
        result: outcome.result,
      });
    case "failed":
      return NextResponse.json(
        { status: "failed", run_id: outcome.runId, error: outcome.error },
        { status: 500 }
      );
    case "audit_update_failed":
      return NextResponse.json(
        { status: "audit_update_failed", run_id: outcome.runId, error: outcome.error },
        { status: 500 }
      );
    case "succeeded":
      return NextResponse.json({
        status: "succeeded",
        run_id: outcome.runId,
        duration_ms: outcome.durationMs,
        result: outcome.result,
      });
  }
}
