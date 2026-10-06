import { cn } from '@/lib/cn';
import type { InstallmentRow } from '@/api/loansGiven.api';

const STYLES: Record<InstallmentRow['status'], { label: string; className: string }> = {
  PAID: { label: 'Paid', className: 'bg-positive/12 text-positive' },
  WAIVED: { label: 'Forgiven', className: 'bg-muted text-muted-foreground' },
  PARTIAL: { label: 'Partly paid', className: 'bg-warning/15 text-warning' },
  OVERDUE: { label: 'Overdue', className: 'bg-negative/12 text-negative' },
  DUE: { label: 'Due soon', className: 'bg-warning/15 text-warning' },
  UPCOMING: { label: 'Pending', className: 'bg-muted/70 text-muted-foreground' },
};

export function InstallmentStatusChip({ row }: { row: InstallmentRow }) {
  const s = STYLES[row.status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        s.className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
      {row.status === 'PARTIAL' && row.overdue && ' · late'}
    </span>
  );
}
