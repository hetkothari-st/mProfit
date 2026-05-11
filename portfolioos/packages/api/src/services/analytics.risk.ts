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
