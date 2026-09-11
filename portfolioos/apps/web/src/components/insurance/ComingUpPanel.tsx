import { Link } from 'react-router-dom';
import { formatINR } from '@portfolioos/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { InsurancePolicyDTO } from '@/api/insurance.api';
import { TONE_DOT, TONE_TEXT, formatDay, policyTitle, premiumDueMeta, urgencyRank } from '@/lib/insurance';
import { InsurerLogo } from './InsurerLogo';

const byDue = (a: InsurancePolicyDTO, b: InsurancePolicyDTO) =>
  (a.premiumDue.dueDate ?? '').localeCompare(b.premiumDue.dueDate ?? '');

/**
 * Premiums due in the next 30 days and anything overdue, most at risk first —
 * the same list the daily reminders are drawn from.
 */
export function ComingUpPanel({
  policies,
  onRecord,
}: {
  policies: InsurancePolicyDTO[];
  onRecord: (policy: InsurancePolicyDTO) => void;
}) {
  const active = policies.filter((p) => p.status === 'ACTIVE');
  const urgent = active
    .map((p) => ({ p, meta: premiumDueMeta(p) }))
    .filter((x) => x.meta.urgent)
    .sort((a, b) => urgencyRank(a.p) - urgencyRank(b.p) || byDue(a.p, b.p));
  const next = active.filter((p) => p.premiumDue.state === 'UPCOMING').sort(byDue)[0];

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pb-2 pt-4">
        <h2 className="font-display text-xl">Coming up</h2>
        <p className="text-xs text-muted-foreground">Premiums due within 30 days, and anything overdue</p>
      </div>
      {urgent.length === 0 ? (
        <p className="px-5 pb-4 text-sm text-muted-foreground">
          Nothing due in the next 30 days.
          {next &&
            ` Next up: ${next.insurer}, ${formatINR(next.premiumAmount, { fractionDigits: 0 })} on ${formatDay(next.premiumDue.dueDate)}.`}
        </p>
      ) : (
        <ul className="divide-y divide-border border-t">
          {urgent.map(({ p, meta }) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 sm:flex-nowrap">
              <InsurerLogo insurer={p.insurer} type={p.type} size={32} maxWidth={96} />
              <div className="min-w-0 flex-1">
                <Link to={`/insurance/${p.id}`} className="block truncate text-sm font-medium hover:underline">
                  {p.insurer} — {policyTitle(p)}
                </Link>
                <p className={`flex items-center gap-1.5 text-sm ${TONE_TEXT[meta.tone]}`}>
                  <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[meta.tone]}`} />
                  {meta.label}
                </p>
                {meta.detail && <p className="mt-0.5 text-xs text-muted-foreground">{meta.detail}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm tabular-nums">{formatINR(p.premiumAmount, { fractionDigits: 0 })}</span>
                <Button size="sm" variant={meta.tone === 'danger' ? 'default' : 'outline'} onClick={() => onRecord(p)}>
                  Record payment
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
