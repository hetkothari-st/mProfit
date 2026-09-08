import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { MfHorizonMetrics, MfHorizonYears, Ratio } from '@portfolioos/shared';
import { Card, CardContent } from '@/components/ui/card';
import { MetricStat, MetricValue, SectionUnavailable } from './MetricValue';
import { RollingDistribution } from './RollingDistribution';
import { DrawdownPanel } from './DrawdownPanel';
import { CalendarYearTable } from './CalendarYearTable';
import { formatIsoDate, formatRatio, formatRatioAsPct, resolveMetric } from '../mfFormat';

/**
 * One horizon's quantitative profile (`02-METRICS.md §9`).
 *
 * Every scalar here goes through `resolveMetric` + `MetricValue`, which means
 * every scalar here is paired with the `fieldStatus` entry that explains it.
 * That is the whole design: `MfHorizonMetrics.fieldStatus` is keyed by the same
 * dotted path used in the specs below ("riskAdjusted.sortino"), so the reason a
 * number is missing comes from the server that failed to compute it rather than
 * being guessed at on the client.
 *
 * The `notApplicableHint` strings are not decoration. `NOT_APPLICABLE` means the
 * metric is undefined *by construction* — Treynor at a beta near zero, Calmar
 * over a fund that has never fallen 1%, a CAGR at the 1-year horizon where SEBI
 * mandates an absolute figure. Without the hint the reader sees "Not applicable"
 * and has no way to distinguish a deliberate omission from a bug, so they file
 * the bug.
 */

interface MetricSpec {
  /** Dotted key into `fieldStatus`, exactly as `02 §9` defines it. */
  path: string;
  label: string;
  read: (m: MfHorizonMetrics) => Ratio | null;
  format: (v: string) => string;
  notApplicableHint?: string;
  hint?: string;
}

const pct = (v: string) => formatRatioAsPct(v, 2, true);
const pctNoSign = (v: string) => formatRatioAsPct(v, 2);
const ratio = (v: string) => formatRatio(v, 2);

const RETURN_SPECS: MetricSpec[] = [
  {
    path: 'returns.cagr',
    label: 'CAGR (annualised)',
    read: (m) => m.returns.cagr,
    format: pct,
    notApplicableHint:
      'SEBI requires performance under one year to be stated as an absolute return, not annualised',
  },
  {
    path: 'returns.absolute',
    label: 'Absolute return',
    read: (m) => m.returns.absolute,
    format: pct,
    notApplicableHint: 'reported only for horizons under one year; longer horizons are annualised',
  },
  { path: 'returns.benchmarkCagr', label: 'Benchmark CAGR', read: (m) => m.returns.benchmarkCagr, format: pct },
  {
    path: 'returns.categoryMedianCagr',
    label: 'Category median CAGR',
    read: (m) => m.returns.categoryMedianCagr,
    format: pct,
  },
  {
    path: 'returns.sipXirr',
    label: 'SIP XIRR',
    read: (m) => m.returns.sipXirr,
    format: pct,
    hint: 'Hypothetical monthly SIP over this horizon',
  },
];

const RISK_SPECS: MetricSpec[] = [
  { path: 'risk.stdDevAnn', label: 'Std deviation (ann.)', read: (m) => m.risk.stdDevAnn, format: pctNoSign },
  { path: 'risk.downsideDevAnn', label: 'Downside deviation', read: (m) => m.risk.downsideDevAnn, format: pctNoSign },
  { path: 'risk.worstMonth', label: 'Worst month', read: (m) => m.risk.worstMonth, format: pct },
  { path: 'risk.bestMonth', label: 'Best month', read: (m) => m.risk.bestMonth, format: pct },
  {
    path: 'risk.worstCalendarYear',
    label: 'Worst calendar year',
    read: (m) => m.risk.worstCalendarYear,
    format: pct,
  },
  {
    path: 'risk.var95Monthly',
    label: 'VaR 95% (monthly)',
    read: (m) => m.risk.var95Monthly,
    format: pct,
    hint: 'Historical 5th percentile of monthly returns',
  },
  { path: 'risk.cvar95Monthly', label: 'CVaR 95% (monthly)', read: (m) => m.risk.cvar95Monthly, format: pct },
  {
    path: 'risk.pctNegativeMonths',
    label: 'Negative months',
    read: (m) => m.risk.pctNegativeMonths,
    format: pctNoSign,
  },
];

const RISK_ADJ_SPECS: MetricSpec[] = [
  { path: 'riskAdjusted.sharpe', label: 'Sharpe', read: (m) => m.riskAdjusted.sharpe, format: ratio },
  { path: 'riskAdjusted.sortino', label: 'Sortino', read: (m) => m.riskAdjusted.sortino, format: ratio },
  { path: 'riskAdjusted.beta', label: 'Beta', read: (m) => m.riskAdjusted.beta, format: ratio },
  {
    path: 'riskAdjusted.jensenAlphaAnn',
    label: "Jensen's alpha (ann.)",
    read: (m) => m.riskAdjusted.jensenAlphaAnn,
    format: pct,
  },
  {
    path: 'riskAdjusted.treynor',
    label: 'Treynor',
    read: (m) => m.riskAdjusted.treynor,
    format: ratio,
    notApplicableHint: 'beta is too close to zero — the ratio explodes and means nothing there',
  },
  {
    path: 'riskAdjusted.trackingErrorAnn',
    label: 'Tracking error (ann.)',
    read: (m) => m.riskAdjusted.trackingErrorAnn,
    format: pctNoSign,
  },
  {
    path: 'riskAdjusted.informationRatio',
    label: 'Information ratio',
    read: (m) => m.riskAdjusted.informationRatio,
    format: ratio,
  },
  {
    path: 'riskAdjusted.calmar',
    label: 'Calmar',
    read: (m) => m.riskAdjusted.calmar,
    format: ratio,
    notApplicableHint: 'this fund has never fallen 1% — there is no drawdown to divide by',
  },
  { path: 'riskAdjusted.omega', label: 'Omega', read: (m) => m.riskAdjusted.omega, format: ratio },
  {
    path: 'riskAdjusted.m2',
    label: 'M² (Modigliani)',
    read: (m) => m.riskAdjusted.m2,
    format: pct,
    hint: "The fund's return restated at benchmark risk",
  },
];

const RELATIVE_SPECS: MetricSpec[] = [
  { path: 'relative.upCapture', label: 'Up capture', read: (m) => m.relative.upCapture, format: pctNoSign },
  { path: 'relative.downCapture', label: 'Down capture', read: (m) => m.relative.downCapture, format: pctNoSign },
  { path: 'relative.captureRatio', label: 'Capture ratio', read: (m) => m.relative.captureRatio, format: ratio },
  {
    path: 'relative.battingAverage',
    label: 'Batting average',
    read: (m) => m.relative.battingAverage,
    format: pctNoSign,
  },
  {
    path: 'relative.outperformanceAnn',
    label: 'Outperformance (ann.)',
    read: (m) => m.relative.outperformanceAnn,
    format: pct,
  },
];

const CONSISTENCY_SPECS: MetricSpec[] = [
  {
    path: 'consistency.rollingBeatBenchPct',
    label: 'Rolling windows beating benchmark',
    read: (m) => m.consistency.rollingBeatBenchPct,
    format: pctNoSign,
  },
  {
    path: 'consistency.rollingBeatCategoryPct',
    label: 'Rolling windows beating category',
    read: (m) => m.consistency.rollingBeatCategoryPct,
    format: pctNoSign,
  },
  {
    path: 'consistency.quartileConsistency',
    label: 'Quartile consistency',
    read: (m) => m.consistency.quartileConsistency,
    format: pctNoSign,
  },
];

export function HorizonMetricsPanel({
  metrics,
  horizon,
}: {
  metrics: MfHorizonMetrics;
  horizon: MfHorizonYears;
}) {
  // A whole horizon can be unhealthy — quarantined NAV data, too few
  // observations. It is still rendered rather than hidden, with the reason on
  // top, because a silently absent tab reads as "this fund has no 10-year
  // record" when the truth may be "we could not compute it".
  const blockUnhealthy = metrics.status !== 'OK';

  return (
    <div data-testid={`mf-horizon-${horizon}`} className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
        <span>As of {formatIsoDate(metrics.asOf) ?? metrics.asOf}</span>
        <span>
          <span className="numeric">{metrics.observationsMonthly}</span> monthly observations
        </span>
        <span>Math version {metrics.mathVersion}</span>
        {metrics.riskFreeSeries && <span>Risk-free: {metrics.riskFreeSeries}</span>}
      </div>

      {blockUnhealthy && (
        <div
          data-horizon-status={metrics.status}
          className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This horizon is marked <span className="font-medium">{metrics.status}</span>
            {metrics.statusReason ? ` — ${metrics.statusReason}` : ''}. Individual figures below
            state their own availability.
          </p>
        </div>
      )}

      <MetricGroup title="Returns" specs={RETURN_SPECS} metrics={metrics} />

      <RollingDistribution
        stats={[
          { windowLabel: '1-year windows', stats: metrics.returns.rolling1y },
          { windowLabel: '3-year windows', stats: metrics.returns.rolling3y },
          { windowLabel: '5-year windows', stats: metrics.returns.rolling5y },
        ]}
      />

      <MetricGroup title="Risk" specs={RISK_SPECS} metrics={metrics} />

      <DrawdownPanel metrics={metrics} />

      <MetricGroup title="Risk-adjusted" specs={RISK_ADJ_SPECS} metrics={metrics} />

      <BenchmarkRelativeGroup metrics={metrics} />

      <div>
        <MetricGroup title="Consistency" specs={CONSISTENCY_SPECS} metrics={metrics} />
        <p className="mt-2 text-[11px] text-muted-foreground">
          {metrics.consistency.survivorshipAdjusted
            ? 'Category medians include schemes that later merged or wound up — excluding them would flatter every survivor.'
            : 'Category medians here cover surviving schemes only, so they read slightly high.'}
        </p>
      </div>

      <CalendarYearTable rows={metrics.returns.calendarYears} />
    </div>
  );
}

/**
 * `BENCHMARK_UNAVAILABLE` (`06 §6`): the relative block goes unavailable while
 * every absolute metric above keeps rendering.
 *
 * The banner is driven by `benchmarkCode === null` rather than by the field
 * statuses, so the reader is told the *cause* once at the top of the section
 * instead of reading the same five-word reason five times — but each field
 * still carries its own status underneath, because a benchmark that exists can
 * still fail one metric and not another.
 */
function BenchmarkRelativeGroup({ metrics }: { metrics: MfHorizonMetrics }) {
  const noBenchmark = metrics.benchmarkCode === null;
  return (
    <div>
      <SectionTitle>Benchmark-relative</SectionTitle>
      {noBenchmark ? (
        <SectionUnavailable
          status="BENCHMARK_UNAVAILABLE"
          title="Relative metrics are not available"
          reason="This scheme has no usable Total Return Index benchmark, so capture ratios, batting average and outperformance cannot be computed. The absolute return and risk figures above are unaffected."
        />
      ) : (
        <>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Benchmark: <span className="font-medium text-foreground">{metrics.benchmarkCode}</span>
          </p>
          <StatGrid specs={RELATIVE_SPECS} metrics={metrics} />
        </>
      )}
    </div>
  );
}

function MetricGroup({
  title,
  specs,
  metrics,
}: {
  title: string;
  specs: MetricSpec[];
  metrics: MfHorizonMetrics;
}) {
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <StatGrid specs={specs} metrics={metrics} />
    </div>
  );
}

function StatGrid({ specs, metrics }: { specs: MetricSpec[]; metrics: MfHorizonMetrics }) {
  return (
    <Card tone="flat">
      <CardContent className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-3 lg:grid-cols-4">
        {specs.map((spec) => {
          const resolved = resolveMetric(spec.read(metrics), spec.path, metrics);
          return (
            <MetricStat key={spec.path} label={spec.label} hint={spec.hint}>
              <MetricValue
                value={resolved.value}
                status={resolved.status}
                reason={resolved.reason}
                format={spec.format}
                notApplicableHint={spec.notApplicableHint}
              />
            </MetricStat>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}
