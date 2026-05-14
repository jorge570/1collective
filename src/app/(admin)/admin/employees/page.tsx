import Link from "next/link";
import { requirePlatformOperator } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";
import { ChevronRight, UserRound } from "lucide-react";
import { inviteOperatorAction } from "./actions";

type Search = Promise<{ error?: string; invited?: string }>;

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const session = await requirePlatformOperator();
  const { error: errorMsg, invited } = await searchParams;
  const admin = createAdminClient();

  const { data: operators } = await admin
    .from("platform_operators")
    .select("id, email, full_name, operator_role, created_at")
    .is("deleted_at", null)
    .order("created_at");

  // Pull assignment counts for any AMs
  const amIds = (operators ?? [])
    .filter((o) => o.operator_role === "account_manager")
    .map((o) => o.id);

  const assignmentsByAm = new Map<string, number>();
  if (amIds.length > 0) {
    const { data: assn } = await admin
      .from("operator_tenant_assignments")
      .select("operator_id")
      .in("operator_id", amIds)
      .is("removed_at", null);
    for (const row of assn ?? []) {
      assignmentsByAm.set(
        row.operator_id,
        (assignmentsByAm.get(row.operator_id) ?? 0) + 1
      );
    }
  }

  const isSuper = session.operatorRole === "super";

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        One Collective Employees
      </h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        Platform operators on your team. Super operators can see and manage
        every tenant; account managers only see the tenants assigned to them.
      </p>

      {errorMsg && (
        <div className="mt-4 rounded-md border border-[color:var(--color-destructive)] bg-[color:var(--color-destructive-muted,#fee2e2)] p-3 text-sm">
          {errorMsg}
        </div>
      )}
      {invited && (
        <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm">
          Invite sent to <strong>{invited}</strong>.
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border bg-[var(--color-background)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Tenants</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="w-10 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(operators ?? []).map((o) => {
                const isYou = o.id === session.userId;
                const tenantCount =
                  o.operator_role === "account_manager"
                    ? (assignmentsByAm.get(o.id) ?? 0)
                    : null;
                return (
                  <tr
                    key={o.id}
                    className="group border-b last:border-b-0 hover:bg-[var(--color-muted)] cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/admin/employees/${o.id}`}
                        className="flex items-center gap-2"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-muted)]">
                          <UserRound className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                        </span>
                        <span>
                          {o.full_name || "—"}
                          {isYou && (
                            <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
                              (you)
                            </span>
                          )}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                      <Link href={`/admin/employees/${o.id}`} className="block">
                        {o.email}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/employees/${o.id}`} className="block">
                        <Badge
                          variant={
                            o.operator_role === "super"
                              ? "default"
                              : o.operator_role === "account_manager"
                                ? "secondary"
                                : "warning"
                          }
                          className="text-xs"
                        >
                          {o.operator_role.replace(/_/g, " ")}
                        </Badge>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {tenantCount !== null ? (
                        <Link href={`/admin/employees/${o.id}`} className="block">
                          {tenantCount} assigned
                        </Link>
                      ) : o.operator_role === "super" ? (
                        <Link href={`/admin/employees/${o.id}`} className="block">
                          all
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
                      <Link href={`/admin/employees/${o.id}`} className="block">
                        {formatDate(o.created_at)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/employees/${o.id}`}
                        className="flex justify-end text-[var(--color-muted-foreground)] group-hover:text-[var(--color-foreground)]"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {isSuper && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-wide">
                Invite operator
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={inviteOperatorAction} className="space-y-3">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="name@1collective.com"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="full_name">Full name</Label>
                  <Input
                    id="full_name"
                    name="full_name"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <Label htmlFor="operator_role">Role</Label>
                  <select
                    id="operator_role"
                    name="operator_role"
                    defaultValue="account_manager"
                    className="block w-full rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-sm"
                  >
                    <option value="super">Super</option>
                    <option value="account_manager">Account manager</option>
                    <option value="support">Support</option>
                    <option value="readonly">Read-only</option>
                  </select>
                </div>
                <Button type="submit" size="sm" className="w-full">
                  Send invite
                </Button>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  An invite email is sent. After accepting, the operator can
                  sign in at /admin/login.
                </p>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
