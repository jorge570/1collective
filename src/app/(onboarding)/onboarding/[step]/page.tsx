import { notFound } from "next/navigation";
import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ONBOARDING_STEPS, type OnboardingStepKey } from "@/lib/onboarding/steps";
import { CompanyInfoStep } from "./_steps/company-info";
import { BrandContentStep } from "./_steps/brand-content";
import { RevenueStep } from "./_steps/revenue";
import { ContractsStep } from "./_steps/contracts";
import { ConnectorsStep } from "./_steps/connectors";
import { InviteTeamStep } from "./_steps/invite-team";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const STEP_KEYS: OnboardingStepKey[] = ONBOARDING_STEPS.map((s) => s.key);

export default async function OnboardingStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  if (!STEP_KEYS.includes(step as OnboardingStepKey)) notFound();
  const stepKey = step as OnboardingStepKey;

  const session = await requireTenantUser();
  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from("tenants")
    .select("id, name, primary_color_hex, secondary_color_hex, trade_types")
    .eq("id", session.tenantId)
    .single();

  const { data: progress } = await admin
    .from("onboarding_progress")
    .select("step_state, completed_steps")
    .eq("tenant_id", session.tenantId)
    .single();

  const stepConfig = ONBOARDING_STEPS.find((s) => s.key === stepKey)!;

  return (
    <div>
      <div className="mb-6 flex items-center gap-2 text-sm">
        <Button asChild variant="ghost" size="sm">
          <Link href="/onboarding">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to setup
          </Link>
        </Button>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">{stepConfig.title}</h1>
      <p className="mt-1 text-[var(--color-muted-foreground)]">
        {stepConfig.description}
      </p>

      <div className="mt-8">
        {stepKey === "company_info" && <CompanyInfoStep tenant={tenant} />}
        {stepKey === "brand_content" && <BrandContentStep tenantId={session.tenantId} />}
        {stepKey === "revenue" && <RevenueStep tenantId={session.tenantId} />}
        {stepKey === "contracts" && <ContractsStep tenantId={session.tenantId} />}
        {stepKey === "connectors" && <ConnectorsStep tenantId={session.tenantId} />}
        {stepKey === "invite_team" && <InviteTeamStep tenantId={session.tenantId} />}
      </div>
    </div>
  );
}
