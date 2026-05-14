import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plug, User, Palette, Bell, KeyRound, Lock } from "lucide-react";

const SETTINGS_SECTIONS = [
  {
    href: "/app/settings/account",
    icon: Lock,
    title: "Account & password",
    description: "Change your password or sign-in email.",
  },
  {
    href: "/app/integrations",
    icon: Plug,
    title: "Integrations",
    description: "Google, QuickBooks, Twilio, Vapi, Meta — credentials and connection status.",
  },
  {
    href: "/app/branding",
    icon: Palette,
    title: "Brand",
    description: "Logo, colors, purpose, values, vision.",
  },
  {
    href: "/app/team",
    icon: User,
    title: "Team & roles",
    description: "Members, role assignments, project access.",
  },
  {
    href: "#",
    icon: Bell,
    title: "Notifications",
    description: "Coming soon.",
  },
  {
    href: "#",
    icon: KeyRound,
    title: "API keys",
    description: "Coming soon.",
  },
];

export default function SettingsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {SETTINGS_SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.title} href={s.href}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-5 w-5 text-[var(--color-muted-foreground)]" />
                    <div>
                      <CardTitle className="text-base">{s.title}</CardTitle>
                      <CardDescription className="mt-0.5">
                        {s.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
