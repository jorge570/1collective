import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signupAction } from "./actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/app");

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your One Collective workspace</CardTitle>
          <CardDescription>
            Start with a 14-day free trial. No credit card required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signupAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="company_name">Company name</Label>
              <Input id="company_name" name="company_name" type="text" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Your name</Label>
              <Input id="full_name" name="full_name" type="text" autoComplete="name" required />
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
                minLength={8}
                required
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
              Create workspace
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-[var(--color-muted-foreground)]">
            Already have an account?{" "}
            <Link href="/login" className="underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
