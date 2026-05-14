import type { Metadata } from "next";
import { requireTenantUser } from "@/lib/auth/session";
import { ModuleShellPreview } from "@/components/app-shell/module-shell-preview";

export const metadata: Metadata = { title: "Estimating" };

export default async function EstimatingPage() {
  await requireTenantUser();
  return (
    <ModuleShellPreview
      title="Estimating"
      description="Build estimates from your unit-price catalog. Convert won estimates into projects in one click."
      primaryActionLabel="New estimate"
      stats={[
        { label: "Open estimates", value: "0" },
        { label: "Pipeline value", value: "$0" },
        { label: "Win rate (90d)", value: "—" },
        { label: "Avg ticket", value: "—" },
      ]}
      emptyTitle="No estimates yet"
      emptyHint="Build your first estimate from the catalog once Estimating is enabled."
    />
  );
}
