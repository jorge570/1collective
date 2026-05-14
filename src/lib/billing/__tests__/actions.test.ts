import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  vi.resetModules();
  vi.doMock("server-only", () => ({}));
  vi.doMock("@/lib/auth/session", () => ({
    requireTenantUser: async () => ({
      tenantId: TENANT_ID,
      userId: "u",
      roleKeys: ["super_admin"],
    }),
  }));
  vi.doMock("next/cache", () => ({ revalidatePath: () => undefined }));
  vi.doMock("next/navigation", () => ({
    redirect: (url: string) => {
      throw new Error(`__redirect__:${url}`);
    },
  }));
});
afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/auth/session");
  vi.doUnmock("next/cache");
  vi.doUnmock("next/navigation");
  delete process.env.STRIPE_SECRET_KEY;
});

function adminWith(billing: { stripe_customer_id: string | null } | null) {
  return {
    from() {
      const b: Record<string, unknown> = {
        select() {
          return b;
        },
        eq() {
          return b;
        },
        async maybeSingle() {
          return { data: billing, error: null };
        },
      };
      return b;
    },
  };
}

describe("createPortalSession", () => {
  it("returns error when there is no stripe customer", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminWith(null),
    }));
    const { createPortalSession } = await import("../actions");
    const result = await createPortalSession();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/No Stripe customer/i);
    }
  });

  it("returns friendly error when STRIPE_SECRET_KEY is missing", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminWith({ stripe_customer_id: "cus_x" }),
    }));
    const { createPortalSession } = await import("../actions");
    const result = await createPortalSession();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Stripe is not configured/i);
    }
  });

  it("rejects non-super-admins", async () => {
    vi.doMock("@/lib/auth/session", () => ({
      requireTenantUser: async () => ({
        tenantId: TENANT_ID,
        userId: "u",
        roleKeys: ["owner"],
      }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminWith({ stripe_customer_id: "cus_x" }),
    }));
    const { createPortalSession } = await import("../actions");
    const result = await createPortalSession();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Super Admins/i);
    }
  });
});
