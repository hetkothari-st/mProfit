import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, RotateCcw } from 'lucide-react';
import { Decimal, type SafeToInvestMonthView, type SafeToInvestSummary } from '@everypaisa/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/api/client';
import { safeToInvestApi } from '@/api/safeToInvest.api';
import { cn } from '@/lib/cn';
import { monthLabel, rupees } from './safeToInvestView';

interface Props {
  month: SafeToInvestMonthView | null;
  onClose: () => void;
  onFresh: (s: SafeToInvestSummary) => void;
}

const MONEY_RE = /^\d+(\.\d{1,2})?$/;

/**
 * One month's income up close: every bank credit with whether it counts and
 * why, a switch to change that, and a box to type the month's total instead
 * (for income that never reached the bank alerts, like cash).
 */
export function MonthDialog({ month, onClose, onFresh }: Props) {
  const qc = useQueryClient();
  const open = month !== null;
  const key = ['safe-to-invest', 'credits', month?.month] as const;
  const { data: credits, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => safeToInvestApi.credits(month!.month),
    enabled: open,
  });
  const [total, setTotal] = useState('');
  useEffect(() => {
    setTotal(month?.source === 'OVERRIDE' && month.inflow ? new Decimal(month.inflow).toFixed(0) : '');
  }, [month]);

  const after = (s: SafeToInvestSummary) => {
    onFresh(s);
    void qc.invalidateQueries({ queryKey: key });
  };
  const decide = useMutation({
    mutationFn: (v: { id: string; include: boolean | null }) => safeToInvestApi.decide(v.id, v.include),
    onSuccess: after,
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const setMonth = useMutation({
    mutationFn: (inflow: string | null) => safeToInvestApi.setMonth(month!.month, inflow),
    onSuccess: (s, inflow) => {
      after(s);
      toast.success(inflow === null ? 'Back to bank data' : 'Month total saved');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const counted = (credits ?? []).filter((c) => c.included).reduce((s, c) => s.plus(c.amount), new Decimal(0));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{month ? monthLabel(month.month, true) : ''}</DialogTitle>
          <DialogDescription>
            Credits from your bank alerts. Untick anything that isn&apos;t income, or type the month&apos;s total instead.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !credits || credits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bank credits for this month. Type the total below if you had income.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {credits.map((c) => (
              <li key={c.id} className="flex items-start gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0"
                  aria-label={`Count ${rupees(c.amount)} from ${c.counterparty ?? 'unknown'} as income`}
                  checked={c.included}
                  disabled={decide.isPending}
                  onChange={() => decide.mutate({ id: c.id, include: !c.included })}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className={cn('min-w-0 truncate', !c.included && 'text-muted-foreground line-through decoration-muted-foreground/50')}>
                      {c.counterparty ?? 'Unknown sender'}
                    </span>
                    <span className={cn('numeric shrink-0', !c.included && 'text-muted-foreground')}>{rupees(c.amount)}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {c.date}
                    {c.decision === null && c.autoReason && <> · {c.autoReason}</>}
                    {c.decision !== null && (
                      <>
                        {' '}· changed by you{' '}
                        <button
                          type="button"
                          className="underline hover:text-foreground"
                          onClick={() => decide.mutate({ id: c.id, include: null })}
                        >
                          undo
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
            <li className="flex justify-between px-3 py-2.5 text-sm font-semibold bg-muted/50">
              <span>Counted as income</span>
              <span className="numeric">{rupees(counted)}</span>
            </li>
          </ul>
        )}

        {month && (
          <div className="space-y-1.5">
            <Label htmlFor="sti-total">Or type this month&apos;s total income (₹)</Label>
            <div className="flex gap-2">
              <Input
                id="sti-total"
                inputMode="decimal"
                placeholder={month.inflow ? new Decimal(month.inflow).toFixed(0) : 'e.g. 125000'}
                value={total}
                onChange={(e) => setTotal(e.target.value.replace(/[,\s₹]/g, ''))}
              />
              <Button
                type="button"
                disabled={!MONEY_RE.test(total) || setMonth.isPending}
                onClick={() => setMonth.mutate(total)}
              >
                Save
              </Button>
            </div>
            {month.source === 'OVERRIDE' && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setMonth.mutate(null)}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Use bank data again
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
