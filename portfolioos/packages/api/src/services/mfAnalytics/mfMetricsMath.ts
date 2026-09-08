/**
 * Pure metric mathematics for the mutual fund analytics layer
 * (`docs/mf-analytics/02-METRICS.md`).
 *
 * **This module is deliberately sterile.** No I/O, no Prisma, no imports from
 * sibling services, no clock, no randomness. It imports `@portfolioos/shared`
 * and `decimal.js` and nothing else. `06-QUALITY-COMPLIANCE.md §1` enforces the
 * same shape on the rules layer (`mf-rules-pure`), and the reason is the same
 * here: every number this file produces has to be reproducible from a fixture
 * alone, forever, or the reconciliation job and the backtest have nothing to
 * compare against. The moment a metric can only be reproduced by standing up a
 * database, "our 3-year Sharpe was 1.12 on 2024-03-31" stops being a checkable
 * claim.
 *
 * Three conventions run through the file.
 *
 * 1. **Decimal in, `Decimal | null` out.** Never a JS number for anything with
 *    a unit (CONTEXT.md §3.1). The exceptions are genuine integer counts —
 *    observation counts, day differences, array indices — which carry no
 *    precision risk and are typed `number` on purpose.
 *
 * 2. **A metric that cannot be computed is `null`, never `0`.** Zero is a real
 *    Sharpe ratio and a real alpha. Using it to mean "we don't know" is how a
 *    fund with no benchmark ends up displayed as a fund with no skill. Every
 *    scalar metric returns `MetricResult` — `{ value, reason? }` — so the
 *    service layer can set `statusReason` without re-deriving why.
 *
 * 3. **Every division is guarded.** A denominator whose absolute value is below
 *    `EPSILON` yields `null` with reason `degenerate_denominator`, never
 *    `Infinity` and never `NaN`. `02 §4` names this case explicitly; an
 *    information ratio of `Infinity` rendered in a UI reads as "infinitely
 *    good" rather than "the tracking error was zero".
 */

import {
  Decimal,
  toDecimal,
  sipXirr,
  type XirrFlow,
} from '@portfolioos/shared';

// `02 §1`: set once, at module load, before any constant below is computed.
//
// This is global decimal.js configuration, not module-local — decimal.js has no
// per-call precision. 28 significant digits is what the spec asks for and it
// only ever makes division, `sqrt` and fractional `pow` *more* accurate; the
// serialisers still round to 6 dp (`serializeRatio`) or 4 dp (`serializeMoney`),
// so nothing downstream changes shape. Constructing a Decimal from a string is
// unaffected by precision, so existing money paths are untouched.
Decimal.set({ precision: 28 });

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

/**
 * Why a metric is missing. These strings are carried verbatim into
 * `MfHorizonMetrics.statusReason`, which is why they are a closed union rather
 * than free text: `05-FINDINGS-ENGINE.md` rules branch on them, and a typo in a
 * reason string would silently disable a rule instead of failing a build.
 */
export type MetricUnavailableReason =
  /** The input series was empty or had no usable points at all. */
  | 'no_data'
  /** Fewer observations than the metric's floor (`02 §1`). */
  | 'insufficient_observations'
  /** Denominator below `EPSILON` — `02 §4` names this case. */
  | 'degenerate_denominator'
  /** Benchmark series absent, or gapped beyond `MAX_BENCHMARK_GAP_BUSINESS_DAYS`. */
  | 'benchmark_unavailable'
  /** Two series were passed with different lengths; the caller must align them. */
  | 'misaligned_series'
  /** Input outside the metric's domain (negative NAV, end before start, …). */
  | 'out_of_range'
  /** The metric is defined but suppressed here on purpose (beta <= 0.1 for Treynor). */
  | 'not_applicable'
  /** The XIRR solver did not converge. */
  | 'no_convergence';

/**
 * The single result shape for every scalar metric in this module.
 *
 * A discriminated `{ ok: true } | { ok: false }` union was the alternative and
 * was rejected: half the call sites want to write the value straight into a DTO
 * field that is already `Ratio | null`, and a union forces a narrowing branch at
 * every one of them. `value: null` plus a reason gives the same information with
 * no ceremony, and makes "forgot to check" fail as a null rather than as a
 * plausible zero.
 */
export interface MetricResult {
  value: Decimal | null;
  reason?: MetricUnavailableReason;
}

export function metricOk(value: Decimal): MetricResult {
  return { value };
}

export function metricUnavailable(reason: MetricUnavailableReason): MetricResult {
  return { value: null, reason };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The degenerate-denominator threshold from `02 §4`. Anything smaller and the
 * quotient is dominated by the noise in the denominator rather than by the
 * relationship the metric is supposed to measure.
 */
export const EPSILON = new Decimal('1e-9');

/** `02 §1`: monthly metrics need at least a year of observations. */
export const MIN_MONTHLY_OBSERVATIONS = 12;

/**
 * `02 §1`: Sharpe / Sortino / alpha / beta need three years. Below that the
 * estimate is dominated by whichever market regime the window happened to
 * catch — the same reason `MIN_RATING_HISTORY_MONTHS` is 36.
 */
export const MIN_RISK_ADJUSTED_OBSERVATIONS = 36;

/**
 * A rolling-return distribution described by fewer windows than this is a point
 * estimate wearing a distribution's clothes — reporting a p10 and a p90 from
 * three observations invites the reader to treat noise as a range.
 */
export const MIN_ROLLING_OBSERVATIONS = 12;

/**
 * `02 §1`: a benchmark index gapped by more than five business days inside the
 * window is not usable for relative metrics. A gap does not merely lose
 * observations — the month-end carry-forward silently manufactures a 0% month
 * for the index and a real one for the fund, which shows up as alpha.
 */
export const MAX_BENCHMARK_GAP_BUSINESS_DAYS = 5;

/**
 * `02 §1`: the window start is `asOf − N years` exactly; if there is no NAV that
 * day, the nearest prior one within seven days. Seven rather than three because
 * Indian markets close for stretches (Diwali plus a weekend plus a state
 * holiday), and rejecting a 10-year horizon over a festival is worse than
 * starting it a day early.
 */
export const WINDOW_START_TOLERANCE_DAYS = 7;

/** `02 §2.4`: the hypothetical SIP instalment. Fixed so the figure is comparable across funds. */
export const HYPOTHETICAL_SIP_INSTALMENT_INR = new Decimal('10000');

/**
 * Bumped whenever a formula here changes in a way that moves a published
 * number. `MfHorizonMetrics.mathVersion` carries it so a metrics row computed
 * last month can be told apart from one computed under a new definition, rather
 * than being silently compared against it.
 */
export const MF_METRICS_MATH_VERSION = '1.0.0';

const TWELVE = new Decimal(12);
/** Computed after `Decimal.set` so it carries the full 28 digits. */
const SQRT_12 = TWELVE.sqrt();
const ZERO = new Decimal(0);
const ONE = new Decimal(1);
const HUNDRED = new Decimal(100);
const MS_PER_DAY = 86_400_000;
/** Julian year. Used for age/tenure only, never for return compounding. */
const DAYS_PER_YEAR = new Decimal('365.25');

// ---------------------------------------------------------------------------
// Core series types
// ---------------------------------------------------------------------------

/**
 * One dated observation. Used for NAVs, index levels, risk-free rates and
 * returns alike — they are all "a Decimal on a date" and giving each its own
 * interface only creates four identical alignment helpers.
 */
export interface SeriesPoint {
  date: Date;
  value: Decimal;
}

/** A period return stamped with the date the period ended. */
export type ReturnPoint = SeriesPoint;

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

/**
 * The only division in this file. Everything else calls through here so that
 * the guard cannot be forgotten at a single call site — which is exactly how an
 * `Infinity` reaches a UI.
 */
function safeDivide(numerator: Decimal, denominator: Decimal): Decimal | null {
  if (denominator.abs().lessThan(EPSILON)) return null;
  return numerator.dividedBy(denominator);
}

function sum(xs: readonly Decimal[]): Decimal {
  let total = ZERO;
  for (const x of xs) total = total.plus(x);
  return total;
}

/** Caller guarantees a non-empty array; every public entry point checks first. */
function mean(xs: readonly Decimal[]): Decimal {
  return sum(xs).dividedBy(xs.length);
}

/**
 * Sample variance (n − 1), not population.
 *
 * A NAV history is a sample of the process that generated it, not the whole
 * population of possible months, and Morningstar / Value Research both publish
 * sample figures. Choosing population here would make our σ read ~1.7% low at
 * 36 observations, which is inside the ±0.1 pp reconciliation tolerance in
 * `06 §2` for high-volatility funds only by luck.
 */
function sampleVariance(xs: readonly Decimal[]): Decimal | null {
  if (xs.length < 2) return null;
  const m = mean(xs);
  let acc = ZERO;
  for (const x of xs) {
    const d = x.minus(m);
    acc = acc.plus(d.times(d));
  }
  return acc.dividedBy(xs.length - 1);
}

/** Sample covariance (n − 1), matching `sampleVariance` so beta's n−1 cancels. */
function sampleCovariance(a: readonly Decimal[], b: readonly Decimal[]): Decimal | null {
  if (a.length !== b.length || a.length < 2) return null;
  const ma = mean(a);
  const mb = mean(b);
  let acc = ZERO;
  for (let i = 0; i < a.length; i++) {
    acc = acc.plus(a[i]!.minus(ma).times(b[i]!.minus(mb)));
  }
  return acc.dividedBy(a.length - 1);
}

/**
 * Linear-interpolation percentile (the R-7 / Excel `PERCENTILE.INC` method) on
 * an ascending array.
 *
 * Chosen over nearest-rank because VaR at the 5th percentile of 36 monthly
 * observations lands between order statistics 2 and 3; nearest-rank would make
 * the figure jump discontinuously as a single month enters or leaves the
 * window, and a risk number that steps by 40 bp on a rolling window boundary
 * gets read as a change in the fund.
 */
function percentile(sortedAsc: readonly Decimal[], p: Decimal): Decimal | null {
  const n = sortedAsc.length;
  if (n === 0) return null;
  if (n === 1) return sortedAsc[0]!;
  const pos = p.times(n - 1);
  const lowIdx = pos.floor().toNumber();
  const highIdx = Math.min(lowIdx + 1, n - 1);
  const frac = pos.minus(lowIdx);
  const low = sortedAsc[lowIdx]!;
  const high = sortedAsc[highIdx]!;
  return low.plus(high.minus(low).times(frac));
}

function sortAscending(xs: readonly Decimal[]): Decimal[] {
  // `comparedTo` rather than a numeric subtraction: the comparator must be a
  // total order on Decimals, and subtracting then coercing would reintroduce
  // the float we spent this whole file avoiding.
  return [...xs].sort((a, b) => a.comparedTo(b));
}

/** Whole days between two instants. An integer count, hence a `number`. */
function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Weekdays strictly between two dates — i.e. how many trading days a gap in a
 * series *swallowed*. Fri → Mon is zero; Fri → Tue is one.
 *
 * Exchange holidays are not modelled: doing so would need a calendar table,
 * which is data, and this module takes none. The five-day threshold in
 * `MAX_BENCHMARK_GAP_BUSINESS_DAYS` is set with that slack in mind.
 */
function missingBusinessDaysBetween(from: Date, to: Date): number {
  let count = 0;
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor.getTime() < end) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/**
 * Index of the last point at or before `time`, or −1.
 *
 * Binary search rather than a linear scan because rolling returns call this
 * once per daily observation over a ten-year series — 2,500 lookups against
 * 2,500 points is the difference between a millisecond and a second per scheme,
 * multiplied by every scheme in the universe on the nightly job.
 */
function lastIndexAtOrBefore(series: readonly SeriesPoint[], time: number): number {
  let lo = 0;
  let hi = series.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid]!.date.getTime() <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

function endOfMonthUtc(year: number, monthIndex: number): Date {
  // Day 0 of the following month is the last day of this one.
  return new Date(Date.UTC(year, monthIndex + 1, 0));
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * The last completed month end at or before `asOf` — `asOf` itself when it is
 * already one.
 *
 * Monthly metrics are sampled at month ends (`toMonthEndSeries`), so an
 * N-year window running to an arbitrary `asOf` is not N years of monthly
 * observations. Ending 8 Sept, the window `2025-09-08 → 2026-09-08` contains
 * the month ends Sep-25 … Aug-26: twelve points, and therefore eleven
 * returns, one short of `MIN_MONTHLY_OBSERVATIONS`. Ending 31 Aug, the window
 * `2025-08-31 → 2026-08-31` starts *on* a month end, giving thirteen points
 * and twelve returns.
 *
 * The metrics cron runs nightly (`15 23 * * *`), so without anchoring, every
 * 1-year row is INSUFFICIENT_DATA on all ~29 non-month-end days of the month
 * and correct on the one day it happens to land on. Same NAV, same fund,
 * different answer depending on the calendar — and the failure is silent, a
 * horizon full of "not enough history" for a fund with thirteen years of it.
 *
 * Anchoring to month ends makes "1-year metrics as of 8 Sept" mean the last
 * twelve completed months, which is what a monthly-sampled window can honestly
 * report, and makes the result independent of which day the job ran.
 */
export function lastCompletedMonthEnd(asOf: Date): Date {
  const end = endOfMonthUtc(asOf.getUTCFullYear(), asOf.getUTCMonth());
  if (end.getTime() <= startOfDayUtc(asOf).getTime()) return end;
  // asOf falls before this month's end — step back to the previous month.
  return endOfMonthUtc(asOf.getUTCFullYear(), asOf.getUTCMonth() - 1);
}

// ---------------------------------------------------------------------------
// §1 — Series builders
// ---------------------------------------------------------------------------

/**
 * Normalise raw NAV / index rows into the canonical daily series: ascending by
 * date, one point per calendar day, non-positive values dropped.
 *
 * This does **not** fill gaps. A NAV series has no observations on weekends and
 * holidays and inventing them would fabricate zero-return days that flatter
 * volatility. Gap *detection* is `maxGapBusinessDays` / `assessBenchmarkSeries`;
 * gap *handling* is a service-layer decision (quarantine, or
 * `BENCHMARK_UNAVAILABLE`).
 *
 * Non-positive NAVs are dropped rather than kept: a zero NAV is always a feed
 * error, and keeping it would produce a −100% day, which then becomes the
 * fund's maximum drawdown of record.
 */
export function toDailySeries(raw: readonly SeriesPoint[]): SeriesPoint[] {
  const byDay = new Map<number, SeriesPoint>();
  for (const point of raw) {
    if (Number.isNaN(point.date.getTime())) continue;
    if (!point.value.isFinite() || point.value.lessThanOrEqualTo(0)) continue;
    const day = startOfDayUtc(point.date);
    // Last row wins for a duplicated date. Feeds re-publish corrections under
    // the same date, and the correction is always the later row.
    byDay.set(day.getTime(), { date: day, value: point.value });
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, point]) => point);
}

/**
 * Month-end series: for every complete month spanned by the daily series, the
 * last available NAV on or before that month end (`02 §1`).
 *
 * Two decisions worth stating, because both look wrong without context.
 *
 * **The point is stamped with the canonical month end, not the NAV's own date.**
 * A fund's last January NAV might be the 30th while its benchmark's is the 31st.
 * Stamping actual dates would make the two series fail to align on any join,
 * and every benchmark-relative metric would silently lose observations. The
 * value is the fund's, the date is the calendar's.
 *
 * **A partial trailing month is excluded.** If the series ends on the 12th, the
 * literal reading of "last NAV on or before the month end" would use the 12th's
 * NAV as that month's close and produce a twelve-day return presented as a
 * month. Volatility computed over a series with one short period at the end is
 * biased low, and the bias is invisible.
 */
export function toMonthEndSeries(daily: readonly SeriesPoint[]): SeriesPoint[] {
  if (daily.length === 0) return [];
  const first = daily[0]!.date;
  const lastTime = daily[daily.length - 1]!.date.getTime();

  const out: SeriesPoint[] = [];
  let year = first.getUTCFullYear();
  let monthIndex = first.getUTCMonth();

  for (;;) {
    const monthEnd = endOfMonthUtc(year, monthIndex);
    if (monthEnd.getTime() > lastTime) break;
    const idx = lastIndexAtOrBefore(daily, monthEnd.getTime());
    if (idx >= 0) out.push({ date: monthEnd, value: daily[idx]!.value });
    monthIndex += 1;
    if (monthIndex > 11) {
      monthIndex = 0;
      year += 1;
    }
  }
  return out;
}

/**
 * Forward-fill a weekly risk-free series (`TBILL_91D`) onto a set of month ends
 * (`02 §1`), returning one entry per month end, aligned by position.
 *
 * Returns `Array<Decimal | null>` rather than a filtered `SeriesPoint[]`
 * precisely so alignment survives: a month end before the first published rate
 * yields `null` in place, and Sharpe for that window is unavailable rather than
 * computed against a rate borrowed from the future. Back-filling the earliest
 * rate backwards would be the tempting alternative and is how a 2008 Sharpe
 * ends up computed against a 2011 T-bill.
 */
export function forwardFillRiskFree(
  weekly: readonly SeriesPoint[],
  monthEnds: readonly Date[],
): Array<Decimal | null> {
  const sorted = toDailySeries(weekly);
  return monthEnds.map((monthEnd) => {
    const idx = lastIndexAtOrBefore(sorted, monthEnd.getTime());
    return idx >= 0 ? sorted[idx]!.value : null;
  });
}

/**
 * Simple period returns, `r_t = V_t / V_{t−1} − 1` (`02 §1`).
 *
 * Simple rather than log because every downstream figure — capture ratios,
 * batting average, the CAGRs the user is shown — is defined on simple returns,
 * and mixing the two bases inside one metrics row is the classic source of a
 * Sharpe that cannot be reconciled against a published one.
 *
 * A period whose prior value is non-positive is omitted rather than treated as
 * a −100% return; `toDailySeries` should already have removed those, so this is
 * belt-and-braces for a caller that built the series by hand.
 */
export function toMonthlyReturns(series: readonly SeriesPoint[]): ReturnPoint[] {
  const out: ReturnPoint[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!;
    const curr = series[i]!;
    if (prev.value.abs().lessThan(EPSILON)) continue;
    out.push({ date: curr.date, value: curr.value.dividedBy(prev.value).minus(1) });
  }
  return out;
}

/**
 * `rf_m = (1 + rf_annual)^(1/12) − 1` (`02 §1`).
 *
 * Geometric de-annualisation, not `rf_annual / 12`: the arithmetic shortcut
 * overstates the monthly rate by ~1.5 bp at a 7% T-bill, which is small until
 * it is subtracted from 36 monthly returns and then annualised back up inside a
 * Sharpe ratio.
 *
 * Returns `null` for a rate at or below −100%, which is not a rate.
 */
export function annualisedRiskFreeToMonthly(annual: Decimal): Decimal | null {
  const base = ONE.plus(annual);
  if (base.lessThanOrEqualTo(0)) return null;
  return base.pow(ONE.dividedBy(TWELVE)).minus(1);
}

/** Vector form of `annualisedRiskFreeToMonthly`, preserving positional nulls. */
export function annualisedRiskFreeSeriesToMonthly(
  annuals: ReadonlyArray<Decimal | null>,
): Array<Decimal | null> {
  return annuals.map((a) => (a === null ? null : annualisedRiskFreeToMonthly(a)));
}

/**
 * Largest number of business days any single gap in the series swallowed.
 * Zero for a series with fewer than two points — "no gaps" is the honest
 * reading, and the observation-count floors catch the short series separately.
 */
export function maxGapBusinessDays(series: readonly SeriesPoint[]): number {
  let worst = 0;
  for (let i = 1; i < series.length; i++) {
    const gap = missingBusinessDaysBetween(series[i - 1]!.date, series[i]!.date);
    if (gap > worst) worst = gap;
  }
  return worst;
}

export interface BenchmarkAssessment {
  usable: boolean;
  maxGapBusinessDays: number;
  reason?: MetricUnavailableReason;
}

/**
 * `02 §1`: decide whether a benchmark series may back relative metrics at all.
 *
 * Kept separate from the metric functions on purpose. A gapped index does not
 * invalidate the fund's standard deviation, only the numbers computed *against*
 * the index, and a single combined "is this window OK" flag is how a benchmark
 * problem ends up suppressing absolute metrics too.
 */
export function assessBenchmarkSeries(
  series: readonly SeriesPoint[] | null | undefined,
  maxGap: number = MAX_BENCHMARK_GAP_BUSINESS_DAYS,
): BenchmarkAssessment {
  if (!series || series.length === 0) {
    return { usable: false, maxGapBusinessDays: 0, reason: 'benchmark_unavailable' };
  }
  const gap = maxGapBusinessDays(series);
  if (gap > maxGap) {
    return { usable: false, maxGapBusinessDays: gap, reason: 'benchmark_unavailable' };
  }
  return { usable: true, maxGapBusinessDays: gap };
}

export interface AlignedReturns {
  dates: Date[];
  a: Decimal[];
  b: Decimal[];
}

/**
 * Inner-join two return series on their period-end dates.
 *
 * An inner join, not a left join with zeros: a month the benchmark did not
 * report is a month we cannot compare, and substituting a 0% index return
 * manufactures alpha of exactly the fund's return for that month.
 */
export function alignReturns(
  a: readonly ReturnPoint[],
  b: readonly ReturnPoint[],
): AlignedReturns {
  const bByTime = new Map<number, Decimal>();
  for (const p of b) bByTime.set(p.date.getTime(), p.value);
  const out: AlignedReturns = { dates: [], a: [], b: [] };
  for (const p of a) {
    const match = bByTime.get(p.date.getTime());
    if (match === undefined) continue;
    out.dates.push(p.date);
    out.a.push(p.value);
    out.b.push(match);
  }
  return out;
}

/** Convenience: strip the dates off a return series. */
export function returnValues(points: readonly ReturnPoint[]): Decimal[] {
  return points.map((p) => p.value);
}

// ---------------------------------------------------------------------------
// §2 — Return metrics
// ---------------------------------------------------------------------------

/** `02 §2.1`: `(V_end / V_start)^(1/N) − 1`. */
export function cagr(navStart: Decimal, navEnd: Decimal, years: Decimal): MetricResult {
  if (years.lessThanOrEqualTo(0)) return metricUnavailable('out_of_range');
  if (navStart.abs().lessThan(EPSILON)) return metricUnavailable('degenerate_denominator');
  const growth = navEnd.dividedBy(navStart);
  // A negative growth factor has no real root at a fractional exponent. It also
  // cannot happen for a NAV, so it means the caller passed something that is
  // not a NAV.
  if (growth.lessThanOrEqualTo(0)) return metricUnavailable('out_of_range');
  return metricOk(growth.pow(ONE.dividedBy(years)).minus(1));
}

/** `02 §2.1`: SEBI convention — sub-1-year performance is stated absolute. */
export function absoluteReturn(navStart: Decimal, navEnd: Decimal): MetricResult {
  if (navStart.abs().lessThan(EPSILON)) return metricUnavailable('degenerate_denominator');
  return metricOk(navEnd.dividedBy(navStart).minus(1));
}

/**
 * `02 §1`: locate the NAV at `asOf − years`, accepting the nearest prior
 * observation within `WINDOW_START_TOLERANCE_DAYS`.
 *
 * Returning `null` when the series simply does not reach back that far is the
 * whole point: it is what turns "this fund is 24 months old" into a 3-year
 * horizon of `INSUFFICIENT_DATA` instead of a 3-year CAGR computed from its
 * inception NAV and quietly annualised as though it were three years.
 */
export function windowStartPoint(
  daily: readonly SeriesPoint[],
  asOf: Date,
  years: number,
  toleranceDays: number = WINDOW_START_TOLERANCE_DAYS,
): SeriesPoint | null {
  if (daily.length === 0) return null;
  const target = new Date(
    Date.UTC(asOf.getUTCFullYear() - years, asOf.getUTCMonth(), asOf.getUTCDate()),
  );
  const idx = lastIndexAtOrBefore(daily, target.getTime());
  if (idx < 0) return null;
  const candidate = daily[idx]!;
  if (calendarDaysBetween(candidate.date, target) > toleranceDays) return null;
  return candidate;
}

/**
 * Point-to-point CAGR over an N-year horizon ending at the series' last point,
 * or `null` when the history does not cover the window.
 */
export function horizonCagr(
  daily: readonly SeriesPoint[],
  asOf: Date,
  years: number,
): MetricResult {
  if (daily.length < 2) return metricUnavailable('insufficient_observations');
  const start = windowStartPoint(daily, asOf, years);
  if (start === null) return metricUnavailable('insufficient_observations');
  const endIdx = lastIndexAtOrBefore(daily, asOf.getTime());
  if (endIdx < 0) return metricUnavailable('no_data');
  return cagr(start.value, daily[endIdx]!.value, new Decimal(years));
}

/** The stat block behind `MfRollingStats` (`02 §2.2`). */
export interface RollingStatsResult {
  windowYears: number;
  observations: number;
  mean: Decimal | null;
  median: Decimal | null;
  min: Decimal | null;
  max: Decimal | null;
  p10: Decimal | null;
  p25: Decimal | null;
  p75: Decimal | null;
  p90: Decimal | null;
  pctNegative: Decimal | null;
  /** Null unless a benchmark daily series was supplied. */
  pctBelowBenchmark: Decimal | null;
  reason?: MetricUnavailableReason;
}

function emptyRollingStats(
  windowYears: number,
  reason: MetricUnavailableReason,
  observations = 0,
): RollingStatsResult {
  return {
    windowYears,
    observations,
    mean: null,
    median: null,
    min: null,
    max: null,
    p10: null,
    p25: null,
    p75: null,
    p90: null,
    pctNegative: null,
    pctBelowBenchmark: null,
    reason,
  };
}

/**
 * `02 §2.2`: rolling-window CAGRs at a daily step.
 *
 * These are the primary performance evidence in findings, because they describe
 * what a randomly-timed investor actually experienced rather than what the one
 * investor who bought on the window's start date did. Point-to-point return is
 * reported but never scored.
 *
 * The optional benchmark series produces `pctBelowBenchmark` from *the same
 * window ends*, which is the only comparison that means anything — comparing a
 * fund's 3-year rolling distribution against a benchmark's over different dates
 * measures the market, not the manager.
 */
export function rollingReturns(
  daily: readonly SeriesPoint[],
  windowYears: 1 | 3 | 5,
  benchmarkDaily?: readonly SeriesPoint[] | null,
): RollingStatsResult {
  if (daily.length < 2) return emptyRollingStats(windowYears, 'insufficient_observations');

  const windowDecimal = new Decimal(windowYears);
  const exponent = ONE.dividedBy(windowDecimal);
  const observations: Decimal[] = [];
  let belowBenchmark = 0;
  let comparable = 0;

  for (const point of daily) {
    const start = windowStartPoint(daily, point.date, windowYears);
    if (start === null) continue;
    if (start.value.abs().lessThan(EPSILON)) continue;
    const growth = point.value.dividedBy(start.value);
    if (growth.lessThanOrEqualTo(0)) continue;
    const rr = growth.pow(exponent).minus(1);
    observations.push(rr);

    if (benchmarkDaily && benchmarkDaily.length > 1) {
      const bEndIdx = lastIndexAtOrBefore(benchmarkDaily, point.date.getTime());
      const bStart = windowStartPoint(benchmarkDaily, point.date, windowYears);
      if (bEndIdx >= 0 && bStart !== null && bStart.value.abs().greaterThanOrEqualTo(EPSILON)) {
        const bGrowth = benchmarkDaily[bEndIdx]!.value.dividedBy(bStart.value);
        if (bGrowth.greaterThan(0)) {
          comparable++;
          if (rr.lessThan(bGrowth.pow(exponent).minus(1))) belowBenchmark++;
        }
      }
    }
  }

  if (observations.length < MIN_ROLLING_OBSERVATIONS) {
    return emptyRollingStats(windowYears, 'insufficient_observations', observations.length);
  }

  const sorted = sortAscending(observations);
  const negatives = observations.filter((r) => r.lessThan(0)).length;

  return {
    windowYears,
    observations: observations.length,
    mean: mean(observations),
    median: percentile(sorted, new Decimal('0.5')),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    p10: percentile(sorted, new Decimal('0.10')),
    p25: percentile(sorted, new Decimal('0.25')),
    p75: percentile(sorted, new Decimal('0.75')),
    p90: percentile(sorted, new Decimal('0.90')),
    pctNegative: new Decimal(negatives).dividedBy(observations.length),
    pctBelowBenchmark:
      comparable > 0 ? new Decimal(belowBenchmark).dividedBy(comparable) : null,
  };
}

export interface CalendarYearReturn {
  year: number;
  value: Decimal;
}

/**
 * `02 §2.3`: return for each *complete* calendar year the series covers.
 *
 * A year is complete only when the series both starts before its 1 January and
 * extends to at least its 31 December. A stub first year would otherwise appear
 * as a full-year figure in the calendar-returns table, which is the number
 * readers scan fastest and question least.
 */
export function calendarYearReturns(daily: readonly SeriesPoint[]): CalendarYearReturn[] {
  if (daily.length < 2) return [];
  const firstTime = daily[0]!.date.getTime();
  const lastTime = daily[daily.length - 1]!.date.getTime();
  const out: CalendarYearReturn[] = [];

  const firstYear = daily[0]!.date.getUTCFullYear();
  const lastYear = daily[daily.length - 1]!.date.getUTCFullYear();

  for (let year = firstYear; year <= lastYear; year++) {
    const priorClose = new Date(Date.UTC(year - 1, 11, 31));
    const close = new Date(Date.UTC(year, 11, 31));
    if (priorClose.getTime() < firstTime) continue;
    if (close.getTime() > lastTime) continue;
    const startIdx = lastIndexAtOrBefore(daily, priorClose.getTime());
    const endIdx = lastIndexAtOrBefore(daily, close.getTime());
    if (startIdx < 0 || endIdx < 0) continue;
    const start = daily[startIdx]!.value;
    if (start.abs().lessThan(EPSILON)) continue;
    out.push({ year, value: daily[endIdx]!.value.dividedBy(start).minus(1) });
  }
  return out;
}

/** `02 §3`: the worst of the calendar years produced above. */
export function worstCalendarYear(rows: readonly CalendarYearReturn[]): MetricResult {
  if (rows.length === 0) return metricUnavailable('no_data');
  let worst = rows[0]!.value;
  for (const row of rows) if (row.value.lessThan(worst)) worst = row.value;
  return metricOk(worst);
}

/**
 * `02 §2.4`: XIRR of a hypothetical monthly SIP — a fixed instalment on the
 * first available NAV date of each month, redeemed at the terminal NAV.
 *
 * Hypothetical, and identical across funds, so the figure isolates the NAV path
 * from the user's own timing. The user's *real* XIRR is a different number and
 * lives in `mfPortfolioAnalysis.service.ts`; conflating them is how a fund gets
 * blamed for an investor's entry point.
 *
 * The solver is `sipXirr` from `@portfolioos/shared`, which works in JS numbers
 * by necessity — rate search is transcendental and has no exact decimal form.
 * Its output is a dimensionless rate, never summed into a balance, and it is
 * lifted straight back into `Decimal` here via `toDecimal`.
 */
export function hypotheticalSipXirr(
  daily: readonly SeriesPoint[],
  instalment: Decimal = HYPOTHETICAL_SIP_INSTALMENT_INR,
): MetricResult {
  if (daily.length < 2) return metricUnavailable('insufficient_observations');

  const terminal = daily[daily.length - 1]!;
  const monthly: Array<{ date: Date; nav: Decimal }> = [];
  let lastKey = '';
  for (const point of daily) {
    // Stop before the terminal point: an instalment bought at the redemption
    // NAV on the redemption date contributes a zero-length holding period and
    // drags the XIRR toward 0 for no economic reason.
    if (point.date.getTime() >= terminal.date.getTime()) break;
    const key = `${point.date.getUTCFullYear()}-${point.date.getUTCMonth()}`;
    if (key === lastKey) continue;
    lastKey = key;
    monthly.push({ date: point.date, nav: point.value });
  }
  if (monthly.length < 2) return metricUnavailable('insufficient_observations');

  const rate = sipXirr(monthly, instalment, { date: terminal.date, nav: terminal.value });
  if (rate === null) return metricUnavailable('no_convergence');
  return metricOk(toDecimal(rate));
}

// ---------------------------------------------------------------------------
// §3 — Risk metrics
// ---------------------------------------------------------------------------

/** `02 §3`: `σ(r_m) × √12`. */
export function stdDevAnn(monthlyReturns: readonly Decimal[]): MetricResult {
  if (monthlyReturns.length < MIN_MONTHLY_OBSERVATIONS) {
    return metricUnavailable('insufficient_observations');
  }
  const variance = sampleVariance(monthlyReturns);
  if (variance === null) return metricUnavailable('insufficient_observations');
  return metricOk(variance.sqrt().times(SQRT_12));
}

/**
 * `02 §3`: `√( mean( min(r_m − rf_m, 0)² ) ) × √12`.
 *
 * The mean is over *all* observations, not only the negative ones. Dividing by
 * the count of downside months instead is a common implementation error and
 * inflates the figure for funds that rarely fall — precisely the funds a
 * Sortino ratio is meant to reward.
 */
export function downsideDevAnn(
  monthlyReturns: readonly Decimal[],
  monthlyRiskFree: readonly Decimal[],
): MetricResult {
  if (monthlyReturns.length !== monthlyRiskFree.length) {
    return metricUnavailable('misaligned_series');
  }
  if (monthlyReturns.length < MIN_MONTHLY_OBSERVATIONS) {
    return metricUnavailable('insufficient_observations');
  }
  let acc = ZERO;
  for (let i = 0; i < monthlyReturns.length; i++) {
    const excess = monthlyReturns[i]!.minus(monthlyRiskFree[i]!);
    if (excess.lessThan(0)) acc = acc.plus(excess.times(excess));
  }
  return metricOk(acc.dividedBy(monthlyReturns.length).sqrt().times(SQRT_12));
}

export interface DrawdownResult {
  /** Negative, e.g. −0.30 for a 30% peak-to-trough fall. Null when uncomputable. */
  maxDrawdown: MetricResult;
  peakDate: Date | null;
  troughDate: Date | null;
  /** Peak → trough, in calendar days. An integer count. */
  maxDrawdownDurationDays: number | null;
  /** Trough → first close at or above the prior peak. `null` means not yet recovered. */
  recoveryDays: number | null;
  recovered: boolean;
}

/**
 * `02 §3`: maximum drawdown, **from the daily series**.
 *
 * Volatility is computed monthly and drawdown daily on purpose, and the split is
 * not an inconsistency. Monthly sampling is what makes σ robust to NAV gaps and
 * comparable to published figures; but a fall that starts on the 4th and bottoms
 * on the 22nd is invisible to a month-end series, and understating the worst
 * loss a holder actually saw is the one error a risk section cannot afford.
 * March 2020 is the canonical case: monthly data shows roughly −23% for Indian
 * equity, daily shows roughly −38%.
 *
 * `recoveryDays: null` means "has not recovered yet" and is deliberately
 * distinct from `0`, which means "recovered the same day".
 */
export function maxDrawdown(daily: readonly SeriesPoint[]): DrawdownResult {
  if (daily.length < 2) {
    return {
      maxDrawdown: metricUnavailable('insufficient_observations'),
      peakDate: null,
      troughDate: null,
      maxDrawdownDurationDays: null,
      recoveryDays: null,
      recovered: false,
    };
  }

  let peakValue = daily[0]!.value;
  let peakDate = daily[0]!.date;
  let worst = ZERO;
  let worstPeakValue = peakValue;
  let worstPeakDate = peakDate;
  let worstTroughDate = daily[0]!.date;
  let worstTroughIdx = 0;

  for (let i = 0; i < daily.length; i++) {
    const point = daily[i]!;
    if (point.value.greaterThan(peakValue)) {
      // Strictly greater, so a flat stretch at the high keeps the FIRST date the
      // peak was set — the date the investor's high-water mark was established.
      peakValue = point.value;
      peakDate = point.date;
    }
    if (peakValue.abs().lessThan(EPSILON)) continue;
    const dd = point.value.dividedBy(peakValue).minus(1);
    if (dd.lessThan(worst)) {
      worst = dd;
      worstPeakValue = peakValue;
      worstPeakDate = peakDate;
      worstTroughDate = point.date;
      worstTroughIdx = i;
    }
  }

  let recoveryDays: number | null = null;
  let recovered = false;
  for (let i = worstTroughIdx; i < daily.length; i++) {
    if (daily[i]!.value.greaterThanOrEqualTo(worstPeakValue)) {
      recovered = true;
      recoveryDays = calendarDaysBetween(worstTroughDate, daily[i]!.date);
      break;
    }
  }

  return {
    maxDrawdown: metricOk(worst),
    peakDate: worstPeakDate,
    troughDate: worstTroughDate,
    maxDrawdownDurationDays: calendarDaysBetween(worstPeakDate, worstTroughDate),
    recoveryDays,
    recovered,
  };
}

/** `02 §3`: `min(r_m)`. */
export function worstMonth(monthlyReturns: readonly Decimal[]): MetricResult {
  if (monthlyReturns.length < MIN_MONTHLY_OBSERVATIONS) {
    return metricUnavailable('insufficient_observations');
  }
  return metricOk(sortAscending(monthlyReturns)[0]!);
}

/** `02 §3`: `max(r_m)`. */
export function bestMonth(monthlyReturns: readonly Decimal[]): MetricResult {
  if (monthlyReturns.length < MIN_MONTHLY_OBSERVATIONS) {
    return metricUnavailable('insufficient_observations');
  }
  const sorted = sortAscending(monthlyReturns);
  return metricOk(sorted[sorted.length - 1]!);
}

/**
 * `02 §3`: **historical** 5th percentile of monthly returns — not the parametric
 * `mean − 1.645σ`.
 *
 * The parametric form assumes normality, and monthly fund returns are left-
 * skewed and fat-tailed in exactly the region VaR is asking about. A normal
 * approximation systematically understates the loss in the tail it exists to
 * describe, which is the single worst place to be optimistic.
 */
export function var95Monthly(monthlyReturns: readonly Decimal[]): MetricResult {
  if (monthlyReturns.length < MIN_MONTHLY_OBSERVATIONS) {
    return metricUnavailable('insufficient_observations');
  }
  const p = percentile(sortAscending(monthlyReturns), new Decimal('0.05'));
  return p === null ? metricUnavailable('no_data') : metricOk(p);
}

/** `02 §3`: mean of the monthly returns at or below `var95Monthly`. */
export function cvar95Monthly(monthlyReturns: readonly Decimal[]): MetricResult {
  const varResult = var95Monthly(monthlyReturns);
  if (varResult.value === null) return varResult;
  const threshold = varResult.value;
  const tail = monthlyReturns.filter((r) => r.lessThanOrEqualTo(threshold));
  // Interpolation can place the 5th percentile strictly below every observation
  // only when n is tiny; falling back to the minimum keeps CVaR ≤ VaR, which is
  // the property every consumer assumes.
  if (tail.length === 0) return metricOk(sortAscending(monthlyReturns)[0]!);
  return metricOk(mean(tail));
}

/** `02 §3`: share of months with `r_m < 0`. */
export function pctNegativeMonths(monthlyReturns: readonly Decimal[]): MetricResult {
  if (monthlyReturns.length < MIN_MONTHLY_OBSERVATIONS) {
    return metricUnavailable('insufficient_observations');
  }
  const negatives = monthlyReturns.filter((r) => r.lessThan(0)).length;
  return metricOk(new Decimal(negatives).dividedBy(monthlyReturns.length));
}

// ---------------------------------------------------------------------------
// §4 — Risk-adjusted metrics (≥ 36 monthly observations)
// ---------------------------------------------------------------------------

function excessReturns(
  returns: readonly Decimal[],
  riskFree: readonly Decimal[],
): Decimal[] | null {
  if (returns.length !== riskFree.length) return null;
  return returns.map((r, i) => r.minus(riskFree[i]!));
}

/** `02 §4`: `(mean(e_m) × 12) / stdDevAnn`. */
export function sharpe(
  monthlyReturns: readonly Decimal[],
  monthlyRiskFree: readonly Decimal[],
): MetricResult {
  const excess = excessReturns(monthlyReturns, monthlyRiskFree);
  if (excess === null) return metricUnavailable('misaligned_series');
  if (excess.length < MIN_RISK_ADJUSTED_OBSERVATIONS) {
    return metricUnavailable('insufficient_observations');
  }
  const sd = stdDevAnn(monthlyReturns);
  if (sd.value === null) return sd;
  const quotient = safeDivide(mean(excess).times(TWELVE), sd.value);
  return quotient === null ? metricUnavailable('degenerate_denominator') : metricOk(quotient);
}

/** `02 §4`: `(mean(e_m) × 12) / downsideDevAnn`. */
export function sortino(
  monthlyReturns: readonly Decimal[],
  monthlyRiskFree: readonly Decimal[],
): MetricResult {
  const excess = excessReturns(monthlyReturns, monthlyRiskFree);
  if (excess === null) return metricUnavailable('misaligned_series');
  if (excess.length < MIN_RISK_ADJUSTED_OBSERVATIONS) {
    return metricUnavailable('insufficient_observations');
  }
  const dd = downsideDevAnn(monthlyReturns, monthlyRiskFree);
  if (dd.value === null) return dd;
  const quotient = safeDivide(mean(excess).times(TWELVE), dd.value);
  // A fund with no down months at all has a zero denominator. That is not an
  // infinitely good Sortino, it is an unmeasurable one.
  return quotient === null ? metricUnavailable('degenerate_denominator') : metricOk(quotient);
}

/** `02 §4`: `cov(e_m, b_m) / var(b_m)`, both series in excess of the risk-free rate. */
export function beta(
  monthlyReturns: readonly Decimal[],
  benchmarkMonthlyReturns: readonly Decimal[],
  monthlyRiskFree: readonly Decimal[],
): MetricResult {
  const fundExcess = excessReturns(monthlyReturns, monthlyRiskFree);
  const benchExcess = excessReturns(benchmarkMonthlyReturns, monthlyRiskFree);
  if (fundExcess === null || benchExcess === null || fundExcess.length !== benchExcess.length) {
    return metricUnavailable('misaligned_series');
  }
  if (fundExcess.length < MIN_RISK_ADJUSTED_OBSERVATIONS) {
    return metricUnavailable('insufficient_observations');
  }
  const cov = sampleCovariance(fundExcess, benchExcess);
  const variance = sampleVariance(benchExcess);
  if (cov === null || variance === null) return metricUnavailable('insufficient_observations');
  const quotient = safeDivide(cov, variance);
  return quotient === null ? metricUnavailable('degenerate_denominator') : metricOk(quotient);
}

/** `02 §4`: `(mean(e_m) − β × mean(b_m)) × 12`. */
export function jensenAlphaAnn(
  monthlyReturns: readonly Decimal[],
  benchmarkMonthlyReturns: readonly Decimal[],
  monthlyRiskFree: readonly Decimal[],
): MetricResult {
  const fundExcess = excessReturns(monthlyReturns, monthlyRiskFree);
  const benchExcess = excessReturns(benchmarkMonthlyReturns, monthlyRiskFree);
  if (fundExcess === null || benchExcess === null || fundExcess.length !== benchExcess.length) {
    return metricUnavailable('misaligned_series');
  }
  if (fundExcess.length < MIN_RISK_ADJUSTED_OBSERVATIONS) {
    return metricUnavailable('insufficient_observations');
  }
  const b = beta(monthlyReturns, benchmarkMonthlyReturns, monthlyRiskFree);
  if (b.value === null) return b;
  return metricOk(mean(fundExcess).minus(b.value.times(mean(benchExcess))).times(TWELVE));
}

/**
 * `02 §4`: `(mean(e_m) × 12) / β`, reported `null` when `β ≤ 0.1`.
 *
 * Treynor divides by systematic risk, and at a beta near zero the quotient
 * explodes on an estimate that is itself mostly noise — a liquid-fund-like
 * beta of 0.02 turns a 1% excess return into a Treynor of 50, which then ranks
 * first in its category. The suppression is deliberate, not a data problem, so
 * it reports `not_applicable` rather than `degenerate_denominator`.
 */
export function treynor(
  monthlyReturns: readonly Decimal[],
  monthlyRiskFree: readonly Decimal[],
  betaValue: Decimal | null,
): MetricResult {
  if (betaValue === null) return metricUnavailable('benchmark_unavailable');
  if (betaValue.lessThanOrEqualTo(new Decimal('0.1'))) return metricUnavailable('not_applicable');
  const excess = excessReturns(monthlyReturns, monthlyRiskFree);
  if (excess === null) return metricUnavailable('misaligned_series');
  if (excess.length < MIN_RISK_ADJUSTED_OBSERVATIONS) {
    return metricUnavailable('insufficient_observations');
  }
  const quotient = safeDivide(mean(excess).times(TWELVE), betaValue);
  return quotient === null ? metricUnavailable('degenerate_denominator') : metricOk(quotient);
}

/** `02 §4`: `σ(r_m − rb_m) × √12`. */
export function trackingErrorAnn(
  monthlyReturns: readonly Decimal[],
  benchmarkMonthlyReturns: readonly Decimal[],
): MetricResult {
  if (monthlyReturns.length !== benchmarkMonthlyReturns.length) {
    return metricUnavailable('misaligned_series');
  }
  if (monthlyReturns.length < MIN_RISK_ADJUSTED_OBSERVATIONS) {
    return metricUnavailable('insufficient_observations');
  }
  const active = monthlyReturns.map((r, i) => r.minus(benchmarkMonthlyReturns[i]!));
  const variance = sampleVariance(active);
  if (variance === null) return metricUnavailable('insufficient_observations');
  return metricOk(variance.sqrt().times(SQRT_12));
}

/**
 * `02 §4`: `(mean(r_m − rb_m) × 12) / trackingErrorAnn`.
 *
 * The guard matters more here than anywhere else in the file. A fund that beats
 * its index by exactly the same margin every month has zero tracking error and
 * an infinite information ratio — which is the ratio's way of saying the input
 * is synthetic, not that the manager is perfect. `null`, always.
 */
export function informationRatio(
  monthlyReturns: readonly Decimal[],
  benchmarkMonthlyReturns: readonly Decimal[],
): MetricResult {
  const te = trackingErrorAnn(monthlyReturns, benchmarkMonthlyReturns);
  if (te.value === null) return te;
  const active = monthlyReturns.map((r, i) => r.minus(benchmarkMonthlyReturns[i]!));
  const quotient = safeDivide(mean(active).times(TWELVE), te.value);
  return quotient === null ? metricUnavailable('degenerate_denominator') : metricOk(quotient);
}

/**
 * `02 §4`: `CAGR / |maxDrawdown|`, reported `null` when the drawdown is
 * shallower than −1%.
 *
 * Same reasoning as Treynor: dividing by a 0.2% drawdown produces a Calmar of
 * 60 for an overnight fund and puts it above every equity fund on a
 * risk-adjusted screen. Suppressed on purpose → `not_applicable`.
 */
export const CALMAR_MIN_DRAWDOWN = new Decimal('0.01');

export function calmar(cagrValue: Decimal | null, maxDrawdownValue: Decimal | null): MetricResult {
  if (cagrValue === null || maxDrawdownValue === null) return metricUnavailable('no_data');
  const depth = maxDrawdownValue.abs();
  if (depth.lessThan(CALMAR_MIN_DRAWDOWN)) return metricUnavailable('not_applicable');
  const quotient = safeDivide(cagrValue, depth);
  return quotient === null ? metricUnavailable('degenerate_denominator') : metricOk(quotient);
}

/** `02 §4`: `Σ max(r_m − τ, 0) / Σ max(τ − r_m, 0)` with `τ = rf_m`. */
export function omega(
  monthlyReturns: readonly Decimal[],
  monthlyRiskFree: readonly Decimal[],
): MetricResult {
  if (monthlyReturns.length !== monthlyRiskFree.length) {
    return metricUnavailable('misaligned_series');
  }
  if (monthlyReturns.length < MIN_RISK_ADJUSTED_OBSERVATIONS) {
    return metricUnavailable('insufficient_observations');
  }
  let gains = ZERO;
  let losses = ZERO;
  for (let i = 0; i < monthlyReturns.length; i++) {
    const diff = monthlyReturns[i]!.minus(monthlyRiskFree[i]!);
    if (diff.greaterThan(0)) gains = gains.plus(diff);
    else losses = losses.plus(diff.negated());
  }
  const quotient = safeDivide(gains, losses);
  return quotient === null ? metricUnavailable('degenerate_denominator') : metricOk(quotient);
}

/**
 * `02 §4`: Modigliani M², `sharpe × σ_bench_ann + rf_ann`.
 *
 * Kept because it is the only risk-adjusted figure that can be stated in prose
 * without a glossary — "restated at the index's level of risk, this fund
 * returned X%" — where "its Sharpe is 0.8" means nothing to most readers.
 */
export function m2(
  sharpeValue: Decimal | null,
  benchmarkStdDevAnn: Decimal | null,
  annualRiskFree: Decimal | null,
): MetricResult {
  if (sharpeValue === null || benchmarkStdDevAnn === null || annualRiskFree === null) {
    return metricUnavailable('no_data');
  }
  return metricOk(sharpeValue.times(benchmarkStdDevAnn).plus(annualRiskFree));
}

// ---------------------------------------------------------------------------
// §5 — Benchmark-relative behaviour
// ---------------------------------------------------------------------------

/**
 * Geometric CAGR over an arbitrary set of months, annualised by *that set's*
 * count (`02 §5`, Morningstar's capture definition).
 *
 * This is the part of capture ratios that looks wrong and is not. The 43 up
 * months inside a ten-year window are compounded together and then annualised
 * as though those 43 months were the entire elapsed time — not spread over the
 * 120 months of the window. Annualising over the full window instead would
 * measure "how much of the index's total return did the fund capture", which is
 * just relative return; capture is meant to answer "when the index rose, how
 * much of the rise did the fund get", and that question only involves the up
 * months.
 *
 * Returns `null` for an empty set or for a compounded growth factor at or below
 * zero (total loss), where the fractional root is undefined.
 */
export function periodSetCagr(returns: readonly Decimal[]): Decimal | null {
  if (returns.length === 0) return null;
  let growth = ONE;
  for (const r of returns) growth = growth.times(ONE.plus(r));
  if (growth.lessThanOrEqualTo(0)) return null;
  return growth.pow(TWELVE.dividedBy(returns.length)).minus(1);
}

function captureFor(
  monthlyReturns: readonly Decimal[],
  benchmarkMonthlyReturns: readonly Decimal[],
  direction: 'up' | 'down',
): MetricResult {
  if (monthlyReturns.length !== benchmarkMonthlyReturns.length) {
    return metricUnavailable('misaligned_series');
  }
  if (monthlyReturns.length < MIN_MONTHLY_OBSERVATIONS) {
    return metricUnavailable('insufficient_observations');
  }
  const fund: Decimal[] = [];
  const bench: Decimal[] = [];
  for (let i = 0; i < monthlyReturns.length; i++) {
    const b = benchmarkMonthlyReturns[i]!;
    const selected = direction === 'up' ? b.greaterThan(0) : b.lessThan(0);
    if (!selected) continue;
    fund.push(monthlyReturns[i]!);
    bench.push(b);
  }
  // A window with no down months at all is a real thing (a three-year bull run
  // in a debt fund) and it means down-capture is undefined, not zero.
  if (fund.length === 0) return metricUnavailable('insufficient_observations');
  const fundCagr = periodSetCagr(fund);
  const benchCagr = periodSetCagr(bench);
  if (fundCagr === null || benchCagr === null) return metricUnavailable('out_of_range');
  const quotient = safeDivide(fundCagr, benchCagr);
  return quotient === null ? metricUnavailable('degenerate_denominator') : metricOk(quotient);
}

/** `02 §5`: fund CAGR over months where the benchmark rose, ÷ benchmark's own. */
export function upCapture(
  monthlyReturns: readonly Decimal[],
  benchmarkMonthlyReturns: readonly Decimal[],
): MetricResult {
  return captureFor(monthlyReturns, benchmarkMonthlyReturns, 'up');
}

/** `02 §5`: the same over months where the benchmark fell. Lower is better. */
export function downCapture(
  monthlyReturns: readonly Decimal[],
  benchmarkMonthlyReturns: readonly Decimal[],
): MetricResult {
  return captureFor(monthlyReturns, benchmarkMonthlyReturns, 'down');
}

/** `02 §5`: `upCapture / downCapture`. */
export function captureRatio(
  upCaptureValue: Decimal | null,
  downCaptureValue: Decimal | null,
): MetricResult {
  if (upCaptureValue === null || downCaptureValue === null) return metricUnavailable('no_data');
  const quotient = safeDivide(upCaptureValue, downCaptureValue);
  return quotient === null ? metricUnavailable('degenerate_denominator') : metricOk(quotient);
}

/** `02 §5`: share of months where `r_m > rb_m`. */
export function battingAverage(
  monthlyReturns: readonly Decimal[],
  benchmarkMonthlyReturns: readonly Decimal[],
): MetricResult {
  if (monthlyReturns.length !== benchmarkMonthlyReturns.length) {
    return metricUnavailable('misaligned_series');
  }
  if (monthlyReturns.length < MIN_MONTHLY_OBSERVATIONS) {
    return metricUnavailable('insufficient_observations');
  }
  let wins = 0;
  for (let i = 0; i < monthlyReturns.length; i++) {
    if (monthlyReturns[i]!.greaterThan(benchmarkMonthlyReturns[i]!)) wins++;
  }
  return metricOk(new Decimal(wins).dividedBy(monthlyReturns.length));
}

/** `02 §5`: `CAGR_fund − CAGR_bench`, in return units (0.02 = 2 pp a year). */
export function outperformanceAnn(
  fundCagr: Decimal | null,
  benchmarkCagr: Decimal | null,
): MetricResult {
  if (fundCagr === null || benchmarkCagr === null) return metricUnavailable('no_data');
  return metricOk(fundCagr.minus(benchmarkCagr));
}

// ---------------------------------------------------------------------------
// Credit rating ordinal scale (`01-DATA-FOUNDATION.md §4`)
// ---------------------------------------------------------------------------

/**
 * The normalised credit ladder, best first. Ordinal position *is* the comparison
 * — `creditRatingOrdinal(a) < creditRatingOrdinal(b)` means `a` is the stronger
 * credit.
 *
 * A ladder rather than a numeric score because the gaps between rungs are not
 * equal and pretending otherwise (AAA = 1, AA = 2 … averaged across a portfolio)
 * produces a "weighted average rating" that is meaningless: the jump from AA− to
 * A+ is a different animal from AAA to AA+. Weighted *buckets*
 * (`creditQualitySplit`) are how this data is aggregated; the ordinal is only
 * ever used to compare or to threshold.
 */
export const CREDIT_RATING_SCALE = [
  'SOV',
  'AAA',
  'AA_PLUS',
  'AA',
  'AA_MINUS',
  'A_PLUS',
  'A',
  'A_MINUS',
  'BBB_PLUS',
  'BBB',
  'BBB_MINUS',
  'BELOW_IG',
  'UNRATED',
] as const;

export type CreditRatingGrade = (typeof CREDIT_RATING_SCALE)[number];

const CREDIT_RATING_ORDINAL: ReadonlyMap<CreditRatingGrade, number> = new Map(
  CREDIT_RATING_SCALE.map((grade, index) => [grade, index]),
);

/** 0 = SOV (strongest) … 12 = UNRATED. An index, hence a `number`. */
export function creditRatingOrdinal(grade: CreditRatingGrade): number {
  return CREDIT_RATING_ORDINAL.get(grade) ?? CREDIT_RATING_SCALE.length - 1;
}

/** Negative when `a` is the stronger credit. Sorts a holdings list best-first. */
export function compareCreditRating(a: CreditRatingGrade, b: CreditRatingGrade): number {
  return creditRatingOrdinal(a) - creditRatingOrdinal(b);
}

/**
 * Map an AMC's disclosed rating text onto the ladder.
 *
 * Portfolio disclosures write the same rating six ways — "CRISIL AA+",
 * "[ICRA]AA+(CE)", "IND AA+ /Stable", "CARE A1+". This strips agency prefixes,
 * credit-enhancement and outlook suffixes, and whitespace, then matches.
 *
 * Short-term ratings are folded onto the long-term ladder at their conventional
 * equivalents (A1+ → AAA per `01 §4`; A1 → AA; A2 → A; A3 → BBB; A4/D →
 * BELOW_IG). That mapping is an approximation, but treating a 90-day A1+ CP as
 * `UNRATED` would put a treasury fund's entire portfolio in the below-AA bucket.
 *
 * Anything unrecognised becomes `UNRATED` rather than throwing: an unfamiliar
 * rating string is a data-quality issue for one holding, not a reason to fail
 * the whole scheme's profile — and `UNRATED` is the conservative bucket, so the
 * error can only ever make a fund look worse, never better.
 */
export function normaliseCreditRating(raw: string | null | undefined): CreditRatingGrade {
  if (raw === null || raw === undefined) return 'UNRATED';
  let s = raw.toUpperCase();
  // Drop bracketed agency tags, outlook and enhancement suffixes, punctuation.
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  s = s.replace(/\b(CRISIL|ICRA|CARE|IND|BWR|BRICKWORK|ACUITE|FITCH|INDIA RATINGS)\b/g, ' ');
  s = s.replace(/\b(STABLE|POSITIVE|NEGATIVE|WATCH|OUTLOOK|CE|SO|RATED|EQUIVALENT)\b/g, ' ');
  s = s.replace(/[^A-Z0-9+-]/g, '');

  if (/^(SOV|SOVEREIGN|GOI|GSEC|G-SEC|SDL|TBILL|T-BILL|GOVT|TREASURY)/.test(s)) return 'SOV';
  if (s.length === 0) return 'UNRATED';
  if (/^(NR|NA|UNRATED|NOTRATED)$/.test(s)) return 'UNRATED';

  // Long-term ladder. Ordered longest-prefix-first so "AA+" is never read as "A".
  if (s.startsWith('AAA') || s.startsWith('A1+')) return 'AAA';
  if (s.startsWith('AA+')) return 'AA_PLUS';
  if (s.startsWith('AA-')) return 'AA_MINUS';
  if (s.startsWith('AA')) return 'AA';
  if (s.startsWith('A+')) return 'A_PLUS';
  if (s.startsWith('A-')) return 'A_MINUS';
  if (s.startsWith('BBB+')) return 'BBB_PLUS';
  if (s.startsWith('BBB-')) return 'BBB_MINUS';
  if (s.startsWith('BBB')) return 'BBB';

  // Short-term ladder, folded onto the long-term equivalents.
  if (s.startsWith('A1')) return 'AA';
  if (s.startsWith('A2')) return 'A';
  if (s.startsWith('A3')) return 'BBB';
  if (s.startsWith('A4')) return 'BELOW_IG';

  if (s.startsWith('A')) return 'A';
  if (/^(BB|B|C|D)/.test(s)) return 'BELOW_IG';
  return 'UNRATED';
}

// ---------------------------------------------------------------------------
// §7 — Portfolio characteristics (pure helpers)
// ---------------------------------------------------------------------------

/**
 * The narrow shape this module needs from one disclosed holding.
 *
 * Declared locally and structurally rather than imported from Prisma on
 * purpose: importing a generated model type would make the purity constraint a
 * matter of discipline rather than of the import graph, and `mf-rules-pure`-style
 * static checks would have nothing to fail on.
 *
 * `weightPct` is in **percentage points** (12.5 = 12.5% of the portfolio),
 * matching how AMCs disclose and how `MfPortfolioSnapshot` stores it. Anything
 * defined on fractions (HHI, active share) divides by 100 internally and says so.
 */
export interface HoldingWeightRow {
  isin?: string | null;
  securityName?: string | null;
  issuer?: string | null;
  weightPct: Decimal;
  kind?: string | null;
  sector?: string | null;
  marketCapBucket?: 'LARGE' | 'MID' | 'SMALL' | null;
  creditRating?: string | null;
  ytmPct?: Decimal | null;
  modifiedDuration?: Decimal | null;
  maturityYears?: Decimal | null;
}

/** Stable identity for a holding across snapshots and across two funds. */
function holdingKey(row: HoldingWeightRow): string {
  const isin = row.isin?.trim().toUpperCase();
  if (isin) return `isin:${isin}`;
  const name = row.securityName?.trim().toUpperCase();
  return name ? `name:${name}` : 'unknown';
}

/**
 * `02 §7`: Σ of the ten largest weights, in percentage points.
 *
 * The tie-break on key is not cosmetic — two holdings at exactly 2.5% would
 * otherwise be ordered by the input array, and the same snapshot read twice in a
 * different row order would produce a different top-10 set. Determinism is a
 * requirement of this module, not a nicety.
 */
export function top10Weight(rows: readonly HoldingWeightRow[], n = 10): MetricResult {
  if (rows.length === 0) return metricUnavailable('no_data');
  const sorted = [...rows].sort((a, b) => {
    const cmp = b.weightPct.comparedTo(a.weightPct);
    return cmp !== 0 ? cmp : holdingKey(a).localeCompare(holdingKey(b));
  });
  return metricOk(sum(sorted.slice(0, n).map((r) => r.weightPct)));
}

/** `02 §7`: `Σ w_i²` with weights as **fractions**, so a 100-equal-weight fund scores 0.01. */
export function hhi(rows: readonly HoldingWeightRow[]): MetricResult {
  if (rows.length === 0) return metricUnavailable('no_data');
  let acc = ZERO;
  for (const row of rows) {
    const w = row.weightPct.dividedBy(HUNDRED);
    acc = acc.plus(w.times(w));
  }
  return metricOk(acc);
}

/**
 * `02 §7`: `1 / hhi` — the number of equally-weighted positions that would give
 * the same concentration. Reads far better in prose than the HHI itself.
 */
export function effectiveHoldings(hhiValue: Decimal | null): MetricResult {
  if (hhiValue === null) return metricUnavailable('no_data');
  const quotient = safeDivide(ONE, hhiValue);
  return quotient === null ? metricUnavailable('degenerate_denominator') : metricOk(quotient);
}

/**
 * `02 §7`: `½ Σ |w_fund,i − w_bench,i|` over the union of holdings, returned as
 * a **fraction** in [0, 1] to match `MfCurrentProfile.activeShare: Ratio`.
 *
 * The union, not the intersection: a benchmark constituent the fund does not
 * hold at all is the largest active bet a manager can make, and intersecting
 * would score a fund holding 5 of the index's 50 names as barely active.
 */
export function activeShare(
  fundRows: readonly HoldingWeightRow[],
  benchmarkRows: readonly HoldingWeightRow[],
): MetricResult {
  if (fundRows.length === 0 || benchmarkRows.length === 0) {
    return metricUnavailable('benchmark_unavailable');
  }
  const fundWeights = new Map<string, Decimal>();
  for (const row of fundRows) {
    const key = holdingKey(row);
    fundWeights.set(key, (fundWeights.get(key) ?? ZERO).plus(row.weightPct));
  }
  const benchWeights = new Map<string, Decimal>();
  for (const row of benchmarkRows) {
    const key = holdingKey(row);
    benchWeights.set(key, (benchWeights.get(key) ?? ZERO).plus(row.weightPct));
  }
  let acc = ZERO;
  for (const key of new Set([...fundWeights.keys(), ...benchWeights.keys()])) {
    const f = fundWeights.get(key) ?? ZERO;
    const b = benchWeights.get(key) ?? ZERO;
    acc = acc.plus(f.minus(b).abs());
  }
  return metricOk(acc.dividedBy(HUNDRED).dividedBy(2));
}

/** All values in percentage points; `null` when no rows were supplied. */
export interface MarketCapSplitResult {
  large: Decimal | null;
  mid: Decimal | null;
  small: Decimal | null;
  unclassified: Decimal | null;
}

/**
 * `02 §7`: split by the AMFI half-yearly large/mid/small list.
 *
 * Every row is counted, and rows with no bucket land in `unclassified` rather
 * than being dropped — an ISIN we could not place is reported, never hidden,
 * because a silently-omitted 8% of the portfolio makes the other three buckets
 * add to 92% and the reader assumes cash.
 *
 * The caller passes the sleeve it wants measured (usually `kind = EQUITY`);
 * filtering here would need a kind taxonomy this module has no business owning.
 */
export function marketCapSplit(rows: readonly HoldingWeightRow[]): MarketCapSplitResult {
  if (rows.length === 0) {
    return { large: null, mid: null, small: null, unclassified: null };
  }
  let large = ZERO;
  let mid = ZERO;
  let small = ZERO;
  let unclassified = ZERO;
  for (const row of rows) {
    switch (row.marketCapBucket) {
      case 'LARGE':
        large = large.plus(row.weightPct);
        break;
      case 'MID':
        mid = mid.plus(row.weightPct);
        break;
      case 'SMALL':
        small = small.plus(row.weightPct);
        break;
      default:
        unclassified = unclassified.plus(row.weightPct);
    }
  }
  return { large, mid, small, unclassified };
}

/** All values in percentage points; mirrors `MfCreditQualitySplit`. */
export interface CreditQualitySplitResult {
  sov: Decimal | null;
  aaa: Decimal | null;
  aaPlus: Decimal | null;
  aa: Decimal | null;
  aaMinus: Decimal | null;
  aAndBelow: Decimal | null;
  unrated: Decimal | null;
}

/**
 * `02 §7`: weight by credit bucket.
 *
 * Everything from A+ downwards collapses into `aAndBelow`. The published DTO
 * has no finer rungs below AA− because retail debt portfolios almost never
 * disclose them separately, and offering a `bbb` field that is empty for 99% of
 * schemes invites the UI to render a chart of zeros.
 */
export function creditQualitySplit(rows: readonly HoldingWeightRow[]): CreditQualitySplitResult {
  if (rows.length === 0) {
    return {
      sov: null,
      aaa: null,
      aaPlus: null,
      aa: null,
      aaMinus: null,
      aAndBelow: null,
      unrated: null,
    };
  }
  const buckets = {
    sov: ZERO,
    aaa: ZERO,
    aaPlus: ZERO,
    aa: ZERO,
    aaMinus: ZERO,
    aAndBelow: ZERO,
    unrated: ZERO,
  };
  for (const row of rows) {
    const grade = normaliseCreditRating(row.creditRating);
    switch (grade) {
      case 'SOV':
        buckets.sov = buckets.sov.plus(row.weightPct);
        break;
      case 'AAA':
        buckets.aaa = buckets.aaa.plus(row.weightPct);
        break;
      case 'AA_PLUS':
        buckets.aaPlus = buckets.aaPlus.plus(row.weightPct);
        break;
      case 'AA':
        buckets.aa = buckets.aa.plus(row.weightPct);
        break;
      case 'AA_MINUS':
        buckets.aaMinus = buckets.aaMinus.plus(row.weightPct);
        break;
      case 'UNRATED':
        buckets.unrated = buckets.unrated.plus(row.weightPct);
        break;
      default:
        buckets.aAndBelow = buckets.aAndBelow.plus(row.weightPct);
    }
  }
  return buckets;
}

/**
 * `02 §7`: Σ weights rated AA− or lower, **plus unrated**.
 *
 * Unrated is counted as risky rather than excluded. An unrated corporate bond in
 * a debt scheme is not "unknown risk to be netted out"; the 2018–19 credit
 * events were concentrated in exactly the paper that carried no current rating.
 */
export function belowAAPct(rows: readonly HoldingWeightRow[]): MetricResult {
  if (rows.length === 0) return metricUnavailable('no_data');
  const aaMinusOrdinal = creditRatingOrdinal('AA_MINUS');
  let acc = ZERO;
  for (const row of rows) {
    const grade = normaliseCreditRating(row.creditRating);
    if (creditRatingOrdinal(grade) >= aaMinusOrdinal) acc = acc.plus(row.weightPct);
  }
  return metricOk(acc);
}

/**
 * `02 §7`: largest single **non-sovereign** issuer weight, in percentage points.
 *
 * Sovereign paper is excluded because a gilt fund is 100% one "issuer" and
 * flagging that as concentration risk would fire the rule on every G-Sec fund in
 * the country. Issuer identity falls back to the security name when the feed
 * gives no issuer, which over-counts distinct series of the same issuer — an
 * under-estimate of concentration, and therefore the safe direction to err.
 */
export function topIssuerPct(rows: readonly HoldingWeightRow[]): MetricResult {
  if (rows.length === 0) return metricUnavailable('no_data');
  const byIssuer = new Map<string, Decimal>();
  for (const row of rows) {
    if (normaliseCreditRating(row.creditRating) === 'SOV') continue;
    const issuer = (row.issuer ?? row.securityName ?? '').trim().toUpperCase();
    if (issuer.length === 0) continue;
    byIssuer.set(issuer, (byIssuer.get(issuer) ?? ZERO).plus(row.weightPct));
  }
  if (byIssuer.size === 0) return metricUnavailable('no_data');
  let worst = ZERO;
  for (const weight of byIssuer.values()) if (weight.greaterThan(worst)) worst = weight;
  return metricOk(worst);
}

/**
 * Weight-average a per-holding attribute over the rows that disclose it.
 *
 * The denominator is the weight of the rows that *have* a value, not the whole
 * portfolio. Dividing by 100 instead would silently treat a fund that disclosed
 * duration for 60% of its book as having a 40% zero-duration sleeve, and report
 * a duration 40% too short.
 */
function weightedAverage(
  rows: readonly HoldingWeightRow[],
  pick: (row: HoldingWeightRow) => Decimal | null | undefined,
): MetricResult {
  if (rows.length === 0) return metricUnavailable('no_data');
  let weighted = ZERO;
  let totalWeight = ZERO;
  for (const row of rows) {
    const value = pick(row);
    if (value === null || value === undefined) continue;
    weighted = weighted.plus(row.weightPct.times(value));
    totalWeight = totalWeight.plus(row.weightPct);
  }
  if (totalWeight.abs().lessThan(EPSILON)) return metricUnavailable('degenerate_denominator');
  return metricOk(weighted.dividedBy(totalWeight));
}

/** `02 §7`: weighted modified duration, in years. Flagged "approximated" by the caller. */
export function weightedModifiedDuration(rows: readonly HoldingWeightRow[]): MetricResult {
  return weightedAverage(rows, (r) => r.modifiedDuration);
}

/** `02 §7`: weighted average maturity, in years. */
export function weightedAverageMaturity(rows: readonly HoldingWeightRow[]): MetricResult {
  return weightedAverage(rows, (r) => r.maturityYears);
}

/** `02 §7`: weighted yield to maturity, in percentage points. */
export function weightedYtm(rows: readonly HoldingWeightRow[]): MetricResult {
  return weightedAverage(rows, (r) => r.ytmPct);
}

/** The SEBI band a sub-category's mandate imposes on one cap bucket, in percentage points. */
export interface MandateBand {
  bucket: 'LARGE' | 'MID' | 'SMALL';
  minPct: Decimal;
  maxPct: Decimal;
}

/**
 * `02 §7`: the worst breach of a mandated cap band across a run of snapshots,
 * in percentage points. `0` means the fund stayed inside its band throughout.
 *
 * Deviation is one-sided by band edge, not distance from a midpoint: a
 * large-cap fund mandated at ≥ 80% large-cap is not drifting when it holds 95%.
 * Only the part outside the band is drift.
 */
export function styleDrift(
  splits: readonly MarketCapSplitResult[],
  band: MandateBand,
): MetricResult {
  if (splits.length === 0) return metricUnavailable('no_data');
  let worst: Decimal | null = null;
  for (const split of splits) {
    const value =
      band.bucket === 'LARGE' ? split.large : band.bucket === 'MID' ? split.mid : split.small;
    if (value === null) continue;
    const below = band.minPct.minus(value);
    const above = value.minus(band.maxPct);
    let deviation = ZERO;
    if (below.greaterThan(deviation)) deviation = below;
    if (above.greaterThan(deviation)) deviation = above;
    if (worst === null || deviation.greaterThan(worst)) worst = deviation;
  }
  return worst === null ? metricUnavailable('no_data') : metricOk(worst);
}

export interface PortfolioSnapshotInput {
  asOf: Date;
  /** Scheme AUM at the snapshot date, in rupees. */
  aum: Decimal;
  holdings: readonly HoldingWeightRow[];
}

/**
 * `02 §7`: `min(Σ buys, Σ sells) / avg AUM` across a run of snapshots, in
 * percentage points. Always reported as **estimated**.
 *
 * Buys and sells are inferred from `weight × AUM` deltas between consecutive
 * snapshots, which is the only turnover computation available from public
 * disclosure — AMCs publish holdings, not trades. Two consequences the caller
 * must carry into the copy: intra-month round trips are invisible (a stock
 * bought and sold between two month-ends contributes nothing), and price
 * movement inside a held position is indistinguishable from a top-up. The
 * figure is therefore a floor with noise on it, not a measurement, and `min` of
 * buys and sells is the conventional way of damping the flow component — a fund
 * that simply received inflows shows large buys and negligible sells, and `min`
 * refuses to call that turnover.
 */
export function turnoverPct(snapshots: readonly PortfolioSnapshotInput[]): MetricResult {
  if (snapshots.length < 2) return metricUnavailable('insufficient_observations');
  const ordered = [...snapshots].sort((a, b) => a.asOf.getTime() - b.asOf.getTime());

  let buys = ZERO;
  let sells = ZERO;
  for (let i = 1; i < ordered.length; i++) {
    const prev = valueByKey(ordered[i - 1]!);
    const curr = valueByKey(ordered[i]!);
    for (const key of new Set([...prev.keys(), ...curr.keys()])) {
      const delta = (curr.get(key) ?? ZERO).minus(prev.get(key) ?? ZERO);
      if (delta.greaterThan(0)) buys = buys.plus(delta);
      else sells = sells.plus(delta.negated());
    }
  }

  const avgAum = mean(ordered.map((s) => s.aum));
  const traded = buys.lessThan(sells) ? buys : sells;
  const quotient = safeDivide(traded, avgAum);
  return quotient === null
    ? metricUnavailable('degenerate_denominator')
    : metricOk(quotient.times(HUNDRED));
}

function valueByKey(snapshot: PortfolioSnapshotInput): Map<string, Decimal> {
  const out = new Map<string, Decimal>();
  for (const row of snapshot.holdings) {
    const key = holdingKey(row);
    const value = row.weightPct.dividedBy(HUNDRED).times(snapshot.aum);
    out.set(key, (out.get(key) ?? ZERO).plus(value));
  }
  return out;
}

// ---------------------------------------------------------------------------
// §8 — Structural metrics (pure arithmetic)
// ---------------------------------------------------------------------------

/**
 * Elapsed years between two dates, on a 365.25-day Julian year.
 *
 * Used for ages and tenures only — never for compounding a return, where the
 * horizon is an exact integer number of years by construction (`02 §1`) and a
 * fractional-year drift of a quarter of a day would move a 10-year CAGR in the
 * fourth decimal.
 */
function yearsBetween(from: Date, to: Date): Decimal | null {
  const ms = to.getTime() - from.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return toDecimal(ms).dividedBy(MS_PER_DAY).dividedBy(DAYS_PER_YEAR);
}

/** `02 §8`: current lead manager's `fromDate` → `asOf`, in years. */
export function managerTenureYears(fromDate: Date, asOf: Date): MetricResult {
  const years = yearsBetween(fromDate, asOf);
  // A manager start date after `asOf` is a data error, not a negative tenure.
  return years === null ? metricUnavailable('out_of_range') : metricOk(years);
}

/** `02 §8`: `inceptionDate` → `asOf`, in years. Gates the 36-month rating floor. */
export function fundAgeYears(inceptionDate: Date, asOf: Date): MetricResult {
  const years = yearsBetween(inceptionDate, asOf);
  return years === null ? metricUnavailable('out_of_range') : metricOk(years);
}

/** `02 §8`: `(aum_now / aum_12m_ago − 1) × 100`, in percentage points. */
export function aumGrowth12mPct(
  currentAum: Decimal | null,
  aumTwelveMonthsAgo: Decimal | null,
): MetricResult {
  if (currentAum === null || aumTwelveMonthsAgo === null) return metricUnavailable('no_data');
  const quotient = safeDivide(currentAum, aumTwelveMonthsAgo);
  if (quotient === null) return metricUnavailable('degenerate_denominator');
  return metricOk(quotient.minus(1).times(HUNDRED));
}

// Re-exported so callers that build SIP cash flows by hand use the same type the
// solver expects, without reaching into `@portfolioos/shared/finance` directly.
export type { XirrFlow };
