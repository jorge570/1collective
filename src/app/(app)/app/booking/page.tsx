import type { Metadata } from "next";
import { requireTenantUser } from "@/lib/auth/session";
import { ModuleShellPreview } from "@/components/app-shell/module-shell-preview";

export const metadata: Metadata = { title: "Booking" };

export default async function BookingPage() {
  await requireTenantUser();
  return (
    <ModuleShellPreview
      title="Booking"
      description="Public booking widget plus inbound submissions inbox. Honors Google Calendar availability when the Google integration is connected."
      primaryActionLabel="Configure widget"
      stats={[
        { label: "Bookings (7d)", value: "0" },
        { label: "Pending review", value: "0" },
        { label: "Conversion", value: "—", helper: "Widget views → bookings" },
        { label: "No-shows (30d)", value: "0" },
      ]}
      emptyTitle="No bookings received"
      emptyHint="Once your booking widget is live on your website, submissions will land here."
    />
  );
}
