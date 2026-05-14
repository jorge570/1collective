import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000aaa";
const ESTIMATE_ID = "11111111-1111-4111-8111-111111111111";
const SIG_ID = "22222222-2222-4222-8222-222222222222";

type AnyRow = Record<string, unknown> | null;

interface Fixture {
  estimate?: AnyRow;
  signature?: AnyRow;
  insertError?: { code?: string; message: string } | null;
  updateError?: { code?: string; message: string } | null;
  inserts: Array<Record<string, unknown>>;
  updates: Array<{ table: string; values: Record<string, unknown> }>;
}

function makeAdmin(fix: Fixture) {
  return {
    from(table: string) {
      const eqs: Record<string, unknown> = {};
      const builder: Record<string, unknown> = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          eqs[col] = val;
          return builder;
        },
        in() {
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        is() {
          return builder;
        },
        async maybeSingle() {
          if (table === "cc_estimates") return { data: fix.estimate ?? null, error: null };
          if (table === "cc_signature_requests") return { data: fix.signature ?? null, error: null };
          return { data: null, error: null };
        },
        insert(values: Record<string, unknown>) {
          fix.inserts.push({ table, ...values });
          return Promise.resolve({ error: fix.insertError ?? null });
        },
        update(values: Record<string, unknown>) {
          fix.updates.push({ table, values });
          return {
            eq() {
              return this;
            },
            in() {
              return this;
            },
            then(resolve: (v: { error: typeof fix.updateError }) => unknown) {
              return resolve({ error: fix.updateError ?? null });
            },
          };
        },
      };
      return builder;
    },
  };
}

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.append(k, v);
  return f;
}

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/lib/auth/session", () => ({
    requireTenantUser: async () => ({
      kind: "tenant_user",
      userId: USER_ID,
      email: "u@example.com",
      tenantId: TENANT_ID,
      tenantSlug: "t",
      tenantStatus: "active",
      roleKeys: ["admin"],
      isFieldRole: false,
      onboardingComplete: true,
    }),
  }));
});

afterEach(() => {
  vi.doUnmock("@/lib/auth/session");
  vi.doUnmock("@/lib/supabase/admin");
  vi.doUnmock("@/foundational/registry");
  vi.doUnmock("@/lib/email");
  vi.doUnmock("@/lib/sms");
  vi.doUnmock("next/cache");
});

describe("requestEstimateSignature", () => {
  it("refuses when the module is disabled", async () => {
    vi.doMock("@/foundational/registry", () => ({
      isModuleEnabled: () => false,
      missingCredentialsFor: () => [],
    }));
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
    vi.doMock("@/lib/email", () => ({ sendEmail: vi.fn() }));
    vi.doMock("@/lib/sms", () => ({ sendSms: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    const { requestEstimateSignature } = await import("../actions");
    await expect(
      requestEstimateSignature(fd({ estimate_id: ESTIMATE_ID }))
    ).rejects.toThrow(/disabled/i);
  });

  it("rejects an estimate that is already accepted", async () => {
    const fix: Fixture = {
      estimate: {
        id: ESTIMATE_ID,
        tenant_id: TENANT_ID,
        status: "accepted",
        estimate_number: "EST-2026-0001",
        title: "Test",
        total_cents: 100000,
      },
      inserts: [],
      updates: [],
    };
    vi.doMock("@/foundational/registry", () => ({
      isModuleEnabled: () => true,
      missingCredentialsFor: () => [],
    }));
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeAdmin(fix) }));
    vi.doMock("@/lib/email", () => ({ sendEmail: vi.fn() }));
    vi.doMock("@/lib/sms", () => ({ sendSms: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    const { requestEstimateSignature } = await import("../actions");
    const r = await requestEstimateSignature(fd({ estimate_id: ESTIMATE_ID }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/accepted/);
    expect(fix.inserts).toHaveLength(0);
  });

  it("inserts a signature request and bumps draft → sent", async () => {
    const fix: Fixture = {
      estimate: {
        id: ESTIMATE_ID,
        tenant_id: TENANT_ID,
        status: "draft",
        estimate_number: "EST-2026-0001",
        title: "Roof repair",
        total_cents: 250000,
      },
      inserts: [],
      updates: [],
    };
    vi.doMock("@/foundational/registry", () => ({
      isModuleEnabled: () => true,
      missingCredentialsFor: () => [],
    }));
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeAdmin(fix) }));
    vi.doMock("@/lib/email", () => ({ sendEmail: vi.fn() }));
    vi.doMock("@/lib/sms", () => ({ sendSms: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    const { requestEstimateSignature } = await import("../actions");
    const r = await requestEstimateSignature(
      fd({ estimate_id: ESTIMATE_ID, signer_email: "c@x.com" })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.token).toMatch(/^[0-9a-f]{64}$/);
      expect(r.data.link).toContain(`/sign/${r.data.token}`);
    }
    const sigInsert = fix.inserts.find((i) => i.table === "cc_signature_requests")!;
    expect(sigInsert.tenant_id).toBe(TENANT_ID);
    expect(sigInsert.target_type).toBe("estimate");
    expect(sigInsert.target_id).toBe(ESTIMATE_ID);
    expect(sigInsert.amount_cents).toBe(250000);
    expect(sigInsert.target_label).toBe("EST-2026-0001 — Roof repair");
    const bump = fix.updates.find(
      (u) => u.table === "cc_estimates" && u.values.status === "sent"
    );
    expect(bump).toBeTruthy();
  });

  it("surfaces the duplicate-pending unique violation as a friendly error", async () => {
    const fix: Fixture = {
      estimate: {
        id: ESTIMATE_ID,
        tenant_id: TENANT_ID,
        status: "sent",
        estimate_number: "EST-2026-0001",
        title: "Test",
        total_cents: 100000,
      },
      insertError: { code: "23505", message: "dup" },
      inserts: [],
      updates: [],
    };
    vi.doMock("@/foundational/registry", () => ({
      isModuleEnabled: () => true,
      missingCredentialsFor: () => [],
    }));
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeAdmin(fix) }));
    vi.doMock("@/lib/email", () => ({ sendEmail: vi.fn() }));
    vi.doMock("@/lib/sms", () => ({ sendSms: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    const { requestEstimateSignature } = await import("../actions");
    const r = await requestEstimateSignature(fd({ estimate_id: ESTIMATE_ID }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already a pending/i);
  });
});

describe("voidSignatureRequest", () => {
  it("only voids pending requests", async () => {
    const fix: Fixture = {
      signature: { id: SIG_ID, target_type: "estimate", target_id: ESTIMATE_ID, status: "signed" },
      inserts: [],
      updates: [],
    };
    vi.doMock("@/foundational/registry", () => ({
      isModuleEnabled: () => true,
      missingCredentialsFor: () => [],
    }));
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeAdmin(fix) }));
    vi.doMock("@/lib/email", () => ({ sendEmail: vi.fn() }));
    vi.doMock("@/lib/sms", () => ({ sendSms: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    const { voidSignatureRequest } = await import("../actions");
    const r = await voidSignatureRequest(fd({ signature_id: SIG_ID }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Cannot void/);
    expect(fix.updates).toHaveLength(0);
  });

  it("voids a pending request", async () => {
    const fix: Fixture = {
      signature: { id: SIG_ID, target_type: "estimate", target_id: ESTIMATE_ID, status: "pending" },
      inserts: [],
      updates: [],
    };
    vi.doMock("@/foundational/registry", () => ({
      isModuleEnabled: () => true,
      missingCredentialsFor: () => [],
    }));
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeAdmin(fix) }));
    vi.doMock("@/lib/email", () => ({ sendEmail: vi.fn() }));
    vi.doMock("@/lib/sms", () => ({ sendSms: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    const { voidSignatureRequest } = await import("../actions");
    const r = await voidSignatureRequest(fd({ signature_id: SIG_ID }));
    expect(r.ok).toBe(true);
    const upd = fix.updates.find((u) => u.table === "cc_signature_requests");
    expect(upd?.values.status).toBe("voided");
  });
});
