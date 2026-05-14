import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isModuleEnabled } from "@/foundational/registry";
import { log } from "@/lib/log";
import {
  declineSignatureBodySchema,
  tokenParamSchema,
} from "@/lib/signatures/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const parsed = declineSignatureBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("cc_signature_requests")
    .select("id, status")
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

  const { data: transitioned, error } = await admin
    .from("cc_signature_requests")
    .update({
      status: "declined",
      declined_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) {
    log.error("signature decline update failed", {
      code: error.code,
      message: error.message,
      signature_id: existing.id,
    });
    return NextResponse.json({ ok: false, error: "Could not record decline" }, { status: 500 });
  }
  if (!transitioned) {
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

  log.info("signature declined", { signature_id: existing.id });
  return NextResponse.json({ ok: true });
}
