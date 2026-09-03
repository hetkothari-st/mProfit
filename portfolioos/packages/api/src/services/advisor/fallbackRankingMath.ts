/**
 * NAV-derived scoring for the FALLBACK product ranking.
 *
 * Read this before using anything in here:
 *
 *   THIS IS PAST PERFORMANCE, AND ONLY PAST PERFORMANCE.
 *
 * This codebase stores NAV history and nothing else about a scheme — there is
 * no expense ratio, no AUM, no manager tenure, no benchmark, no category peer
 * set. A score computed here therefore cannot distinguish a genuinely good
 * fund from one that happened to be in the right sector for three years, and it
 * cannot see the fee that will eat the difference. It exists for exactly one
 * job: when an adviser has approved nothing for a bucket, produce a defensible
 * ordering instead of picking arbitrarily.
 *
 * Every recommendation sourced this way MUST be marked lower-confidence and
 * stamped with provenance FALLBACK_RANKING (see productResolution.ts), so the
 * person reading it knows it came from a NAV series and not from a human.
 *
 * Pure: no DB, no clock — `asOf` is passed in, matching the rest of the
 * advisor math layer.
 */

export interface NavPoint {
  /** ISO date. Parsed with Date; unparseable points are dropped. */
  date: string;
  nav: number;
}

export interface NavScore {
  cagrPct: number | null;
  volatilityPct: number | null;
  maxDrawdownPct: number | null;
  score: number;
  /** Monthly observations the score was actually computed from. */
  observations: number;
}

/** Below this many month-end observations there is no basis for a ranking, and
 *  admitting that is better than ordering funds on a handful of points. Twelve
 *  is the smallest window that contains a full seasonal cycle and gives eleven
 *  returns to take a standard deviation of. */
export const MIN_MONTHLY_OBSERVATIONS = 12;

const DEFAULT_WINDOW_YEARS = 3;
const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;

/**
 * Score weights. All three components are in percentage points, so they are
 * directly commensurable and a linear combination is meaningful:
 *
 *   score = cagrPct − (VOL_WEIGHT × volatilityPct) − (DRAWDOWN_WEIGHT × maxDrawdownPct)
 *
 * A linear penalty rather than a ratio (return / volatility) on purpose: a
 * ratio explodes as volatility approaches zero, so a liquid fund yielding 6%
 * with 0.3% volatility would out-rank every equity fund in the list — which is
 * the correct answer to a question nobody asked, since the bucket already
 * decided the asset class.
 *
 * The weights say: a fund must earn ~1pp more CAGR to justify 2pp more
 * annualised volatility, and ~1pp more to justify 4pp of extra worst-case
 * drawdown. Drawdown is weighted lower than volatility because the two overlap
 * heavily; it is included at all because it is the number that predicts whether
 * an investor actually stays invested.
 */
const VOL_WEIGHT = 0.5;
const DRAWDOWN_WEIGHT = 0.25;

interface MonthEnd {
  time: number;
  nav: number;
}

/** Last valid observation of each calendar month inside the window, ascending. */
function toMonthEnds(series: NavPoint[], asOf: Date, years: number): MonthEnd[] {
  const asOfTime = asOf.getTime();
  const startTime = asOfTime - years * DAYS_PER_YEAR * MS_PER_DAY;

  const byMonth = new Map<string, MonthEnd>();
  for (const point of series) {
    if (!point || typeof point.date !== 'string') continue;
    if (typeof point.nav !== 'number' || !Number.isFinite(point.nav) || point.nav <= 0) continue;
    const time = new Date(point.date).getTime();
    if (!Number.isFinite(time)) continue;
    if (time > asOfTime || time < startTime) continue;

    const d = new Date(time);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const existing = byMonth.get(key);
    if (!existing || time >= existing.time) byMonth.set(key, { time, nav: point.nav });
  }

  return Array.from(byMonth.values()).sort((a, b) => a.time - b.time);
}

/**
 * Score a NAV series over the trailing `years` window ending at `asOf`.
 *
 * Returns null when fewer than MIN_MONTHLY_OBSERVATIONS month-end observations
 * fall inside the window. Callers must treat null as "no basis to rank this
 * candidate" and leave it out of the ranking entirely — not as a zero score.
 */
export function scoreNavSeries(
  series: NavPoint[],
  asOf: Date,
  years: number = DEFAULT_WINDOW_YEARS,
): NavScore | null {
  if (!Array.isArray(series) || series.length === 0) return null;
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) return null;
  if (!Number.isFinite(years) || years <= 0) return null;

  const months = toMonthEnds(series, asOf, years);
  if (months.length < MIN_MONTHLY_OBSERVATIONS) return null;

  // Safe: months.length >= MIN_MONTHLY_OBSERVATIONS was checked above.
  const first = months[0]!;
  const last = months[months.length - 1]!;

  // CAGR over the actual elapsed span, not the nominal window — a series that
  // only covers 14 of a requested 36 months must not be annualised as if it
  // covered three years.
  const spanYears = (last.time - first.time) / MS_PER_DAY / DAYS_PER_YEAR;
  const cagrPct =
    spanYears > 0 ? (Math.pow(last.nav / first.nav, 1 / spanYears) - 1) * 100 : null;

  // Annualised volatility of monthly log returns (sample standard deviation).
  const logReturns: number[] = [];
  for (let i = 1; i < months.length; i += 1) {
    logReturns.push(Math.log(months[i]!.nav / months[i - 1]!.nav));
  }
  let volatilityPct: number | null = null;
  if (logReturns.length >= 2) {
    const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    const variance =
      logReturns.reduce((acc, r) => acc + (r - mean) * (r - mean), 0) / (logReturns.length - 1);
    volatilityPct = Math.sqrt(variance) * Math.sqrt(12) * 100;
  }

  // Worst peak-to-trough decline inside the window, as a positive percentage.
  let peak = first.nav;
  let maxDrawdown = 0;
  for (const m of months) {
    if (m.nav > peak) peak = m.nav;
    const dd = (peak - m.nav) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  const maxDrawdownPct = maxDrawdown * 100;

  const score =
    (cagrPct ?? 0) - VOL_WEIGHT * (volatilityPct ?? 0) - DRAWDOWN_WEIGHT * maxDrawdownPct;

  return {
    cagrPct: cagrPct == null ? null : round4(cagrPct),
    volatilityPct: volatilityPct == null ? null : round4(volatilityPct),
    maxDrawdownPct: round4(maxDrawdownPct),
    score: round4(score),
    observations: months.length,
  };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
