import { requirePlatformOperator } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { createInviteLinkAction, disableInviteLinkAction } from "./actions";

export default async function InviteLinksPage() {
  await requirePlatformOperator();
  const admin = createAdminClient();

  const { data: links } = await admin
    .from("invite_links")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invite links</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Generate signup links with pre-configured billing terms.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create new invite link</CardTitle>
          <CardDescription>
            Choose billing mode and trial duration. Trials never require a card up
            front.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createInviteLinkAction} className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="billing_mode">Billing mode</Label>
              <select
                id="billing_mode"
                name="billing_mode"
                className="flex h-9 w-full rounded-md border bg-[var(--color-background)] px-3 text-sm"
                required
                defaultValue="free_trial"
              >
                <option value="free_forever">Free forever</option>
                <option value="free_trial">Free trial</option>
                <option value="paid_immediate">Paid immediately</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trial_duration_days">Trial duration (days)</Label>
              <Input
                id="trial_duration_days"
                name="trial_duration_days"
                type="number"
                placeholder="120"
                defaultValue={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max_redemptions">Max redemptions</Label>
              <Input
                id="max_redemptions"
                name="max_redemptions"
                type="number"
                placeholder="1"
                defaultValue={1}
                min={1}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" name="notes" placeholder="For Joe at ACME" />
            </div>
            <div className="md:col-span-4 flex justify-end">
              <Button type="submit">Generate invite</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="rounded-lg border bg-[var(--color-background)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
              <th className="px-4 py-3 font-medium">Link</th>
              <th className="px-4 py-3 font-medium">Billing</th>
              <th className="px-4 py-3 font-medium">Used</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Notes</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(links ?? []).map((link) => (
              <tr key={link.id} className="border-b last:border-b-0">
                <td className="px-4 py-3 font-mono text-xs">/signup/{link.token}</td>
                <td className="px-4 py-3 text-xs">
                  {link.billing_mode}
                  {link.billing_mode === "free_trial" && link.trial_duration_days
                    ? ` · ${link.trial_duration_days}d`
                    : ""}
                </td>
                <td className="px-4 py-3 text-xs">
                  {link.redemptions} / {link.max_redemptions ?? "∞"}
                </td>
                <td className="px-4 py-3">
                  {link.disabled_at ? (
                    <Badge variant="destructive">disabled</Badge>
                  ) : link.max_redemptions !== null &&
                    link.redemptions >= link.max_redemptions ? (
                    <Badge variant="warning">used up</Badge>
                  ) : (
                    <Badge variant="success">active</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
                  {link.notes ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {!link.disabled_at && (
                    <form action={disableInviteLinkAction}>
                      <input type="hidden" name="link_id" value={link.id} />
                      <Button size="sm" variant="outline" type="submit">
                        Disable
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {(!links || links.length === 0) && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-[var(--color-muted-foreground)]"
                >
                  No invite links yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
