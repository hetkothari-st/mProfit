import { AlertTriangle } from 'lucide-react';
import type {
  MfAllocationComparison,
  MfCreditQualitySplit,
  MfHeldFundDto,
  MfLookThrough,
  MfMarketCapSplit,
  Pct,
} from '@portfolioos/shared';
import { Card, CardContent } from '@/components/ui/card';
import { MetricStat, SectionUnavailable } from './MetricValue';
import { NullablePctCell, PctCell } from './MetricCells';
import { known, ratioToChartNumber } from '../mfFormat';

/**
 * What the funds actually hold, aggregated (`04 §3`).
 *
 * **The whole section is a floor whenever `fundsWithoutHoldings` is non-empty,
 * and it says so at the top rather than in a footnote.** A fund we have no
 * portfolio disclosure for contributes nothing to any figure below: its stocks
 * are absent from the top-25, its sectors from the sector table, its equity
 * from the asset-class split. Every number is therefore an UNDER-statement of
 * the user's true exposure, and the direction matters — a reader checking
 * whether they are over-concentrated in one stock would be reassured by a
 * number that is low precisely because the evidence is missing. The banner
 * names the funds so the size of the gap is legible.
 *
 * Every weight here is a `Pct` — `effectiveWeightPct` on a stock, the sector
 * map, the market-cap and credit splits, the target comparison. None of them
 * is a `Ratio` and none goes near `formatRatioAsPct`.
 */
export function LookThrough({
  lookThrough,
  funds,
}: {
  lookThrough: MfLookThrough;
  funds: MfHeldFundDto[];
}) {
  const nameFor = (schemeCode: string) =>
    funds.find((f) => f.schemeCode === schemeCode)?.meta.schemeName ?? schemeCode;

  const missing = lookThrough.fundsWithoutHoldings;

  return (
    <section data-testid="mf-look-through" className="space-y-5">
      <h2 className="font-display text-[22px] leading-none text-foreground">Look-through</h2>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Your funds&apos; holdings, weighted by what each fund is worth to you. This is the exposure
        that actually determines your risk — the labels on the funds do not.
      </p>

      {missing.length > 0 && (
        <div
          data-testid="mf-lookthrough-floor"
          className="flex items-start gap-2.5 rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
          <span>
            <strong className="font-medium">
              Everything in this section is a floor, not a total.
            </strong>{' '}
            We hold no portfolio disclosure for{' '}
            {missing.map(nameFor).join(', ')}, so{' '}
            {missing.length === 1 ? 'its' : 'their'} stocks, sectors and asset mix are absent from
            every figure below. Your real exposure to any line here is at least what is shown and
            possibly more.
          </span>
        </div>
      )}

      <TopStocks stocks={lookThrough.topStocks} />

      <div className="grid gap-5 lg:grid-cols-2">
        <WeightTable
          title="Asset class"
          caption="What your mutual fund book is really invested in, across every fund."
          weights={lookThrough.assetClass}
          testId="mf-lookthrough-asset-class"
          emptyReason="No fund in this view has a holdings disclosure we could classify by asset class."
        />
        <MarketCap split={lookThrough.marketCap} />
      </div>

      <WeightTable
        title="Sectors"
        caption={
          lookThrough.sectorsBenchmark
            ? 'Compared against the broad-market index weights, where the constituents are loaded.'
            : 'Absolute weights only — we have not loaded index constituents to compare against.'
        }
        weights={lookThrough.sectors}
        benchmark={lookThrough.sectorsBenchmark}
        testId="mf-lookthrough-sectors"
        emptyReason="No fund in this view has a holdings disclosure carrying a sector classification."
      />

      <Credit split={lookThrough.credit} />

      <TargetComparison target={lookThrough.target} />
    </section>
  );
}

function TopStocks({ stocks }: { stocks: MfLookThrough['topStocks'] }) {
  if (stocks.length === 0) {
    return (
      <div>
        <SubHeading>Underlying stocks</SubHeading>
        <SectionUnavailable
          title="No underlying holdings to aggregate"
          reason="None of your funds has a portfolio disclosure we could look through. This is a coverage gap in the snapshots we hold, not evidence that your funds hold nothing."
        />
      </div>
    );
  }
  return (
    <div data-testid="mf-lookthrough-stocks">
      <SubHeading>Underlying stocks</SubHeading>
      <Card tone="flat">
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Security</th>
                <th className="px-4 py-2.5 text-right font-medium">Of MF book</th>
                <th className="px-4 py-2.5 text-right font-medium">Of net worth</th>
                <th className="px-4 py-2.5 font-medium">Held through</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {stocks.map((s, i) => (
                <tr key={`${s.isin ?? s.securityName}-${i}`} data-stock={s.securityName}>
                  <td className="px-4 py-2">
                    <span className="font-medium text-foreground">{s.securityName}</span>
                    {s.isin && <span className="ml-2 text-[11px] text-muted-foreground">{s.isin}</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <PctCell resolved={known(s.effectiveWeightPct)} fractionDigits={2} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <NullablePctCell
                      value={s.effectiveWeightOfNetWorthPct}
                      // Same null as `weightInNetWorth` on a held fund: a share
                      // of a denominator we cannot see is a fabricated ratio.
                      reason="your net worth is not fully visible in this view, so a share of it cannot be stated"
                      fractionDigits={2}
                    />
                  </td>
                  <td className="px-4 py-2 text-[11.5px] text-muted-foreground">
                    {/* Each contributor's own weight is shown, not just its
                        name: the effective weight on the left is the sum of
                        (fund weight × holding weight) across these, and without
                        the components the reader cannot tell one heavy position
                        in one fund from a small position held five times. */}
                    {s.contributors.map((c, ci) => (
                      <span key={c.schemeCode} data-contributor={c.schemeCode}>
                        {ci > 0 && ', '}
                        {c.schemeName}{' '}
                        <span className="text-muted-foreground/75">
                          (<PctCell resolved={known(c.weightPct)} fractionDigits={1} />)
                        </span>
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * A `Record<string, Pct>` rendered as a sorted bar table.
 *
 * `ratioToChartNumber` is used ONLY for the bar width and the sort — the
 * documented chart-geometry escape hatch. Every number the reader can read
 * comes from `formatPct` on the original wire string, so a pixel and a figure
 * can never disagree.
 */
function WeightTable({
  title,
  caption,
  weights,
  benchmark,
  testId,
  emptyReason,
}: {
  title: string;
  caption: string;
  weights: Record<string, Pct>;
  benchmark?: Record<string, Pct> | null;
  testId: string;
  emptyReason: string;
}) {
  const rows = Object.entries(weights).sort(
    (a, b) => ratioToChartNumber(b[1]) - ratioToChartNumber(a[1]),
  );
  if (rows.length === 0) {
    return (
      <div>
        <SubHeading>{title}</SubHeading>
        <SectionUnavailable title={`${title} not available`} reason={emptyReason} />
      </div>
    );
  }
  const top = ratioToChartNumber(rows[0]?.[1] ?? null);

  return (
    <div data-testid={testId}>
      <SubHeading>{title}</SubHeading>
      <p className="mb-2 text-[11.5px] text-muted-foreground">{caption}</p>
      <Card tone="flat">
        <CardContent className="space-y-2 p-5">
          {rows.map(([label, weight]) => (
            <div key={label} className="flex items-center gap-3" data-weight-row={label}>
              <span className="w-36 shrink-0 truncate text-[12px] text-foreground">{label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span
                  className="block h-full rounded-full bg-accent/60"
                  style={{ width: top > 0 ? `${(ratioToChartNumber(weight) / top) * 100}%` : '0%' }}
                />
              </span>
              <span className="w-16 shrink-0 text-right text-[12px]">
                <PctCell resolved={known(weight)} fractionDigits={1} />
              </span>
              {benchmark && (
                <span className="w-28 shrink-0 text-right text-[11px] text-muted-foreground">
                  {benchmark[label] === undefined ? (
                    'not in index'
                  ) : (
                    <>
                      index <PctCell resolved={known(benchmark[label]!)} fractionDigits={1} />
                    </>
                  )}
                </span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

const MARKET_CAP_LABEL: Record<keyof MfMarketCapSplit, string> = {
  large: 'Large cap',
  mid: 'Mid cap',
  small: 'Small cap',
  unclassified: 'Unclassified',
};

function MarketCap({ split }: { split: MfMarketCapSplit }) {
  return (
    <div data-testid="mf-lookthrough-market-cap">
      <SubHeading>Market cap</SubHeading>
      <p className="mb-2 text-[11.5px] text-muted-foreground">
        Across every equity holding we can see, not across the funds&apos; category labels.
      </p>
      <Card tone="flat">
        <CardContent className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-4">
          {(Object.keys(MARKET_CAP_LABEL) as Array<keyof MfMarketCapSplit>).map((k) => (
            <MetricStat
              key={k}
              label={MARKET_CAP_LABEL[k]}
              // Reported, never folded into another bucket — absorbing it would
              // silently inflate whichever bucket took it.
              hint={k === 'unclassified' ? 'Holdings we could not place, shown rather than hidden' : undefined}
            >
              <NullablePctCell
                value={split[k]}
                reason="no holding in the snapshots we hold could be placed in this bucket, which is different from none being in it"
                fractionDigits={1}
              />
            </MetricStat>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

const CREDIT_LABEL: Record<keyof MfCreditQualitySplit, string> = {
  sov: 'Sovereign',
  aaa: 'AAA',
  aaPlus: 'AA+',
  aa: 'AA',
  aaMinus: 'AA-',
  aAndBelow: 'A and below',
  unrated: 'Unrated',
};

/**
 * Rendered only when the book actually contains debt we can see. An all-equity
 * portfolio has no credit profile, and printing "Not available" seven times for
 * one would be as misleading as printing zeros: it implies a measurement we
 * failed to make rather than a question that does not arise.
 */
function Credit({ split }: { split: MfCreditQualitySplit | null }) {
  if (split === null) return null;
  return (
    <div data-testid="mf-lookthrough-credit">
      <SubHeading>Credit quality</SubHeading>
      <Card tone="flat">
        <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4 lg:grid-cols-7">
          {(Object.keys(CREDIT_LABEL) as Array<keyof MfCreditQualitySplit>).map((k) => (
            <MetricStat key={k} label={CREDIT_LABEL[k]}>
              <NullablePctCell
                value={split[k]}
                reason="the disclosures we hold carry no rating in this bucket, which is not the same as holding nothing in it"
                fractionDigits={1}
              />
            </MetricStat>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Target vs actual (`04 §3`), rendered only when the user has a risk profile and
 * an active model portfolio. Absent, the section does not appear at all: a drift
 * table with no target would have to invent one.
 *
 * `outsideTolerance` comes from the advisor's own REBALANCE constants, so this
 * page and the advice engine cannot disagree about what counts as drift.
 */
function TargetComparison({ target }: { target: MfAllocationComparison | null }) {
  if (target === null) return null;
  const keys = Object.keys(target.target);

  return (
    <div data-testid="mf-lookthrough-target">
      <SubHeading>Against your target allocation</SubHeading>
      <p className="mb-2 text-[11.5px] text-muted-foreground">
        Model <span className="font-medium text-foreground">{target.model}</span>. A row is flagged
        when it is outside the tolerance the advice engine itself uses.
      </p>
      <Card tone="flat">
        <CardContent className="p-0">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Sleeve</th>
                <th className="px-4 py-2.5 text-right font-medium">Actual</th>
                <th className="px-4 py-2.5 text-right font-medium">Target</th>
                <th className="px-4 py-2.5 text-right font-medium">Drift</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {keys.map((k) => (
                <tr key={k} data-target-sleeve={k}>
                  <td className="px-4 py-2 text-foreground">
                    {k}
                    {target.outsideTolerance.includes(k) && (
                      <span className="ml-2 rounded-full border border-amber-400/50 bg-amber-400/10 px-1.5 py-px text-[9.5px] font-medium uppercase tracking-kerned text-amber-700 dark:text-amber-300">
                        Outside tolerance
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <NullablePctCell
                      value={target.actual[k] ?? null}
                      reason="this sleeve is not present in the look-through we could compute"
                      fractionDigits={1}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <NullablePctCell
                      value={target.target[k] ?? null}
                      reason="the model portfolio does not state a target for this sleeve"
                      fractionDigits={1}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <NullablePctCell
                      value={target.drift[k] ?? null}
                      reason="a drift needs both an actual and a target, and one of them is missing"
                      fractionDigits={1}
                      showSign
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function SubHeading({ children }: { children: string }) {
  return (
    <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}
