import { describe, expect, it } from "vitest";
import {
  createInvoiceSchema,
  recordInvoicePaymentSchema,
  setInvoiceStatusSchema,
  updateInvoiceSchema,
  convertEstimateToInvoiceSchema,
} from "../schemas";
import { formatNumber } from "../numbering";

describe("createInvoiceSchema", () => {
  it("parses minimal payload and converts blanks to null", () => {
    const out = createInvoiceSchema.parse({
      title: "Foundation work",
      tax_rate_percent: "8.25",
    });
    expect(out.title).toBe("Foundation work");
    expect(out.tax_rate_percent).toBe(825);
    expect(out.due_date).toBeNull();
    expect(out.company_id).toBeUndefined();
  });

  it("rejects empty title and bad date", () => {
    expect(() => createInvoiceSchema.parse({ title: "" })).toThrow();
    expect(() =>
      createInvoiceSchema.parse({ title: "x", due_date: "not-a-date" })
    ).toThrow();
  });

  it("accepts a valid due_date and uuid company_id", () => {
    const out = createInvoiceSchema.parse({
      title: "x",
      due_date: "2026-06-30",
      company_id: "00000000-0000-4000-8000-000000000001",
    });
    expect(out.due_date).toBe("2026-06-30");
    expect(out.company_id).toBe("00000000-0000-4000-8000-000000000001");
  });
});

describe("updateInvoiceSchema", () => {
  it("requires invoice_id uuid", () => {
    expect(() =>
      updateInvoiceSchema.parse({ invoice_id: "nope", title: "x" })
    ).toThrow();
  });
});

describe("setInvoiceStatusSchema", () => {
  it("only accepts valid statuses", () => {
    expect(
      setInvoiceStatusSchema.parse({
        invoice_id: "00000000-0000-4000-8000-000000000001",
        status: "paid",
      }).status
    ).toBe("paid");
    expect(() =>
      setInvoiceStatusSchema.parse({
        invoice_id: "00000000-0000-4000-8000-000000000001",
        status: "frobnicated",
      })
    ).toThrow();
  });
});

describe("recordInvoicePaymentSchema", () => {
  it("converts dollars to cents", () => {
    const out = recordInvoicePaymentSchema.parse({
      invoice_id: "00000000-0000-4000-8000-000000000001",
      amount: "150.25",
    });
    expect(out.amount).toBe(15025);
  });

  it("rejects malformed money", () => {
    expect(() =>
      recordInvoicePaymentSchema.parse({
        invoice_id: "00000000-0000-4000-8000-000000000001",
        amount: "abc",
      })
    ).toThrow();
  });
});

describe("convertEstimateToInvoiceSchema", () => {
  it("requires estimate_id uuid; due_date optional", () => {
    const out = convertEstimateToInvoiceSchema.parse({
      estimate_id: "00000000-0000-4000-8000-000000000001",
    });
    expect(out.due_date).toBeNull();
  });
});

describe("invoice numbering format", () => {
  it("zero-pads sequence to 4 digits", () => {
    expect(formatNumber(2026, 1)).toBe("INV-2026-0001");
    expect(formatNumber(2026, 9999)).toBe("INV-2026-9999");
  });
});
