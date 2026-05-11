import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAIClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export const AI_MODELS = {
  contract_extraction: "claude-opus-4-7",
  contract_review: "claude-opus-4-7",
  financial_analysis: "claude-sonnet-4-6",
  default: "claude-sonnet-4-6",
} as const;
