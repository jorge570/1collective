import type { Metadata } from "next";
import { requireTenantUser } from "@/lib/auth/session";
import { ModuleShellPreview } from "@/components/app-shell/module-shell-preview";

export const metadata: Metadata = { title: "Manpower" };

export default async function ManpowerPage() {
  await requireTenantUser();
  return (
    <ModuleShellPreview
      title="Manpower"
      description="Crew scheduling, daily assignments, and time tracking across active projects."
      primaryActionLabel="Schedule crew"
      stats={[
        { label: "Crews", value: "0" },
        { label: "On the job today", value: "0" },
        { label: "Open assignments", value: "0" },
        { label: "Hours (this week)", value: "0" },
      ]}
      emptyTitle="No crews assigned"
      emptyHint="Schedule crews against projects once Manpower is enabled."
    />
  );
}
