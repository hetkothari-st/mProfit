import type { MfAnalysisScope, MfPortfolioTotals } from '@portfolioos/shared';
import { Card, CardContent } from '@/components/ui/card';
import { MetricStat } from './MetricValue';
import {
  MoneyCell,
  NullableMoneyCell,
  NullablePctCell,
  NullableRatioPctCell,
  RatioCell,
  RatioPctCell,
} from './MetricCells';
import { MfPartialChip } from './MfScopeNotice';
import { known, resolveWithStatus } from '../mfFormat';

/**
 * The headline block: what the MF book cost, what it is worth, what it earned,
 * what it costs to keep, and how concentrated it is.
 *
 * Three fields here carry the honesty states most likely to be flattened into a
 * number by a well-meaning edit, and each is handled explicitly:
 *
 * **`weightedTerPct` and `annualCostInr` are `Pct | null` and `Money | null`,
 * and null means "no fund you hold has disclosed an expense ratio".** Rendering
 * `0.00%` and `₹0` there does not merely omit information — it makes a
 * confident false claim, that the portfolio is free to run. Zero is a real and
 * outstanding expense ratio; that is exactly why the contract refuses to use it
 * as a sentinel (`MfCostSummary.weightedTerPct`, `MfPortfolioTotals`). Even
 * when they are NON-null they are a floor, because the mean is taken over the
 * subset of funds that did disclose — the hint says so here, and the cost
 * section names the funds.
 *
 * **`portfolioXirr` travels with `portfolioXirrStatus`.** A portfolio whose
 * cash flows never change sign, or whose solver did not converge, has no XIRR —
 * distinct from an XIRR of zero, which would say the money went nowhere.
 *
 * **`redundancyScore` and `effectiveFundCount` are both `Ratio` and are
 * formatted completely differently.** The first is a fraction (`0.31` = 31%
 * mean pairwise overlap); the second is a COUNT of funds (`1 / Σw²` = 4.31
 * funds). Percent-formatting the second would render "431%". They are
 * neighbours on the contract and neighbours on screen, which is precisely when
 * two same-branded quantities get confused.
 */
/**
 * The service's sentinel for "this analysis was computed on request and not
 * persisted onto an `MfAnalysisRun`". Deliberately not a cuid, so it cannot be
 * mistaken for a run id that resolves to nothing.
 */
const UNPERSISTED_RUN_ID = 'unpersisted';

export function PortfolioTotals({
  totals,
  scope,
  asOf,
  runId,
}: {
  totals: MfPortfolioTotals;
  scope: MfAnalysisScope;
  asOf: string;
  runId: string;
}) {
  // A value/status PAIR on the contract rather than a bare nullable, so the
  // reason for a missing XIRR comes from the server rather than being guessed.
  const xirr = resolveWithStatus(totals.portfolioXirr, totals.portfolioXirrStatus);

  return (
    <Card tone="hero" data-testid="mf-portfolio-totals">
      <CardContent className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Mutual fund book
              <MfPartialChip scope={scope} />
            </p>
            <p className="mt-2 font-display text-[40px] leading-none text-foreground">
              <MoneyCell resolved={known(totals.currentValue)} />
            </p>
            <p className="mt-2 text-[12px] text-muted-foreground">
              Invested <MoneyCell resolved={known(totals.investedValue)} /> ·{' '}
              {totals.fundCount} {totals.fundCount === 1 ? 'scheme' : 'schemes'}
              {totals.equityFundCount > 0 && `, ${totals.equityFundCount} equity-oriented`}
            </p>
          </div>
          <div className="text-right text-[11px] text-muted-foreground">
            <p>As of {asOf}</p>
            {/* Provenance. `04` persists an analysis onto `MfAnalysisRun` so a
                page never shows a different number from the run its findings
                came from; until the engine writes those rows this read is
                computed live, and saying which of the two you are looking at
                is the difference between a citable figure and a screenshot. */}
            <p data-run-id={runId} className="mt-0.5">
              {runId === UNPERSISTED_RUN_ID
                ? 'Computed on request — not a stored run'
                : `Run ${runId}`}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-border/60 pt-5 sm:grid-cols-3 lg:grid-cols-6">
          <MetricStat label="Absolute gain">
            <MoneyCell resolved={known(totals.absoluteGain)} />
          </MetricStat>

          <MetricStat
            label="Portfolio XIRR"
            hint="Your own cash flows, not the funds' published returns"
          >
            <RatioPctCell resolved={xirr} fractionDigits={2} showSign />
          </MetricStat>

          <MetricStat
            label="Weighted TER"
            hint="Averaged over the funds that disclosed one — a floor, not a total"
          >
            <NullablePctCell
              value={totals.weightedTerPct}
              // Quoting the contract's own explanation of the null. No digits
              // in the reason: the keystone test walks every rendered metric
              // and fails a non-OK one that contains one, because a number
              // inside an unavailability is a number the reader can mistake
              // for the answer.
              reason="no fund you hold has disclosed an expense ratio, and zero would say your portfolio is free"
            />
          </MetricStat>

          <MetricStat
            label="Annual cost"
            hint="Weighted TER charged on the funds that disclosed one"
          >
            <NullableMoneyCell
              value={totals.annualCostInr}
              reason="no fund you hold has disclosed an expense ratio, so there is nothing to charge it against"
            />
          </MetricStat>

          <MetricStat
            label="Effective funds"
            hint="1 / Σ(weight²) — diversification across funds, not within them"
          >
            {/* A COUNT, not a fraction. See the header. */}
            <RatioCell resolved={known(totals.effectiveFundCount)} fractionDigits={2} />
          </MetricStat>

          <MetricStat label="Redundancy" hint="Weighted mean pairwise overlap between your funds">
            {/* A FRACTION. Same branded type as the cell to its left, opposite
                formatting. */}
            <NullableRatioPctCell
              value={totals.redundancyScore}
              reason="fewer than two of your funds have a comparable holdings snapshot, so there is no pair to compare"
              fractionDigits={1}
            />
          </MetricStat>
        </div>

        <div className="mt-5 border-t border-border/60 pt-4">
          <MetricStat
            label="Switching to direct plans would save, per year"
            hint="TER difference between each regular plan you hold and its direct sibling, on today's value"
          >
            <MoneyCell resolved={known(totals.directPlanSavingsInr)} className="text-[20px]" />
          </MetricStat>
        </div>
      </CardContent>
    </Card>
  );
}
