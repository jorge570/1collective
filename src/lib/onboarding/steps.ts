export type OnboardingStepKey =
  | "company_info"
  | "brand_content"
  | "revenue"
  | "contracts"
  | "connectors"
  | "invite_team";

export interface OnboardingStepConfig {
  key: OnboardingStepKey;
  title: string;
  description: string;
  estMinutes: number;
}

export const ONBOARDING_STEPS: OnboardingStepConfig[] = [
  {
    key: "company_info",
    title: "Company info",
    description: "Name, trades, headquarters, brand colors.",
    estMinutes: 4,
  },
  {
    key: "brand_content",
    title: "Purpose, values, vision",
    description: "What your company stands for. Used across proposals and the dashboard.",
    estMinutes: 6,
  },
  {
    key: "revenue",
    title: "Revenue history",
    description: "Last 5–10 years of revenue. Manual entry, CSV upload, or live QuickBooks pull.",
    estMinutes: 5,
  },
  {
    key: "contracts",
    title: "Historical contracts",
    description:
      "Upload past contracts and proposals. We parse them and pre-populate your CRM.",
    estMinutes: 3,
  },
  {
    key: "connectors",
    title: "Connect Google + QuickBooks",
    description:
      "Optional now. Connect later from Settings → Connectors if you'd rather skip.",
    estMinutes: 2,
  },
  {
    key: "invite_team",
    title: "Invite your team",
    description: "Add teammates and assign roles. You can do this later.",
    estMinutes: 2,
  },
];

export function getStepIndex(key: OnboardingStepKey): number {
  return ONBOARDING_STEPS.findIndex((s) => s.key === key);
}

export function getNextStep(current: OnboardingStepKey): OnboardingStepKey | null {
  const i = getStepIndex(current);
  if (i < 0 || i >= ONBOARDING_STEPS.length - 1) return null;
  return ONBOARDING_STEPS[i + 1].key;
}
