import { describe, expect, it } from "vitest";
import { advanceNextRun, scheduleTemplateSchema } from "../frequencies";

describe("advanceNextRun", () => {
  const base = new Date("2026-01-15T12:00:00Z");
  it("weekly adds 7 days", () => {
    expect(advanceNextRun(base, "weekly").toISOString()).toBe("2026-01-22T12:00:00.000Z");
  });
  it("biweekly adds 14 days", () => {
    expect(advanceNextRun(base, "biweekly").toISOString()).toBe("2026-01-29T12:00:00.000Z");
  });
  it("monthly adds 1 month", () => {
    expect(advanceNextRun(base, "monthly").toISOString()).toBe("2026-02-15T12:00:00.000Z");
  });
  it("quarterly adds 3 months", () => {
    expect(advanceNextRun(base, "quarterly").toISOString()).toBe("2026-04-15T12:00:00.000Z");
  });
  it("yearly adds 1 year", () => {
    expect(advanceNextRun(base, "yearly").toISOString()).toBe("2027-01-15T12:00:00.000Z");
  });
  it("does not mutate the input", () => {
    const before = base.toISOString();
    advanceNextRun(base, "monthly");
    expect(base.toISOString()).toBe(before);
  });
});

describe("scheduleTemplateSchema", () => {
  it("accepts a minimal valid template", () => {
    const out = scheduleTemplateSchema.parse({
      title: "Monthly retainer",
      tax_rate_percent: 825,
      line_items: [{ description: "Work", quantity: 1, unit_price: 50000 }],
    });
    expect(out.due_date_offset_days).toBe(30);
    expect(out.line_items[0].unit).toBe("ea");
  });
  it("rejects empty line items", () => {
    expect(() =>
      scheduleTemplateSchema.parse({
        title: "x",
        tax_rate_percent: 0,
        line_items: [],
      })
    ).toThrow();
  });
  it("rejects too many line items", () => {
    const li = { description: "x", quantity: 1, unit_price: 1 };
    expect(() =>
      scheduleTemplateSchema.parse({
        title: "x",
        tax_rate_percent: 0,
        line_items: Array(51).fill(li),
      })
    ).toThrow();
  });
});
