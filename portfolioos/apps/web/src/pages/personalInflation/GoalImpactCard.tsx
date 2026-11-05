import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Target } from 'lucide-react';
import { Decimal, formatINR, type InflationGoalImpact } from '@everypaisa/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiErrorMessage } from '@/api/client';
import { personalInflationApi, PERSONAL_INFLATION_GOALS_KEY } from '@/api/personalInflation.api';
import { formatRatePct } from './personalInflationView';

const lakh = (v: string | null) => (v == null ? '—' : formatINR(v, { compact: true }));
const rupees = (v: string | null) => (v == null ? '—' : formatINR(v, { fractionDigits: 0 }));
const year = (iso: string) => iso.slice(0, 4);

/** Goals the user can re-plan: there is a suggestion and it differs from what the goal uses. */
const replannable = (g: InflationGoalImpact) => g.suggestedRate != null && !g.rateInUse;

/**
 * Goal impact: what each active goal really needs at the user's inflation
 * versus official CPI, the gap, and the extra SIP that closes it. "Re-plan"
 * writes the suggested rate onto the goals the user ticks, after a preview.
 */
export function GoalImpactCard({ basketVersion }: { basketVersion: string }) {
  const qc = useQueryClient();
  // Re-read whenever the basket changes: the suggested rates move with it.
  const { data, isLoading } = useQuery({
    queryKey: [...PERSONAL_INFLATION_GOALS_KEY, basketVersion],
    queryFn: () => personalInflationApi.goals(),
  });
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const goals = useMemo(() => data?.goals ?? [], [data]);
  // Default selection: every goal that would change.
  const selected = picked ?? new Set(goals.filter(replannable).map((g) => g.goalId));
  const chosen = goals.filter((g) => selected.has(g.goalId) && replannable(g));

  const applyMut = useMutation({
    mutationFn: (ids: string[]) => personalInflationApi.applyGoalRates(ids),
    onSuccess: (view) => {
      qc.setQueryData([...PERSONAL_INFLATION_GOALS_KEY, basketVersion], view);
      void qc.invalidateQueries({ queryKey: ['goals'] });
      setConfirmOpen(false);
      setPicked(null);
      toast.success('Goals re-planned');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent>
      </Card>
    );
  }
  if (!data) return null;

  if (!data.available) {
    return (
      <Card>
        <CardHeader><CardTitle>Goal impact</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          See what your own inflation does to goals like a child&apos;s education or retirement, and the extra SIP that
          covers it. Goals come with a paid plan. <Link to="/pricing" className="underline">See plans</Link>
        </CardContent>
      </Card>
    );
  }

  if (goals.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Goal impact</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No active goals yet. <Link to="/goals" className="underline">Add a goal</Link> to see what it needs at your inflation.
        </CardContent>
      </Card>
    );
  }

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Goal impact</CardTitle>
        <p className="text-sm text-muted-foreground">
          Each goal&apos;s target is in today&apos;s rupees. Here is what it grows to by the target date at your inflation,
          against a plan that assumes official CPI.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {goals.map((g) => {
          const canPick = replannable(g);
          const gap = g.gap ? new Decimal(g.gap) : null;
          return (
            <div key={g.goalId} className="rounded-lg border p-4 flex gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0"
                aria-label={`Re-plan ${g.name}`}
                disabled={!canPick}
                checked={canPick && selected.has(g.goalId)}
                onChange={() => toggle(g.goalId)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">{g.name} ({year(g.targetDate)})</span>
                  <span className="text-xs text-muted-foreground">
                    {g.rateInUse ? 'Already uses this rate' : g.currentRate ? `Uses ${formatRatePct(g.currentRate)} now` : 'No inflation set'}
                  </span>
                </div>
                {g.neededAtSuggested && g.neededAtOfficial ? (
                  <p className="text-sm mt-1">
                    Needs <strong className="numeric">{lakh(g.neededAtSuggested)}</strong> at {g.suggestedLabel} (
                    {formatRatePct(g.suggestedRate)}), not <span className="numeric">{lakh(g.neededAtOfficial)}</span> at
                    official CPI ({formatRatePct(g.officialRate)}).
                  </p>
                ) : (
                  <p className="text-sm mt-1 text-muted-foreground">Official figures haven&apos;t loaded yet.</p>
                )}
                {gap && !gap.isZero() && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {gap.greaterThan(0) ? (
                      <>Gap {lakh(g.gap)}{g.extraMonthlySip && <> · extra SIP about {rupees(g.extraMonthlySip)}/month to cover it, at {formatRatePct(g.assumedReturn, 0)}{g.returnIsDefault && ' (assumed)'}</>}</>
                    ) : (
                      <>Your rate is lower, so the goal needs {lakh(gap.abs().toString())} less than a CPI plan.</>
                    )}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted-foreground">
            The extra SIP is paid at the start of each month and assumes each goal&apos;s expected return, or 12% a year if none is set.
          </p>
          {goals.some(replannable) ? (
            <Button disabled={chosen.length === 0} onClick={() => setConfirmOpen(true)}>
              <Target className="h-4 w-4 mr-1" />
              {chosen.length === 0 ? 'Tick goals to re-plan' : `Re-plan ${chosen.length === 1 ? '1 goal' : `${chosen.length} goals`}`}
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">Your goals already use these rates.</span>
          )}
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Re-plan goals</DialogTitle>
            <DialogDescription>Each goal&apos;s inflation rate changes as below. You can edit any goal later.</DialogDescription>
          </DialogHeader>
          <ul className="text-sm space-y-2">
            {chosen.map((g) => (
              <li key={g.goalId} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{g.name}</span>
                <span className="numeric shrink-0">
                  {g.currentRate ? formatRatePct(g.currentRate) : 'none'} → <strong>{formatRatePct(g.suggestedRate)}</strong>
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={applyMut.isPending}>Cancel</Button>
            <Button onClick={() => applyMut.mutate(chosen.map((g) => g.goalId))} disabled={applyMut.isPending}>
              {applyMut.isPending ? 'Saving…' : 'Re-plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
