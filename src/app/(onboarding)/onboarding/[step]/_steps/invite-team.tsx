import { markStepCompleteAction } from "@/lib/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function InviteTeamStep({ tenantId }: { tenantId: string }) {
  void tenantId;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite your team</CardTitle>
          <CardDescription>
            Add teammates and assign roles. You can also do this later from
            Team → Invite.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Team invitations and role assignment UI will activate after you finish
            initial setup. Continue to your dashboard now.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <form action={markStepCompleteAction}>
          <input type="hidden" name="step_key" value="invite_team" />
          <Button type="submit">Mark complete and finish setup</Button>
        </form>
      </div>
    </div>
  );
}
