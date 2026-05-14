import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const TOKEN = "a".repeat(64);
const SIG_ID = "33333333-3333-4333-8333-333333333333";
const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const ESTIMATE_ID = "11111111-1111-4111-8111-111111111111";

interface SignatureRow {
  id: string;
  tenant_id: string;
  target_type: "estimate" | "change_order";
  target_id: string;
  status: "pending" | "signed" | "declined" | "voided" | "expired";
  expires_at: string | null;
}

interface EstimateRow {
  id: string;
  tenant_id: string;
  status: string;
  accepted_at: string | null;
}

function makeStore() {
  const store: { sig: SignatureRow; estimate: EstimateRow } = {
    sig: {
      id: SIG_ID,
      tenant_id: TENANT_ID,
      target_type: "estimate",
      target_id: ESTIMATE_ID,
      status: "pending",
      expires_at: null,
    },
    estimate: {
      id: ESTIMATE_ID,
      tenant_id: TENANT_ID,
      status: "sent",
      accepted_at: null,
    },
  };
  return store;
}

function makeAdmin(store: ReturnType<typeof makeStore>) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const inFilters: Record<string, unknown[]> = {};
      let pendingUpdate: Record<string, unknown> | null = null;

      const builder: Record<string, unknown> = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return builder;
        },
        in(col: string, vals: unknown[]) {
          inFilters[col] = vals;
          return builder;
        },
        async maybeSingle() {
          if (pendingUpdate && table === "cc_signature_requests") {
            // Atomic conditional update on the in-memory row.
            const matchesId = filters.id === undefined || filters.id === store.sig.id;
            const matchesStatus = filters.status === undefined || filters.status === store.sig.status;
            if (matchesId && matchesStatus) {
              Object.assign(store.sig, pendingUpdate);
              pendingUpdate = null;
              return { data: { id: store.sig.id }, error: null };
            }
            pendingUpdate = null;
            return { data: null, error: null };
          }
          if (table === "cc_signature_requests") {
            if (filters.token === TOKEN || filters.id === store.sig.id) {
              return { data: { ...store.sig }, error: null };
            }
          }
          return { data: null, error: null };
        },
        update(values: Record<string, unknown>) {
          pendingUpdate = values;
          return builder;
        },
        then(resolve: (v: { data: null; error: null }) => unknown) {
          // Estimate update path: not selecting, just awaiting the chain.
          if (pendingUpdate && table === "cc_estimates") {
            const matchesId = filters.id === store.estimate.id;
            const matchesTenant = filters.tenant_id === store.estimate.tenant_id;
            const matchesIn =
              !inFilters.status || inFilters.status.includes(store.estimate.status);
            if (matchesId && matchesTenant && matchesIn) {
              Object.assign(store.estimate, pendingUpdate);
            }
            pendingUpdate = null;
          }
          return resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  };
}

function applyBaseMocks() {
  vi.doMock("server-only", () => ({}));
  vi.doMock("@/foundational/registry", () => ({
    isModuleEnabled: () => true,
    missingCredentialsFor: () => [],
  }));
}

beforeEach(() => {
  vi.resetModules();
  applyBaseMocks();
});

afterEach(() => {
  vi.doUnmock("@/foundational/registry");
  vi.doUnmock("@/lib/supabase/admin");
});

async function callAccept(adminFactory: () => unknown) {
  vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: adminFactory }));
  const mod = await import("@/app/api/sign/[token]/accept/route");
  const req = new Request("http://x/api/sign/" + TOKEN + "/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Jane Doe",
      signature_data_uri: "data:image/svg+xml;base64,PHN2Zy8+",
    }),
  });
  return mod.POST(req as never, { params: Promise.resolve({ token: TOKEN }) });
}

async function callDecline(adminFactory: () => unknown) {
  vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: adminFactory }));
  const mod = await import("@/app/api/sign/[token]/decline/route");
  const req = new Request("http://x/api/sign/" + TOKEN + "/decline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return mod.POST(req as never, { params: Promise.resolve({ token: TOKEN }) });
}

describe("public accept route", () => {
  it("first accept wins, second accept returns 409 with terminal status", async () => {
    const store = makeStore();
    const adminFactory = () => makeAdmin(store);

    const r1 = await callAccept(adminFactory);
    expect(r1.status).toBe(200);
    const j1 = await r1.json();
    expect(j1.ok).toBe(true);
    expect(store.sig.status).toBe("signed");
    expect(store.estimate.status).toBe("accepted");

    vi.resetModules();
    applyBaseMocks();
    const r2 = await callAccept(adminFactory);
    expect(r2.status).toBe(409);
    const j2 = await r2.json();
    expect(j2.ok).toBe(false);
    expect(j2.error).toMatch(/signed/);
  });
});

describe("public decline route", () => {
  it("decline after accept returns 409 and does NOT revert estimate", async () => {
    const store = makeStore();
    const adminFactory = () => makeAdmin(store);

    const accept = await callAccept(adminFactory);
    expect(accept.status).toBe(200);
    expect(store.sig.status).toBe("signed");
    expect(store.estimate.status).toBe("accepted");

    vi.resetModules();
    applyBaseMocks();
    const decline = await callDecline(adminFactory);
    expect(decline.status).toBe(409);
    expect(store.sig.status).toBe("signed");
    expect(store.estimate.status).toBe("accepted");
  });

  it("accept after decline returns 409 and does NOT mark estimate accepted", async () => {
    const store = makeStore();
    const adminFactory = () => makeAdmin(store);

    const decline = await callDecline(adminFactory);
    expect(decline.status).toBe(200);
    expect(store.sig.status).toBe("declined");
    expect(store.estimate.status).toBe("sent");

    vi.resetModules();
    applyBaseMocks();
    const accept = await callAccept(adminFactory);
    expect(accept.status).toBe(409);
    expect(store.sig.status).toBe("declined");
    expect(store.estimate.status).toBe("sent");
  });
});
