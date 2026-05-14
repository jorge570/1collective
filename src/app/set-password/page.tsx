import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setOwnPasswordAction } from "./actions";

type Search = Promise<{ error?: string }>;

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const session = await getSession();
  if (session.kind === "anonymous") redirect("/login");
  if (!session.passwordResetRequired) {
    // Nothing to do here. Bounce them to their normal landing.
    redirect(session.kind === "platform_operator" ? "/admin" : "/app");
  }
  const { error: errorMsg } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-muted)] px-4">
      <div className="w-full max-w-md rounded-xl border bg-[var(--color-background)] p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">
          Set a new password
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Your administrator set or generated a password for you. Please pick
          your own before continuing.
        </p>

        {errorMsg && (
          <div className="mt-4 rounded-md border border-[color:var(--color-destructive)] bg-[color:var(--color-destructive-muted,#fee2e2)] p-3 text-sm">
            {errorMsg}
          </div>
        )}

        <form action={setOwnPasswordAction} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="new_password">New password</Label>
            <Input
              id="new_password"
              name="new_password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              At least 8 characters. Pick something you don&apos;t use anywhere
              else.
            </p>
          </div>
          <div>
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
          <Button type="submit" className="w-full">
            Set password and continue
          </Button>
        </form>

        <p className="mt-6 text-xs text-[var(--color-muted-foreground)]">
          Signed in as {session.email}.
        </p>
      </div>
    </div>
  );
}
