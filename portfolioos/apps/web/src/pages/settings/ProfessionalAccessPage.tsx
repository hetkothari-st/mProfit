import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, UserMinus } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { professionalAccessApi } from '@/api/ca.api';
import { CaActivityFeed } from '@/components/ca/CaActivityFeed';

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
              <div
                key={g.clientId}
                className="flex items-center justify-between gap-4 border-b border-border/50 px-4 py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-foreground">
                    {g.advisor?.name ?? 'Unknown professional'}
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
                  {/* Said plainly rather than in a tooltip. This is full access,
                      not a partial share, and understating it would be the
                      wrong direction to be vague in. */}
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/85">
                    Can see your complete financial position and edit your books.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(g.clientId)}
                  className="shrink-0 hover:border-negative/40 hover:text-negative"
                >
                  <UserMinus className="h-3.5 w-3.5" /> Withdraw
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <CaActivityFeed entries={activity ?? []} />
    </div>
  );
}
