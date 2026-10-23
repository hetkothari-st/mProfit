import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/api/client';

/**
 * Why a family member's page could not load — in the server's words.
 *
 * The page used to say "Couldn't load this member. You may no longer have
 * permission" for every failure, including the common one: the family's plan
 * doesn't include the member view (`requireFamilyFeature` refuses with "This
 * feature requires the FAMILY plan or higher"). A plan refusal now gets the
 * same lock-and-upgrade treatment the Overview tab shows; any other refusal
 * shows the server's own message.
 *
 * Plan locks are recognised from the server's refusal rather than from the
 * caller's own plan: a member on a lower plan is let in when the family's
 * creator pays (requirePlan `familyPayer`), which the client can't see.
 */
const PLAN_REFUSAL = /requires the .+ plan/i;

function isPlanRefusal(message: string): boolean {
  return PLAN_REFUSAL.test(message);
}

export function MemberDetailError({ error }: { error: unknown }) {
  const reason = apiErrorMessage(error, '');

  if (reason && isPlanRefusal(reason)) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-accent/10 text-accent">
            <Lock className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Member view is locked</h3>
          <p className="mt-1.5 text-xs text-muted-foreground">{reason}.</p>
          <Button asChild size="sm" className="mt-4">
            <Link to="/pricing">View plans</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-negative">
        <p>Couldn&apos;t load this member.</p>
        {reason && <p className="mt-1.5 text-xs text-muted-foreground">{reason}</p>}
      </CardContent>
    </Card>
  );
}
