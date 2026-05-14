// [CC-FOUNDATION] Read-only helper used by the estimate detail page to surface
// "Setup required" hints next to the Send-for-signature form. Lives outside
// actions.ts so the "use server" file can keep all exports as async functions.
import { missingCredentialsFor } from "@/foundational/registry";

export interface DeliveryStatus {
  emailReady: boolean;
  smsReady: boolean;
  emailMissing: string[];
  smsMissing: string[];
}

export function deliveryStatus(): DeliveryStatus {
  const emailMissing: string[] = [];
  if (!process.env.RESEND_API_KEY) emailMissing.push("RESEND_API_KEY");
  if (!process.env.EMAIL_FROM_ADDRESS) emailMissing.push("EMAIL_FROM_ADDRESS");
  const smsMissing = missingCredentialsFor("ai_phone_daniella").filter((k) =>
    k.startsWith("TWILIO_")
  );
  if (!process.env.TWILIO_FROM_NUMBER) smsMissing.push("TWILIO_FROM_NUMBER");
  return {
    emailReady: emailMissing.length === 0,
    smsReady: smsMissing.length === 0,
    emailMissing,
    smsMissing,
  };
}
