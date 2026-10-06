import type { LoanGivenStatus } from '@/api/loansGiven.api';

const STATUS_STYLES: Record<LoanGivenStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-positive/15 text-positive' },
  SETTLED: { label: 'Settled', className: 'bg-muted text-muted-foreground' },
  WRITTEN_OFF: { label: 'Written off', className: 'bg-negative/15 text-negative' },
};

export function LoanGivenStatusBadge({ status }: { status: LoanGivenStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}
