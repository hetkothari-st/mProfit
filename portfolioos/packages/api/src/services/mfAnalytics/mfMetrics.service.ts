/**
 * Orchestration for the mutual fund metrics layer
 * (`docs/mf-analytics/02-METRICS.md`).
 *
 * This module is the I/O half of the pair whose pure half is
 * `mfMetricsMath.ts`. It loads three series (NAV, benchmark, risk-free) plus
 * the latest portfolio disclosure and the meta tables, hands them to the math
 * module, and serialises the answers onto the `MfHorizonMetrics` /
 * `MfCurrentProfile` shapes from `@portfolioos/shared`.
 *
 * **It contains no formulas.** Every arithmetic operation on a metric lives in
 * `mfMetricsMath.ts`; if a number in this file is computed rather than
 * transported, that is a bug. The split exists so that "our 3-year Sharpe was
 * 1.12 on 2024-03-31" is reproducible from a fixture without a database.
 *
 * The substance of this file is **status assignment** — deciding, for each
 * horizon, whether the answer is `OK`, `INSUFFICIENT_DATA`,
 * `BENCHMARK_UNAVAILABLE`, `STALE` or `QUARANTINED`, and recording a per-field
 * status beside every null. `02 §1` and `06 §6` both turn on this: a consumer
 * that receives a non-`OK` metric renders "not available — {reason}", and a
 * consumer that receives `0` renders a fund with no skill. The two must never
 * be confusable, so nothing here ever substitutes a zero for an unknown.
 *
 * ## The join path (read before editing a query here)
 *
 * `MfSchemeMeta.schemeCode` is the AMFI code and equals
 * `MutualFundMaster.schemeCode`, but NAV history is keyed
 * `MFNav.fundId -> MutualFundMaster.id`. There is deliberately no FK between
 * the analytics metadata and the NAV master (AMFI publishes codes for schemes
 * we may have no master row for yet), so the join is two hops and is done by
 * hand below. See the doc comment on `MfSchemeMeta.schemeCode` in
 * `schema.prisma`.
 *
 * `MFNav.adjustedNav` — never `MFNav.nav` — is what every return calculation
 * reads (`02 §1`). It is nullable because it is backfilled; a null means "not
 * yet adjusted", which is missing data, not zero, and the point is simply
 * absent from the series.
 */

import type { Prisma, MfSchemeMeta } from '@prisma/client';
import {
  Decimal,
  toDecimal,
  serializeMoney,
  serializeRatio,
  serializePct,
  MF_HORIZONS,
  type Money,
  type Ratio,
  type Pct,
  type MfHorizonYears,
  type MfHorizonMetrics,
  type MfCurrentProfile,
  type MfMetricStatus,
  type MfRollingStats,
  type MfCalendarYearRow,
  type MfMarketCapSplit,
  type MfCreditQualitySplit,
  type MfTopHolding,
  type MfHoldingKind,
} from '@portfolioos/shared';

import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';
import * as math from './mfMetricsMath.js';
import type {
  MetricResult,
  MetricUnavailableReason,
  SeriesPoint,
  HoldingWeightRow,
} from './mfMetricsMath.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * `06 §6`: a portfolio disclosure older than this makes the horizon-0 profile
 * `STALE` rather than `OK`. AMCs disclose by the 10th for the prior month end,
 * so ~40 days of lag is normal and healthy; 60 days means a disclosure was
 * missed entirely, and every concentration / overlap number derived from it now
 * describes a portfolio the fund may no longer hold.
 */
export const HOLDINGS_STALE_AFTER_DAYS = 60;

/**
 * `02 §1`: the risk-free series. Stored annualised in **percent** units on
 * `RiskFreeRate.ratePct`, so every read divides by 100 before it reaches the
 * math module, which works in fractions throughout.
 */
export const RISK_FREE_SERIES = 'TBILL_91D';

/** `02 §2.2`: the rolling windows we report, subject to fitting in the horizon. */
const ROLLING_WINDOWS = [1, 3, 5] as const;

/** `02 §8`: manager-change count window. */
const MANAGER_CHANGE_LOOKBACK_YEARS = 3;

/** `02 §7`: turnover is inferred across trailing monthly snapshots. */
const TURNOVER_SNAPSHOT_COUNT = 12;

const HUNDRED = new Decimal(100);
const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Status vocabulary
// ---------------------------------------------------------------------------

/**
 * Map the math module's fine-grained `MetricUnavailableReason` onto the coarse
 * `MfMetricStatus` enum the DB and the API speak.
 *
 * Two mappings deserve their reasoning stated, because both look wrong:
 *
 * `degenerate_denominator` -> `INSUFFICIENT_DATA`. A tracking error of exactly
 * zero is not "insufficient data" in the literal sense — we had every
 * observation. But the enum has no `UNDEFINED` member, and the honest thing to
 * tell a reader is "we cannot give you this number", which is what
 * `INSUFFICIENT_DATA` renders as. Claiming `OK` with a null would read as a
 * deliberate omission, which it is not.
 *
 * `not_applicable` -> `NOT_APPLICABLE`. This is the *deliberate* suppression
 * case: Treynor at a beta below 0.1, Calmar on a sub-1% drawdown, CAGR at the
 * one-year horizon where SEBI convention says report the absolute return
 * instead. The row is healthy and nothing is missing; the field is null by
 * definition.
 *
 * It gets its own status rather than reusing `OK`. `OK` with a null value
 * would invert the layer's reading rule: `00-README.md` invariant 4 tells a
 * consumer to render a *non-OK* metric as unavailable, which makes `OK` the
 * one status that licenses printing the number — and the number is null. A
 * consumer following the documented contract would render 0.00 for a fund
 * whose Treynor is undefined, the exact null-as-zero failure the status
 * vocabulary exists to prevent. `INSUFFICIENT_DATA` is equally wrong in the
 * other direction: it sends the UI hunting for history that need not exist and
 * makes a correctly-un-ranked liquid fund look under-covered.
 */
function statusForReason(reason: MetricUnavailableReason | undefined): MfMetricStatus {
  switch (reason) {
    case 'benchmark_unavailable':
      return 'BENCHMARK_UNAVAILABLE';
    case 'not_applicable':
      return 'NOT_APPLICABLE';
    case undefined:
      return 'INSUFFICIENT_DATA';
    default:
      return 'INSUFFICIENT_DATA';
  }
}

/**
 * Collects the per-field statuses that accompany every null in the output.
 *
 * The shared type's contract is "a null in any block is always accompanied by
 * an entry in `fieldStatus`". Enforcing that by hand at ~60 call sites is how
 * one gets forgotten, so every field goes through this recorder and the null
 * and its status are produced by the same call. The dotted paths match the
 * shape exactly ("riskAdjusted.sortino") because `05-FINDINGS-ENGINE.md`
 * evidence rows cite metrics by that path.
 */
class FieldStatus {
  private readonly map: Record<string, MfMetricStatus> = {};

  /** Serialise a dimensionless ratio, or record why it is missing. */
  ratio(path: string, result: MetricResult): Ratio | null {
    if (result.value === null) {
      this.map[path] = statusForReason(result.reason);
      return null;
    }
    return serializeRatio(result.value);
  }

  /** Serialise a percent-unit value, or record why it is missing. */
  pct(path: string, result: MetricResult): Pct | null {
    if (result.value === null) {
      this.map[path] = statusForReason(result.reason);
      return null;
    }
    return serializePct(result.value);
  }

  /** Serialise a rupee amount, or record why it is missing. */
  money(path: string, value: Decimal | null, reason?: MetricUnavailableReason): Money | null {
    if (value === null) {
      this.map[path] = statusForReason(reason);
      return null;
    }
    return serializeMoney(value);
  }

  /** An integer count (holdings, days) — no precision risk, but still statused when null. */
  count(path: string, value: number | null, reason?: MetricUnavailableReason): number | null {
    if (value === null) this.map[path] = statusForReason(reason);
    return value;
  }

  /** A non-scalar field (a split, a map, an array) that could not be produced. */
  missing(path: string, reason: MetricUnavailableReason): null {
    this.map[path] = statusForReason(reason);
    return null;
  }

  snapshot(): Record<string, MfMetricStatus> {
    // Copy so a caller cannot mutate the recorder after the row is built.
    return { ...this.map };
  }
}

// ---------------------------------------------------------------------------
// Small date / series helpers
// ---------------------------------------------------------------------------

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function minusYears(d: Date, years: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear() - years, d.getUTCMonth(), d.getUTCDate()));
}

function calendarDaysBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / MS_PER_DAY);
}

/** Inclusive slice of an ascending-by-date series. */
function sliceSeries(series: readonly SeriesPoint[], from: Date, to: Date): SeriesPoint[] {
  const lo = from.getTime();
  const hi = to.getTime();
  return series.filter((p) => p.date.getTime() >= lo && p.date.getTime() <= hi);
}

/** Last element at or before `time` in an ascending-by-date array, or null. */
function lastAtOrBefore<T extends { date: Date }>(rows: readonly T[], time: number): T | null {
  let found: T | null = null;
  for (const row of rows) {
    if (row.date.getTime() > time) break;
    found = row;
  }
  return found;
}

// ---------------------------------------------------------------------------
// Loaded inputs
// ---------------------------------------------------------------------------

interface SnapshotWithHoldings {
  id: string;
  asOf: Date;
  totalHoldings: number;
  cashPct: Prisma.Decimal;
  holdings: Array<{
    kind: MfHoldingKind;
    isin: string | null;
    securityName: string;
    weightPct: Prisma.Decimal;
    sector: string | null;
    marketCapBucket: string | null;
    issuer: string | null;
    creditRating: string | null;
    maturityDate: Date | null;
    ytmPct: Prisma.Decimal | null;
  }>;
}

/**
 * Everything one scheme's metrics need, read once. Loading per horizon instead
 * would issue six copies of the same NAV query; the ten-year series is the
 * superset of every window, so it is fetched once and sliced in memory.
 */
interface SchemeInputs {
  meta: MfSchemeMeta;
  /** Ascending, deduped, `adjustedNav` only, quarantined rows excluded. */
  navDaily: SeriesPoint[];
  /** Dates of quarantined NAV rows inside the widest window — surfaced, not hidden. */
  quarantinedDates: Date[];
  /** Ascending benchmark index levels, or empty when the scheme has no benchmark. */
  benchmarkDaily: SeriesPoint[];
  benchmarkCode: string | null;
  /** Annualised risk-free **fractions** (not percent), ascending. */
  riskFreeAnnual: SeriesPoint[];
  latestSnapshot: SnapshotWithHoldings | null;
  /** Trailing snapshots (oldest first) used for turnover and style drift. */
  snapshotHistory: SnapshotWithHoldings[];
  terPct: Decimal | null;
  aumNow: Decimal | null;
  aum12mAgo: Decimal | null;
  /** Ascending AUM series, for pairing an AUM with each historical snapshot. */
  aumSeries: SeriesPoint[];
  managers: Array<{ managerName: string; role: string | null; fromDate: Date; toDate: Date | null }>;
}

/**
 * The widest horizon plus the widest rolling window: a 10-year horizon reports
 * 5-year rolling returns, and the earliest of those needs a NAV 15 years back.
 * Loading only 10 years would silently produce zero rolling-5y observations at
 * the start of the window and a distribution biased toward recent history.
 */
const MAX_LOOKBACK_YEARS = Math.max(...MF_HORIZONS) + Math.max(...ROLLING_WINDOWS);

async function loadSchemeInputs(schemeCode: string, asOf: Date): Promise<SchemeInputs> {
  const meta = await prisma.mfSchemeMeta.findUnique({ where: { schemeCode } });
  if (!meta) throw new NotFoundError(`MfSchemeMeta not found for schemeCode ${schemeCode}`);

  const earliest = minusYears(asOf, MAX_LOOKBACK_YEARS);

  // Hop 1 of the two-hop join. A scheme with metadata but no master row has no
  // NAV history at all, which is a real state (AMFI publishes the code before
  // we have ingested the fund) and yields INSUFFICIENT_DATA rather than a throw.
  const master = await prisma.mutualFundMaster.findUnique({
    where: { schemeCode },
    select: { id: true },
  });

  let navRows: Array<{ date: Date; adjustedNav: Prisma.Decimal | null; isQuarantined: boolean }> =
    [];
  if (master) {
    navRows = await prisma.mFNav.findMany({
      where: { fundId: master.id, date: { gte: earliest, lte: asOf } },
      select: { date: true, adjustedNav: true, isQuarantined: true },
      orderBy: { date: 'asc' },
    });
  }

  // Quarantined rows are read but never fed to the math. `01 §6` keeps them so
  // the gap stays visible instead of silently closing up; the service's job is
  // to surface that visibility as a status, which is why the dates are carried
  // rather than the rows being filtered away in SQL.
  const quarantinedDates = navRows.filter((r) => r.isQuarantined).map((r) => startOfDayUtc(r.date));

  const navDaily = math.toDailySeries(
    navRows
      .filter((r) => !r.isQuarantined && r.adjustedNav !== null)
      .map((r) => ({ date: r.date, value: toDecimal(r.adjustedNav) })),
  );

  const benchmarkCode = meta.benchmarkIndexCode;
  let benchmarkDaily: SeriesPoint[] = [];
  if (benchmarkCode) {
    const rows = await prisma.benchmarkIndexPrice.findMany({
      where: { indexCode: benchmarkCode, date: { gte: earliest, lte: asOf } },
      select: { date: true, value: true },
      orderBy: { date: 'asc' },
    });
    benchmarkDaily = math.toDailySeries(rows.map((r) => ({ date: r.date, value: toDecimal(r.value) })));
  }

  const rfRows = await prisma.riskFreeRate.findMany({
    where: { series: RISK_FREE_SERIES, date: { gte: earliest, lte: asOf } },
    select: { date: true, ratePct: true },
    orderBy: { date: 'asc' },
  });
  // Percent -> fraction at the boundary. Every consumer downstream (including
  // `annualisedRiskFreeToMonthly`) assumes a fraction; converting here means the
  // /100 appears exactly once instead of at each metric.
  const riskFreeAnnual = math.toDailySeries(
    rfRows.map((r) => ({ date: r.date, value: toDecimal(r.ratePct).dividedBy(HUNDRED) })),
  );

  const snapshotSelect = {
    id: true,
    asOf: true,
    totalHoldings: true,
    cashPct: true,
    holdings: {
      select: {
        kind: true,
        isin: true,
        securityName: true,
        weightPct: true,
        sector: true,
        marketCapBucket: true,
        issuer: true,
        creditRating: true,
        maturityDate: true,
        ytmPct: true,
      },
    },
  } as const;

  const snapshotsDesc = (await prisma.mfPortfolioSnapshot.findMany({
    where: { schemeCode, asOf: { lte: asOf } },
    select: snapshotSelect,
    orderBy: { asOf: 'desc' },
    take: TURNOVER_SNAPSHOT_COUNT,
  })) as SnapshotWithHoldings[];

  const ter = await prisma.mfSchemeTer.findFirst({
    where: { schemeCode, effectiveFrom: { lte: asOf } },
    orderBy: { effectiveFrom: 'desc' },
    select: { terPct: true },
  });

  const aumRows = await prisma.mfSchemeAum.findMany({
    where: { schemeCode, asOf: { lte: asOf } },
    select: { asOf: true, aum: true },
    orderBy: { asOf: 'asc' },
  });
  const aumSeries: SeriesPoint[] = aumRows.map((r) => ({
    date: startOfDayUtc(r.asOf),
    value: toDecimal(r.aum),
  }));
  const aumNow = aumSeries.length > 0 ? aumSeries[aumSeries.length - 1]!.value : null;
  const aumTwelveBack = lastAtOrBefore(aumSeries, minusYears(asOf, 1).getTime());

  const managers = await prisma.mfSchemeManager.findMany({
    where: { schemeCode },
    select: { managerName: true, role: true, fromDate: true, toDate: true },
    orderBy: { fromDate: 'asc' },
  });

  return {
    meta,
    navDaily,
    quarantinedDates,
    benchmarkDaily,
    benchmarkCode,
    riskFreeAnnual,
    latestSnapshot: snapshotsDesc[0] ?? null,
    snapshotHistory: [...snapshotsDesc].reverse(),
    terPct: ter ? toDecimal(ter.terPct) : null,
    aumNow,
    aum12mAgo: aumTwelveBack?.value ?? null,
    aumSeries,
    managers,
  };
}

// ---------------------------------------------------------------------------
// Per-horizon computation
// ---------------------------------------------------------------------------

/**
 * The month-by-month table every monthly metric is derived from.
 *
 * Built once per horizon and then projected into three aligned pairs rather
 * than re-joined at each metric, because every one of those joins is a chance
 * to hand two arrays of different length to a formula that assumes they line
 * up. `alignReturns` is an inner join on purpose (`02 §1`): a month the index
 * did not report is a month we cannot compare, and substituting a 0% index
 * return manufactures alpha of exactly the fund's return for that month.
 */
interface MonthlyTable {
  /** Every fund monthly return in the window. */
  fund: Decimal[];
  /** Fund returns for months with a risk-free rate, and the aligned rates. */
  fundRf: Decimal[];
  rf: Decimal[];
  /** Fund and benchmark returns for months both reported. */
  fundVsBench: Decimal[];
  bench: Decimal[];
  /** All three aligned, for beta / alpha / Treynor. */
  fundTriple: Decimal[];
  benchTriple: Decimal[];
  rfTriple: Decimal[];
  /** Mean annualised risk-free rate over the window — the `rf_ann` term in M². */
  meanAnnualRf: Decimal | null;
}

function buildMonthlyTable(
  fundMonthly: readonly SeriesPoint[],
  benchMonthly: readonly SeriesPoint[] | null,
  riskFreeAnnual: readonly SeriesPoint[],
): MonthlyTable {
  const fundReturns = math.toMonthlyReturns(fundMonthly);
  const benchReturns = benchMonthly ? math.toMonthlyReturns(benchMonthly) : [];

  const monthEnds = fundReturns.map((p) => p.date);
  const annualRf = math.forwardFillRiskFree(riskFreeAnnual, monthEnds);
  const monthlyRf = math.annualisedRiskFreeSeriesToMonthly(annualRf);

  const benchByTime = new Map<number, Decimal>();
  for (const p of benchReturns) benchByTime.set(p.date.getTime(), p.value);

  const table: MonthlyTable = {
    fund: [],
    fundRf: [],
    rf: [],
    fundVsBench: [],
    bench: [],
    fundTriple: [],
    benchTriple: [],
    rfTriple: [],
    meanAnnualRf: null,
  };

  const annualRfPresent: Decimal[] = [];

  for (let i = 0; i < fundReturns.length; i++) {
    const r = fundReturns[i]!.value;
    const rf = monthlyRf[i] ?? null;
    const b = benchByTime.get(fundReturns[i]!.date.getTime()) ?? null;
    const rfAnnual = annualRf[i] ?? null;

    table.fund.push(r);
    if (rf !== null) {
      table.fundRf.push(r);
      table.rf.push(rf);
    }
    if (rfAnnual !== null) annualRfPresent.push(rfAnnual);
    if (b !== null) {
      table.fundVsBench.push(r);
      table.bench.push(b);
    }
    if (rf !== null && b !== null) {
      table.fundTriple.push(r);
      table.benchTriple.push(b);
      table.rfTriple.push(rf);
    }
  }

  if (annualRfPresent.length > 0) {
    let acc = new Decimal(0);
    for (const v of annualRfPresent) acc = acc.plus(v);
    table.meanAnnualRf = acc.dividedBy(annualRfPresent.length);
  }

  return table;
}

/** Missing-benchmark shorthand, so the short-circuit reads once not fifteen times. */
const NO_BENCHMARK: MetricResult = { value: null, reason: 'benchmark_unavailable' };

function toRollingStats(
  fs: FieldStatus,
  path: string,
  result: math.RollingStatsResult,
): MfRollingStats | null {
  if (result.mean === null) {
    fs.missing(path, result.reason ?? 'insufficient_observations');
    return null;
  }
  return {
    windowYears: result.windowYears as 1 | 3 | 5,
    observations: result.observations,
    mean: fs.ratio(`${path}.mean`, { value: result.mean }),
    median: fs.ratio(`${path}.median`, { value: result.median, reason: 'no_data' }),
    min: fs.ratio(`${path}.min`, { value: result.min, reason: 'no_data' }),
    max: fs.ratio(`${path}.max`, { value: result.max, reason: 'no_data' }),
    p10: fs.ratio(`${path}.p10`, { value: result.p10, reason: 'no_data' }),
    p25: fs.ratio(`${path}.p25`, { value: result.p25, reason: 'no_data' }),
    p75: fs.ratio(`${path}.p75`, { value: result.p75, reason: 'no_data' }),
    p90: fs.ratio(`${path}.p90`, { value: result.p90, reason: 'no_data' }),
    pctNegative: fs.ratio(`${path}.pctNegative`, { value: result.pctNegative, reason: 'no_data' }),
    pctBelowBenchmark: fs.ratio(`${path}.pctBelowBenchmark`, {
      value: result.pctBelowBenchmark,
      reason: 'benchmark_unavailable',
    }),
    // Owned by `mfPeerRank.service.ts` (`02 §6`), which needs the category
    // universe this module deliberately does not load. Null with a status
    // rather than 0 — a fund is not "never below the category median".
    pctBelowCategoryMedian: fs.missing(`${path}.pctBelowCategoryMedian`, 'no_data'),
  };
}

/**
 * Build the fully-null horizon row for a window the NAV history does not cover.
 *
 * A row still gets written (`schema.prisma` on `MfSchemeMetrics`: "an absent row
 * is a bug report"), carrying the reason. This is the single most common
 * outcome for a young fund and it must be cheap and honest, not an exception.
 */
function emptyHorizon(
  asOf: Date,
  horizonYears: MfHorizonYears,
  benchmarkCode: string | null,
  status: MfMetricStatus,
  statusReason: string,
  observationsMonthly = 0,
): MfHorizonMetrics {
  const fs = new FieldStatus();
  const unavailable: MetricResult = { value: null, reason: 'insufficient_observations' };

  return {
    asOf: asOf.toISOString().slice(0, 10),
    horizonYears,
    observationsMonthly,
    status,
    statusReason,
    benchmarkCode,
    riskFreeSeries: RISK_FREE_SERIES,
    mathVersion: math.MF_METRICS_MATH_VERSION,
    returns: {
      cagr: fs.ratio('returns.cagr', unavailable),
      absolute: fs.ratio('returns.absolute', unavailable),
      benchmarkCagr: fs.ratio('returns.benchmarkCagr', unavailable),
      categoryMedianCagr: fs.ratio('returns.categoryMedianCagr', unavailable),
      rolling1y: fs.missing('returns.rolling1y', 'insufficient_observations'),
      rolling3y: fs.missing('returns.rolling3y', 'insufficient_observations'),
      rolling5y: fs.missing('returns.rolling5y', 'insufficient_observations'),
      calendarYears: [],
      sipXirr: fs.ratio('returns.sipXirr', unavailable),
    },
    risk: {
      stdDevAnn: fs.ratio('risk.stdDevAnn', unavailable),
      downsideDevAnn: fs.ratio('risk.downsideDevAnn', unavailable),
      maxDrawdown: fs.ratio('risk.maxDrawdown', unavailable),
      maxDrawdownDurationDays: fs.count('risk.maxDrawdownDurationDays', null, 'insufficient_observations'),
      recoveryDays: fs.count('risk.recoveryDays', null, 'insufficient_observations'),
      worstMonth: fs.ratio('risk.worstMonth', unavailable),
      bestMonth: fs.ratio('risk.bestMonth', unavailable),
      worstCalendarYear: fs.ratio('risk.worstCalendarYear', unavailable),
      var95Monthly: fs.ratio('risk.var95Monthly', unavailable),
      cvar95Monthly: fs.ratio('risk.cvar95Monthly', unavailable),
      pctNegativeMonths: fs.ratio('risk.pctNegativeMonths', unavailable),
    },
    riskAdjusted: {
      sharpe: fs.ratio('riskAdjusted.sharpe', unavailable),
      sortino: fs.ratio('riskAdjusted.sortino', unavailable),
      beta: fs.ratio('riskAdjusted.beta', unavailable),
      jensenAlphaAnn: fs.ratio('riskAdjusted.jensenAlphaAnn', unavailable),
      treynor: fs.ratio('riskAdjusted.treynor', unavailable),
      trackingErrorAnn: fs.ratio('riskAdjusted.trackingErrorAnn', unavailable),
      informationRatio: fs.ratio('riskAdjusted.informationRatio', unavailable),
      calmar: fs.ratio('riskAdjusted.calmar', unavailable),
      omega: fs.ratio('riskAdjusted.omega', unavailable),
      m2: fs.ratio('riskAdjusted.m2', unavailable),
    },
    relative: {
      upCapture: fs.ratio('relative.upCapture', unavailable),
      downCapture: fs.ratio('relative.downCapture', unavailable),
      captureRatio: fs.ratio('relative.captureRatio', unavailable),
      battingAverage: fs.ratio('relative.battingAverage', unavailable),
      outperformanceAnn: fs.ratio('relative.outperformanceAnn', unavailable),
    },
    consistency: {
      rollingBeatBenchPct: fs.ratio('consistency.rollingBeatBenchPct', unavailable),
      rollingBeatCategoryPct: fs.ratio('consistency.rollingBeatCategoryPct', unavailable),
      quartileHistory: [],
      quartileConsistency: fs.ratio('consistency.quartileConsistency', unavailable),
      survivorshipAdjusted: true,
    },
    fieldStatus: fs.snapshot(),
  };
}

function computeHorizon(
  inputs: SchemeInputs,
  asOf: Date,
  horizonYears: MfHorizonYears,
): MfHorizonMetrics {
  const { navDaily, benchmarkDaily, benchmarkCode, riskFreeAnnual } = inputs;

  // ── Gate 1: does the NAV history cover the window at all? ────────────────
  //
  // `02 §1`: window start is `asOf − N years` exactly, or the nearest prior NAV
  // within seven days. `windowStartPoint` returning null is precisely the
  // "this fund is 24 months old" case, and it must produce INSUFFICIENT_DATA
  // rather than a 3-year CAGR computed from an inception NAV.
  const windowStart = math.windowStartPoint(navDaily, asOf, horizonYears);
  if (windowStart === null) {
    const covered =
      navDaily.length > 0
        ? Math.floor(calendarDaysBetween(navDaily[0]!.date, asOf) / 30.44)
        : 0;
    return emptyHorizon(
      asOf,
      horizonYears,
      benchmarkCode,
      'INSUFFICIENT_DATA',
      navDaily.length === 0
        ? 'no_adjusted_nav_history'
        : `nav_history_covers_${covered}_of_${horizonYears * 12}_months`,
    );
  }

  const windowFrom = windowStart.date;
  const windowDaily = sliceSeries(navDaily, windowFrom, asOf);
  const benchWindowDaily = sliceSeries(benchmarkDaily, windowFrom, asOf);

  // ── Gate 2: is the benchmark usable for this window? ─────────────────────
  //
  // Assessed on the window, not the whole series. A 2013 index gap is
  // irrelevant to a 3-year horizon ending today, and gating the whole scheme on
  // it would suppress relative metrics that are perfectly computable.
  const benchAssessment = math.assessBenchmarkSeries(
    benchmarkCode === null || benchWindowDaily.length === 0 ? null : benchWindowDaily,
  );
  const benchUsable = benchAssessment.usable;

  const fundMonthly = math.toMonthEndSeries(windowDaily);
  const benchMonthly = benchUsable ? math.toMonthEndSeries(benchWindowDaily) : null;
  const table = buildMonthlyTable(fundMonthly, benchMonthly, riskFreeAnnual);
  const observationsMonthly = table.fund.length;

  // ── Gate 3: enough monthly observations for the row to mean anything? ────
  if (observationsMonthly < math.MIN_MONTHLY_OBSERVATIONS) {
    return emptyHorizon(
      asOf,
      horizonYears,
      benchmarkCode,
      'INSUFFICIENT_DATA',
      `monthly_observations_${observationsMonthly}_below_floor_${math.MIN_MONTHLY_OBSERVATIONS}`,
      observationsMonthly,
    );
  }

  const fs = new FieldStatus();

  // ── Returns (`02 §2`) ────────────────────────────────────────────────────
  const endPoint = navDaily[navDaily.length - 1]!;

  // SEBI convention (`02 §2.1` and the `MfReturnMetrics` doc comment): sub-1-year
  // and exactly-1-year performance is stated absolute, longer horizons
  // annualised. At one year the two numbers are arithmetically identical, so
  // reporting both would invite a reader to treat them as independent evidence;
  // the CAGR field is deliberately null there and statused `NOT_APPLICABLE`
  // via `not_applicable` — nothing is missing, it is simply not the field in
  // use, and the UI must not print it as a zero return.
  const isAbsoluteHorizon = horizonYears === 1;
  const cagrResult = isAbsoluteHorizon
    ? { value: null, reason: 'not_applicable' as const }
    : math.cagr(windowStart.value, endPoint.value, new Decimal(horizonYears));
  const absoluteResult = isAbsoluteHorizon
    ? math.absoluteReturn(windowStart.value, endPoint.value)
    : { value: null, reason: 'not_applicable' as const };

  const benchCagrResult = benchUsable
    ? math.horizonCagr(benchWindowDaily, asOf, horizonYears)
    : NO_BENCHMARK;

  // Rolling windows need history *before* the horizon start: a 3-year rolling
  // return stamped at the window's first date reads a NAV three years earlier.
  // Slicing to the horizon alone would silently drop every early observation
  // and skew the distribution toward the most recent years.
  const rollingFor = (window: 1 | 3 | 5): math.RollingStatsResult | null => {
    if (window > horizonYears) return null;
    const from = minusYears(windowFrom, window);
    return math.rollingReturns(
      sliceSeries(navDaily, from, asOf),
      window,
      benchUsable ? sliceSeries(benchmarkDaily, from, asOf) : null,
    );
  };
  const rolling1 = rollingFor(1);
  const rolling3 = rollingFor(3);
  const rolling5 = rollingFor(5);

  const fundCalendarYears = math.calendarYearReturns(windowDaily);
  const benchCalendarYears = benchUsable ? math.calendarYearReturns(benchWindowDaily) : [];
  const benchByYear = new Map(benchCalendarYears.map((r) => [r.year, r.value]));
  const calendarYears: MfCalendarYearRow[] = fundCalendarYears.map((row) => {
    const benchValue = benchByYear.get(row.year) ?? null;
    return {
      year: row.year,
      fund: serializeRatio(row.value),
      benchmark: benchValue === null ? null : serializeRatio(benchValue),
      // Category median, rank, universe size and quartile all need the peer
      // universe, which `mfPeerRank.service.ts` owns (`02 §6`). Null here is
      // "not computed by this module", never "the fund had no peers".
      categoryMedian: null,
      rank: null,
      universeSize: null,
      quartile: null,
    };
  });

  const returns = {
    cagr: fs.ratio('returns.cagr', cagrResult),
    absolute: fs.ratio('returns.absolute', absoluteResult),
    benchmarkCagr: fs.ratio('returns.benchmarkCagr', benchCagrResult),
    categoryMedianCagr: fs.missing('returns.categoryMedianCagr', 'no_data'),
    rolling1y: rolling1 === null
      ? fs.missing('returns.rolling1y', 'not_applicable')
      : toRollingStats(fs, 'returns.rolling1y', rolling1),
    rolling3y: rolling3 === null
      ? fs.missing('returns.rolling3y', 'not_applicable')
      : toRollingStats(fs, 'returns.rolling3y', rolling3),
    rolling5y: rolling5 === null
      ? fs.missing('returns.rolling5y', 'not_applicable')
      : toRollingStats(fs, 'returns.rolling5y', rolling5),
    calendarYears,
    sipXirr: fs.ratio('returns.sipXirr', math.hypotheticalSipXirr(windowDaily)),
  };

  // ── Risk (`02 §3`) ───────────────────────────────────────────────────────
  const drawdown = math.maxDrawdown(windowDaily);
  const stdDev = math.stdDevAnn(table.fund);
  const downsideDev = math.downsideDevAnn(table.fundRf, table.rf);

  const risk = {
    stdDevAnn: fs.ratio('risk.stdDevAnn', stdDev),
    downsideDevAnn: fs.ratio('risk.downsideDevAnn', downsideDev),
    maxDrawdown: fs.ratio('risk.maxDrawdown', drawdown.maxDrawdown),
    maxDrawdownDurationDays: fs.count(
      'risk.maxDrawdownDurationDays',
      drawdown.maxDrawdownDurationDays,
      'insufficient_observations',
    ),
    // `null` here means "has not recovered yet" — a fact, not a gap — so it is
    // recorded as `not_applicable` and statused OK rather than as missing data.
    recoveryDays: fs.count(
      'risk.recoveryDays',
      drawdown.recoveryDays,
      drawdown.recovered ? 'insufficient_observations' : 'not_applicable',
    ),
    worstMonth: fs.ratio('risk.worstMonth', math.worstMonth(table.fund)),
    bestMonth: fs.ratio('risk.bestMonth', math.bestMonth(table.fund)),
    worstCalendarYear: fs.ratio('risk.worstCalendarYear', math.worstCalendarYear(fundCalendarYears)),
    var95Monthly: fs.ratio('risk.var95Monthly', math.var95Monthly(table.fund)),
    cvar95Monthly: fs.ratio('risk.cvar95Monthly', math.cvar95Monthly(table.fund)),
    pctNegativeMonths: fs.ratio('risk.pctNegativeMonths', math.pctNegativeMonths(table.fund)),
  };

  // ── Risk-adjusted (`02 §4`) ──────────────────────────────────────────────
  const sharpeResult = math.sharpe(table.fundRf, table.rf);
  const betaResult = benchUsable
    ? math.beta(table.fundTriple, table.benchTriple, table.rfTriple)
    : NO_BENCHMARK;
  const benchStdDev = benchUsable ? math.stdDevAnn(table.bench) : NO_BENCHMARK;

  const riskAdjusted = {
    sharpe: fs.ratio('riskAdjusted.sharpe', sharpeResult),
    sortino: fs.ratio('riskAdjusted.sortino', math.sortino(table.fundRf, table.rf)),
    beta: fs.ratio('riskAdjusted.beta', betaResult),
    jensenAlphaAnn: fs.ratio(
      'riskAdjusted.jensenAlphaAnn',
      benchUsable
        ? math.jensenAlphaAnn(table.fundTriple, table.benchTriple, table.rfTriple)
        : NO_BENCHMARK,
    ),
    treynor: fs.ratio(
      'riskAdjusted.treynor',
      benchUsable ? math.treynor(table.fundRf, table.rf, betaResult.value) : NO_BENCHMARK,
    ),
    trackingErrorAnn: fs.ratio(
      'riskAdjusted.trackingErrorAnn',
      benchUsable ? math.trackingErrorAnn(table.fundVsBench, table.bench) : NO_BENCHMARK,
    ),
    informationRatio: fs.ratio(
      'riskAdjusted.informationRatio',
      benchUsable ? math.informationRatio(table.fundVsBench, table.bench) : NO_BENCHMARK,
    ),
    // Calmar pairs the horizon return with the horizon drawdown. At the 1-year
    // horizon the return lives in `absolute`, so that is the numerator there —
    // otherwise a one-year Calmar would be null for a reason that has nothing to
    // do with either input.
    calmar: fs.ratio(
      'riskAdjusted.calmar',
      math.calmar(
        (isAbsoluteHorizon ? absoluteResult.value : cagrResult.value) ?? null,
        drawdown.maxDrawdown.value,
      ),
    ),
    omega: fs.ratio('riskAdjusted.omega', math.omega(table.fundRf, table.rf)),
    m2: fs.ratio(
      'riskAdjusted.m2',
      benchUsable
        ? math.m2(sharpeResult.value, benchStdDev.value, table.meanAnnualRf)
        : NO_BENCHMARK,
    ),
  };

  // ── Benchmark-relative (`02 §5`) ─────────────────────────────────────────
  const upCaptureResult = benchUsable
    ? math.upCapture(table.fundVsBench, table.bench)
    : NO_BENCHMARK;
  const downCaptureResult = benchUsable
    ? math.downCapture(table.fundVsBench, table.bench)
    : NO_BENCHMARK;

  const relative = {
    upCapture: fs.ratio('relative.upCapture', upCaptureResult),
    downCapture: fs.ratio('relative.downCapture', downCaptureResult),
    captureRatio: fs.ratio(
      'relative.captureRatio',
      benchUsable
        ? math.captureRatio(upCaptureResult.value, downCaptureResult.value)
        : NO_BENCHMARK,
    ),
    battingAverage: fs.ratio(
      'relative.battingAverage',
      benchUsable ? math.battingAverage(table.fundVsBench, table.bench) : NO_BENCHMARK,
    ),
    outperformanceAnn: fs.ratio(
      'relative.outperformanceAnn',
      benchUsable
        ? math.outperformanceAnn(
            (isAbsoluteHorizon ? absoluteResult.value : cagrResult.value) ?? null,
            benchCagrResult.value,
          )
        : NO_BENCHMARK,
    ),
  };

  // ── Consistency (`02 §6`) ────────────────────────────────────────────────
  //
  // Only `rollingBeatBenchPct` is derivable without the peer universe: it is
  // `1 − pctBelowBenchmark` on the 3-year rolling distribution. Everything else
  // in this block needs category medians and quartiles, which
  // `mfPeerRank.service.ts` computes and writes.
  const beatBench =
    rolling3 !== null && rolling3.pctBelowBenchmark !== null
      ? math.metricOk(new Decimal(1).minus(rolling3.pctBelowBenchmark))
      : benchUsable
        ? math.metricUnavailable('insufficient_observations')
        : NO_BENCHMARK;

  const consistency = {
    rollingBeatBenchPct: fs.ratio('consistency.rollingBeatBenchPct', beatBench),
    rollingBeatCategoryPct: fs.missing('consistency.rollingBeatCategoryPct', 'no_data'),
    quartileHistory: [],
    quartileConsistency: fs.missing('consistency.quartileConsistency', 'no_data'),
    // A methodology declaration, not a measurement: the universes this layer
    // builds always include schemes that later merged or wound up (`02 §6`),
    // because excluding the dead funds would flatter every survivor. It is
    // stated here so the reader is not left to assume either way.
    survivorshipAdjusted: true,
  };

  // ── Row status ───────────────────────────────────────────────────────────
  //
  // Precedence, most fundamental first:
  //   1. INSUFFICIENT_DATA — the window is not covered, or too few months.
  //      (Both already returned above.)
  //   2. QUARANTINED — the window contains NAV rows the ingest validator
  //      rejected (`01 §6`). The metrics ARE computed from the surviving rows,
  //      because a single bad print should not blank a ten-year history; but the
  //      status says so, which is what "surface it, do not silently compute
  //      around it" requires. A consumer that treats QUARANTINED as unusable is
  //      free to; a consumer that shows the numbers must show the caveat.
  //   3. BENCHMARK_UNAVAILABLE — absolute metrics are fine, relative ones are
  //      null. Ranked below QUARANTINED because a benchmark gap says nothing
  //      about the fund's own data quality.
  //   4. OK.
  const quarantinedInWindow = inputs.quarantinedDates.filter(
    (d) => d.getTime() >= windowFrom.getTime() && d.getTime() <= asOf.getTime(),
  );

  let status: MfMetricStatus = 'OK';
  let statusReason: string | undefined;
  if (quarantinedInWindow.length > 0) {
    status = 'QUARANTINED';
    statusReason = `${quarantinedInWindow.length}_quarantined_nav_rows_in_window_from_${
      quarantinedInWindow[0]!.toISOString().slice(0, 10)
    }`;
  } else if (!benchUsable) {
    status = 'BENCHMARK_UNAVAILABLE';
    statusReason =
      benchmarkCode === null
        ? 'no_benchmark_index_code'
        : benchWindowDaily.length === 0
          ? `no_${benchmarkCode}_prices_in_window`
          : `benchmark_gap_${benchAssessment.maxGapBusinessDays}_business_days`;
  }

  return {
    asOf: asOf.toISOString().slice(0, 10),
    horizonYears,
    observationsMonthly,
    status,
    statusReason,
    benchmarkCode,
    riskFreeSeries: RISK_FREE_SERIES,
    mathVersion: math.MF_METRICS_MATH_VERSION,
    returns,
    risk,
    riskAdjusted,
    relative,
    consistency,
    fieldStatus: fs.snapshot(),
  };
}

// ---------------------------------------------------------------------------
// Horizon 0 — current portfolio + structural profile (`02 §7-8`)
// ---------------------------------------------------------------------------

function toHoldingRows(snapshot: SnapshotWithHoldings): HoldingWeightRow[] {
  return snapshot.holdings.map((h) => ({
    isin: h.isin,
    securityName: h.securityName,
    issuer: h.issuer,
    weightPct: toDecimal(h.weightPct),
    kind: h.kind,
    sector: h.sector,
    marketCapBucket:
      h.marketCapBucket === 'LARGE' || h.marketCapBucket === 'MID' || h.marketCapBucket === 'SMALL'
        ? h.marketCapBucket
        : null,
    creditRating: h.creditRating,
    ytmPct: h.ytmPct === null ? null : toDecimal(h.ytmPct),
    // The feed gives a maturity date, the math wants years-to-maturity. Measured
    // from the snapshot date, not `asOf`: a bond's remaining life at the time
    // the portfolio was disclosed is what that disclosure describes.
    maturityYears:
      h.maturityDate === null
        ? null
        : toDecimal(
            (h.maturityDate.getTime() - snapshot.asOf.getTime()) / MS_PER_DAY,
          ).dividedBy(365.25),
    modifiedDuration: null,
  }));
}

function computeProfile(inputs: SchemeInputs, asOf: Date): MfCurrentProfile {
  const fs = new FieldStatus();
  const { meta, latestSnapshot } = inputs;
  const asOfIso = asOf.toISOString().slice(0, 10);

  // ── Structural block (`02 §8`) — available with or without a snapshot ────
  //
  // Deliberately computed before the early return below: TER, AUM, manager
  // tenure and fund age come from the meta tables and are perfectly knowable
  // for a scheme that has never disclosed a portfolio. Blanking them along with
  // the holdings would be the "render ₹0 where the truth is unknown" failure in
  // reverse — hiding data we have.
  const terPct = fs.pct(
    'terPct',
    inputs.terPct === null ? { value: null, reason: 'no_data' } : math.metricOk(inputs.terPct),
  );
  const aum = fs.money('aum', inputs.aumNow, 'no_data');
  const aumGrowth = fs.pct('aumGrowth12mPct', math.aumGrowth12mPct(inputs.aumNow, inputs.aum12mAgo));

  const currentManagers = inputs.managers.filter((m) => m.toDate === null);
  // "Lead" first when the feed labels roles; otherwise the earliest start date,
  // which is the manager whose tenure the fund is actually judged on.
  const leadManager =
    currentManagers.find((m) => (m.role ?? '').toLowerCase().includes('lead')) ??
    currentManagers[0] ??
    null;
  const managerTenure = fs.ratio(
    'managerTenureYears',
    leadManager === null
      ? { value: null, reason: 'no_data' }
      : math.managerTenureYears(leadManager.fromDate, asOf),
  );
  const changeWindowStart = minusYears(asOf, MANAGER_CHANGE_LOOKBACK_YEARS);
  const managerChangesLast3y = inputs.managers.filter(
    (m) =>
      m.toDate !== null &&
      m.toDate.getTime() >= changeWindowStart.getTime() &&
      m.toDate.getTime() <= asOf.getTime(),
  ).length;

  const fundAge = fs.ratio('fundAgeYears', math.fundAgeYears(meta.inceptionDate, asOf));
  const exitLoadMaxDays = fs.count('exitLoadMaxDays', parseExitLoadMaxDays(meta.exitLoadRules), 'no_data');

  const structural = {
    terPct,
    // Both need the category universe (`mfPeerRank.service.ts`). Null with a
    // status, never a placeholder percentile.
    terCategoryMedianPct: fs.missing('terCategoryMedianPct', 'no_data') as Pct | null,
    terPercentile: fs.missing('terPercentile', 'no_data') as Ratio | null,
    aum,
    aumGrowth12mPct: aumGrowth,
    aumCategoryPercentile: fs.missing('aumCategoryPercentile', 'no_data') as Ratio | null,
    managerTenureYears: managerTenure,
    managerChangesLast3y,
    currentManagers: currentManagers.map((m) => ({
      name: m.managerName,
      role: m.role,
      fromDate: m.fromDate.toISOString().slice(0, 10),
    })),
    fundAgeYears: fundAge,
    exitLoadMaxDays,
  };

  if (latestSnapshot === null) {
    // No portfolio disclosure at all. Every portfolio characteristic is null
    // WITH a status — a fund with no snapshot has not got 0% cash, 0 holdings
    // and an HHI of 0, which is what a naive zero-fill would assert.
    return {
      asOf: asOfIso,
      snapshotAsOf: null,
      status: 'INSUFFICIENT_DATA',
      statusReason: 'no_portfolio_snapshot',
      numHoldings: fs.count('numHoldings', null, 'no_data'),
      top10WeightPct: fs.pct('top10WeightPct', { value: null, reason: 'no_data' }),
      hhi: fs.ratio('hhi', { value: null, reason: 'no_data' }),
      effectiveHoldings: fs.ratio('effectiveHoldings', { value: null, reason: 'no_data' }),
      cashPct: fs.pct('cashPct', { value: null, reason: 'no_data' }),
      activeShare: fs.ratio('activeShare', { value: null, reason: 'benchmark_unavailable' }),
      marketCapSplit: fs.missing('marketCapSplit', 'no_data'),
      sectorWeights: fs.missing('sectorWeights', 'no_data'),
      sectorActiveWeights: fs.missing('sectorActiveWeights', 'benchmark_unavailable'),
      turnoverPct: fs.pct('turnoverPct', { value: null, reason: 'no_data' }),
      turnoverIsEstimated: true,
      styleBox: fs.missing('styleBox', 'no_data'),
      styleDrift: fs.ratio('styleDrift', { value: null, reason: 'no_data' }),
      topHoldings: [],
      modifiedDuration: fs.ratio('modifiedDuration', { value: null, reason: 'no_data' }),
      durationIsApproximated: true,
      averageMaturityYears: fs.ratio('averageMaturityYears', { value: null, reason: 'no_data' }),
      ytmPct: fs.pct('ytmPct', { value: null, reason: 'no_data' }),
      creditQualitySplit: fs.missing('creditQualitySplit', 'no_data'),
      belowAAPct: fs.pct('belowAAPct', { value: null, reason: 'no_data' }),
      topIssuerPct: fs.pct('topIssuerPct', { value: null, reason: 'no_data' }),
      ...structural,
      fieldStatus: fs.snapshot(),
    };
  }

  const rows = toHoldingRows(latestSnapshot);
  // Cash and derivatives are excluded from "holdings" everywhere below. `02 §7`
  // writes the count as "kind = EQUITY (or DEBT)", which is category-dependent
  // and breaks for a hybrid that holds both; excluding the two sleeves that are
  // never securities is the part of that definition which holds for every
  // category, and it keeps a 40-stock fund from reading as 42 because it parked
  // cash in two places.
  const securityRows = rows.filter((r) => r.kind !== 'CASH' && r.kind !== 'DERIVATIVE');
  const equityRows = securityRows.filter((r) => r.kind === 'EQUITY');
  const debtRows = securityRows.filter((r) => r.kind === 'DEBT');

  const hhiResult = math.hhi(securityRows);
  const capSplit = math.marketCapSplit(equityRows);

  const sectorWeights = buildSectorWeights(securityRows);
  const styleBox = buildStyleBox(capSplit);

  const topHoldings: MfTopHolding[] = [...latestSnapshot.holdings]
    .filter((h) => h.kind !== 'CASH' && h.kind !== 'DERIVATIVE')
    .sort((a, b) => {
      const cmp = toDecimal(b.weightPct).comparedTo(toDecimal(a.weightPct));
      // Deterministic tie-break — two holdings at exactly 2.5% must not swap
      // places between runs, or the "same inputs twice ⇒ identical JSON"
      // invariant (`02 §10.9`) fails on row order alone.
      return cmp !== 0 ? cmp : a.securityName.localeCompare(b.securityName);
    })
    .slice(0, 10)
    .map((h) => ({
      isin: h.isin,
      securityName: h.securityName,
      kind: h.kind,
      weightPct: serializePct(toDecimal(h.weightPct)),
      sector: h.sector,
      marketCapBucket:
        h.marketCapBucket === 'LARGE' || h.marketCapBucket === 'MID' || h.marketCapBucket === 'SMALL'
          ? h.marketCapBucket
          : null,
    }));

  // Turnover needs an AUM beside each snapshot (weights alone cannot tell a
  // top-up from a price move). Snapshots with no AUM within reach are dropped
  // rather than defaulted, which can leave fewer than two and yield null.
  const turnoverInputs: math.PortfolioSnapshotInput[] = [];
  for (const snap of inputs.snapshotHistory) {
    const aumAt = lastAtOrBefore(inputs.aumSeries, startOfDayUtc(snap.asOf).getTime());
    if (aumAt === null) continue;
    turnoverInputs.push({
      asOf: startOfDayUtc(snap.asOf),
      aum: aumAt.value,
      holdings: toHoldingRows(snap),
    });
  }

  // `02 §7`: use the AMC-disclosed modified duration when the feed carries one,
  // otherwise weight it from holding maturities and flag the approximation.
  // `MfPortfolioHolding` has no duration column today, so in practice this
  // always takes the fallback — but the order is written the right way round so
  // that populating the column later changes the number, not the code.
  const disclosedDuration = math.weightedModifiedDuration(debtRows);
  const modifiedDurationResult =
    disclosedDuration.value !== null ? disclosedDuration : math.weightedAverageMaturity(debtRows);

  const snapshotAgeDays = calendarDaysBetween(startOfDayUtc(latestSnapshot.asOf), asOf);
  const stale = snapshotAgeDays > HOLDINGS_STALE_AFTER_DAYS;

  return {
    asOf: asOfIso,
    snapshotAsOf: latestSnapshot.asOf.toISOString().slice(0, 10),
    status: stale ? 'STALE' : 'OK',
    statusReason: stale ? `snapshot_${snapshotAgeDays}_days_old` : undefined,

    numHoldings: securityRows.length,
    top10WeightPct: fs.pct('top10WeightPct', math.top10Weight(securityRows)),
    hhi: fs.ratio('hhi', hhiResult),
    effectiveHoldings: fs.ratio('effectiveHoldings', math.effectiveHoldings(hhiResult.value)),
    cashPct: fs.pct('cashPct', math.metricOk(toDecimal(latestSnapshot.cashPct))),
    // Active share and sector active weights both need the benchmark's
    // constituents, which no table in this repo carries yet. Reported as
    // BENCHMARK_UNAVAILABLE (`02 §7` names that status for exactly this case)
    // rather than as an absent field.
    activeShare: fs.ratio('activeShare', { value: null, reason: 'benchmark_unavailable' }),
    marketCapSplit: toMarketCapSplit(fs, capSplit),
    sectorWeights: sectorWeights ?? fs.missing('sectorWeights', 'no_data'),
    sectorActiveWeights: fs.missing('sectorActiveWeights', 'benchmark_unavailable'),
    turnoverPct: fs.pct('turnoverPct', math.turnoverPct(turnoverInputs)),
    turnoverIsEstimated: true,
    styleBox: styleBox ?? fs.missing('styleBox', 'no_data'),
    // The SEBI mandate bands per sub-category are not modelled anywhere in the
    // repo yet, and `styleDrift` is meaningless without the band it is measured
    // against — inventing a default band would manufacture drift.
    styleDrift: fs.ratio('styleDrift', { value: null, reason: 'no_data' }),
    topHoldings,

    // ── Debt-only (`02 §7`) ───────────────────────────────────────────────
    //
    // `MfPortfolioHolding` carries no disclosed modified duration, so it is
    // weighted from holding maturities per the doc's fallback and flagged
    // `durationIsApproximated` — the rules layer must not treat it as fact.
    modifiedDuration: fs.ratio('modifiedDuration', modifiedDurationResult),
    durationIsApproximated: true,
    averageMaturityYears: fs.ratio('averageMaturityYears', math.weightedAverageMaturity(debtRows)),
    ytmPct: fs.pct('ytmPct', math.weightedYtm(debtRows)),
    creditQualitySplit: toCreditQualitySplit(fs, debtRows),
    belowAAPct: fs.pct('belowAAPct', math.belowAAPct(debtRows)),
    topIssuerPct: fs.pct('topIssuerPct', math.topIssuerPct(debtRows)),

    ...structural,
    fieldStatus: fs.snapshot(),
  };
}

function toMarketCapSplit(fs: FieldStatus, split: math.MarketCapSplitResult): MfMarketCapSplit | null {
  if (split.large === null) return fs.missing('marketCapSplit', 'no_data');
  return {
    large: serializePct(split.large),
    mid: split.mid === null ? null : serializePct(split.mid),
    small: split.small === null ? null : serializePct(split.small),
    unclassified: split.unclassified === null ? null : serializePct(split.unclassified),
  };
}

function toCreditQualitySplit(
  fs: FieldStatus,
  debtRows: readonly HoldingWeightRow[],
): MfCreditQualitySplit | null {
  const split = math.creditQualitySplit(debtRows);
  if (split.sov === null) return fs.missing('creditQualitySplit', 'no_data');
  return {
    sov: serializePct(split.sov),
    aaa: split.aaa === null ? null : serializePct(split.aaa),
    aaPlus: split.aaPlus === null ? null : serializePct(split.aaPlus),
    aa: split.aa === null ? null : serializePct(split.aa),
    aaMinus: split.aaMinus === null ? null : serializePct(split.aaMinus),
    aAndBelow: split.aAndBelow === null ? null : serializePct(split.aAndBelow),
    unrated: split.unrated === null ? null : serializePct(split.unrated),
  };
}

/**
 * Sector weights over the security sleeve. Holdings with no sector are omitted
 * from the map rather than bucketed as "Unknown": the map's own total is then
 * visibly short of the portfolio, which is the honest signal, whereas an
 * "Unknown" slice invites the reader to treat it as a sector allocation.
 */
function buildSectorWeights(rows: readonly HoldingWeightRow[]): Record<string, Pct> | null {
  const acc = new Map<string, Decimal>();
  for (const row of rows) {
    const sector = row.sector?.trim();
    if (!sector) continue;
    acc.set(sector, (acc.get(sector) ?? new Decimal(0)).plus(row.weightPct));
  }
  if (acc.size === 0) return null;
  const out: Record<string, Pct> = {};
  // Sorted so the serialised JSON is byte-identical across runs (`02 §10.9`).
  for (const key of [...acc.keys()].sort()) out[key] = serializePct(acc.get(key)!);
  return out;
}

/**
 * `02 §7`: the cap axis of the style box, from the AMFI split. The value/growth
 * axis needs weighted P/B and P/E against universe medians, which requires
 * fundamentals on `StockMaster` that are not populated — so this is the
 * documented "cap-only 1×3 box" fallback, with `style: null` rather than a
 * guessed BLEND.
 */
function buildStyleBox(
  split: math.MarketCapSplitResult,
): { cap: 'LARGE' | 'MID' | 'SMALL'; style: 'VALUE' | 'BLEND' | 'GROWTH' | null } | null {
  if (split.large === null || split.mid === null || split.small === null) return null;
  let cap: 'LARGE' | 'MID' | 'SMALL' = 'LARGE';
  let best = split.large;
  if (split.mid.greaterThan(best)) {
    cap = 'MID';
    best = split.mid;
  }
  if (split.small.greaterThan(best)) {
    cap = 'SMALL';
    best = split.small;
  }
  // An all-zero split (a pure debt fund's equity sleeve) has no cap at all.
  if (best.lessThanOrEqualTo(0)) return null;
  return { cap, style: null };
}

/** `02 §8`: longest exit-load tier, from the parsed `[{ daysUpTo, pct }]` ladder. */
function parseExitLoadMaxDays(rules: Prisma.JsonValue | null): number | null {
  if (!Array.isArray(rules)) return null;
  let max: number | null = null;
  for (const rule of rules) {
    if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) continue;
    const days = (rule as Record<string, unknown>).daysUpTo;
    if (typeof days !== 'number' || !Number.isFinite(days)) continue;
    if (max === null || days > max) max = days;
  }
  return max;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface SchemeMetricsResult {
  schemeCode: string;
  asOf: Date;
  benchmarkCode: string | null;
  riskFreeSeries: string;
  mathVersion: string;
  /** One entry per `MF_HORIZONS`, in that order. */
  horizons: MfHorizonMetrics[];
  /** The `horizonYears = 0` row (`02 §7`). */
  profile: MfCurrentProfile;
}

/**
 * Compute every metrics row for one scheme at one `asOf`.
 *
 * Pure with respect to the database in one direction only: it reads, it never
 * writes. Persistence is the job's business (`mfMetricsJob.ts`), which keeps
 * this callable from an API handler for an ad-hoc `asOf` without side effects.
 */
export async function computeMetricsForScheme(
  schemeCode: string,
  asOf: Date,
): Promise<SchemeMetricsResult> {
  const day = startOfDayUtc(asOf);
  const inputs = await loadSchemeInputs(schemeCode, day);

  return {
    schemeCode,
    asOf: day,
    benchmarkCode: inputs.benchmarkCode,
    riskFreeSeries: RISK_FREE_SERIES,
    mathVersion: math.MF_METRICS_MATH_VERSION,
    horizons: MF_HORIZONS.map((h) => computeHorizon(inputs, day, h)),
    profile: computeProfile(inputs, day),
  };
}

/**
 * Persist one scheme's rows, upserting on `(schemeCode, asOf, horizonYears)`.
 *
 * Idempotent by construction (`01 §5`): a re-run on the same day rewrites
 * identical content, which is why the job can be retried without a guard. Not
 * wrapped in a transaction — `MfSchemeMetrics` is reference data with no
 * cross-row invariant, and six independent upserts that partially succeed leave
 * a coherent (if incomplete) state that the next run repairs. Were an atomic
 * commit ever needed it must be `runInTransaction` from `lib/prisma.ts`, never
 * `prisma.$transaction`, which is not atomic under the RLS hook.
 */
export async function persistSchemeMetrics(result: SchemeMetricsResult): Promise<number> {
  const rows: Array<{ horizonYears: number; status: MfMetricStatus; statusReason?: string; payload: unknown }> =
    [
      ...result.horizons.map((h) => ({
        horizonYears: h.horizonYears as number,
        status: h.status,
        statusReason: h.statusReason,
        payload: h,
      })),
      {
        horizonYears: 0,
        status: result.profile.status,
        statusReason: result.profile.statusReason,
        payload: result.profile,
      },
    ];

  for (const row of rows) {
    const data = {
      status: row.status,
      statusReason: row.statusReason ?? null,
      metrics: row.payload as Prisma.InputJsonValue,
      benchmarkCode: result.benchmarkCode,
      riskFreeSeries: result.riskFreeSeries,
      mathVersion: result.mathVersion,
      computedAt: new Date(),
    };
    await prisma.mfSchemeMetrics.upsert({
      where: {
        schemeCode_asOf_horizonYears: {
          schemeCode: result.schemeCode,
          asOf: result.asOf,
          horizonYears: row.horizonYears,
        },
      },
      create: {
        schemeCode: result.schemeCode,
        asOf: result.asOf,
        horizonYears: row.horizonYears,
        ...data,
      },
      update: data,
    });
  }

  return rows.length;
}
