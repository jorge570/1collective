import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePlatformOperator } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/utils";
import { ChevronLeft, Trash2 } from "lucide-react";
import {
  updateOperatorProfileAction,
  setOperatorRoleAction,
  assignTenantToOperatorAction,
  unassignTenantFromOperatorAction,
} from "./actions";

type Params = Promise<{ id: string }>;
type Search = Promise<{ error?: string }>;

const ROLE_OPTIONS = ["super", "account_manager", "support", "readonly"];

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const session = await requirePlatformOperator();
  const { id } = await params;
  const { error: errorMsg } = await searchParams;
  const admin = createAdminClient();

  const { data: operator } = await admin
    .from("platform_operators")
    .select(
      "id, email, full_name, operator_role, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (!operator) notFound();

  const isSelf = operator.id === session.userId;
  const isSuper = session.operatorRole === "super";
  const canEditOther = isSuper;

  // For AMs, show their assigned tenants. Super super operators can also manage these.
  const isAccountManager = operator.operator_role === "account_manager";
  const { data: assignments } = isAccountManager
    ? await admin
        .from("operator_tenant_assignments")
        .select(
          "id, created_at, tenant_id, tenants ( id, name, slug, status )"
        )
        .eq("operator_id", operator.id)
        .is("removed_at", null)
        .order("created_at")
    : { data: [] as { id: string; created_at: string; tenant_id: string; tenants: { id: string; name: string; slug: string; status: string } | { id: string; name: string; slug: string; status: string }[] | null }[] };

  // Pull all tenants for the "assign" select.
  const { data: allTenants } = isAccountManager && isSuper
    ? await admin
        .from("tenants")
        .select("id, name, slug")
        .order("name")
    : { data: [] as { id: string; name: string; slug: string }[] };

  const assignedTenantIds = new Set(
    (assignments ?? []).map((a) => a.tenant_id)
  );
  const unassignedTenants = (allTenants ?? []).filter(
    (t) => !assignedTenantIds.has(t.id)
  );

  // Auth user info
  const { data: authData } = await admin.auth.admin.getUserById(operator.id);
  const authUser = authData?.user ?? null;

  return (
    <div className="p-8">
      <Link
        href="/admin/employees"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ChevronLeft className="h-4 w-4" />
        Employees
      </Link>

      <div className="mt-3 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {operator.full_name || operator.email}
            {isSelf && (
              <span className="ml-2 text-sm font-normal text-[var(--color-muted-foreground)]">
                (you)
              </span>
            )}
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
            {operator.email}
          </p>
        </div>
        <Badge
          variant={
            operator.operator_role === "super"
              ? "default"
              : operator.operator_role === "account_manager"
                ? "secondary"
                : "warning"
          }
          className="text-xs"
        >
          {operator.operator_role.replace(/_/g, " ")}
        </Badge>
      </div>

      {errorMsg && (
        <div className="mt-4 rounded-md border border-[color:var(--color-destructive)] bg-[color:var(--color-destructive-muted,#fee2e2)] p-3 text-sm">
          {errorMsg}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wide">
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateOperatorProfileAction} className="space-y-4">
              <input type="hidden" name="operator_id" value={operator.id} />
              <div>
                <Label htmlFor="full_name">Full name</Label>
                <Input
                  id="full_name"
                  name="full_name"
                  defaultValue={operator.full_name ?? ""}
                  disabled={!isSelf && !canEditOther}
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={operator.email}
                  disabled={!isSelf && !canEditOther}
                />
                <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                  Updates the address in both the operator profile and Supabase
                  Auth.
                </p>
              </div>
              {(isSelf || canEditOther) && (
                <Button type="submit" size="sm">
                  Save profile
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Role */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wide">
              Role
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={setOperatorRoleAction} className="space-y-3">
              <input type="hidden" name="operator_id" value={operator.id} />
              <div>
                <Label htmlFor="operator_role">Operator role</Label>
                <select
                  id="operator_role"
                  name="operator_role"
                  defaultValue={operator.operator_role}
                  disabled={!isSuper || isSelf}
                  className="block w-full rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-sm disabled:opacity-60"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                  {isSelf
                    ? "You can't change your own role."
                    : isSuper
                      ? "Super operators can change any operator's role."
                      : "Only super operators can change roles."}
                </p>
              </div>
              {isSuper && !isSelf && (
                <Button type="submit" size="sm">
                  Save role
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Auth info */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wide">
              Auth + Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm lg:grid-cols-3">
              <dt className="text-[var(--color-muted-foreground)]">User ID</dt>
              <dd className="lg:col-span-2 font-mono text-xs">{operator.id}</dd>
              <dt className="text-[var(--color-muted-foreground)]">
                Email confirmed
              </dt>
              <dd className="lg:col-span-2">
                {authUser?.email_confirmed_at
                  ? formatDateTime(authUser.email_confirmed_at)
                  : "Pending"}
              </dd>
              <dt className="text-[var(--color-muted-foreground)]">
                Last sign-in
              </dt>
              <dd className="lg:col-span-2">
                {authUser?.last_sign_in_at
                  ? formatDateTime(authUser.last_sign_in_at)
                  : "Never"}
              </dd>
              <dt className="text-[var(--color-muted-foreground)]">Created</dt>
              <dd className="lg:col-span-2">
                {formatDateTime(operator.created_at)}
              </dd>
            </dl>
          </CardContent>
        </Card>

        {/* Account Manager assignments (only when this operator IS an AM) */}
        {isAccountManager && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm font-medium uppercase tracking-wide">
                <span>Assigned tenants</span>
                <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
                  {(assignments ?? []).length} total
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(assignments ?? []).length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  No tenants assigned. This account manager won&apos;t see any
                  tenants until one is assigned.
                </p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {(assignments ?? []).map((a) => {
                    const t = Array.isArray(a.tenants) ? a.tenants[0] : a.tenants;
                    if (!t) return null;
                    return (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/admin/tenants/${t.id}`}
                            className="font-medium hover:underline"
                          >
                            {t.name}
                          </Link>
                          <div className="text-xs text-[var(--color-muted-foreground)]">
                            {t.slug} · {t.status}
                          </div>
                        </div>
                        {isSuper && (
                          <form action={unassignTenantFromOperatorAction}>
                            <input
                              type="hidden"
                              name="operator_id"
                              value={operator.id}
                            />
                            <input
                              type="hidden"
                              name="tenant_id"
                              value={t.id}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              type="submit"
                              className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                            >
                              <Trash2 className="mr-1 h-3 w-3" />
                              Unassign
                            </Button>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {isSuper && unassignedTenants.length > 0 && (
                <form
                  action={assignTenantToOperatorAction}
                  className="flex flex-wrap items-end gap-2 border-t pt-4"
                >
                  <input
                    type="hidden"
                    name="operator_id"
                    value={operator.id}
                  />
                  <div className="flex-1 min-w-[220px]">
                    <Label htmlFor="tenant_id" className="text-xs">
                      Assign new tenant
                    </Label>
                    <select
                      id="tenant_id"
                      name="tenant_id"
                      defaultValue=""
                      required
                      className="block w-full rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-sm"
                    >
                      <option value="" disabled>
                        Pick a tenant…
                      </option>
                      {unassignedTenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button size="sm" type="submit">
                    Assign
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
