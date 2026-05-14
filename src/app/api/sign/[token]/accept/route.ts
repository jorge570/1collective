import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isModuleEnabled } from "@/foundational/registry";
import { log } from "@/lib/log";
import {
  acceptSignatureBodySchema,
  tokenParamSchema,
} from "@/lib/signatures/schemas";
import { isExpired } from "@/lib/signatures/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!isModuleEnabled("e_signature")) {
    return NextResponse.json({ ok: false, error: "Module disabled" }, { status: 503 });
  }

  const tokenParsed = tokenParamSchema.safeParse(await params);
  if (!tokenParsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = acceptSignatureBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid signature payload" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("cc_signature_requests")
    .select("id, tenant_id, target_type, target_id, status, expires_at")
    .eq("token", tokenParsed.data.token)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (existing.status !== "pending") {
    return NextResponse.json(
      { ok: false, error: `Already ${existing.status}` },
      { status: 409 }
    );
  }
  if (isExpired(existing)) {
    await admin
      .from("cc_signature_requests")
      .update({ status: "expired" })
      .eq("id", existing.id)
      .eq("status", "pending");
    return NextResponse.json({ ok: false, error: "Link expired" }, { status: 410 });
  }

  const ip = clientIp(req);
  const { data: transitioned, error } = await admin
    .from("cc_signature_requests")
    .update({
      status: "signed",
      signed_at: new Date().toISOString(),
      signed_by_name: parsed.data.name,
      signed_ip: ip,
      signature_data_uri: parsed.data.signature_data_uri,
    })
    .eq("id", existing.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) {
    log.error("signature accept update failed", {
      code: error.code,
      message: error.message,
      signature_id: existing.id,
    });
    return NextResponse.json({ ok: false, error: "Could not save signature" }, { status: 500 });
  }
  if (!transitioned) {
    // Lost the race against another accept/decline call. Re-read terminal state
    // and surface a 409 so clients see the actual outcome instead of a fake OK.
    const { data: after } = await admin
      .from("cc_signature_requests")
      .select("status")
      .eq("id", existing.id)
      .maybeSingle();
    return NextResponse.json(
      { ok: false, error: `Already ${after?.status ?? "resolved"}` },
      { status: 409 }
    );
  }

  if (existing.target_type === "estimate") {
    await admin
      .from("cc_estimates")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", existing.target_id)
      .eq("tenant_id", existing.tenant_id)
      .in("status", ["draft", "sent"]);
  }

  log.info("signature accepted", {
    signature_id: existing.id,
    target_type: existing.target_type,
    target_id: existing.target_id,
  });
  return NextResponse.json({ ok: true });
}
