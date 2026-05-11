import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { signupViaInviteAction } from "./actions";

export default async function SignupViaInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;

  const admin = createAdminClient();
  const { data: link } = await admin
    .from("invite_links")
    .select("id, billing_mode, trial_duration_days, max_redemptions, redemptions, expires_at, disabled_at, notes")
    .eq("token", token)
    .maybeSingle();

  if (!link) return <InviteError reason="Invite link not found." />;
  if (link.disabled_at) return <InviteError reason="This invite link has been disabled." />;
  if (link.expires_at && new Date(link.expires_at) < new Date())
    return <InviteError reason="This invite link has expired." />;
  if (link.max_redemptions !== null && link.redemptions >= link.max_redemptions)
    return <InviteError reason="This invite link has reached its redemption limit." />;

  const trialDescription = describeBilling(link.billing_mode, link.trial_duration_days);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your One Collective account</CardTitle>
          <CardDescription>
            You&apos;ve been invited to set up a new workspace.
          </CardDescription>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">{trialDescription}</Badge>
            {link.billing_mode !== "paid_immediate" && (
              <Badge variant="outline">No credit card required</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <form action={signupViaInviteAction} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <div className="space-y-1.5">
              <Label htmlFor="company_name">Company name</Label>
              <Input id="company_name" name="company_name" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Your name</Label>
              <Input id="full_name" name="full_name" autoComplete="name" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
              />
              <p className="text-xs text-[var(--color-muted-foreground)]">
                At least 8 characters.
              </p>
            </div>
            {sp.error && (
              <p className="text-sm text-[var(--color-destructive)]">
                {decodeURIComponent(sp.error)}
              </p>
            )}
            <Button type="submit" className="w-full">
              Create account
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function InviteError({ reason }: { reason: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Invite unavailable</CardTitle>
          <CardDescription>{reason}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function describeBilling(mode: string, days: number | null): string {
  switch (mode) {
    case "free_forever":
      return "Free for life";
    case "free_trial":
      return days
        ? `${days}-day free trial`
        : "Free trial";
    case "paid_immediate":
      return "Paid plan";
    default:
      return "—";
  }
}
