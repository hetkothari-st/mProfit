/**
 * The nightly metrics cron made this the difference between a fund's 1-year
 * horizon reading "13 years of history" and reading "not enough history" —
 * decided by nothing but which day the job happened to run. Month lengths are
 * the awkward part: 28/29/30/31 all occur and February moves.
 */
import { describe, it, expect } from 'vitest';
import { lastCompletedMonthEnd } from '../../../src/services/mfAnalytics/mfMetricsMath.js';

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('lastCompletedMonthEnd', () => {
  it('returns the date itself when it is already a month end', () => {
    expect(iso(lastCompletedMonthEnd(utc('2026-08-31')))).toBe('2026-08-31');
    expect(iso(lastCompletedMonthEnd(utc('2026-04-30')))).toBe('2026-04-30');
    expect(iso(lastCompletedMonthEnd(utc('2026-02-28')))).toBe('2026-02-28');
    expect(iso(lastCompletedMonthEnd(utc('2028-02-29')))).toBe('2028-02-29');
  });

  it('steps back to the previous month end mid-month', () => {
    // The date that produced the wall of "not enough history".
    expect(iso(lastCompletedMonthEnd(utc('2026-09-08')))).toBe('2026-08-31');
    expect(iso(lastCompletedMonthEnd(utc('2026-03-01')))).toBe('2026-02-28');
    expect(iso(lastCompletedMonthEnd(utc('2026-05-30')))).toBe('2026-04-30');
  });

  it('crosses a year boundary', () => {
    expect(iso(lastCompletedMonthEnd(utc('2026-01-15')))).toBe('2025-12-31');
    expect(iso(lastCompletedMonthEnd(utc('2026-01-01')))).toBe('2025-12-31');
    expect(iso(lastCompletedMonthEnd(utc('2026-12-31')))).toBe('2026-12-31');
  });

  it('handles February in a leap year from the following month', () => {
    expect(iso(lastCompletedMonthEnd(utc('2028-03-10')))).toBe('2028-02-29');
  });

  it('is idempotent — anchoring an anchor changes nothing', () => {
    for (const d of ['2026-09-08', '2026-01-01', '2028-03-10', '2026-08-31']) {
      const once = lastCompletedMonthEnd(utc(d));
      expect(iso(lastCompletedMonthEnd(once))).toBe(iso(once));
    }
  });

  it('never returns a date after asOf', () => {
    for (const d of ['2026-09-08', '2026-02-01', '2026-12-30', '2028-02-29']) {
      expect(lastCompletedMonthEnd(utc(d)).getTime()).toBeLessThanOrEqual(utc(d).getTime());
    }
  });

  it('yields a 1-year window with twelve monthly returns from any run date', () => {
    // Thirteen month-end samples -> twelve returns, the floor. The property
    // that was violated on every non-month-end day.
    for (const d of ['2026-09-08', '2026-09-30', '2026-01-15', '2026-03-01']) {
      const to = lastCompletedMonthEnd(utc(d));
      const from = new Date(
        Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), to.getUTCDate()),
      );
      let count = 0;
      const cur = new Date(from.getTime());
      while (cur.getTime() <= to.getTime()) {
        count += 1;
        // Step to the next month end.
        cur.setUTCFullYear(cur.getUTCFullYear(), cur.getUTCMonth() + 2, 0);
      }
      expect(count, `window ${iso(from)}..${iso(to)} for asOf ${d}`).toBe(13);
    }
  });
});
