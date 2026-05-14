// [CC-FOUNDATION] Public route: creates a Stripe Checkout Session for the
// invoice tied to the pay-link token, then redirects the customer to the
// hosted Stripe page. All authorization is on the token (64 hex).

import { NextResponse, type NextRequest } from "next/server";
import { startInvoiceCheckout } from "@/lib/invoicing/stripe";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const result = await startInvoiceCheckout(token);
  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  if (!result.url) {
    return NextResponse.json({ ok: false, error: "Stripe did not return a URL." }, { status: 502 });
  }
  return NextResponse.redirect(result.url, 303);
}
