import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2, ScanSearch } from 'lucide-react';
import { formatINR, type HiddenCostSource, type HiddenCostsView } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { cn } from '@/lib/cn';
import { apiErrorMessage } from '@/api/client';
import { HIDDEN_COSTS_KEY, hiddenCostsApi } from '@/api/hiddenCosts.api';
import { compactInr, costShare } from './hiddenCostsView';

const inr0 = (v: string) => formatINR(v, { fractionDigits: 0 });

/**
 * Hidden Cost X-ray: one big yearly number, a bar per source (red where the
 * user can stop paying, amber where they can't, striped where it is an
 * estimate, grey for taxes), the 20-year cost, and the way out.
 */
export function HiddenCostsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: HIDDEN_COSTS_KEY, queryFn: () => hiddenCostsApi.view() });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Hidden costs"
        description="Fees, commissions and charges taken from your money every year, without a bill."
      />
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error || !data ? (
        <p className="rounded-2xl border p-6 text-[14px] text-muted-foreground">{apiErrorMessage(error, 'Hidden costs could not load. Try again in a minute.')}</p>
      ) : data.sources.length === 0 ? (
        <Empty view={data} />
      ) : (
        <XRay view={data} />
      )}
    </div>
  );
}

function XRay({ view }: { view: HiddenCostsView }) {
  const all = view.sources.map((s) => s.amountInr);
  const cut = view.cuttableInr !== '0.00';
  return (
    <>
      <section aria-labelledby="hc-total" className="relative overflow-hidden rounded-[28px] border bg-card p-6 sm:p-9">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-negative/15 blur-3xl" />
        <h2 id="hc-total" className="relative text-[15px] font-medium text-muted-foreground">Hidden costs you paid this year</h2>
        <p className="numeric-display-lg relative mt-1 text-[clamp(52px,8vw,92px)] font-semibold leading-[0.95] tracking-[-0.02em]">{inr0(view.totalInr)}</p>
        <p className="relative mt-3 max-w-[48ch] text-[15px] text-muted-foreground">Deducted quietly from your investments and accounts. Never shown to you as a bill.</p>
        {view.estimatedInr !== '0.00' && (
          <p className="relative mt-4 inline-flex rounded-full border px-3 py-1 text-[12.5px] text-muted-foreground">
            <span className="numeric-display mr-1 text-foreground">{inr0(view.estimatedInr)}</span> of this is estimated, marked below
          </p>
        )}
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section aria-label="By source" className="rounded-[28px] border bg-card p-3 sm:p-4">
          <ul>
            {view.sources.map((s) => (
              <SourceRow key={s.key} source={s} share={costShare(s.amountInr, all)} />
            ))}
          </ul>
        </section>

        <div className="space-y-4 lg:sticky lg:top-24">
          <section aria-labelledby="hc-compound" className="rounded-[28px] bg-accent p-6 text-background sm:p-8">
            <h2 id="hc-compound" className="text-[14px] font-semibold opacity-80">Over {view.compound.years} years</h2>
            <p className="numeric-display-lg mt-1 text-[clamp(44px,5vw,64px)] font-semibold leading-none">{compactInr(view.compound.valueInr)}</p>
            <p className="mt-3 text-[14px] opacity-80">What these costs would grow to if they stayed invested at {view.compound.ratePct}% a year instead.</p>
          </section>

          {cut && (
            <div>
              <Link
                to="/act-on-it"
                className="flex w-full items-center justify-center rounded-[18px] bg-negative px-5 py-4 text-[16px] font-semibold text-white shadow-[0_10px_30px_-10px_hsl(var(--negative)/0.7)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Cut {inr0(view.cuttableInr)} of it — show me how
              </Link>
              <p className="mt-2 text-center text-[12.5px] text-muted-foreground">EveryPaisa earns ₹0 commission on any switch.</p>
            </div>
          )}

          <Notes view={view} />
        </div>
      </div>
    </>
  );
}

function SourceRow({ source: s, share }: { source: HiddenCostSource; share: number }) {
  const bar = s.unavoidable
    ? 'bg-muted-foreground/50'
    : s.basis === 'ESTIMATE'
      ? 'bg-[repeating-linear-gradient(135deg,hsl(var(--warning))_0_6px,hsl(var(--warning)/0.45)_6px_12px)]'
      : s.cuttable
        ? 'bg-negative'
        : 'bg-warning';
  return (
    <li className="rounded-2xl px-3 py-3.5 sm:px-4">
      <div className="flex items-baseline justify-between gap-3">
        <b className="text-[15.5px] font-semibold">{s.label}</b>
        <span className="numeric-display shrink-0 text-[18px] font-semibold">{inr0(s.amountInr)}</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className={cn('block h-full rounded-full', bar)} style={{ width: `${Math.max(share, 2)}%` }} />
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
        {s.detail}
        {s.cuttable && <Tag className="bg-negative/15 text-negative">Can cut</Tag>}
        {s.basis === 'ESTIMATE' && <Tag className="bg-warning/15 text-warning">Estimate · {s.estimateNote}</Tag>}
      </p>
    </li>
  );
}

const Tag = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-medium', className)}>{children}</span>
);

function Notes({ view }: { view: HiddenCostsView }) {
  const notes: string[] = [];
  if (view.fundsWithoutTer > 0) {
    notes.push(`${view.fundsWithoutTer} ${view.fundsWithoutTer === 1 ? 'fund doesn’t' : 'funds don’t'} publish an expense ratio, so ${view.fundsWithoutTer === 1 ? 'it isn’t' : 'they aren’t'} counted.`);
  }
  if (view.unavailable.length > 0) notes.push('Part of your data couldn’t be read just now, so the total may be low. Try again later.');
  if (notes.length === 0) return null;
  return (
    <ul className="space-y-1.5 rounded-2xl border border-dashed px-4 py-3 text-[12.5px] text-muted-foreground">
      {notes.map((n) => <li key={n}>{n}</li>)}
    </ul>
  );
}

function Empty({ view }: { view: HiddenCostsView }) {
  return (
    <section className="rounded-[28px] border bg-card p-8 sm:p-10">
      <ScanSearch className="h-8 w-8 text-accent-ink" aria-hidden />
      <h2 className="mt-4 font-display text-[28px] font-semibold">No hidden costs found.</h2>
      <p className="mt-2 max-w-[60ch] text-[15px] text-muted-foreground">
        We look at your funds’ expense ratios, trade charges, ULIP and PMS fees, exit loads and bank charges. Add your holdings or connect your bank alerts and we’ll check again.
      </p>
      {view.unavailable.length > 0 && <p className="mt-3 text-[13px] text-muted-foreground">Part of your data couldn’t be read just now. Try again later.</p>}
    </section>
  );
}
