/**
 * Holes in a fund's NAV history, measured in trading days.
 *
 * A scheme whose NAV stopped updating for a month and then resumed is not a
 * scheme with a shorter track record — it is a scheme whose track record has
 * a hole in the middle, and every metric computed over it is wrong in a way
 * the metric itself cannot report. A rolling-return window that straddles the
 * hole annualises a jump that took a month as though it took a day; a Sortino
 * computed from a month-end grid silently interpolates across it; a tracking
 * error against a comparator that DID publish reads as skill or as noise
 * depending on which way the market moved while we were not looking.
 *
 * `maxNavStalenessDays` already catches a fund that stopped and never
 * restarted. This catches the one that stopped and came back, which looks
 * perfectly healthy at both ends.
 *
 * ── Why trading days, not calendar days ──────────────────────────
 * Counting calendar days makes every Diwali week and every long weekend look
 * like a five-day outage, so any threshold loose enough to survive the
 * calendar is too loose to catch a real one. The gap that matters is "how
 * many days did the rest of the market publish a NAV and this fund did not".
 *
 * We do not hold an exchange holiday calendar, and inventing one would be a
 * maintenance burden that goes stale every year. We do not need to: AMFI's
 * own file IS the calendar. A day on which any fund published a NAV was a day
 * on which this fund should have published one. The calendar is therefore
 * derived from the data, and it is exactly as correct as the data is.
 *
 * Pure: no database, no clock.
 */

import type { NavObservation } from './types.js';

export interface NavGap {
  /** Last date the fund published before the hole. */
  from: string;
  /** First date it published after it. */
  to: string;
  /**
   * Trading days between those two on which the market published and this
   * fund did not. A fund that publishes every trading day has gaps of 0.
   */
  tradingDaysMissing: number;
}

/**
 * The trading calendar, as the market itself reports it: every date on which
 * at least one scheme published a NAV, ascending, unique.
 *
 * Built once per scoring run from the whole universe and handed to every
 * candidate, because one fund's history cannot tell you which days were
 * holidays — that is precisely the information a gap hides.
 */
export function buildTradingCalendar(dates: Iterable<string>): string[] {
  return [...new Set(dates)].sort();
}

/**
 * The largest hole in `navHistory`, measured against `tradingDays`.
 *
 * Only the interior is examined. A fund that launched in the middle of the
 * window has no NAV before its launch, and that is not a gap — it is a short
 * track record, which `minTrackRecordYears` already judges. A fund whose NAV
 * stops at the end has stale prices, which `maxNavStalenessDays` judges.
 * Counting either here would fail the same fund twice under the wrong name.
 *
 * Returns null when there is nothing to measure: fewer than two observations,
 * or no calendar.
 */
export function largestNavGap(
  navHistory: readonly NavObservation[],
  tradingDays: readonly string[],
): NavGap | null {
  const observed = [...new Set(navHistory.map((n) => n.date))].sort();
  if (observed.length < 2 || tradingDays.length === 0) return null;

  const first = observed[0]!;
  const last = observed[observed.length - 1]!;

  // Trading days strictly inside the fund's own history. Binary search would
  // be tidier, but the calendar is ~1,250 entries for a five-year window and
  // this runs once per fund; a filter is clearer and fast enough.
  const window = tradingDays.filter((d) => d >= first && d <= last);
  if (window.length === 0) return null;

  const have = new Set(observed);
  let best: NavGap | null = null;
  let runStart: string | null = null;
  let runLength = 0;
  let lastSeen = first;

  for (const day of window) {
    if (have.has(day)) {
      if (runStart !== null && (best === null || runLength > best.tradingDaysMissing)) {
        best = { from: lastSeen, to: day, tradingDaysMissing: runLength };
      }
      runStart = null;
      runLength = 0;
      lastSeen = day;
      continue;
    }
    if (runStart === null) runStart = day;
    runLength += 1;
  }

  // A run that reaches the end of the window cannot happen — `last` is in
  // `have` and is the final element — so there is no trailing run to close.
  return best;
}

/** "2026-03-04..2026-04-02 (18 trading days)" — for a human reading a log. */
export function describeNavGap(gap: NavGap): string {
  const d = gap.tradingDaysMissing;
  return `${gap.from}..${gap.to} (${d} trading ${d === 1 ? 'day' : 'days'})`;
}
