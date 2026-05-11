import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ONBOARDING_STEPS, type OnboardingStepKey } from "@/lib/onboarding/steps";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { completeOnboarding } from "@/lib/onboarding/actions";

export default async function OnboardingSummaryPage() {
  const session = await requireTenantUser();
  const admin = createAdminClient();

  const { data: progress } = await admin
    .from("onboarding_progress")
    .select("current_step_key, completed_steps, last_active_at, started_at")
    .eq("tenant_id", session.tenantId)
    .single();

  const completed = new Set<OnboardingStepKey>(
    (progress?.completed_steps || []) as OnboardingStepKey[]
  );
  const totalSteps = ONBOARDING_STEPS.length;
  const completedCount = completed.size;
  const percent = Math.round((completedCount / totalSteps) * 100);
  const allDone = completedCount === totalSteps;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Set up your workspace</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          Each step builds out a piece of your dashboard. You can stop and pick up
          where you left off — your progress is saved automatically.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Setup progress</CardTitle>
              <CardDescription className="mt-1">
                {completedCount} of {totalSteps} steps complete
              </CardDescription>
            </div>
            <div className="text-sm font-medium">{percent}%</div>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={percent} />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {ONBOARDING_STEPS.map((step, idx) => {
          const isDone = completed.has(step.key);
          const isCurrent = !isDone && progress?.current_step_key === step.key;
          return (
            <Card key={step.key} className={isCurrent ? "ring-1 ring-[var(--color-ring)]" : ""}>
              <CardContent className="flex items-start justify-between gap-4 py-4">
                <div className="flex items-start gap-3">
                  {isDone ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-[var(--color-success)]" />
                  ) : (
                    <Circle className="mt-0.5 h-5 w-5 text-[var(--color-muted-foreground)]" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--color-muted-foreground)]">
                        Step {idx + 1}
                      </span>
                      {isCurrent && <Badge variant="secondary">In progress</Badge>}
                      {isDone && <Badge variant="success">Done</Badge>}
                    </div>
                    <div className="mt-1 font-medium">{step.title}</div>
                    <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
                      {step.description}
                    </p>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <Button
                    asChild
                    variant={isDone ? "outline" : isCurrent ? "default" : "outline"}
                    size="sm"
                  >
                    <Link href={`/onboarding/${step.key}`}>
                      {isDone ? "Review" : isCurrent ? "Continue" : "Open"}
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <form action={completeOnboarding}>
          <Button type="submit" size="lg" disabled={!allDone}>
            Finish setup and open dashboard
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
