import { requireTenantUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function TeamPage() {
  const session = await requireTenantUser();
  if (session.isFieldRole) return null;

  const admin = createAdminClient();
  const { data: members } = await admin
    .from("user_role_assignments")
    .select(`
      role_id,
      users (id, email, full_name),
      roles (key, name)
    `)
    .eq("tenant_id", session.tenantId);

  type Row = {
    role_id: string;
    users: { id: string; email: string; full_name: string | null } | { id: string; email: string; full_name: string | null }[] | null;
    roles: { key: string; name: string } | { key: string; name: string }[] | null;
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        Manage roles, permissions, and project assignments.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
          <CardDescription>
            Invite teammates and assign them roles — full management UI coming
            next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(members as Row[] | null)?.map((m, i) => {
              const u = Array.isArray(m.users) ? m.users[0] : m.users;
              const r = Array.isArray(m.roles) ? m.roles[0] : m.roles;
              if (!u) return null;
              return (
                <div
                  key={`${u.id}-${i}`}
                  className="flex items-center justify-between border-b py-2 last:border-b-0"
                >
                  <div>
                    <div className="font-medium text-sm">{u.full_name ?? u.email}</div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">
                      {u.email}
                    </div>
                  </div>
                  {r && <Badge variant="secondary">{r.name}</Badge>}
                </div>
              );
            })}
            {(!members || members.length === 0) && (
              <p className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">
                No team members yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
