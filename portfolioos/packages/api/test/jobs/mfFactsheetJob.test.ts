/**
 * The publication-lag default, measured against a real AMC.
 *
 * On 2026-09-08 sbimf.com serves the July disclosure (200) and redirects the
 * August one (302) — SEBI allows ten days from month end and AMCs use them.
 * Getting this wrong does not fail loudly: the 302 lands on an HTML error page
 * which then fails as "not a workbook", which reads like a parser bug and sends
 * the reader into the parser rather than the calendar.
 */
import { describe, it, expect } from 'vitest';
import { defaultDisclosureMonth } from '../../src/jobs/mfFactsheetJob.js';

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('defaultDisclosureMonth', () => {
  it('steps back a month when the last month end is too recent', () => {
    // The observed case: August not yet published on 8 September.
    expect(iso(defaultDisclosureMonth(utc('2026-09-08')))).toBe('2026-07-31');
    expect(iso(defaultDisclosureMonth(utc('2026-09-01')))).toBe('2026-07-31');
  });

  it('uses the last month end once the lag has passed', () => {
    expect(iso(defaultDisclosureMonth(utc('2026-09-12')))).toBe('2026-08-31');
    expect(iso(defaultDisclosureMonth(utc('2026-09-30')))).toBe('2026-08-31');
  });

  it('crosses a year boundary', () => {
    expect(iso(defaultDisclosureMonth(utc('2026-01-05')))).toBe('2025-11-30');
    expect(iso(defaultDisclosureMonth(utc('2026-01-20')))).toBe('2025-12-31');
  });

  it('handles February in a common and a leap year', () => {
    expect(iso(defaultDisclosureMonth(utc('2026-03-20')))).toBe('2026-02-28');
    expect(iso(defaultDisclosureMonth(utc('2028-03-20')))).toBe('2028-02-29');
    // Too early in March — step back to January.
    expect(iso(defaultDisclosureMonth(utc('2028-03-02')))).toBe('2028-01-31');
  });

  it('always returns a month end, never a mid-month date', () => {
    for (let day = 1; day <= 28; day += 3) {
      const d = defaultDisclosureMonth(utc(`2026-06-${String(day).padStart(2, '0')}`));
      const next = new Date(d.getTime());
      next.setUTCDate(next.getUTCDate() + 1);
      expect(next.getUTCMonth(), `day ${day} produced ${iso(d)}`).not.toBe(d.getUTCMonth());
    }
  });

  it('never returns a month end in the future', () => {
    for (const d of ['2026-09-08', '2026-01-01', '2026-12-31', '2028-02-29']) {
      expect(defaultDisclosureMonth(utc(d)).getTime()).toBeLessThan(utc(d).getTime());
    }
  });
});
