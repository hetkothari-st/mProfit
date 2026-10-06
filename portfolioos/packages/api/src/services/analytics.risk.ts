/**
 * Risk metrics: volatility, Sharpe ratio, maximum drawdown, beta.
 *
 * Operates on JS numbers, not Decimal. These are statistical estimates,
 * not accounting figures — the XIRR solver already takes this position
 * (xirr.service.ts). The accumulator error here is bounded by the
 * caller's input precision, not IEEE-754 drift across thousands of ops.
 *
 * Returns `null` for any metric the input series cannot support (fewer
 * than 3 monthly points, all-zero, etc.) rather than throwing — the UI
 * is responsible for rendering "n/a" gracefully.
 */

const RISK_FREE_RATE_ANNUAL = 0.065; // ~6.5% — Indian 10Y G-Sec proxy
const TRADING_MONTHS_PER_YEAR = 12;

export interface RiskMetrics {
  /** Annualised standard deviation of monthly returns, in %. */
  volatilityPct: number | null;
  /** (Annualised return - risk-free) / volatility. */
  sharpe: number | null;
  /** Worst peak-to-trough drawdown over the series, as a positive %. */
  maxDrawdownPct: number | null;
  /** Regression slope vs benchmark monthly returns. */
  betaVsNifty: number | null;
  /** Number of monthly observations contributing to the metrics. */
  observations: number;
}

interface MonthlyPoint {
  date: string; // YYYY-MM
  value: number;
}

/**
 * Collapse a daily/irregular series to month-end values, one per month.
 * Latest observation in each month wins.
 */
export function monthlyFromDaily(
  daily: Array<{ date: string; value: number }>,
): MonthlyPoint[] {
  const byMonth = new Map<string, { date: string; value: number }>();
  for (const p of daily) {
    const month = p.date.slice(0, 7);
    const cur = byMonth.get(month);
    if (!cur || p.date > cur.date) byMonth.set(month, p);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ date: month, value: v.value }));
}

function monthlyReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!;
    if (prev === 0 || !isFinite(prev)) continue;
    const r = (values[i]! - prev) / prev;
    if (isFinite(r)) out.push(r);
  }
  return out;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function maxDrawdown(values: number[]): number {
  if (values.length < 2) return 0;
  let peak = values[0]!;
  let maxDd = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = (peak - v) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

function beta(portfolioReturns: number[], benchmarkReturns: number[]): number | null {
  // Align lengths by trimming to the shorter (assumes both end at "now").
  const n = Math.min(portfolioReturns.length, benchmarkReturns.length);
  if (n < 3) return null;
  const p = portfolioReturns.slice(-n);
  const b = benchmarkReturns.slice(-n);
  const meanP = mean(p);
  const meanB = mean(b);
  let cov = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    cov += (p[i]! - meanP) * (b[i]! - meanB);
    varB += (b[i]! - meanB) ** 2;
  }
  if (varB === 0) return null;
  return cov / varB;
}

export function computeRiskMetrics(
  portfolioMonthly: Array<{ date: string; value: number }>,
  niftyMonthly: Array<{ date: string; value: number }> = [],
): RiskMetrics {
  const values = portfolioMonthly.map((p) => p.value);
  const returns = monthlyReturns(values);
  if (returns.length < 3) {
    return {
      volatilityPct: null,
      sharpe: null,
      maxDrawdownPct: null,
      betaVsNifty: null,
      observations: returns.length,
    };
  }

  const sd = stddev(returns);
  const volAnn = sd * Math.sqrt(TRADING_MONTHS_PER_YEAR);

  // Annualise return via CAGR if we have ≥2 points; else fall back to mean*12.
  let annReturn: number;
  if (values.length >= 2 && values[0]! > 0) {
    const totalReturn = values[values.length - 1]! / values[0]!;
    const years = (values.length - 1) / TRADING_MONTHS_PER_YEAR;
    annReturn = years > 0 ? totalReturn ** (1 / years) - 1 : 0;
  } else {
    annReturn = mean(returns) * TRADING_MONTHS_PER_YEAR;
  }

  const sharpe = volAnn > 0 ? (annReturn - RISK_FREE_RATE_ANNUAL) / volAnn : null;
  const maxDd = maxDrawdown(values);

  const niftyReturns = monthlyReturns(niftyMonthly.map((p) => p.value));
  const b = niftyReturns.length >= 3 ? beta(returns, niftyReturns) : null;

  return {
    volatilityPct: isFinite(volAnn) ? volAnn * 100 : null,
    sharpe: sharpe != null && isFinite(sharpe) ? sharpe : null,
    maxDrawdownPct: maxDd * 100,
    betaVsNifty: b,
    observations: returns.length,
  };
}

// ─── Return correlation between asset classes ──────────────────────────

/** One month-end snapshot of what was held and at what price. */
export interface MonthlyPositions {
  date: string; // YYYY-MM-DD
  positions: Array<{ key: string; assetClass: string; quantity: number; price: number | null }>;
  /** Holdings whose share count changed by a corporate action this month. */
  corporateActionKeys: string[];
}

/**
 * Fewest overlapping monthly returns before a correlation is reported. Below
 * this a coefficient is mostly noise — two random series agree "strongly"
 * surprisingly often over three or four months.
 */
export const MIN_CORRELATION_OBSERVATIONS = 6;

/**
 * Monthly return per asset class, one entry per month after the first.
 *
 * Each month's return uses the quantities held at the START of the month:
 *
 *     Σ qty_start × (price_end − price_start)  ÷  Σ qty_start × price_start
 *
 * so money added or withdrawn during the month does not count as a return —
 * unlike a return computed from total value, where a large purchase looks like
 * a gain. A holding is left out of a month when it lacks a price at either end
 * (FDs, real estate and anything else without a price feed) or when a split,
 * bonus, merger or demerger changed its share count, which would otherwise
 * read as a price move. A class with nothing usable in a month gets null.
 */
export function classMonthlyReturns(months: MonthlyPositions[]): Map<string, Array<number | null>> {
  const classes = new Set<string>();
  for (const m of months) for (const p of m.positions) classes.add(p.assetClass);

  const out = new Map<string, Array<number | null>>();
  for (const cls of classes) out.set(cls, []);

  for (let i = 1; i < months.length; i++) {
    const start = months[i - 1]!;
    const end = months[i]!;
    const endPrice = new Map<string, number>();
    for (const p of end.positions) if (p.price != null && p.price > 0) endPrice.set(p.key, p.price);
    const adjusted = new Set(end.corporateActionKeys);

    const num = new Map<string, number>();
    const den = new Map<string, number>();
    for (const p of start.positions) {
      if (p.price == null || p.price <= 0 || p.quantity <= 0) continue;
      if (adjusted.has(p.key)) continue;
      const pe = endPrice.get(p.key);
      if (pe == null) continue;
      num.set(p.assetClass, (num.get(p.assetClass) ?? 0) + p.quantity * (pe - p.price));
      den.set(p.assetClass, (den.get(p.assetClass) ?? 0) + p.quantity * p.price);
    }
    for (const cls of classes) {
      const d = den.get(cls) ?? 0;
      out.get(cls)!.push(d > 0 ? (num.get(cls) ?? 0) / d : null);
    }
  }
  return out;
}

/**
 * Pearson correlation over the months where both series have a value.
 * Null when there are too few shared months or when either series doesn't
 * vary (correlation is undefined for a flat line).
 */
export function pearson(
  a: Array<number | null>,
  b: Array<number | null>,
  minObservations = MIN_CORRELATION_OBSERVATIONS,
): { r: number | null; observations: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    if (x == null || y == null || !isFinite(x) || !isFinite(y)) continue;
    xs.push(x);
    ys.push(y);
  }
  if (xs.length < minObservations) return { r: null, observations: xs.length };
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  // Treat a near-zero variance as flat: cost-valued holdings can drift by
  // rounding alone, and dividing by that produces a meaningless ±1.
  if (sxx < 1e-12 || syy < 1e-12) return { r: null, observations: xs.length };
  const r = sxy / Math.sqrt(sxx * syy);
  return { r: Math.max(-1, Math.min(1, r)), observations: xs.length };
}

export interface ClassCorrelation {
  classes: string[];
  /** matrix[i][j] = correlation of class i with class j; null where it can't be computed. */
  matrix: Array<Array<number | null>>;
  /** Shared monthly observations behind each cell. */
  observations: number[][];
  minObservations: number;
}

export function classCorrelationMatrix(returns: Map<string, Array<number | null>>): ClassCorrelation {
  const classes = [...returns.keys()];
  const matrix: Array<Array<number | null>> = [];
  const observations: number[][] = [];
  for (const ci of classes) {
    const row: Array<number | null> = [];
    const obsRow: number[] = [];
    for (const cj of classes) {
      const { r, observations: o } = pearson(returns.get(ci)!, returns.get(cj)!);
      row.push(r);
      obsRow.push(o);
    }
    matrix.push(row);
    observations.push(obsRow);
  }
  return { classes, matrix, observations, minObservations: MIN_CORRELATION_OBSERVATIONS };
}
