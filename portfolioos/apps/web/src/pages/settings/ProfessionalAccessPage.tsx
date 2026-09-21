import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, UserMinus, SlidersHorizontal, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { professionalAccessApi, type MyProfessional } from '@/api/ca.api';
import { CaActivityFeed } from '@/components/ca/CaActivityFeed';
import { GrantScopePanel } from '@/components/ca/GrantScopePanel';

/**
 * The client's side of a CA relationship: who can see their books, what those
 * people have done, and a way to end it.
 *
 * Deliberately not behind any plan gate. Whoever can reach someone's financial
 * position, the person it belongs to must be able to see it and stop it — a
 * revoke button that required a subscription would not be a revoke button.
 *
 * The activity feed is the other half of the same idea. Write access to
 * somebody's ledger is only defensible if they can read what was done, so this
 * shows the same rows the CA sees, from the other side.
 */
export function ProfessionalAccessPage() {
  const qc = useQueryClient();

  const { data: grants, isLoading } = useQuery({
    queryKey: ['professional-access'],
    queryFn: () => professionalAccessApi.list(),
  });

  const { data: activity } = useQuery({
    queryKey: ['professional-access', 'activity'],
    queryFn: () => professionalAccessApi.activity(),
  });

  const [managing, setManaging] = useState<string | null>(null);

  const reinstate = useMutation({
    mutationFn: (clientId: string) => professionalAccessApi.reinstate(clientId),
    onSuccess: () => {
      toast.success('Access restored');
      qc.invalidateQueries({ queryKey: ['professional-access'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (clientId: string) => professionalAccessApi.revoke(clientId),
    onSuccess: () => {
      toast.success('Access withdrawn');
      qc.invalidateQueries({ queryKey: ['professional-access'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = grants ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Who can see your books"
        description="Accountants and advisors you have granted access to. Withdrawing takes effect immediately."
      />

      {isLoading ? (
        <Card className="overflow-hidden">
          <div className="h-[72px] animate-pulse bg-muted/30" />
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nobody else has access"
          description="When you accept an invitation from a CA or advisor, they'll be listed here — along with everything they do."
        />
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {rows.map((g) => (
              <div key={g.clientId} className="border-b border-border/50 last:border-0">
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-foreground">
                      {g.advisor?.name ?? 'Unknown professional'}
                      {g.status === 'REVOKED' && (
                        <span className="ml-2 rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          withdrawn
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {g.advisor?.email ?? '—'}
                      {g.grantedAt && (
                        <>
                          {' · '}
                          <span className="numeric">
                            since {new Date(g.grantedAt).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        </>
                      )}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/85">
                      {describeScope(g)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {g.status === 'ACTIVE' ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setManaging(managing === g.clientId ? null : g.clientId)}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" /> Manage
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate(g.clientId)}
                          className="hover:border-negative/40 hover:text-negative"
                        >
                          <UserMinus className="h-3.5 w-3.5" /> Withdraw
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={reinstate.isPending}
                        onClick={() => reinstate.mutate(g.clientId)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                      </Button>
                    )}
                  </div>
                </div>
                {managing === g.clientId && (
                  <GrantScopePanel clientId={g.clientId} onClose={() => setManaging(null)} />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <CaActivityFeed entries={activity ?? []} />
    </div>
  );
}

/**
 * One line saying what this grant actually reaches.
 *
 * Said plainly rather than in a tooltip: unrestricted access to somebody's
 * whole financial position is the strong case, and understating it would be
 * the wrong direction to be vague in.
 */
function describeScope(g: MyProfessional): string {
  if (g.status === 'REVOKED') {
    return g.revokedAt
      ? `No access since ${new Date(g.revokedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.`
      : 'No access.';
  }

  const limits: string[] = [];
  if (!g.scopeAllPortfolios) {
    limits.push(`${g.portfolioCount} portfolio${g.portfolioCount === 1 ? '' : 's'}`);
  }
  if (!g.scopeAllCategories) {
    limits.push(`${g.categoryCount} categor${g.categoryCount === 1 ? 'y' : 'ies'}`);
  }
  if (!g.scopeAllAssetClasses) {
    limits.push(`${g.assetClassCount} asset class${g.assetClassCount === 1 ? '' : 'es'}`);
  }

  const window =
    g.accessUntil
      ? ` Ends ${new Date(g.accessUntil).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.`
      : '';

  return limits.length === 0
    ? `Can see your complete financial position and edit your books.${window}`
    : `Limited to ${limits.join(', ')}, and can edit your books.${window}`;
}
