import { Link } from 'react-router-dom';
import { formatINR } from '@portfolioos/shared';
import { Card } from '@/components/ui/card';
import type { InsuranceClaimDTO, InsurancePolicyDTO } from '@/api/insurance.api';
import { InsurerLogo } from './InsurerLogo';

const RANK: Record<InsuranceClaimDTO['progress']['next']['action'], number> = {
  GO_TO_OMBUDSMAN: 0,
  FILE_GRIEVANCE: 1,
  WAIT: 2,
  NONE: 3,
};

/** Every claim still in progress, those needing a push first. Hidden when there are none. */
export function OpenClaimsPanel({ policies }: { policies: InsurancePolicyDTO[] }) {
  const items = policies
    .flatMap((p) =>
      (p.claims ?? [])
        .filter((c) => c.progress.next.action !== 'NONE')
        .map((c) => ({ p, c })),
    )
    .sort((a, b) => RANK[a.c.progress.next.action] - RANK[b.c.progress.next.action]);
  if (items.length === 0) return null;

  return (
    <Card className="overflow-hidden p-0">
      <div className="px-5 pb-2 pt-4">
        <h2 className="font-display text-xl">Claims in progress</h2>
      </div>
      <ul className="divide-y divide-border border-t">
        {items.map(({ p, c }) => {
          const push = c.progress.next.action === 'FILE_GRIEVANCE' || c.progress.next.action === 'GO_TO_OMBUDSMAN';
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 sm:flex-nowrap">
              <InsurerLogo insurer={p.insurer} type={p.type} size={32} maxWidth={96} />
              <div className="min-w-0 flex-1">
                <Link to={`/insurance/${p.id}#claims`} className="block truncate text-sm font-medium hover:underline">
                  {p.insurer} — {c.claimType}
                </Link>
                <p className={`text-sm ${push ? 'text-amber-500' : 'text-muted-foreground'}`}>{c.progress.next.reason}</p>
              </div>
              <span className="shrink-0 text-sm tabular-nums">{formatINR(c.claimedAmount, { fractionDigits: 0 })}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
