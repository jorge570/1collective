import { describe, expect, it } from "vitest";
import {
  acceptSignatureBodySchema,
  declineSignatureBodySchema,
  requestEstimateSignatureSchema,
  signatureIdSchema,
  tokenParamSchema,
  TOKEN_LENGTH_HEX,
} from "../schemas";

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.append(k, v);
  return f;
}

describe("requestEstimateSignatureSchema", () => {
  const validId = "11111111-1111-4111-8111-111111111111";

  it("requires a uuid estimate_id", () => {
    expect(() =>
      requestEstimateSignatureSchema.parse({ estimate_id: "nope" })
    ).toThrow();
  });

  it("accepts a minimal payload and defaults expires_in_days to 30", () => {
    const out = requestEstimateSignatureSchema.parse({ estimate_id: validId });
    expect(out.expires_in_days).toBe(30);
    expect(out.signer_email).toBeUndefined();
    expect(out.signer_phone).toBeUndefined();
  });

  it("normalises blank optional contact fields to undefined", () => {
    const out = requestEstimateSignatureSchema.parse({
      estimate_id: validId,
      signer_email: "  ",
      signer_phone: "",
    });
    expect(out.signer_email).toBeUndefined();
    expect(out.signer_phone).toBeUndefined();
  });

  it("rejects an invalid email", () => {
    expect(() =>
      requestEstimateSignatureSchema.parse({
        estimate_id: validId,
        signer_email: "not-an-email",
      })
    ).toThrow();
  });

  it("clamps expires_in_days to [1, 365]", () => {
    expect(() =>
      requestEstimateSignatureSchema.parse({
        estimate_id: validId,
        expires_in_days: 0,
      })
    ).toThrow();
    expect(() =>
      requestEstimateSignatureSchema.parse({
        estimate_id: validId,
        expires_in_days: 366,
      })
    ).toThrow();
  });
});

describe("tokenParamSchema", () => {
  it("accepts a 64-char hex token", () => {
    const t = "a".repeat(TOKEN_LENGTH_HEX);
    expect(tokenParamSchema.parse({ token: t }).token).toBe(t);
  });
  it("rejects wrong length", () => {
    expect(() => tokenParamSchema.parse({ token: "abc" })).toThrow();
  });
  it("rejects non-hex characters", () => {
    expect(() =>
      tokenParamSchema.parse({ token: "z".repeat(TOKEN_LENGTH_HEX) })
    ).toThrow();
  });
});

describe("acceptSignatureBodySchema", () => {
  const goodSvg = "data:image/svg+xml;base64,PHN2Zy8+";

  it("accepts a name + svg data uri", () => {
    const out = acceptSignatureBodySchema.parse({
      name: "  Jane Doe  ",
      signature_data_uri: goodSvg,
    });
    expect(out.name).toBe("Jane Doe");
  });

  it("rejects an empty name", () => {
    expect(() =>
      acceptSignatureBodySchema.parse({ name: "   ", signature_data_uri: goodSvg })
    ).toThrow();
  });

  it("rejects unsupported data uris", () => {
    expect(() =>
      acceptSignatureBodySchema.parse({
        name: "Jane",
        signature_data_uri: "data:text/plain;base64,YQ==",
      })
    ).toThrow();
  });

  it("rejects oversized payloads", () => {
    expect(() =>
      acceptSignatureBodySchema.parse({
        name: "Jane",
        signature_data_uri: "data:image/svg+xml;base64," + "a".repeat(200_001),
      })
    ).toThrow();
  });
});

describe("declineSignatureBodySchema", () => {
  it("accepts an empty body", () => {
    expect(declineSignatureBodySchema.parse({})).toEqual({});
  });
  it("trims and caps the optional reason", () => {
    expect(() =>
      declineSignatureBodySchema.parse({ reason: "x".repeat(501) })
    ).toThrow();
  });
});

describe("signatureIdSchema (FormData)", () => {
  it("requires a uuid signature_id", () => {
    const f = fd({ signature_id: "nope" });
    expect(signatureIdSchema.safeParse(Object.fromEntries(f)).success).toBe(false);
    const ok = signatureIdSchema.safeParse({
      signature_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(ok.success).toBe(true);
  });
});
