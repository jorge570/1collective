import type { Metadata } from "next";
import { requireTenantUser } from "@/lib/auth/session";
import { ModuleShellPreview } from "@/components/app-shell/module-shell-preview";

export const metadata: Metadata = { title: "Social" };

export default async function SocialPage() {
  await requireTenantUser();
  return (
    <ModuleShellPreview
      title="Social"
      description="Schedule posts to Facebook, Instagram, and LinkedIn from one queue. Auto-promote completed jobs as case studies."
      primaryActionLabel="Compose post"
      stats={[
        { label: "Scheduled", value: "0" },
        { label: "Published (30d)", value: "0" },
        { label: "Connected accounts", value: "0" },
        { label: "Engagement (30d)", value: "—" },
      ]}
      emptyTitle="Nothing scheduled"
      emptyHint="Connect a social account and queue your first post once Social is enabled."
    />
  );
}
