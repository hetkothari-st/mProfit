import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAX_CALENDAR_GAP_WEEKDAYS,
  describeCalendarGap,
  judgeCalendar,
  longestWeekdayGap,
} from '../../../../src/services/advisor/fundRanking/calendarIntegrity.js';
import { buildTradingCalendar } from '../../../../src/services/advisor/fundRanking/navGaps.js';

/**
 * The circularity this closes.
 *
 * `nav_history_gap` measures each fund against a trading calendar derived
 * from the NAV universe. If the whole feed stops, the calendar stops with it:
 * three weeks of missing NAVs do not show up as three weeks of gaps in 14,000
 * funds, they show up as three weeks that were not trading days, and every
 * fund passes the gap check unanimously. The measurement and the thing being
 * measured fail together and agree with each other.
 *
 * The only reference the feed cannot influence is the weekday.
 */

function weekdaysBetween(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const d = new Date(`${fromIso}T00:00:00.000Z`);
  const end = new Date(`${toIso}T00:00:00.000Z`);
  while (d <= end) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** A healthy quarter: the market priced every weekday. */
const HEALTHY = weekdaysBetween('2026-01-01', '2026-03-31');
const WINDOW_END = '2026-03-31';

describe('longestWeekdayGap', () => {
  it('finds nothing wrong with a market that priced every weekday', () => {
    expect(longestWeekdayGap(HEALTHY, WINDOW_END)).toBeNull();
  });

  it('does not count weekends', () => {
    // Every Saturday and Sunday is absent from HEALTHY by construction.
    expect(longestWeekdayGap(HEALTHY, WINDOW_END)).toBeNull();
  });

  it('treats a hole spanning a weekend as one hole, not two', () => {
    // 2026-03-05 is a Thursday; drop Thu, Fri, Mon — the weekend in the
    // middle is not a gap and must not split the run.
    const missing = new Set(['2026-03-05', '2026-03-06', '2026-03-09']);
    const gap = longestWeekdayGap(
      HEALTHY.filter((d) => !missing.has(d)),
      WINDOW_END,
    );
    expect(gap!.weekdays).toBe(3);
    expect(gap!.from).toBe('2026-03-04');
    expect(gap!.to).toBe('2026-03-10');
  });

  it('reports the longest hole when there are several', () => {
    const missing = new Set(['2026-02-03', ...weekdaysBetween('2026-03-02', '2026-03-06')]);
    const gap = longestWeekdayGap(
      HEALTHY.filter((d) => !missing.has(d)),
      WINDOW_END,
    );
    expect(gap!.weekdays).toBe(5);
  });

  // The most important case: the feed died and never came back, so the hole
  // is at the END of the calendar and there is no "next trading day" to
  // bound it. Bounding the window at the calendar's own last day — the
  // obvious implementation — would find nothing here.
  it('catches a feed that stopped and never restarted', () => {
    const upToMarch2 = HEALTHY.filter((d) => d <= '2026-03-02');
    const gap = longestWeekdayGap(upToMarch2, WINDOW_END);
    expect(gap).not.toBeNull();
    expect(gap!.from).toBe('2026-03-02');
    expect(gap!.to).toBe(WINDOW_END);
    expect(gap!.weekdays).toBe(weekdaysBetween('2026-03-03', WINDOW_END).length);
  });

  // The opposite end is NOT a gap: "we hold no NAVs from 2021" is an absence
  // of history, which the track-record rules judge, not a hole in it.
  it('ignores the stretch before the calendar starts', () => {
    const fromFebruary = HEALTHY.filter((d) => d >= '2026-02-02');
    expect(longestWeekdayGap(fromFebruary, WINDOW_END)).toBeNull();
  });

  it('returns null for an empty calendar rather than an infinite gap', () => {
    expect(longestWeekdayGap([], WINDOW_END)).toBeNull();
  });

  it('returns null when the window ends before the calendar starts', () => {
    expect(longestWeekdayGap(HEALTHY, '2025-12-01')).toBeNull();
  });

  it('caps the listed missing days so a log line stays readable', () => {
    const gap = longestWeekdayGap(['2026-01-01'], WINDOW_END);
    expect(gap!.weekdays).toBeGreaterThan(25);
    expect(gap!.missing.length).toBe(25);
  });

  it('describes a gap for a human', () => {
    expect(describeCalendarGap({ from: 'a', to: 'b', weekdays: 15, missing: [] })).toBe(
      'a..b (15 weekdays)',
    );
    expect(describeCalendarGap({ from: 'a', to: 'b', weekdays: 1, missing: [] })).toBe(
      'a..b (1 weekday)',
    );
  });
});

describe('judgeCalendar', () => {
  // ── The case this whole file exists for ────────────────────────
  it('fails a universe-wide three-week hole', () => {
    const outage = new Set(weekdaysBetween('2026-03-02', '2026-03-20'));
    const verdict = judgeCalendar(
      buildTradingCalendar(HEALTHY.filter((d) => !outage.has(d))),
      WINDOW_END,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.gap!.weekdays).toBe(15);
    expect(verdict.reason).toMatch(/15 consecutive weekdays/);
    expect(verdict.reason).toMatch(/the NAV feed, not the market, is what stopped/);
  });

  // ── And the case it must not mistake for that one ──────────────
  //
  // Diwali 2026: Laxmi Pujan and Balipratipada fall midweek, and the
  // exchange is shut for the longest cluster it ever takes. Three weekdays.
  it('passes a Diwali-shaped three-weekday hole', () => {
    // 2026-11-09 is a Monday. Shut Mon–Wed, reopen Thursday.
    const november = weekdaysBetween('2026-11-02', '2026-11-30');
    const holiday = new Set(['2026-11-09', '2026-11-10', '2026-11-11']);
    const verdict = judgeCalendar(
      buildTradingCalendar(november.filter((d) => !holiday.has(d))),
      '2026-11-30',
    );
    expect(verdict.gap!.weekdays).toBe(3);
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toBeNull();
  });

  it('passes a four-weekday cluster, which is exactly the threshold', () => {
    const missing = new Set(weekdaysBetween('2026-03-02', '2026-03-05'));
    const verdict = judgeCalendar(HEALTHY.filter((d) => !missing.has(d)), WINDOW_END);
    expect(verdict.gap!.weekdays).toBe(4);
    expect(verdict.ok).toBe(true);
  });

  it('fails one weekday past the threshold', () => {
    const missing = new Set(weekdaysBetween('2026-03-02', '2026-03-06'));
    const verdict = judgeCalendar(HEALTHY.filter((d) => !missing.has(d)), WINDOW_END);
    expect(verdict.gap!.weekdays).toBe(5);
    expect(verdict.ok).toBe(false);
  });

  // An empty calendar is a different failure with a different name. Calling
  // it an infinite gap would be true and useless, and it would fail every
  // run on a fresh database before the first NAV sync.
  it('keeps the existing no-fire behaviour on an empty calendar', () => {
    const verdict = judgeCalendar([], WINDOW_END);
    expect(verdict.ok).toBe(true);
    expect(verdict.gap).toBeNull();
    expect(verdict.reason).toBeNull();
  });

  it('honours a configured threshold over the default', () => {
    const missing = new Set(weekdaysBetween('2026-03-02', '2026-03-20'));
    const calendar = HEALTHY.filter((d) => !missing.has(d));
    expect(judgeCalendar(calendar, WINDOW_END, 20).ok).toBe(true);
    expect(judgeCalendar(calendar, WINDOW_END, 2).ok).toBe(false);
  });

  it('defaults to four weekdays', () => {
    expect(DEFAULT_MAX_CALENDAR_GAP_WEEKDAYS).toBe(4);
    const missing = new Set(weekdaysBetween('2026-03-02', '2026-03-06'));
    const calendar = HEALTHY.filter((d) => !missing.has(d));
    expect(judgeCalendar(calendar, WINDOW_END).ok).toBe(
      judgeCalendar(calendar, WINDOW_END, DEFAULT_MAX_CALENDAR_GAP_WEEKDAYS).ok,
    );
  });

  // Why the threshold is not tighter: a false positive here fails a whole
  // scoring run, and the market really does close for three weekdays.
  it('does not fire on any plausible holiday cluster', () => {
    for (const len of [1, 2, 3]) {
      const start = '2026-03-02';
      const missing = new Set(weekdaysBetween(start, weekdaysBetween(start, '2026-03-31')[len - 1]!));
      const verdict = judgeCalendar(HEALTHY.filter((d) => !missing.has(d)), WINDOW_END);
      expect(verdict.ok, `${len}-weekday cluster should pass`).toBe(true);
    }
  });
});
