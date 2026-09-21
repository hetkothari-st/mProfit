/**
 * Fund metrics, computed from NAV history alone.
 *
 * ── On numbers rather than Decimal ───────────────────────────────
 * Everything in this file is a STATISTIC, never a rupee: rolling returns,
 * capture ratios, Sortino, tracking error. None of these values is ever added
 * to a balance, written to a money column, or shown as an amount — they are
 * inputs to a percentile ranking, and the ranking only cares about order.
 *
 * IEEE-754 is appropriate here and Decimal is not: Sortino needs a square
 * root, tracking error needs a standard deviation, and rolling returns need
 * fractional powers, none of which decimal.js does without a lossy conversion
 * anyway. `fallbackRankingMath.ts` made the same call for the same reason.
 *
 * NOTHING IN THIS FILE MAY TOUCH A MONEY VALUE. If a future metric needs one
 * (AUM, a rupee cost), take it as `Decimal`, compare it as `Decimal`, and keep
 * the float arithmetic on this side of the boundary.
 *
 * Pure: no DB, no clock — `asOf` is passed in.
 */

import type { FundMetrics, MethodologyConfig, NavObservation } from './types.js';

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;

interface MonthEnd {
  time: number;
  nav: number;
}

/** Last valid observation of each calendar month, ascending. Month-ends
 *  rather than raw dailies so two funds are compared on the same grid even
 *  when one skips a holiday the other prices. */
export function toMonthEnds(series: NavObservation[], asOf: Date): MonthEnd[] {
  const asOfTime = asOf.getTime();
  const byMonth = new Map<string, MonthEnd>();

  for (const point of series) {
    if (!point || typeof point.date !== 'string') continue;
    if (typeof point.nav !== 'number' || !Number.isFinite(point.nav) || point.nav <= 0) continue;
    const time = new Date(point.date).getTime();
    if (!Number.isFinite(time) || time > asOfTime) continue;
    const d = new Date(time);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const existing = byMonth.get(key);
    if (!existing || time >= existing.time) byMonth.set(key, { time, nav: point.nav });
  }

  return [...byMonth.values()].sort((a, b) => a.time - b.time);
}

/**
 * Annualised returns over every N-year window that fits, stepped monthly.
 *
 * Rolling rather than trailing on purpose. A trailing 3-year number is one
 * sample that depends entirely on where the window happens to start — move it
 * three months and a "top quartile" fund can become median. Fifty overlapping
 * windows say something about consistency; one says something about luck.
 */
export function rollingReturnsPct(
  series: NavObservation[],
  asOf: Date,
  years: number,
  stepMonths: number,
): number[] {
  const months = toMonthEnds(series, asOf);
  const windowMonths = Math.round(years * 12);
  if (months.length <= windowMonths) return [];

  const out: number[] = [];
  for (let end = months.length - 1; end - windowMonths >= 0; end -= Math.max(1, stepMonths)) {
    const start = months[end - windowMonths]!;
    const finish = months[end]!;
    const spanYears = (finish.time - start.time) / MS_PER_DAY / DAYS_PER_YEAR;
    if (spanYears <= 0 || start.nav <= 0) continue;
    out.push((Math.pow(finish.nav / start.nav, 1 / spanYears) - 1) * 100);
  }
  return out.reverse();
}

/** Monthly simple returns, in percent. */
export function monthlyReturnsPct(series: NavObservation[], asOf: Date): number[] {
  const months = toMonthEnds(series, asOf);
  const out: number[] = [];
  for (let i = 1; i < months.length; i += 1) {
    const prev = months[i - 1]!.nav;
    if (prev <= 0) continue;
    out.push((months[i]!.nav / prev - 1) * 100);
  }
  return out;
}

/**
 * Sortino: excess return per unit of DOWNSIDE deviation.
 *
 * Sharpe punishes a fund for rising sharply, which is not a risk anybody is
 * trying to avoid. Sortino only counts months below the target, which is the
 * thing an investor actually experiences as risk.
 */
export function sortino(monthlyPct: number[], riskFreeAnnualPct: number): number | null {
  if (monthlyPct.length < 12) return null;
  const monthlyTarget = riskFreeAnnualPct / 12;
  const mean = monthlyPct.reduce((a, b) => a + b, 0) / monthlyPct.length;
  const downside = monthlyPct.filter((r) => r < monthlyTarget).map((r) => (r - monthlyTarget) ** 2);
  if (downside.length === 0) return null;
  const downsideDev = Math.sqrt(downside.reduce((a, b) => a + b, 0) / downside.length);
  if (downsideDev === 0) return null;
  return ((mean - monthlyTarget) / downsideDev) * Math.sqrt(12);
}

/** Worst peak-to-trough fall inside the series, as a positive percentage. */
export function maxDrawdownPct(series: NavObservation[], asOf: Date): number | null {
  const months = toMonthEnds(series, asOf);
  if (months.length < 2) return null;
  let peak = months[0]!.nav;
  let worst = 0;
  for (const m of months) {
    if (m.nav > peak) peak = m.nav;
    const dd = (peak - m.nav) / peak;
    if (dd > worst) worst = dd;
  }
  return worst * 100;
}

/**
 * Downside capture: how much of the comparator's bad months the fund took.
 *
 * 80 means it fell four-fifths as far as its peers did; 110 means it fell
 * harder. This is the metric that best predicts whether an investor is still
 * holding the fund after a bad year, which is why it carries real weight in
 * the active model.
 */
export function downsideCapturePct(fundMonthly: number[], comparatorMonthly: number[]): number | null {
  const n = Math.min(fundMonthly.length, comparatorMonthly.length);
  if (n < 12) return null;
  const fund = fundMonthly.slice(-n);
  const comp = comparatorMonthly.slice(-n);

  let fundSum = 0;
  let compSum = 0;
  let downMonths = 0;
  for (let i = 0; i < n; i += 1) {
    if (comp[i]! < 0) {
      fundSum += fund[i]!;
      compSum += comp[i]!;
      downMonths += 1;
    }
  }
  if (downMonths < 6 || compSum === 0) return null;
  return (fundSum / compSum) * 100;
}

/** Share of rolling windows in which the fund beat the comparator's window
 *  return, 0–100. Both series must be aligned by construction. */
export function outperformanceConsistencyPct(
  fundWindows: number[],
  comparatorWindows: number[],
): number | null {
  const n = Math.min(fundWindows.length, comparatorWindows.length);
  if (n < 6) return null;
  const fund = fundWindows.slice(-n);
  const comp = comparatorWindows.slice(-n);
  let wins = 0;
  for (let i = 0; i < n; i += 1) {
    if (fund[i]! > comp[i]!) wins += 1;
  }
  return (wins / n) * 100;
}

/** Annualised return over the whole usable series. */
export function annualisedReturnPct(series: NavObservation[], asOf: Date): number | null {
  const months = toMonthEnds(series, asOf);
  if (months.length < 2) return null;
  const first = months[0]!;
  const last = months[months.length - 1]!;
  const spanYears = (last.time - first.time) / MS_PER_DAY / DAYS_PER_YEAR;
  if (spanYears <= 0 || first.nav <= 0) return null;
  return (Math.pow(last.nav / first.nav, 1 / spanYears) - 1) * 100;
}

/**
 * Tracking difference and tracking error against a comparator.
 *
 * Difference is what the investor lost to costs and slippage over the period;
 * error is how erratic that gap was month to month. A tracker with a −0.3%
 * difference and 0.1% error is doing its job. One with +2% difference is not
 * tracking anything.
 */
export function trackingMetrics(
  fundMonthly: number[],
  comparatorMonthly: number[],
): { trackingDifferencePct: number | null; trackingErrorPct: number | null } {
  const n = Math.min(fundMonthly.length, comparatorMonthly.length);
  if (n < 12) return { trackingDifferencePct: null, trackingErrorPct: null };
  const diffs: number[] = [];
  for (let i = n; i > 0; i -= 1) {
    diffs.push(fundMonthly[fundMonthly.length - i]! - comparatorMonthly[comparatorMonthly.length - i]!);
  }
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance = diffs.reduce((acc, d) => acc + (d - mean) ** 2, 0) / Math.max(1, diffs.length - 1);
  return {
    trackingDifferencePct: mean * 12,
    trackingErrorPct: Math.sqrt(variance) * Math.sqrt(12),
  };
}

export function median(values: number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 === 0 ? (clean[mid - 1]! + clean[mid]!) / 2 : clean[mid]!;
}

/**
 * Every metric for one fund, against a comparator series assembled by the
 * caller (the category median, or the same-index peer median for trackers).
 */
export function computeMetrics(args: {
  navHistory: NavObservation[];
  comparatorMonthlyPct: number[];
  comparatorRollingPct: number[];
  passive: boolean;
  trackingIsPeerRelative: boolean;
  config: MethodologyConfig;
  asOf: Date;
}): FundMetrics {
  const { navHistory, comparatorMonthlyPct, comparatorRollingPct, passive, config, asOf } = args;

  const rolling = rollingReturnsPct(
    navHistory,
    asOf,
    config.metrics.rollingReturnYears,
    config.metrics.rollingStepMonths,
  );
  const monthly = monthlyReturnsPct(navHistory, asOf);
  const tracking = passive
    ? trackingMetrics(monthly, comparatorMonthlyPct)
    : { trackingDifferencePct: null, trackingErrorPct: null };

  return {
    rollingReturnsPct: rolling,
    outperformanceConsistencyPct: passive
      ? null
      : outperformanceConsistencyPct(rolling, comparatorRollingPct),
    downsideCapturePct: passive ? null : downsideCapturePct(monthly, comparatorMonthlyPct),
    sortino: passive ? null : sortino(monthly, config.metrics.riskFreeRatePct),
    maxDrawdownPct: maxDrawdownPct(navHistory, asOf),
    trackingDifferencePct: tracking.trackingDifferencePct,
    trackingErrorPct: tracking.trackingErrorPct,
    trackingIsPeerRelative: passive ? args.trackingIsPeerRelative : false,
    observations: monthly.length,
  };
}
