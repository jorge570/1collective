import { describe, expect, test } from "vitest";
import { z } from "zod";
import { actionError, actionOk, parseForm } from "../validation";

describe("actionOk / actionError", () => {
  test("actionOk() with no args returns { ok:true, data:undefined }", () => {
    const r = actionOk();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBeUndefined();
  });

  test("actionOk(data) carries the payload", () => {
    const r = actionOk({ id: 42 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ id: 42 });
  });

  test("actionError without fieldErrors", () => {
    const r = actionError("Boom");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("Boom");
      expect(r.fieldErrors).toBeUndefined();
    }
  });

  test("actionError with fieldErrors", () => {
    const r = actionError("Validation failed", { email: ["Required"] });
    if (!r.ok) {
      expect(r.fieldErrors).toEqual({ email: ["Required"] });
    }
  });
});

describe("parseForm", () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.coerce.number().int().min(0),
    tags: z.array(z.string()).optional(),
  });

  function fd(entries: Array<[string, string]>): FormData {
    const f = new FormData();
    for (const [k, v] of entries) f.append(k, v);
    return f;
  }

  test("parses valid form data", () => {
    const r = parseForm(schema, fd([["name", "Acme"], ["age", "5"]]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.name).toBe("Acme");
      expect(r.data.age).toBe(5);
    }
  });

  test("collects repeated keys into an array", () => {
    const r = parseForm(schema, fd([
      ["name", "Acme"],
      ["age", "1"],
      ["tags", "x"],
      ["tags", "y"],
      ["tags", "z"],
    ]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.tags).toEqual(["x", "y", "z"]);
  });

  test("returns fieldErrors on validation failure", () => {
    const r = parseForm(schema, fd([["name", ""], ["age", "-5"]]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("Validation failed");
      expect(r.fieldErrors.name?.length ?? 0).toBeGreaterThan(0);
      expect(r.fieldErrors.age?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test("missing required field surfaces in fieldErrors", () => {
    const r = parseForm(schema, fd([["age", "1"]]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.name).toBeDefined();
  });
});
