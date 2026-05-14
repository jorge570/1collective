import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePlatformOperator } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatDateTime } from "@/lib/utils";
import { ChevronLeft, UserRound } from "lucide-react";
import {
  updateTenantProfileAction,
  setTenantStatusAction,
  extendTrialDaysAction,
  setCustomTrialEndAction,
} from "./actions";

const TRADE_OPTIONS = [
  "plumbing",
  "mechanical",
  "fire_protection",
  "concrete",
  "steel",
  "electrical",
  "general_contracting",
  "hvac",
  "landscaping",
  "roofing",
  "masonry",
  "other",
];

const TENANT_STATUS_OPTIONS = [
  "onboarding",
  "active",
  "suspended",
  "trial_expired",
];

type Params = Promise<{ id: string }>;

export default async function TenantDetailPage({ params }: { params: Params }) {
  await requirePlatformOperator();
  const { id } = await params;
  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from("tenants")
    .select(
      `
      id, name, slug, status, trade_types, custom_trade_types,
      google_workspace_domain, bids_email_address, created_at, updated_at,
      tenant_billing (
        billing_mode, billing_status, trial_started_at, trial_ends_at,
        trial_extended_count, stripe_customer_id, stripe_subscription_id,
        last_payment_at
      )
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (!tenant) notFound();

  const billing = Array.isArray(tenant.tenant_billing)
    ? tenant.tenant_billing[0]
    : tenant.tenant_billing;

  // Tenant users + their role assignments
  const { data: tenantUsers } = await admin
    .from("users")
    .select(
      `
      id, email, full_name, phone_e164, last_active_at, created_at,
      user_role_assignments!user_role_assignments_user_id_fkey (
        roles ( key, name, is_field )
      )
    `
    )
    .eq("tenant_id", tenant.id)
    .is("deleted_at", null)
    .order("created_at");

  type RolesShape =
    | { key: string; name: string; is_field: boolean }
    | { key: string; name: string; is_field: boolean }[]
    | null;
  type UserRow = {
    id: string;
    email: string;
    full_name: string | null;
    phone_e164: string | null;
    last_active_at: string | null;
    created_at: string;
    user_role_assignments: { roles: RolesShape }[] | null;
  };

  // Payment history (Stripe webhooks fill billing_events with event_type starting with "stripe.")
  const { data: payments } = await admin
    .from("billing_events")
    .select("id, event_type, payload, occurred_at")
    .eq("tenant_id", tenant.id)
    .order("occurred_at", { ascending: false })
    .limit(20);

  // Group users by primary role
  const usersByRole = groupUsersByRole((tenantUsers ?? []) as UserRow[]);
  const todayIso = new Date().toISOString().slice(0, 10);
  const trialEndIso = billing?.trial_ends_at
    ? new Date(billing.trial_ends_at).toISOString().slice(0, 10)
    : "";

  return (
    <div className="p-8">
      <Link
        href="/admin/tenants"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ChevronLeft className="h-4 w-4" />
        Tenants
      </Link>

      <div className="mt-3 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
          <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
            {tenant.slug}
          </p>
        </div>
        <Badge variant={tenantStatusVariant(tenant.status)} className="text-xs">
          {tenant.status}
        </Badge>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wide">
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateTenantProfileAction} className="space-y-4">
              <input type="hidden" name="tenant_id" value={tenant.id} />
              <div>
                <Label htmlFor="name">Company name</Label>
                <Input id="name" name="name" defaultValue={tenant.name} required />
              </div>
              <div>
                <Label htmlFor="slug">Slug</Label>
                <Input id="slug" name="slug" defaultValue={tenant.slug} required />
                <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                  URL-safe identifier. Lowercase + hyphens.
                </p>
              </div>
              <div>
                <Label htmlFor="google_workspace_domain">
                  Google Workspace domain
                </Label>
                <Input
                  id="google_workspace_domain"
                  name="google_workspace_domain"
                  defaultValue={tenant.google_workspace_domain ?? ""}
                  placeholder="example.com"
                />
              </div>
              <div>
                <Label>Trades</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {TRADE_OPTIONS.map((trade) => {
                    const checked = (tenant.trade_types ?? []).includes(trade);
                    return (
                      <label
                        key={trade}
                        className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
                      >
                        <input
                          type="checkbox"
                          name="trade_types"
                          value={trade}
                          defaultChecked={checked}
                          className="h-3 w-3"
                        />
                        {trade.replace(/_/g, " ")}
                      </label>
                    );
                  })}
                </div>
              </div>
              <Button type="submit" size="sm">
                Save profile
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Billing / trial */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wide">
              Billing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-[var(--color-muted-foreground)]">Plan</dt>
              <dd>{billing?.billing_mode ?? "—"}</dd>
              <dt className="text-[var(--color-muted-foreground)]">Status</dt>
              <dd>{billing?.billing_status ?? "—"}</dd>
              <dt className="text-[var(--color-muted-foreground)]">Trial started</dt>
              <dd>{billing?.trial_started_at ? formatDate(billing.trial_started_at) : "—"}</dd>
              <dt className="text-[var(--color-muted-foreground)]">Trial ends</dt>
              <dd>
                {billing?.trial_ends_at ? formatDate(billing.trial_ends_at) : "—"}
                {billing?.trial_extended_count
                  ? ` (+${billing.trial_extended_count})`
                  : ""}
              </dd>
              <dt className="text-[var(--color-muted-foreground)]">Stripe customer</dt>
              <dd>
                {billing?.stripe_customer_id ? (
                  <code className="text-xs">{billing.stripe_customer_id}</code>
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-[var(--color-muted-foreground)]">Last payment</dt>
              <dd>{billing?.last_payment_at ? formatDate(billing.last_payment_at) : "—"}</dd>
            </dl>

            <div className="space-y-2 border-t pt-4">
              <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                Trial controls
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <form action={extendTrialDaysAction} className="flex items-end gap-2">
                  <input type="hidden" name="tenant_id" value={tenant.id} />
                  <div>
                    <Label htmlFor="extend_days" className="text-xs">
                      Extend by (days)
                    </Label>
                    <Input
                      id="extend_days"
                      name="days"
                      type="number"
                      min="1"
                      defaultValue={30}
                      className="w-24"
                    />
                  </div>
                  <Button size="sm" variant="outline" type="submit">
                    Extend
                  </Button>
                </form>
                <form action={setCustomTrialEndAction} className="flex items-end gap-2">
                  <input type="hidden" name="tenant_id" value={tenant.id} />
                  <div>
                    <Label htmlFor="trial_end" className="text-xs">
                      Set trial end date
                    </Label>
                    <Input
                      id="trial_end"
                      name="trial_end"
                      type="date"
                      defaultValue={trialEndIso}
                      min={todayIso}
                      className="w-44"
                    />
                  </div>
                  <Button size="sm" variant="outline" type="submit">
                    Set date
                  </Button>
                </form>
              </div>
            </div>

            <div className="space-y-2 border-t pt-4">
              <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                Status
              </div>
              <form action={setTenantStatusAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="tenant_id" value={tenant.id} />
                <div>
                  <Label htmlFor="status" className="text-xs">
                    Set status
                  </Label>
                  <select
                    id="status"
                    name="status"
                    defaultValue={tenant.status}
                    className="block w-44 rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-sm"
                  >
                    {TENANT_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <Button size="sm" variant="outline" type="submit">
                  Apply
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        {/* Users */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm font-medium uppercase tracking-wide">
              <span>Users</span>
              <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
                {(tenantUsers ?? []).length} total
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(tenantUsers ?? []).length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                No users in this tenant yet.
              </p>
            ) : (
              <div className="space-y-6">
                {usersByRole.groups.map((group) => (
                  <div key={group.label}>
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                      {group.label}{" "}
                      <span className="ml-1 text-[var(--color-muted-foreground)]">
                        ({group.users.length})
                      </span>
                    </div>
                    <ul className="divide-y rounded-md border">
                      {group.users.map((u) => (
                        <li key={u.id}>
                          <Link
                            href={`/admin/tenants/${tenant.id}/users/${u.id}`}
                            className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--color-muted)]"
                          >
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-muted)]">
                              <UserRound className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="truncate font-medium">
                                {u.full_name || u.email}
                              </div>
                              <div className="truncate text-xs text-[var(--color-muted-foreground)]">
                                {u.email}
                              </div>
                            </div>
                            <div className="text-xs text-[var(--color-muted-foreground)]">
                              {u.last_active_at
                                ? `seen ${formatDate(u.last_active_at)}`
                                : "never signed in"}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment history */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm font-medium uppercase tracking-wide">
              <span>Payment history</span>
              <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
                {(payments ?? []).length} events
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(payments ?? []).length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                No payments yet. Stripe events will appear here once the tenant
                adds a card and a subscription becomes active.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    <th className="py-2 font-medium">Event</th>
                    <th className="py-2 font-medium">Amount</th>
                    <th className="py-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {payments!.map((p) => {
                    const payload = (p.payload ?? {}) as Record<string, unknown>;
                    const amount =
                      typeof payload.amount_cents === "number"
                        ? `$${(payload.amount_cents / 100).toFixed(2)}`
                        : typeof payload.amount === "number"
                          ? `$${(payload.amount / 100).toFixed(2)}`
                          : "—";
                    return (
                      <tr key={p.id} className="border-b last:border-b-0">
                        <td className="py-2 font-mono text-xs">{p.event_type}</td>
                        <td className="py-2 text-xs">{amount}</td>
                        <td className="py-2 text-xs text-[var(--color-muted-foreground)]">
                          {formatDateTime(p.occurred_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex justify-between text-xs text-[var(--color-muted-foreground)]">
        <span>Created {formatDateTime(tenant.created_at)}</span>
        <span>Updated {formatDateTime(tenant.updated_at)}</span>
      </div>
    </div>
  );
}

function tenantStatusVariant(
  s: string
): "default" | "success" | "warning" | "destructive" | "secondary" {
  switch (s) {
    case "active":
      return "success";
    case "onboarding":
      return "secondary";
    case "trial_expired":
      return "warning";
    case "suspended":
      return "destructive";
    default:
      return "default";
  }
}

type GroupedUser = {
  id: string;
  email: string;
  full_name: string | null;
  phone_e164: string | null;
  last_active_at: string | null;
  created_at: string;
  roleKeys: string[];
};

type UserGroup = { label: string; users: GroupedUser[] };

// Map role keys to display label; order in this array determines section order.
const ROLE_LABEL_ORDER: Array<{ keys: string[]; label: string }> = [
  { keys: ["super_admin"], label: "Super Admin" },
  { keys: ["owner"], label: "Owner / Executive" },
  { keys: ["admin"], label: "Admin" },
  { keys: ["bookkeeper"], label: "Bookkeeper" },
  { keys: ["estimator"], label: "Estimator" },
  { keys: ["pm"], label: "Project Manager" },
  { keys: ["office"], label: "Office" },
  { keys: ["field_foreman"], label: "Field Foreman" },
];

type AnyUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  phone_e164: string | null;
  last_active_at: string | null;
  created_at: string;
  user_role_assignments:
    | {
        roles:
          | { key: string; name: string; is_field: boolean }
          | { key: string; name: string; is_field: boolean }[]
          | null;
      }[]
    | null;
};

function groupUsersByRole(rows: AnyUserRow[]): { groups: UserGroup[] } {
  const normalised: GroupedUser[] = rows.map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    phone_e164: u.phone_e164,
    last_active_at: u.last_active_at,
    created_at: u.created_at,
    roleKeys: (u.user_role_assignments ?? [])
      .flatMap((a) =>
        Array.isArray(a.roles) ? a.roles : a.roles ? [a.roles] : []
      )
      .map((r) => r.key)
      .filter((k): k is string => !!k),
  }));

  const groups: UserGroup[] = [];
  const consumed = new Set<string>();

  for (const def of ROLE_LABEL_ORDER) {
    const users = normalised.filter(
      (u) => !consumed.has(u.id) && u.roleKeys.some((k) => def.keys.includes(k))
    );
    users.forEach((u) => consumed.add(u.id));
    if (users.length > 0) groups.push({ label: def.label, users });
  }

  // Anyone without a recognised role
  const others = normalised.filter((u) => !consumed.has(u.id));
  if (others.length > 0) groups.push({ label: "No role assigned", users: others });

  return { groups };
}
