/**
 * Is the trading calendar itself trustworthy?
 *
 * `nav_history_gap` measures a fund against the calendar, and the calendar is
 * derived from the NAV universe — every date on which any scheme priced. That
 * is the right definition, and it has one blind spot that matters enormously:
 *
 *   **If the whole feed stops, the calendar stops with it.**
 *
 * Three weeks of missing NAVs do not appear as three weeks of gaps in 14,000
 * funds. They appear as three weeks that simply were not trading days, and
 * every fund passes the gap check unanimously. The measurement and the thing
 * being measured fail together, silently and in agreement — which is the exact
 * shape of the AMFI outage that started all of this, one level up.
 *
 * So the calendar is checked against something that does not come from the
 * feed: **the weekday.** The Indian market does not close for three weeks. It
 * closes for weekends, and for holiday clusters that run to three weekdays at
 * the outside — Diwali's Laxmi Pujan plus Balipratipada, a Holi mid-week, a
 * general-election day beside a weekend. A run of weekdays longer than that
 * with no NAV from any scheme in the country is not a holiday. It is us.
 *
 * `maxCalendarGapWeekdays` (config, default 4) is therefore deliberately NOT
 * a tight bound on real holidays. It sits just above the longest cluster that
 * can legitimately occur, because a false positive here fails a whole scoring
 * run — and the cost of being wrong in the other direction is ranking funds
 * on a market we stopped watching.
 *
 * Pure: no database, no clock, no feed.
 */

export interface CalendarGap {
  /** Last trading day before the hole (or the window start when it leads). */
  from: string;
  /** First trading day after it (or the window end when it trails). */
  to: string;
  /** Mon–Fri dates in between on which nothing in the market priced. */
  weekdays: number;
  /** The missing weekdays themselves, for the log line. Capped for sanity. */
  missing: string[];
}

const MAX_LISTED = 25;

function isWeekend(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The longest run of consecutive weekdays absent from `tradingDays`, between
 * the calendar's own first day and `windowEnd`.
 *
 * The window starts at the first day we have rather than at the start of the
 * scoring window, because "we hold no NAVs from 2021" is an absence of
 * history, not a hole in it — the track-record rules judge that. It ends at
 * `windowEnd` rather than at the calendar's last day, because a feed that
 * died three weeks ago shows up ONLY as a trailing hole, and that is the case
 * this exists to catch.
 *
 * Returns null for an empty calendar. A universe with no NAV dates at all is
 * a different failure with a different name, and reporting it as an infinite
 * calendar gap would be both true and useless.
 */
export function longestWeekdayGap(
  tradingDays: readonly string[],
  windowEnd: string,
): CalendarGap | null {
  if (tradingDays.length === 0) return null;

  const have = new Set(tradingDays);
  const sorted = [...have].sort();
  const start = sorted[0]!;
  if (windowEnd < start) return null;

  let best: CalendarGap | null = null;
  let runStart: string | null = null;
  let run: string[] = [];
  let lastSeen = start;

  const close = (to: string) => {
    if (runStart === null) return;
    if (best === null || run.length > best.weekdays) {
      best = {
        from: lastSeen,
        to,
        weekdays: run.length,
        missing: run.slice(0, MAX_LISTED),
      };
    }
    runStart = null;
    run = [];
  };

  for (let day = start; day <= windowEnd; day = addDays(day, 1)) {
    if (have.has(day)) {
      close(day);
      lastSeen = day;
      continue;
    }
    // A weekend is not a gap and does not break a run either: a hole that
    // spans a weekend is one hole, not two. Only weekdays are counted.
    if (isWeekend(day)) continue;
    if (runStart === null) runStart = day;
    run.push(day);
  }
  // A run still open at the end is the trailing case — the feed stopped and
  // never came back — which is the most important one to report.
  close(windowEnd);

  return best;
}

/** "2026-03-02..2026-03-23 (15 weekdays)" — for a log line or an alert. */
export function describeCalendarGap(gap: CalendarGap): string {
  return `${gap.from}..${gap.to} (${gap.weekdays} weekday${gap.weekdays === 1 ? '' : 's'})`;
}

export interface CalendarVerdict {
  ok: boolean;
  gap: CalendarGap | null;
  /** The threshold applied, so a log line says what it was judged against. */
  maxWeekdays: number;
  reason: string | null;
}

export const DEFAULT_MAX_CALENDAR_GAP_WEEKDAYS = 4;

export function judgeCalendar(
  tradingDays: readonly string[],
  windowEnd: string,
  maxWeekdays: number = DEFAULT_MAX_CALENDAR_GAP_WEEKDAYS,
): CalendarVerdict {
  const gap = longestWeekdayGap(tradingDays, windowEnd);
  if (!gap || gap.weekdays <= maxWeekdays) {
    return { ok: true, gap, maxWeekdays, reason: null };
  }
  return {
    ok: false,
    gap,
    maxWeekdays,
    reason:
      `no scheme in the market priced on ${gap.weekdays} consecutive weekdays ` +
      `(${describeCalendarGap(gap)}), beyond the ${maxWeekdays} the longest ` +
      'Indian holiday cluster can account for — the NAV feed, not the market, ' +
      'is what stopped',
  };
}
