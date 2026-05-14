// [CC-FOUNDATION] Public (unauthenticated) helpers for the /sign/[token] flow.
// These functions use the service role and filter strictly by token. They never
// trust user-provided tenant IDs.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PublicSignatureView {
  id: string;
  tenant_id: string;
  target_type: "estimate" | "change_order";
  target_id: string;
  target_label: string;
  amount_cents: number;
  description: string | null;
  status: "pending" | "signed" | "declined" | "voided" | "expired";
  expires_at: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
  declined_at: string | null;
  workspace_name: string | null;
}

export async function loadPublicSignatureByToken(
  token: string
): Promise<PublicSignatureView | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("cc_signature_requests")
    .select(
      "id, tenant_id, target_type, target_id, target_label, amount_cents, description, status, expires_at, signed_at, signed_by_name, declined_at"
    )
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  const { data: tenant } = await admin
    .from("tenants")
    .select("name")
    .eq("id", data.tenant_id)
    .maybeSingle();
  return { ...data, workspace_name: tenant?.name ?? null } as PublicSignatureView;
}

export function isExpired(view: Pick<PublicSignatureView, "status" | "expires_at">): boolean {
  if (view.status !== "pending") return false;
  if (!view.expires_at) return false;
  return new Date(view.expires_at).getTime() < Date.now();
}
