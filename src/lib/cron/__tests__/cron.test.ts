import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultDailyKey,
  defaultHourlyKey,
  getCronJob,
  listCronJobs,
  registerCronJob,
  resetCronRegistryForTests,
} from "../registry";
import { verifyCronSecret } from "../auth";

describe("cron registry", () => {
  beforeEach(() => resetCronRegistryForTests());
  afterEach(() => resetCronRegistryForTests());

  it("registers and looks up jobs", () => {
    registerCronJob({
      name: "test.alpha",
      description: "alpha",
      schedule: "*/5 * * * *",
      handler: async () => ({ status: "succeeded" }),
    });
    expect(getCronJob("test.alpha")?.name).toBe("test.alpha");
    expect(getCronJob("missing")).toBeUndefined();
  });

  it("rejects duplicate registrations", () => {
    registerCronJob({
      name: "dup",
      description: "x",
      schedule: "* * * * *",
      handler: async () => ({ status: "succeeded" }),
    });
    expect(() =>
      registerCronJob({
        name: "dup",
        description: "y",
        schedule: "* * * * *",
        handler: async () => ({ status: "succeeded" }),
      })
    ).toThrow();
  });

  it("lists jobs alphabetically", () => {
    registerCronJob({
      name: "z",
      description: "z",
      schedule: "* * * * *",
      handler: async () => ({ status: "succeeded" }),
    });
    registerCronJob({
      name: "a",
      description: "a",
      schedule: "* * * * *",
      handler: async () => ({ status: "succeeded" }),
    });
    expect(listCronJobs().map((j) => j.name)).toEqual(["a", "z"]);
  });
});

describe("cron idempotency-key helpers", () => {
  it("derives stable daily and hourly keys in UTC", () => {
    const t = new Date("2026-05-14T07:33:21.000Z");
    expect(defaultDailyKey("nightly", t)).toBe("nightly:2026-05-14");
    expect(defaultHourlyKey("ping", t)).toBe("ping:2026-05-14T07");
  });
});

describe("verifyCronSecret", () => {
  const ORIGINAL = process.env.CRON_SHARED_SECRET;
  beforeEach(() => {
    process.env.CRON_SHARED_SECRET = "s3cret-value";
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.CRON_SHARED_SECRET;
    else process.env.CRON_SHARED_SECRET = ORIGINAL;
  });

  it("accepts the configured secret", () => {
    expect(verifyCronSecret("s3cret-value")).toBe(true);
  });

  it("rejects mismatched and missing secrets", () => {
    expect(verifyCronSecret("wrong")).toBe(false);
    expect(verifyCronSecret(null)).toBe(false);
    expect(verifyCronSecret("")).toBe(false);
  });

  it("throws MissingCredentialsError when env var is unset", () => {
    delete process.env.CRON_SHARED_SECRET;
    expect(() => verifyCronSecret("any")).toThrow(/CRON_SHARED_SECRET/);
  });
});

describe("runCronJob", () => {
  beforeEach(() => {
    resetCronRegistryForTests();
    vi.resetModules();
  });
  afterEach(() => {
    resetCronRegistryForTests();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  function mockAdmin(behavior: { duplicate?: boolean; updateFails?: boolean } = {}) {
    const updateCalls: Array<Record<string, unknown>> = [];
    const insertedId = "00000000-0000-4000-8000-000000000001";
    const admin = {
      from() {
        return {
          insert(_row: Record<string, unknown>) {
            void _row;
            return {
              select() {
                return {
                  single: async () =>
                    behavior.duplicate
                      ? { data: null, error: { code: "23505", message: "dup" } }
                      : { data: { id: insertedId }, error: null },
                };
              },
            };
          },
          update(row: Record<string, unknown>) {
            updateCalls.push(row);
            return {
              eq: async () =>
                behavior.updateFails
                  ? { data: null, error: { message: "audit blew up" } }
                  : { data: null, error: null },
            };
          },
        };
      },
    };
    return { admin, updateCalls, insertedId };
  }

  it("records success and returns a run id", async () => {
    const { admin, updateCalls, insertedId } = mockAdmin();
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
    const { registerCronJob } = await import("../registry");
    const { runCronJob } = await import("../runner");
    registerCronJob({
      name: "ok",
      description: "x",
      schedule: "* * * * *",
      handler: async () => ({ status: "succeeded", result: { count: 3 } }),
    });
    const out = await runCronJob({ jobName: "ok", idempotencyKey: "k1" });
    expect(out.status).toBe("succeeded");
    if (out.status !== "succeeded") throw new Error("unreachable");
    expect(out.runId).toBe(insertedId);
    expect(out.result).toEqual({ count: 3 });
    expect(updateCalls.at(-1)).toMatchObject({ status: "succeeded" });
  });

  it("returns skipped_duplicate when the audit row already exists", async () => {
    const { admin } = mockAdmin({ duplicate: true });
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
    const { registerCronJob } = await import("../registry");
    const { runCronJob } = await import("../runner");
    registerCronJob({
      name: "dup",
      description: "x",
      schedule: "* * * * *",
      handler: async () => ({ status: "succeeded" }),
    });
    const out = await runCronJob({ jobName: "dup", idempotencyKey: "k2" });
    expect(out.status).toBe("skipped_duplicate");
  });

  it("records failures and surfaces the error", async () => {
    const { admin, updateCalls } = mockAdmin();
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
    const { registerCronJob } = await import("../registry");
    const { runCronJob } = await import("../runner");
    registerCronJob({
      name: "boom",
      description: "x",
      schedule: "* * * * *",
      handler: async () => {
        throw new Error("nope");
      },
    });
    const out = await runCronJob({ jobName: "boom", idempotencyKey: "k3" });
    expect(out.status).toBe("failed");
    if (out.status !== "failed") throw new Error("unreachable");
    expect(out.error).toBe("nope");
    expect(updateCalls.at(-1)).toMatchObject({ status: "failed", error_message: "nope" });
  });

  it("surfaces audit_update_failed when the success-path update fails", async () => {
    const { admin } = mockAdmin({ updateFails: true });
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
    const { registerCronJob } = await import("../registry");
    const { runCronJob } = await import("../runner");
    registerCronJob({
      name: "ok-but-audit-broken",
      description: "x",
      schedule: "* * * * *",
      handler: async () => ({ status: "succeeded" }),
    });
    const out = await runCronJob({ jobName: "ok-but-audit-broken", idempotencyKey: "k4" });
    expect(out.status).toBe("audit_update_failed");
    if (out.status !== "audit_update_failed") throw new Error("unreachable");
    expect(out.error).toContain("audit blew up");
  });

  it("surfaces audit_update_failed when the failure-path update also fails", async () => {
    const { admin } = mockAdmin({ updateFails: true });
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
    const { registerCronJob } = await import("../registry");
    const { runCronJob } = await import("../runner");
    registerCronJob({
      name: "boom-and-audit-broken",
      description: "x",
      schedule: "* * * * *",
      handler: async () => {
        throw new Error("handler boom");
      },
    });
    const out = await runCronJob({
      jobName: "boom-and-audit-broken",
      idempotencyKey: "k5",
    });
    expect(out.status).toBe("audit_update_failed");
    if (out.status !== "audit_update_failed") throw new Error("unreachable");
    expect(out.error).toContain("handler boom");
    expect(out.error).toContain("audit blew up");
  });

  it("returns unknown_job for unregistered names", async () => {
    const { admin } = mockAdmin();
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
    const { runCronJob } = await import("../runner");
    const out = await runCronJob({ jobName: "nope" });
    expect(out.status).toBe("unknown_job");
  });
});
