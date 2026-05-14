import type { Metadata } from "next";
import { requireTenantUser } from "@/lib/auth/session";
import { ModuleShellPreview } from "@/components/app-shell/module-shell-preview";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  await requireTenantUser();
  return (
    <ModuleShellPreview
      title="Projects"
      description="Pipeline, work-in-progress, change orders, and project execution tracking."
      primaryActionLabel="New project"
      stats={[
        { label: "Active", value: "0" },
        { label: "WIP value", value: "$0" },
        { label: "Change orders (30d)", value: "0" },
        { label: "Closed (30d)", value: "0" },
      ]}
      emptyTitle="No projects yet"
      emptyHint="Active jobs, change orders, and closeouts will live here once Projects is enabled."
    />
  );
}
