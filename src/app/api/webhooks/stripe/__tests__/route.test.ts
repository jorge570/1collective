import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const INVOICE_ID = "44444444-4444-4444-8444-444444444444";
const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const PAY_LINK_ID = "55555555-5555-4555-8555-555555555555";

interface Spy {
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
  invoiceUpdates: Array<Record<string, unknown>>;
  payLinkUpdates: Array<Record<string, unknown>>;
  events: Array<{ status: string }>;
  existingEventStatus?: string;
  existingPaymentIntentId?: string | null;
  invoiceTotalCents?: number;
  invoiceAmountPaidCents?: number;
}

function adminFor(spy: Spy) {
  return {
    rpc(fn: string, args: Record<string, unknown>) {
      spy.rpcCalls.push({ fn, args });
      return Promise.resolve({ data: null, error: null });
    },
    from(table: string) {
      const b: Record<string, unknown> = {
        select() {
          return b;
        },
        eq() {
          return b;
        },
        is() {
          return b;
        },
        async maybeSingle() {
          if (table === "integration_events") {
            return spy.existingEventStatus
              ? { data: { id: "e", status: spy.existingEventStatus }, error: null }
              : { data: null, error: null };
          }
          if (table === "cc_invoices") {
            return {
              data: {
                stripe_payment_intent_id: spy.existingPaymentIntentId ?? null,
                total_cents: spy.invoiceTotalCents ?? 100000,
                amount_paid_cents: spy.invoiceAmountPaidCents ?? 0,
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        upsert(values: Record<string, unknown>) {
          spy.events.push({ status: String(values.status) });
          return Promise.resolve({ error: null });
        },
        update(values: Record<string, unknown>) {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq(col: string, val: unknown) {
              filters[col] = val;
              return chain;
            },
            neq(col: string, val: unknown) {
              filters[`${col}__neq`] = val;
              return chain;
            },
            in() {
              return chain;
            },
            then(resolve: (v: { error: null }) => unknown) {
              if (table === "cc_invoices") spy.invoiceUpdates.push(values);
              if (table === "cc_invoice_payment_links") spy.payLinkUpdates.push(values);
              if (table === "integration_events") {
                const last = spy.events[spy.events.length - 1];
                if (filters["status__neq"] && last && last.status === filters["status__neq"]) {
                  // Skip — would clobber a needs_attention row.
                } else if (filters["status"] && last && last.status !== filters["status"]) {
                  // Conditional update did not match.
                } else if (values.status !== undefined) {
                  spy.events.push({ status: String(values.status) });
                }
              }
              return resolve({ error: null });
            },
          };
          return chain;
        },
      };
      return b;
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.doMock("server-only", () => ({}));
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/supabase/admin");
  vi.doUnmock("@/lib/stripe/client");
});

function makeRequest(rawEvent: unknown) {
  return new Request("http://x/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=fake" },
    body: JSON.stringify(rawEvent),
  });
}

describe("stripe webhook — invoice payment flow", () => {
  it("checkout.session.completed records payment via RPC and stamps invoice", async () => {
    const spy: Spy = { rpcCalls: [], invoiceUpdates: [], payLinkUpdates: [], events: [] };
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminFor(spy) }));
    vi.doMock("@/lib/stripe/client", () => ({
      getStripe: () => ({
        webhooks: {
          constructEvent: () => ({
            id: "evt_1",
            type: "checkout.session.completed",
            data: {
              object: {
                payment_status: "paid",
                amount_total: 12345,
                payment_intent: "pi_abc",
                metadata: {
                  cc_invoice_id: INVOICE_ID,
                  cc_tenant_id: TENANT_ID,
                  cc_pay_link_id: PAY_LINK_ID,
                },
              },
            },
          }),
        },
      }),
      getStripeWebhookSecret: () => "whsec_x",
    }));

    const { POST } = await import("../route");
    const res = await POST(makeRequest({}) as never);
    expect(res.status).toBe(200);
    expect(spy.rpcCalls).toHaveLength(1);
    expect(spy.rpcCalls[0]).toEqual({
      fn: "cc_record_invoice_payment",
      args: { p_invoice_id: INVOICE_ID, p_tenant_id: TENANT_ID, p_delta_cents: 12345 },
    });
    expect(spy.invoiceUpdates.some((u) => u.stripe_payment_intent_id === "pi_abc")).toBe(true);
    expect(spy.payLinkUpdates.some((u) => typeof u.used_at === "string")).toBe(true);
    expect(spy.events.some((e) => e.status === "processed")).toBe(true);
  });

  it("is idempotent on a re-fired event id", async () => {
    const spy: Spy = {
      rpcCalls: [],
      invoiceUpdates: [],
      payLinkUpdates: [],
      events: [],
      existingEventStatus: "processed",
    };
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminFor(spy) }));
    vi.doMock("@/lib/stripe/client", () => ({
      getStripe: () => ({
        webhooks: {
          constructEvent: () => ({
            id: "evt_dup",
            type: "checkout.session.completed",
            data: {
              object: {
                payment_status: "paid",
                amount_total: 100,
                metadata: { cc_invoice_id: INVOICE_ID, cc_tenant_id: TENANT_ID },
              },
            },
          }),
        },
      }),
      getStripeWebhookSecret: () => "whsec_x",
    }));

    const { POST } = await import("../route");
    const res = await POST(makeRequest({}) as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.idempotent).toBe(true);
    expect(spy.rpcCalls).toHaveLength(0);
  });

  it("payment_intent.succeeded skips when intent already recorded on invoice", async () => {
    const spy: Spy = {
      rpcCalls: [],
      invoiceUpdates: [],
      payLinkUpdates: [],
      events: [],
      existingPaymentIntentId: "pi_seen",
    };
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminFor(spy) }));
    vi.doMock("@/lib/stripe/client", () => ({
      getStripe: () => ({
        webhooks: {
          constructEvent: () => ({
            id: "evt_pi",
            type: "payment_intent.succeeded",
            data: {
              object: {
                id: "pi_seen",
                status: "succeeded",
                amount_received: 999,
                metadata: { cc_invoice_id: INVOICE_ID, cc_tenant_id: TENANT_ID },
              },
            },
          }),
        },
      }),
      getStripeWebhookSecret: () => "whsec_x",
    }));

    const { POST } = await import("../route");
    const res = await POST(makeRequest({}) as never);
    expect(res.status).toBe(200);
    expect(spy.rpcCalls).toHaveLength(0);
  });

  it("caps the applied amount to remaining balance and flags overpayment", async () => {
    const spy: Spy = {
      rpcCalls: [],
      invoiceUpdates: [],
      payLinkUpdates: [],
      events: [],
      invoiceTotalCents: 10000,
      invoiceAmountPaidCents: 8000,
    };
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminFor(spy) }));
    vi.doMock("@/lib/stripe/client", () => ({
      getStripe: () => ({
        webhooks: {
          constructEvent: () => ({
            id: "evt_over",
            type: "checkout.session.completed",
            data: {
              object: {
                payment_status: "paid",
                amount_total: 5000,
                payment_intent: "pi_over",
                metadata: {
                  cc_invoice_id: INVOICE_ID,
                  cc_tenant_id: TENANT_ID,
                  cc_pay_link_id: PAY_LINK_ID,
                },
              },
            },
          }),
        },
      }),
      getStripeWebhookSecret: () => "whsec_x",
    }));

    const { POST } = await import("../route");
    const res = await POST(makeRequest({}) as never);
    expect(res.status).toBe(200);
    expect(spy.rpcCalls).toHaveLength(1);
    expect(spy.rpcCalls[0].args).toEqual({
      p_invoice_id: INVOICE_ID,
      p_tenant_id: TENANT_ID,
      p_delta_cents: 2000,
    });
    expect(spy.events.some((e) => e.status === "needs_attention")).toBe(true);
    const finalStatus = spy.events[spy.events.length - 1]?.status;
    expect(finalStatus).toBe("needs_attention");
  });

  it("rejects requests without stripe-signature", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminFor({ rpcCalls: [], invoiceUpdates: [], payLinkUpdates: [], events: [] }) }));
    vi.doMock("@/lib/stripe/client", () => ({
      getStripe: () => ({ webhooks: { constructEvent: () => ({}) } }),
      getStripeWebhookSecret: () => "x",
    }));
    const { POST } = await import("../route");
    const req = new Request("http://x/api/webhooks/stripe", { method: "POST", body: "{}" });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});
