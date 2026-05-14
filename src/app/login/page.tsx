import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { devLoginAction, loginAction } from "./actions";
import { DEV_LOGIN_EMAIL, isDevLoginEnabled } from "./dev-config";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(sp.next || "/app");

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to One Collective</CardTitle>
          <CardDescription>Use your work email.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="space-y-4">
            <input type="hidden" name="next" value={sp.next || "/app"} />
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
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {sp.error && (
              <p className="text-sm text-[var(--color-destructive)]">
                {decodeURIComponent(sp.error)}
              </p>
            )}
            <Button type="submit" className="w-full">
              Sign in
            </Button>
            <div className="text-right">
              <Link
                href="/forgot-password"
                className="text-xs text-[var(--color-muted-foreground)] underline"
              >
                Forgot password?
              </Link>
            </div>
          </form>

          {isDevLoginEnabled() && (
            <form action={devLoginAction} className="mt-6 space-y-2 border-t pt-4">
              <input type="hidden" name="next" value={sp.next || "/app"} />
              <Button type="submit" variant="outline" className="w-full">
                Sign in as developer
              </Button>
              <p className="text-center text-xs text-[var(--color-muted-foreground)]">
                Dev-only shortcut. Signs in as {DEV_LOGIN_EMAIL}. Disabled in production.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
