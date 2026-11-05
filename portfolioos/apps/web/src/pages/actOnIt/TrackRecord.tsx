import { formatINR, type ActOnItView } from '@everypaisa/shared';
import { cn } from '@/lib/cn';
import { CATEGORY_LABEL, barShare, outcomeLabel, stateLabel } from './actOnItView';

/**
 * The track record (mockup v4): one big number — what acting earned against
 * doing nothing, counted only from moves seen in the data — a given → acted →
 * confirmed funnel, and the dated history drawn around a centre line: gains to
 * the right, misses to the left, hatched while waiting, blank when not measured.
 */
export function TrackRecord({ view }: { view: ActOnItView }) {
  const r = view.record;
  const max = Math.max(r.given, 1);
  const values = view.history.map((h) => h.outcomeInr);
  return (
    <section aria-labelledby="aoi-record" className="mt-14 grid items-start gap-10 lg:grid-cols-[340px_1fr]">
      <div>
        <h2 id="aoi-record" className="font-display text-[22px] text-muted-foreground">Your track record with us</h2>
        <p className="numeric-display-lg mt-1 text-[clamp(56px,7vw,80px)] font-semibold leading-[0.95] text-accent-ink">
          {formatINR(r.totalInr, { fractionDigits: 0 })}
        </p>
        <p className="mt-2.5 max-w-[30ch] text-[15px] text-muted-foreground">more than if you had done nothing, from the advice you acted on.</p>
        {r.missedInr !== '0.00' && (
          <p className="mt-1 text-[13px] text-negative">{formatINR(r.missedInr, { fractionDigits: 0 })} missed on advice you skipped.</p>
        )}
        <div className="mt-6 flex flex-col gap-2.5" aria-label="Advice given, acted on and confirmed">
          {[
            { n: r.given, label: 'given', cls: 'bg-foreground' },
            { n: r.acted, label: 'acted on', cls: 'bg-foreground/60' },
            { n: r.confirmed, label: 'confirmed in your data', cls: 'bg-accent' },
          ].map((f) => (
            <div key={f.label} className="flex items-center gap-3">
              <b className="numeric-display w-9 text-right text-[22px] font-semibold">{f.n}</b>
              <span className={cn('h-2.5 rounded', f.cls)} style={{ width: `${Math.max(6, (f.n / max) * 150)}px` }} />
              <span className="whitespace-nowrap text-[13px] text-muted-foreground">{f.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-7 max-w-[34ch] text-[12.5px] leading-relaxed text-muted-foreground">
          Every recommendation is kept with its reasons and the date. Results compare what you did against doing nothing, using real prices.
          Things you tell us you did, but we can't see, are listed and not counted.
        </p>
      </div>

      {view.history.length === 0 ? (
        <div className="rounded-3xl border border-dashed p-8 text-[14px] text-muted-foreground">
          Your history starts with your first piece of advice. Each one shows here with what happened next.
        </div>
      ) : (
        <ol className="overflow-hidden rounded-3xl border bg-card">
          {view.history.map((h) => {
            const share = barShare(h.outcomeInr, values);
            const tone = h.outcome === 'GAINED' ? 'text-accent-ink' : h.outcome === 'MISSED' ? 'text-negative' : 'text-muted-foreground';
            const dot = h.state === 'CONFIRMED' ? 'bg-accent' : h.state === 'ACCEPTED' ? 'bg-warning' : h.state === 'SKIPPED' ? 'bg-negative' : 'bg-muted-foreground/60';
            return (
              <li key={h.id} className="grid grid-cols-[64px_1fr] items-center gap-x-4 gap-y-2 border-t px-5 py-3.5 first:border-t-0 sm:grid-cols-[72px_1fr_160px_minmax(110px,auto)] sm:px-6">
                <time className="text-[12px] leading-tight text-muted-foreground" dateTime={h.date}>
                  {new Date(h.date).toLocaleDateString('en-IN', { month: 'short' })}<br />{h.date.slice(0, 4)}
                </time>
                <div className="min-w-0">
                  <b className="block truncate font-semibold" title={h.headline}>{h.headline}</b>
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <i className={cn('inline-block h-2 w-2 rounded-full', dot)} />
                    {stateLabel(h.state)} · {CATEGORY_LABEL[h.category] ?? h.category}
                  </span>
                </div>
                <div className="relative col-span-2 h-5 sm:col-span-1" aria-hidden>
                  <span className="absolute inset-y-[-12px] left-1/2 w-px bg-border" />
                  {h.outcome === 'GAINED' && <span className="absolute left-1/2 h-full rounded-r-md bg-accent" style={{ width: `${share / 2}%` }} />}
                  {h.outcome === 'MISSED' && <span className="absolute right-1/2 h-full rounded-l-md bg-negative" style={{ width: `${share / 2}%` }} />}
                  {h.outcome === 'WAITING' && <span className="absolute left-1/2 h-full w-[30%] rounded-r-md border border-warning/60 bg-[repeating-linear-gradient(135deg,hsl(var(--warning)/0.35)_0_5px,transparent_5px_10px)]" />}
                </div>
                <div className={cn('col-span-2 text-right sm:col-span-1', h.outcome === 'GAINED' || h.outcome === 'MISSED' ? 'numeric-display text-[19px] font-semibold' : 'text-[13px]', tone)}>
                  {outcomeLabel(h.outcome, h.outcomeInr)}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
