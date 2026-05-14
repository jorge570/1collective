import type { Metadata } from "next";
import { requireTenantUser } from "@/lib/auth/session";
import { ModuleShellPreview } from "@/components/app-shell/module-shell-preview";

export const metadata: Metadata = { title: "AI Phone" };

export default async function AiPhonePage() {
  await requireTenantUser();
  return (
    <ModuleShellPreview
      title="AI Phone"
      description="Inbound AI receptionist (Daniella) and outbound AI calls (Serana) on a single phone hub."
      primaryActionLabel="Provision number"
      stats={[
        { label: "Calls handled (7d)", value: "0" },
        { label: "Avg handle time", value: "—" },
        { label: "Bookings created", value: "0" },
        { label: "Voicemails", value: "0" },
      ]}
      emptyTitle="Phone hub not provisioned"
      emptyHint="Provision a Twilio number and pick which agent answers it once AI Phone is enabled."
    />
  );
}
