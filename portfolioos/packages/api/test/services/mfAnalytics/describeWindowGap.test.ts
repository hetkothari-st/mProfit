/**
 * The three reasons a window cannot open are three different operational
 * problems, and the message is the only thing that tells them apart.
 *
 * The case that motivated this: Tata Dynamic Bond Fund, NAV from 2013-01-02 to
 * 2022-09-23, asked for a 3-year window ending 2026-08-31. It reported
 * "nav_history_covers_163_of_36_months" — four times the history it needed, so
 * it read as an arithmetic bug rather than as a feed that had stopped.
 */
import { describe, it, expect } from 'vitest';
import { describeWindowGap } from '../../../src/services/mfAnalytics/mfMetrics.service.js';

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

/** Two endpoints are enough: the helper only reads first and last. */
function span(from: string, to: string) {
  return [
    { date: utc(from), value: '100' },
    { date: utc(to), value: '100' },
  ] as never;
}

describe('describeWindowGap', () => {
  it('names a stale feed instead of reporting impossible coverage', () => {
    const reason = describeWindowGap(span('2013-01-02', '2022-09-23'), utc('2026-08-31'), 3);
    expect(reason).toBe('nav_series_ends_2022-09-23_before_window_opens_2023-08-31');
    expect(reason).not.toMatch(/covers_\d+_of_36_months/);
  });

  it('still reports coverage for an ordinary young fund', () => {
    expect(describeWindowGap(span('2025-01-01', '2026-08-31'), utc('2026-08-31'), 3)).toMatch(
      /^nav_history_covers_\d+_of_36_months$/,
    );
  });

  it('names a hole at the window boundary in an otherwise live feed', () => {
    expect(describeWindowGap(span('2020-01-01', '2026-08-31'), utc('2026-08-31'), 3)).toBe(
      'no_nav_within_tolerance_of_2023-08-31',
    );
  });

  it('reports an empty series as such', () => {
    expect(describeWindowGap([] as never, utc('2026-08-31'), 3)).toBe('no_adjusted_nav_history');
  });

  it('scales the window with the horizon', () => {
    // The same series is a different problem at a different horizon, which is
    // the point of naming the window boundary in the message. Tata Dynamic
    // Bond's 2013→2022 history ENDS before a 3-year window opens, but BRACKETS
    // a 10-year one — there the fault is a hole, not a dead feed.
    expect(describeWindowGap(span('2013-01-02', '2022-09-23'), utc('2026-08-31'), 10)).toBe(
      'no_nav_within_tolerance_of_2016-08-31',
    );
    // A series that really does end before the 10-year window still says so.
    expect(describeWindowGap(span('2013-01-02', '2015-06-30'), utc('2026-08-31'), 10)).toBe(
      'nav_series_ends_2015-06-30_before_window_opens_2016-08-31',
    );
  });
});
