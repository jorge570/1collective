import { requireTenantUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { changePasswordAction, changeEmailAction } from "./actions";

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const session = await requireTenantUser();
  const sp = await searchParams;

  const successMessage =
    sp.success === "password"
      ? "Password updated."
      : sp.success === "email"
      ? "Confirmation links sent. Click the link in your new inbox to finish the change."
      : null;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        Update your sign-in details. Account deletion is handled by your
        workspace administrator — contact them or open a support request.
      </p>

      {successMessage && (
        <div className="mt-4 rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 px-3 py-2 text-sm">
          {successMessage}
        </div>
      )}
      {sp.error && (
        <div className="mt-4 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-3 py-2 text-sm">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Change password</CardTitle>
            <CardDescription>
              You'll need to enter your current password to confirm.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={changePasswordAction} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="current_password">Current password</Label>
                <Input
                  id="current_password"
                  name="current_password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new_password">New password</Label>
                <Input
                  id="new_password"
                  name="new_password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm_password">Confirm new password</Label>
                <Input
                  id="confirm_password"
                  name="confirm_password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <Button type="submit">Update password</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Change email</CardTitle>
            <CardDescription>
              Confirmation links are sent to both your current and new addresses
              before the change takes effect.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={changeEmailAction} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="current_email">Current email</Label>
                <Input
                  id="current_email"
                  name="current_email"
                  type="email"
                  value={session.email}
                  disabled
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new_email">New email</Label>
                <Input
                  id="new_email"
                  name="new_email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
              <Button type="submit">Send confirmation</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
