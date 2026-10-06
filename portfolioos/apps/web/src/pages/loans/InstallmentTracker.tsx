import { cn } from '@/lib/cn';

/**
 * Up to this many instalments, one block per month. Beyond it (a 20-year home
 * loan is 240 EMIs) blocks would be slivers, so each block is a year instead
 * and fills part-way through the year.
 */
const MONTH_BLOCKS_UP_TO = 36;

interface TrackerProps {
  done: number;
  total: number;
  accent: string;
  className?: string;
}

function clampDone(done: number, total: number) {
  return Math.min(Math.max(done, 0), Math.max(total, 0));
}

function installmentPct(done: number, total: number): number {
  return total > 0 ? (clampDone(done, total) / total) * 100 : 0;
}

/** Instalments as blocks: months for short loans, years for long ones. */
export function InstallmentTracker({ done, total, accent, className }: TrackerProps) {
  if (total <= 0) return null;
  const paid = clampDone(done, total);
  const byYear = total > MONTH_BLOCKS_UP_TO;
  const size = byYear ? 12 : 1;
  const blocks = Math.ceil(total / size);
  const pct = Math.round(installmentPct(paid, total));

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={`${pct}% repaid`}
        className={cn('flex', total <= 12 ? 'gap-1' : 'gap-[3px]')}
      >
        {Array.from({ length: blocks }, (_, i) => {
          const start = i * size;
          const len = Math.min(size, total - start);
          const filled = Math.min(Math.max(paid - start, 0), len);
          const title = byYear
            ? `Year ${i + 1}: ${filled} of ${len} EMIs paid`
            : `EMI ${i + 1}: ${filled ? 'paid' : 'pending'}`;
          return (
            <span
              key={i}
              title={title}
              className="relative h-2.5 overflow-hidden rounded-[2px] bg-muted"
              // A short final year gets a proportionally shorter block.
              style={{ flexGrow: len, flexBasis: 0 }}
            >
              {filled > 0 && (
                <span
                  className="absolute inset-y-0 left-0"
                  style={{ width: `${(filled / len) * 100}%`, background: accent }}
                />
              )}
            </span>
          );
        })}
      </div>
      {byYear && (
        <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/80">
          Each block = 1 year
        </div>
      )}
    </div>
  );
}

/** Continuous percentage bar with an "x/y instalments done" label. */
export function InstallmentProgress({ done, total, accent, className }: TrackerProps) {
  if (total <= 0) return null;
  const paid = clampDone(done, total);
  const pct = installmentPct(paid, total);
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground">
            {paid}/{total}
          </span>{' '}
          instalments done
        </span>
        <span className="font-medium tabular-nums text-foreground">
          {pct >= 100 ? 100 : pct.toFixed(pct < 10 && pct > 0 ? 1 : 0)}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Instalments done"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={paid}
        aria-valuetext={`${paid} of ${total} instalments done`}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: accent }}
        />
      </div>
    </div>
  );
}
