// [CC-FOUNDATION] E-signature zod schemas + helpers.
import { z } from "zod";

export const SIGNATURE_TARGET_TYPES = ["estimate", "change_order"] as const;
export const SIGNATURE_STATUSES = [
  "pending",
  "signed",
  "declined",
  "voided",
  "expired",
] as const;

export type SignatureTargetType = (typeof SIGNATURE_TARGET_TYPES)[number];
export type SignatureStatus = (typeof SIGNATURE_STATUSES)[number];

export const TOKEN_LENGTH_BYTES = 32;
export const TOKEN_LENGTH_HEX = 64;

const trimmedOptional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

export const requestEstimateSignatureSchema = z.object({
  estimate_id: z.string().uuid(),
  signer_email: trimmedOptional(254).pipe(
    z
      .string()
      .email()
      .optional()
      .or(z.undefined())
  ),
  signer_phone: trimmedOptional(32),
  expires_in_days: z.coerce
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .default(30),
});

export const signatureIdSchema = z.object({
  signature_id: z.string().uuid(),
});

export const tokenParamSchema = z.object({
  token: z
    .string()
    .length(TOKEN_LENGTH_HEX)
    .regex(/^[0-9a-f]+$/i, "Invalid token"),
});

export const acceptSignatureBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  signature_data_uri: z
    .string()
    .min(1)
    .max(200_000)
    .refine(
      (s) => s.startsWith("data:image/svg+xml;base64,") || s.startsWith("data:image/png;base64,"),
      "signature_data_uri must be a base64-encoded SVG or PNG data URI"
    ),
});

export const declineSignatureBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
