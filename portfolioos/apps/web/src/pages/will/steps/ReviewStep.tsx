import { AlertTriangle, CheckCircle2, Scale, XCircle } from 'lucide-react';
import { formatINR, willEstateTotals, WILL_DISCLAIMER, WILL_RULES } from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { WillStepProps } from './types';

/** Rules fixed on a particular tab of their step. */
const RULE_TAB: Record<string, string> = {
  EXECUTOR_APPOINTED: 'executor',
  EXECUTOR_GUARDIAN_INDIVIDUAL: 'executor',
  GUARDIAN_IF_MINOR_CHILDREN: 'guardian',
};

export function ReviewStep({ payload, findings, goTo }: WillStepProps) {
  const blockers = findings.filter((f) => f.severity === 'BLOCKER').length;
  const rules = WILL_RULES.filter((r) => r.id !== 'LEGAL_REVIEW_RECOMMENDED');
  // Findings whose rule is not in WILL_RULES (e.g. RULE_ERROR) must still be seen and block.
  const known = new Set(WILL_RULES.map((r) => r.id));
  const unknown = findings.filter((f) => !known.has(f.ruleId) && f.severity !== 'INFO');
  const totals = willEstateTotals(payload.estate.items);
  const money = (d: { toFixed(n: number): string }) => formatINR(d.toFixed(2), { fractionDigits: 0 });
  const a = payload.allocation;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="min-w-0 space-y-3 p-4 sm:p-5">
        <h2 className={cn('text-base font-semibold', blockers ? 'text-negative' : 'text-positive')}>
          {blockers ? `${blockers} ${blockers === 1 ? 'thing' : 'things'} to fix before you can preview` : 'Ready to preview'}
        </h2>
        <ul className="divide-y divide-border/60">
          {rules.map((r) => {
            const hits = findings.filter((f) => f.ruleId === r.id);
            const hardStop = hits.some((h) => h.severity === 'BLOCKER');
            const Icon = hits.length === 0 ? CheckCircle2 : hardStop ? XCircle : AlertTriangle;
            const tone = hits.length === 0 ? 'text-positive' : hardStop ? 'text-negative' : 'text-warning';
            return (
              <li key={r.id} data-testid={`check-${r.id}`} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone)} />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{r.title}</p>
                    {hits.length === 0
                      ? <p className="text-xs text-muted-foreground">OK</p>
                      : hits.map((h, i) => <p key={i} className="break-words text-xs text-muted-foreground">{h.message}</p>)}
                  </div>
                </div>
                {hits.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => goTo(r.step, RULE_TAB[r.id])}>Fix</Button>
                )}
              </li>
            );
          })}
          {unknown.map((f, i) => (
            <li key={`${f.ruleId}-${i}`} data-testid={`check-${f.ruleId}`} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                {f.severity === 'BLOCKER'
                  ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-negative" />
                  : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
                <div className="min-w-0">
                  <p className="font-medium text-foreground">Something needs another look</p>
                  <p className="break-words text-xs text-muted-foreground">{f.message}</p>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => goTo(f.step)}>Fix</Button>
            </li>
          ))}
        </ul>
      </Card>
      <div className="min-w-0 space-y-4">
        <Card tone="muted" className="space-y-2 p-4 text-sm">
          <h2 className="font-semibold text-foreground">Your will at a glance</h2>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
            <dt className="text-muted-foreground">Assets</dt><dd className="text-right tabular-nums text-foreground">{money(totals.assets)}</dd>
            <dt className="text-muted-foreground">Liabilities</dt><dd className="text-right tabular-nums text-foreground">{money(totals.liabilities)}</dd>
            <dt className="text-muted-foreground">Net estate</dt><dd className="text-right tabular-nums text-foreground" data-testid="review-net">{money(totals.net)}</dd>
            <dt className="text-muted-foreground">People named</dt><dd className="text-right text-foreground">{payload.people.length}</dd>
            <dt className="text-muted-foreground">Specific gifts</dt><dd className="text-right text-foreground">{a.specificGifts.length}</dd>
            <dt className="text-muted-foreground">Money gifts</dt><dd className="text-right text-foreground">{a.fixedGifts.length}</dd>
          </dl>
        </Card>
        <Card tone="muted" className="space-y-2 border-warning/40 p-4 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-foreground"><Scale className="h-4 w-4 text-warning" />Legal review recommended</p>
          <p className="text-foreground">{WILL_DISCLAIMER}</p>
        </Card>
      </div>
    </div>
  );
}
