import { Decimal } from '@portfolioos/shared';
import { TONE_DOT, type Tone } from '@/lib/insurance';
import { inr } from './verdict';

/**
 * Cover against need, as one bar: filled as far as the cover goes, with the
 * rest of the track left open — the gap you can see before you read it.
 */
export function CoverageBar({ cover, need, tone }: { cover: string; need: string; tone: Tone }) {
  const c = new Decimal(cover);
  const n = new Decimal(need);
  const pct = n.greaterThan(0) ? Decimal.min(100, c.dividedBy(n).times(100)).toNumber() : 100;
  const label = `You have ${inr(cover)} against a need of ${inr(need)}`;

  return (
    <div>
      <div role="img" aria-label={label} className="relative h-3 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-[width] duration-300 ${TONE_DOT[tone]}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between gap-3 text-xs tabular-nums text-muted-foreground">
        <span>You have {inr(cover)}</span>
        <span>You need {inr(need)}</span>
      </div>
    </div>
  );
}
