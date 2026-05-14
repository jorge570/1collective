import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { forgotPasswordAction } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const sp = await searchParams;
  const sent = sp.sent === "1";

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            {sent
              ? "If an account exists for that email, a reset link is on its way."
              : "Enter your work email and we'll send you a link to choose a new password."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sent && (
            <form action={forgotPasswordAction} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
              {sp.error && (
                <p className="text-sm text-[var(--color-destructive)]">
                  {decodeURIComponent(sp.error)}
                </p>
              )}
              <Button type="submit" className="w-full">
                Send reset link
              </Button>
            </form>
          )}
          <p className="mt-6 text-center text-xs text-[var(--color-muted-foreground)]">
            Remembered it?{" "}
            <Link href="/login" className="underline">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
