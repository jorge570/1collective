import { describe, expect, test } from "vitest";
import { cn, formatCurrency, formatDate, formatDateTime } from "../utils";

describe("cn", () => {
  test("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  test("dedupes tailwind conflicts (later wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  test("ignores falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  test("supports conditional object syntax", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
  });
});

describe("formatCurrency", () => {
  test("formats whole-dollar amounts from cents", () => {
    expect(formatCurrency(123400)).toBe("$1,234");
  });

  test("rounds to whole dollars (no fractional)", () => {
    expect(formatCurrency(150)).toBe("$2");
  });

  test("renders zero as $0, not em-dash", () => {
    expect(formatCurrency(0)).toBe("$0");
  });

  test("renders null/undefined as em-dash", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
  });

  test("handles negative amounts", () => {
    expect(formatCurrency(-50000)).toBe("-$500");
  });
});

describe("formatDate", () => {
  test("formats ISO string", () => {
    expect(formatDate("2026-05-14T12:00:00Z")).toMatch(/May 14, 2026/);
  });

  test("formats Date instance", () => {
    expect(formatDate(new Date("2026-01-02T12:00:00Z"))).toMatch(/Jan 2, 2026/);
  });

  test("renders nullish as em-dash", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
});

describe("formatDateTime", () => {
  test("includes hour and minute", () => {
    const r = formatDateTime("2026-05-14T18:30:00Z");
    expect(r).toMatch(/May 14, 2026/);
    expect(r).toMatch(/:\d{2}/);
  });

  test("renders nullish as em-dash", () => {
    expect(formatDateTime(null)).toBe("—");
  });
});
