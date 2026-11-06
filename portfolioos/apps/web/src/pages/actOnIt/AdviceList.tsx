import { formatINR, type AdviceHistoryRow } from '@everypaisa/shared';
import { cn } from '@/lib/cn';
import { CATEGORY_LABEL, outcomeLabel, stateLabel } from './actOnItView';

const DOT: Partial<Record<AdviceHistoryRow['state'], string>> = {
  CONFIRMED: 'bg-accent',
  CONFIRMED_BY_USER: 'bg-accent/50',
  ACCEPTED: 'bg-warning',
  SKIPPED: 'bg-negative',
};

/** A tab's advice as tiles; each opens its "Ask why". */
export function AdviceList({ rows, empty, onOpen }: { rows: AdviceHistoryRow[]; empty: string; onOpen: (id: string) => void }) {
  if (rows.length === 0) {
    return <p className="rounded-3xl border border-dashed p-8 text-[14px] text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {rows.map((h) => {
        const result = outcomeLabel(h.outcome, h.outcomeInr);
        const tone = h.outcome === 'GAINED' ? 'text-accent-ink' : h.outcome === 'MISSED' || h.outcome === 'LOST' ? 'text-negative' : 'text-muted-foreground';
        const big = ['GAINED', 'MISSED', 'LOST', 'AVOIDED'].includes(h.outcome);
        return (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => onOpen(h.id)}
              className="group flex h-full w-full flex-col rounded-3xl border bg-card p-5 text-left transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-2 text-[12px]">
                <span className="rounded-full bg-accent/15 px-2.5 py-0.5 font-medium text-accent-ink">{CATEGORY_LABEL[h.category] ?? 'Advice'}</span>
                <time className="text-muted-foreground" dateTime={h.date}>
                  {new Date(h.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </time>
              </span>
              <b className="mt-3 line-clamp-2 font-display text-[19px] font-semibold leading-snug">{h.headline}</b>
              <span className="mt-auto flex items-end justify-between gap-3 pt-4">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                  <i className={cn('inline-block h-2 w-2 rounded-full', DOT[h.state] ?? 'bg-muted-foreground/60')} />
                  {stateLabel(h.state)}
                </span>
                <span className={cn('text-right', big ? 'numeric-display text-[20px] font-semibold' : 'text-[12.5px]', tone)}>
                  {result || (h.promisedGainInr ? `+${formatINR(h.promisedGainInr, { fractionDigits: 0 })} expected` : '')}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
