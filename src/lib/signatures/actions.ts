"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isModuleEnabled } from "@/foundational/registry";
import { actionError, actionOk, parseForm, type ActionResult } from "@/lib/validation";
import { log } from "@/lib/log";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { MissingCredentialsError } from "@/lib/integrations/base";
import {
  requestEstimateSignatureSchema,
  signatureIdSchema,
  TOKEN_LENGTH_BYTES,
} from "./schemas";

type Admin = ReturnType<typeof createAdminClient>;

function ensureEnabled() {
  if (!isModuleEnabled("e_signature")) {
    throw new Error("E-signature module is disabled");
  }
}

function publicBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const replit = process.env.REPLIT_DEV_DOMAIN;
  if (replit) return `https://${replit}`;
  return "http://localhost:5000";
}

function newToken(): string {
  return crypto.randomBytes(TOKEN_LENGTH_BYTES).toString("hex");
}

async function loadOwnedEstimate(admin: Admin, tenantId: string, estimateId: string) {
  const { data } = await admin
    .from("cc_estimates")
    .select("id, tenant_id, status, estimate_number, title, total_cents")
    .eq("id", estimateId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) throw new Error("Estimate not found");
  return data;
}

export async function requestEstimateSignature(
  formData: FormData
): Promise<ActionResult<{ signature_id: string; token: string; link: string }>> {
  ensureEnabled();
  const session = await requireTenantUser();

  const parsed = parseForm(requestEstimateSignatureSchema, formData);
  if (!parsed.ok) return parsed;

  const admin = createAdminClient();
  const estimate = await loadOwnedEstimate(admin, session.tenantId, parsed.data.estimate_id);
  if (!["draft", "sent"].includes(estimate.status)) {
    return actionError(`Cannot send a ${estimate.status} estimate for signature.`);
  }

  const token = newToken();
  const id = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + (parsed.data.expires_in_days ?? 30) * 24 * 60 * 60 * 1000
  ).toISOString();

  const { error } = await admin.from("cc_signature_requests").insert({
    id,
    tenant_id: session.tenantId,
    target_type: "estimate",
    target_id: estimate.id,
    target_label: `${estimate.estimate_number} — ${estimate.title}`,
    amount_cents: Number(estimate.total_cents),
    description: null,
    token,
    signer_email: parsed.data.signer_email ?? null,
    signer_phone: parsed.data.signer_phone ?? null,
    status: "pending",
    expires_at: expiresAt,
    created_by: session.userId,
  });
  if (error) {
    if (error.code === "23505") {
      return actionError(
        "There is already a pending signature request for this estimate. Void it first."
      );
    }
    log.error("requestEstimateSignature insert failed", { code: error.code, message: error.message });
    return actionError("Could not create signature request.");
  }

  if (estimate.status === "draft") {
    await admin
      .from("cc_estimates")
      .update({ status: "sent" })
      .eq("id", estimate.id)
      .eq("tenant_id", session.tenantId);
  }

  const link = `${publicBaseUrl()}/sign/${token}`;

  // Best-effort delivery — failures are logged but do not roll back the request.
  if (parsed.data.signer_email) {
    try {
      await sendEmail({
        to: parsed.data.signer_email,
        subject: `Signature requested: ${estimate.estimate_number}`,
        html: `<p>You have a document awaiting your signature.</p><p><strong>${estimate.estimate_number} — ${estimate.title}</strong></p><p><a href="${link}">Review &amp; sign</a></p>`,
        text: `You have a document awaiting your signature.\n\n${estimate.estimate_number} — ${estimate.title}\n\nReview & sign: ${link}`,
      });
    } catch (err) {
      if (!(err instanceof MissingCredentialsError)) {
        log.warn("signature email send failed", { signature_id: id, err: String(err) });
      }
    }
  }
  if (parsed.data.signer_phone) {
    try {
      await sendSms({
        to: parsed.data.signer_phone,
        body: `Signature requested for ${estimate.estimate_number}: ${link}`,
      });
    } catch (err) {
      if (!(err instanceof MissingCredentialsError)) {
        log.warn("signature sms send failed", { signature_id: id, err: String(err) });
      }
    }
  }

  revalidatePath(`/app/estimating/${estimate.id}`);
  return actionOk({ signature_id: id, token, link });
}

export async function voidSignatureRequest(formData: FormData): Promise<ActionResult<void>> {
  ensureEnabled();
  const session = await requireTenantUser();
  const parsed = parseForm(signatureIdSchema, formData);
  if (!parsed.ok) return parsed;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("cc_signature_requests")
    .select("id, target_type, target_id, status")
    .eq("id", parsed.data.signature_id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!existing) return actionError("Signature request not found.");
  if (existing.status !== "pending") {
    return actionError(`Cannot void a ${existing.status} signature request.`);
  }

  const { error } = await admin
    .from("cc_signature_requests")
    .update({ status: "voided", voided_at: new Date().toISOString() })
    .eq("id", existing.id)
    .eq("tenant_id", session.tenantId)
    .eq("status", "pending");
  if (error) {
    log.error("voidSignatureRequest failed", { code: error.code, message: error.message });
    return actionError("Could not void signature request.");
  }

  if (existing.target_type === "estimate") {
    revalidatePath(`/app/estimating/${existing.target_id}`);
  }
  return actionOk();
}

