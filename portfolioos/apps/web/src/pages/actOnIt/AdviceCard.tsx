import { Decimal, formatINR, type AdviceCardView } from '@everypaisa/shared';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { riskSteps, twoPathEnds } from './actOnItView';

const inr0 = (v: string) => formatINR(v, { fractionDigits: 0 });

/**
 * The advice to act on (mockup v4): a plain headline, the reason, the two
 * paths (straight lines — a year's growth is close to linear, and a curve
 * would exaggerate), and a side panel with why now, risk, cost and confidence.
 */
export function AdviceCard({
  card,
  compliance,
  busy,
  onAccept,
  onWhy,
  onLater,
  onDismiss,
  onDoneElsewhere,
}: {
  card: AdviceCardView;
  compliance: string;
  busy: boolean;
  onAccept: () => void;
  onWhy: () => void;
  onLater: () => void;
  onDismiss: () => void;
  onDoneElsewhere: () => void;
}) {
  return (
    <article aria-labelledby="aoi-headline" className="grid overflow-hidden rounded-[28px] border bg-card lg:grid-cols-[1.35fr_1fr]">
      <div className="p-6 sm:p-9">
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-[11px] font-bold text-background" aria-hidden>E</span>
          {compliance}
          {card.urgent && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[12px] font-medium text-warning">Deadline this week</span>}
        </p>
        <h2 id="aoi-headline" className="mt-4 max-w-[18ch] font-display text-[clamp(28px,3.4vw,44px)] font-semibold leading-[1.08] tracking-[-0.015em]">
          {card.headline}
        </h2>
        <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-muted-foreground">{card.rationale}</p>

        {card.twoPaths ? (
          <TwoPaths card={card} />
        ) : (
          card.gainInr && (
            <p className="mt-6 flex items-baseline gap-2.5">
              <span className="numeric-display text-[36px] font-semibold text-accent-ink">+{inr0(card.gainInr)}</span>
              <span className="text-[13px] text-muted-foreground">expected</span>
            </p>
          )
        )}

        <div className="mt-7 flex flex-wrap gap-2.5">
          <Button size="lg" className="rounded-[14px] bg-accent text-background shadow-[0_8px_30px_-8px_hsl(var(--accent)/0.55)] hover:bg-accent/90" disabled={busy} onClick={onAccept}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Accept advice
          </Button>
          <Button size="lg" variant="outline" className="rounded-[14px]" onClick={onWhy}>Ask why</Button>
          <Button size="lg" variant="ghost" className="rounded-[14px] text-muted-foreground" disabled={busy} onClick={onLater}>Not now</Button>
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">
          <button type="button" className="underline-offset-2 hover:text-foreground hover:underline" disabled={busy} onClick={onDoneElsewhere}>I already did this</button>
          <span aria-hidden> · </span>
          <button type="button" className="underline-offset-2 hover:text-foreground hover:underline" disabled={busy} onClick={onDismiss}>Not for me</button>
        </p>
      </div>

      <aside className="flex flex-col gap-6 border-t bg-muted/40 p-6 sm:p-8 lg:border-l lg:border-t-0">
        <WhyNow card={card} />
        <div>
          <h3 className="mb-2 text-[13px] font-medium text-muted-foreground">Risk</h3>
          <div className="flex gap-1" aria-label={`Risk ${card.riskBand.toLowerCase()}`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={cn('h-2 flex-1 rounded', i <= riskSteps(card.riskBand) ? 'bg-accent' : 'bg-border')} />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[12px] text-muted-foreground"><span>Low</span><span>High</span></div>
        </div>
        {(card.costInr !== null || card.liquidity !== null) && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="mb-1 text-[13px] font-medium text-muted-foreground">You pay</h3>
            <p className="numeric-display text-[24px]">{card.costInr === null ? '—' : inr0(card.costInr)}</p>
            <p className="text-[12px] text-muted-foreground">{card.costInr === '0.00' ? 'No commission' : card.costInr === null ? 'Check exit load and tax' : 'One time'}</p>
          </div>
          <div>
            <h3 className="mb-1 text-[13px] font-medium text-muted-foreground">Money back</h3>
            <p className="text-[24px] font-medium leading-tight">{card.liquidity ?? '—'}</p>
          </div>
        </div>
        )}
        <p className="text-[12.5px] text-muted-foreground">
          Confidence: {card.confidence === 'HIGH' ? 'high' : 'medium'}. Built from your own data.
          {card.expiresAt && <> Stands until {new Date(card.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.</>}
        </p>
      </aside>
    </article>
  );
}

function TwoPaths({ card }: { card: AdviceCardView }) {
  const t = card.twoPaths!;
  const ends = twoPathEnds(t.amountInr, t.doNothingRatePct, t.actRatePct);
  // The y-axis is zoomed to the money's range (amount → act end): the gap is real, not exaggerated by curvature.
  const lo = new Decimal(t.amountInr);
  const hi = new Decimal(ends.act);
  const y = (v: string) => 182 - new Decimal(v).minus(lo).dividedBy(hi.minus(lo).isZero() ? 1 : hi.minus(lo)).times(142).toNumber();
  const yDn = y(ends.doNothing);
  return (
    <figure className="mt-6" aria-label={`What ${inr0(t.amountInr)} becomes in a year on each path`}>
      <p className="flex items-baseline gap-2.5">
        <span className="numeric-display text-[36px] font-semibold text-accent-ink">+{inr0(ends.gap)}</span>
        <span className="text-[13px] text-muted-foreground">more in a year</span>
      </p>
      <svg viewBox="0 0 600 210" className="mt-1 h-auto w-full" role="img">
        <line x1="20" y1="190" x2="580" y2="190" className="stroke-border" />
        <path d={`M20 182 L580 40 L580 ${yDn} Z`} className="fill-accent/20" />
        <path d={`M20 182 L580 ${yDn}`} fill="none" strokeWidth="2.5" strokeDasharray="6 6" className="stroke-muted-foreground" />
        <path d="M20 182 L580 40" fill="none" strokeWidth="3.5" className="stroke-accent" />
        <circle cx="580" cy="40" r="6" className="fill-accent" />
        <circle cx="580" cy={yDn} r="5" className="fill-muted-foreground" />
        <text x="566" y="30" textAnchor="end" fontSize="12" className="fill-accent-ink numeric-display">{inr0(ends.act)} if you move it</text>
        <text x="572" y={yDn + 22} textAnchor="end" fontSize="12" className="fill-muted-foreground numeric-display">{inr0(ends.doNothing)} if it stays</text>
        <text x="20" y="206" fontSize="11" className="fill-muted-foreground">Today</text>
        <text x="580" y="206" fontSize="11" textAnchor="end" className="fill-muted-foreground">In a year</text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-[3px] w-3.5 rounded bg-accent" />{t.actLabel}, about {t.actRatePct}%</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-[3px] w-3.5 rounded bg-muted-foreground" />{t.doNothingLabel}, {t.doNothingRatePct}%</span>
      </figcaption>
    </figure>
  );
}

function WhyNow({ card }: { card: AdviceCardView }) {
  const w = card.whyNow;
  if (!w) return null;
  if (w.kind === 'BALANCE' && w.months?.length) {
    const max = w.months.reduce((m, x) => Decimal.max(m, new Decimal(x.balance)), new Decimal(1));
    const buffer = w.bufferInr ? new Decimal(w.bufferInr) : null;
    const pct = (v: Decimal) => Math.max(4, v.dividedBy(max).times(100).toNumber());
    return (
      <div>
        <h3 className="mb-2 text-[13px] font-medium text-muted-foreground">Why now</h3>
        <div className="relative flex h-16 items-end gap-[5px]" aria-label="Your balance at each month end">
          {w.months.map((m) => {
            const above = buffer ? new Decimal(m.balance).greaterThan(buffer) : true;
            return <i key={m.month} title={`${m.month}: ${inr0(m.balance)}`} className={cn('flex-1 rounded-t-[3px]', above ? 'bg-accent' : 'bg-muted-foreground/40')} style={{ height: `${pct(new Decimal(m.balance))}%` }} />;
          })}
          {buffer && <span className="absolute inset-x-0 border-t-[1.5px] border-dashed border-foreground/50" style={{ bottom: `${pct(buffer)}%` }} />}
        </div>
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          Your balance each month. The dashed line is 3 months of spending{buffer && <>, {inr0(buffer.toFixed(2))}</>}, and it stays in the bank.
        </p>
      </div>
    );
  }
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-medium text-muted-foreground">Why now</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
        {(w.items ?? []).slice(0, 6).map((i) => (
          <div key={i.label} className="contents">
            <dt className="text-muted-foreground">{i.label}</dt>
            <dd className="numeric-display text-right">{i.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
