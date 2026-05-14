import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resetPasswordAction } from "./actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect(
      `/forgot-password?error=${encodeURIComponent(
        "Reset link expired or invalid. Request a new one."
      )}`
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>
            Signed in as <strong>{data.user.email}</strong>. Set a new password
            below to finish.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={resetPasswordAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <p className="text-xs text-[var(--color-muted-foreground)]">
                At least 8 characters.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            {sp.error && (
              <p className="text-sm text-[var(--color-destructive)]">
                {decodeURIComponent(sp.error)}
              </p>
            )}
            <Button type="submit" className="w-full">
              Update password
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-[var(--color-muted-foreground)]">
            <Link href="/login" className="underline">
              Cancel and return to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
