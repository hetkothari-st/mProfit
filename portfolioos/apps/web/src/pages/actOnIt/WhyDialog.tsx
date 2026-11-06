import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleSlash, Loader2, Target } from 'lucide-react';
import { formatINR, type AdviceCardView } from '@everypaisa/shared';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { actOnItApi } from '@/api/actOnIt.api';
import { CATEGORY_LABEL, factValue, figureParts, reasonPoints, riskSteps } from './actOnItView';

const RISK_WORD = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' } as const;

/**
 * "Ask why": the advice in figures first (what it earns, how risky, how fast
 * the money comes back), the reason as short points with the numbers lifted
 * out, the facts it was built from as tiles, and whether it counts in the
 * track record.
 */
export function WhyDialog({ id, card, onClose }: { id: string | null; card: AdviceCardView | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['act-on-it', 'why', id], queryFn: () => actOnItApi.why(id!), enabled: id !== null });
  const given = data ? new Date(data.givenAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl gap-0 rounded-[26px] p-0 sm:p-0">
        {isLoading || !data ? (
          <div className="grid place-items-center py-16">
            <DialogTitle className="sr-only">Why this advice</DialogTitle>
            <DialogDescription className="sr-only">Loading</DialogDescription>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <header className="relative overflow-hidden border-b px-6 pb-6 pt-6 sm:px-8">
              <div aria-hidden className="pointer-events-none absolute -left-16 -top-24 h-56 w-56 rounded-full bg-accent/20 blur-3xl" />
              <div className="relative flex flex-wrap items-center gap-2 pr-8 text-[12px]">
                <span className="rounded-full bg-accent/15 px-2.5 py-1 font-medium text-accent-ink">{CATEGORY_LABEL[data.category] ?? 'Advice'}</span>
                <span className="text-muted-foreground">Given {given}</span>
              </div>
              <DialogTitle className="relative mt-3 font-display text-[26px] font-semibold leading-[1.12] tracking-[-0.01em]">{data.headline}</DialogTitle>
              <DialogDescription className="sr-only">Why this advice was given and how it will be checked.</DialogDescription>
              {card && <Figures card={card} />}
            </header>

            <div className="space-y-6 px-6 py-6 sm:px-8">
              <section aria-label="Why">
                <ul className="space-y-2.5">
                  {reasonPoints(data.rationale).map((point) => (
                    <li key={point} className="flex gap-3 text-[14px] leading-relaxed text-muted-foreground">
                      <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      <span>
                        {figureParts(point).map((p, i) =>
                          p.figure ? <b key={i} className="numeric-display font-semibold text-foreground">{p.text}</b> : <span key={i}>{p.text}</span>,
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {data.facts.length > 0 && (
                <section aria-label="Built from your data">
                  <h3 className="mb-2.5 text-[12.5px] font-medium text-muted-foreground">Built from your data</h3>
                  <dl className="grid grid-cols-2 gap-2.5">
                    {data.facts.map((f) => (
                      <div key={f.label} className="rounded-2xl border bg-muted/40 px-4 py-3">
                        <dt className="text-[12px] text-muted-foreground">{f.label}</dt>
                        <dd className={cn('mt-0.5 truncate', f.kind === 'text' && !/^\d+(\.\d+)?$/.test(f.value) ? 'text-[15px] font-medium' : 'numeric-display text-[20px] font-semibold')}>{factValue(f)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              <TrackedNote tracked={data.tracked} text={data.measuredBy} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The promise in up to three numbers: what it earns, how risky, how fast the
 * money comes back. A figure the advice does not state is left out, not shown
 * as an empty tile.
 */
function Figures({ card }: { card: AdviceCardView }) {
  const count = 1 + (card.gainInr ? 1 : 0) + (card.liquidity ? 1 : 0);
  return (
    <div className={cn('relative mt-5 grid gap-2.5', count === 3 ? 'grid-cols-3' : count === 2 ? 'grid-cols-2' : 'max-w-[11rem] grid-cols-1')}>
      {card.gainInr && (
        <Tile label="Expected gain">
          <span className="text-accent-ink">+{formatINR(card.gainInr, { fractionDigits: 0 })}</span>
        </Tile>
      )}
      <Tile label="Risk">
        <span>{RISK_WORD[card.riskBand]}</span>
        <span className="mt-2 flex gap-1" aria-hidden>
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={cn('h-1.5 flex-1 rounded-full', i <= riskSteps(card.riskBand) ? 'bg-accent' : 'bg-border')} />
          ))}
        </span>
      </Tile>
      {card.liquidity && <Tile label="Money back">{card.liquidity}</Tile>}
    </div>
  );
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card/70 px-3.5 py-3 backdrop-blur">
      <p className="text-[11.5px] text-muted-foreground">{label}</p>
      <div className="numeric-display mt-1 flex flex-col text-[18px] font-semibold leading-tight">{children}</div>
    </div>
  );
}

function TrackedNote({ tracked, text }: { tracked: boolean; text: string }) {
  const Icon = tracked ? Target : CircleSlash;
  return (
    <div className={cn('flex gap-3 rounded-2xl border px-4 py-3.5', tracked ? 'border-accent/40 bg-accent/10' : 'bg-muted/30')}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tracked ? 'text-accent-ink' : 'text-muted-foreground')} aria-hidden />
      <div>
        <p className="text-[13.5px] font-medium">{tracked ? 'Counted in your track record' : 'Not counted in your track record'}</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
          {tracked ? text : "This kind of advice can't be priced yet, so it isn't added to your total."}
        </p>
      </div>
    </div>
  );
}
