"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenantUser } from "@/lib/auth/session";
import {
  getNextStep,
  type OnboardingStepKey,
} from "@/lib/onboarding/steps";

export interface SaveStepInput {
  stepKey: OnboardingStepKey;
  stepData: Record<string, unknown>;
  markComplete: boolean;
}

export async function saveOnboardingStep(input: SaveStepInput) {
  const session = await requireTenantUser();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("onboarding_progress")
    .select("id, completed_steps, step_state, current_step_key")
    .eq("tenant_id", session.tenantId)
    .single();

  if (!existing) {
    throw new Error("Onboarding progress row missing for tenant.");
  }

  const stepState = {
    ...(existing.step_state as Record<string, unknown>),
    [input.stepKey]: input.stepData,
  };
  const completedSteps = new Set<string>(existing.completed_steps as string[]);
  if (input.markComplete) completedSteps.add(input.stepKey);

  const next = getNextStep(input.stepKey);
  const newCurrent = input.markComplete && next ? next : existing.current_step_key;

  await admin
    .from("onboarding_progress")
    .update({
      step_state: stepState,
      completed_steps: Array.from(completedSteps),
      current_step_key: newCurrent,
      last_active_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
}

export async function completeOnboarding() {
  const session = await requireTenantUser();
  const admin = createAdminClient();

  await admin
    .from("onboarding_progress")
    .update({ completed_at: new Date().toISOString() })
    .eq("tenant_id", session.tenantId);

  await admin
    .from("tenants")
    .update({ status: "active" })
    .eq("id", session.tenantId);

  redirect("/app");
}

export async function saveCompanyInfoAction(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const primaryColor = String(formData.get("primary_color_hex") || "").trim();
  const secondaryColor = String(formData.get("secondary_color_hex") || "").trim();
  const tradeTypesRaw = formData.getAll("trade_types").map((v) => String(v));

  const session = await requireTenantUser();
  const admin = createAdminClient();

  await admin
    .from("tenants")
    .update({
      name,
      primary_color_hex: primaryColor || null,
      secondary_color_hex: secondaryColor || null,
      trade_types: tradeTypesRaw,
    })
    .eq("id", session.tenantId);

  await saveOnboardingStep({
    stepKey: "company_info",
    stepData: { saved_at: new Date().toISOString() },
    markComplete: true,
  });

  redirect("/onboarding/brand_content");
}

export async function saveBrandContentAction(formData: FormData) {
  const session = await requireTenantUser();
  const admin = createAdminClient();

  const purpose = String(formData.get("purpose") || "").trim();
  const vision = String(formData.get("vision") || "").trim();
  const mission = String(formData.get("mission") || "").trim();
  const valuesRaw = String(formData.get("core_values") || "");
  const coreValues = valuesRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([^:—-]+)[:—-]\s*(.+)$/);
      if (m) return { title: m[1].trim(), description: m[2].trim() };
      return { title: line, description: "" };
    });

  const { data: existing } = await admin
    .from("brand_content")
    .select("id")
    .eq("tenant_id", session.tenantId)
    .maybeSingle();

  if (existing) {
    await admin
      .from("brand_content")
      .update({ purpose, vision, mission, core_values: coreValues })
      .eq("id", existing.id);
  } else {
    await admin.from("brand_content").insert({
      tenant_id: session.tenantId,
      purpose,
      vision,
      mission,
      core_values: coreValues,
    });
  }

  await saveOnboardingStep({
    stepKey: "brand_content",
    stepData: { saved_at: new Date().toISOString() },
    markComplete: true,
  });

  redirect("/onboarding/revenue");
}

export async function saveRevenueAction(formData: FormData) {
  const session = await requireTenantUser();
  const admin = createAdminClient();

  const entries: { year: number; revenue_cents: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const year = formData.get(`year_${i}`);
    const revenue = formData.get(`revenue_${i}`);
    if (year && revenue) {
      const y = Number(year);
      const r = Math.round(Number(revenue) * 100);
      if (!Number.isNaN(y) && !Number.isNaN(r) && y > 1900 && r >= 0) {
        entries.push({ year: y, revenue_cents: r });
      }
    }
  }

  if (entries.length > 0) {
    await admin
      .from("revenue_history")
      .upsert(
        entries.map((e) => ({
          tenant_id: session.tenantId,
          year: e.year,
          revenue_cents: e.revenue_cents,
          source: "manual",
        })),
        { onConflict: "tenant_id,year" }
      );
  }

  await saveOnboardingStep({
    stepKey: "revenue",
    stepData: { saved_at: new Date().toISOString(), count: entries.length },
    markComplete: true,
  });

  redirect("/onboarding/contracts");
}

export async function markStepCompleteAction(formData: FormData) {
  const stepKey = String(formData.get("step_key") || "") as OnboardingStepKey;
  await saveOnboardingStep({ stepKey, stepData: {}, markComplete: true });
  const next = getNextStep(stepKey);
  if (next) {
    redirect(`/onboarding/${next}`);
  }
  redirect("/onboarding");
}

export async function jumpToStepAction(formData: FormData) {
  const stepKey = String(formData.get("step_key") || "");
  redirect(`/onboarding/${stepKey}`);
}
