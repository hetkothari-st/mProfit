import { cn } from '@/lib/cn';
import { balanceLabel, balanceTone } from '@/lib/splitFormat';

const TONE = {
  owed: 'text-positive',
  owe: 'text-negative',
  settled: 'text-muted-foreground',
} as const;

export function BalancePill({ net, currency, approx, className }: { net: string; currency: string; approx?: boolean; className?: string }) {
  return (
    <span className={cn('text-sm font-medium tabular-nums whitespace-nowrap', TONE[balanceTone(net)], className)}>
      {balanceLabel(net, currency, { approx })}
    </span>
  );
}
