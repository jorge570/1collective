import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (session.kind !== "tenant_user") redirect("/login");
  if (session.passwordResetRequired) redirect("/set-password");
  if (session.onboardingComplete) redirect("/app");

  return (
    <div className="min-h-screen bg-[var(--color-muted)]">
      <header className="border-b bg-[var(--color-background)] px-6 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="text-sm font-semibold tracking-tight">One Collective</div>
          <form action="/logout" method="post">
            <Button type="submit" variant="ghost" size="sm">
              <LogOut className="mr-1.5 h-4 w-4" />
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>
    </div>
  );
}
