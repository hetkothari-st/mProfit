import { useState } from 'react';
import { Plus } from 'lucide-react';
import { guidesForPolicyType, type ClaimKind } from '@portfolioos/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { InsurancePolicyDTO } from '@/api/insurance.api';
import { plural } from '@/lib/insurance';
import { ClaimTracker } from './ClaimTracker';
import { StartClaimDialog } from './StartClaimDialog';

/** A policy's claims: open ones tracked in full, closed ones folded away, and a way to start one. */
export function ClaimsSection({ policy }: { policy: InsurancePolicyDTO }) {
  const [startOpen, setStartOpen] = useState(false);
  const [kind, setKind] = useState<ClaimKind | null>(null);
  const claims = policy.claims ?? [];
  const open = claims.filter((c) => c.progress.next.action !== 'NONE' || c.progress.stage !== 'SETTLED');
  const closed = claims.filter((c) => !open.includes(c));
  const guides = guidesForPolicyType(policy.type);

  const start = (k: ClaimKind | null) => {
    setKind(k);
    setStartOpen(true);
  };

  return (
    <Card id="claims">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="font-display text-xl">Claims</CardTitle>
        <Button size="sm" onClick={() => start(null)}>
          <Plus className="h-3.5 w-3.5" /> Start a claim
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {claims.length === 0 && (
          <div>
            <p className="text-sm text-muted-foreground">
              Nothing claimed on this policy. When you need to, start here — you’ll get the steps, a document checklist,
              and a nudge if the insurer runs past its time limit.
            </p>
            {guides.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {guides.map((g) => (
                  <Button key={g.kind} size="sm" variant="outline" onClick={() => start(g.kind)}>
                    {g.title}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {open.map((c) => (
          <ClaimTracker key={c.id} claim={c} insurer={policy.insurer} />
        ))}

        {closed.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              {plural(closed.length, 'settled claim')}
            </summary>
            <div className="mt-3 space-y-4">
              {closed.map((c) => (
                <ClaimTracker key={c.id} claim={c} insurer={policy.insurer} />
              ))}
            </div>
          </details>
        )}
      </CardContent>
      <StartClaimDialog policy={policy} open={startOpen} onOpenChange={setStartOpen} initialKind={kind} />
    </Card>
  );
}
