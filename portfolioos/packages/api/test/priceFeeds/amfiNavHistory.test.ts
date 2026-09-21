import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseAmfiNavHistoryText,
  parseAmfiHistoryDate,
  toAmfiDateParam,
} from '../../src/priceFeeds/amfiNavHistory.js';
import { parseAmfiNavText } from '../../src/priceFeeds/amfi.service.js';
import { findNavGap, monthWindows } from '../../src/priceFeeds/amfiNavGap.js';

/**
 * Fixture is a slice of what portal.amfiindia.com actually returned for
 * frmdt=15-Sep-2026&todt=16-Sep-2026, taken on 21 Sep 2026.
 */
const FIXTURE = join(__dirname, '..', 'fixtures', 'amfi', 'navhistory-excerpt.txt');
const historyText = readFileSync(FIXTURE, 'utf8');

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('AMFI historical NAV report', () => {
  it('reads code, name, plan, option, ISIN, NAV and date from the real columns', () => {
    const { rows, parseFailures } = parseAmfiNavHistoryText(historyText);
    expect(parseFailures).toBe(0);
    const row = rows.find((r) => r.schemeCode === '148921' && r.date.getUTCDate() === 15);
    expect(row).toBeTruthy();
    expect(row!.navName).toBe('Aditya Birla Sun Life Multi-Cap Fund-Direct Growth');
    expect(row!.planType).toBe('Direct Plan');
    expect(row!.optionType).toBe('GROWTH');
    expect(row!.isin).toBe('INF209KB1Y49');
    expect(row!.nav).toBe('22.43');
    expect(row!.date.toISOString().slice(0, 10)).toBe('2026-09-15');
  });

  it('returns one row per scheme per day across the requested range', () => {
    const { rows } = parseAmfiNavHistoryText(historyText);
    const forScheme = rows.filter((r) => r.schemeCode === '148921');
    expect(forScheme.map((r) => r.date.toISOString().slice(0, 10))).toEqual([
      '2026-09-15',
      '2026-09-16',
    ]);
    expect(forScheme.map((r) => r.nav)).toEqual(['22.43', '22.45']);
  });

  it('keeps empty plan and option columns as null rather than empty strings', () => {
    const { rows } = parseAmfiNavHistoryText(historyText);
    const unclaimed = rows.find((r) => r.schemeCode === '139619')!;
    expect(unclaimed.planType).toBeNull();
    expect(unclaimed.optionType).toBeNull();
    expect(unclaimed.isin).toBeNull();
    expect(unclaimed.nav).toBe('10.0000');
  });

  /**
   * Why this parser exists rather than reusing the NAVAll one.
   *
   * Both files have eight semicolon-separated fields and both happen to put
   * the NAV and the date last, so the NAVAll parser reads this file without
   * complaining — and gets the identity of every fund wrong. Fields 1 to 5
   * are in a different order, so the scheme name comes out as the option
   * ("GROWTH") and the ISIN lands in the plan column.
   *
   * That is worse than a crash: a parser that fails is noticed, and this one
   * would have quietly written thousands of NAVs against funds named GROWTH.
   */
  it('is not interchangeable with the NAVAll parser', () => {
    const asNavAll = parseAmfiNavText(historyText);
    const wrong = asNavAll.find((r) => r.schemeCode === '148921')!;
    expect(wrong.schemeName).toBe('GROWTH');
    expect(wrong.planType).toBe('INF209KB1Y49');

    const right = parseAmfiNavHistoryText(historyText).rows.find(
      (r) => r.schemeCode === '148921',
    )!;
    expect(right.navName).toBe('Aditya Birla Sun Life Multi-Cap Fund-Direct Growth');
    expect(right.planType).toBe('Direct Plan');
    // The one thing both get right, which is exactly what makes the mix-up
    // survivable long enough to do damage.
    expect(wrong.nav).toBe(right.nav);
  });

  it('counts a short line as a failure instead of dropping it', () => {
    const { rows, dataLines, parseFailures } = parseAmfiNavHistoryText(
      ['Scheme Code;NAV Name;Plan;Option;ISIN;ISIN2;Net Asset Value;Date', '148921;Short;Row'].join(
        '\n',
      ),
    );
    expect(rows).toEqual([]);
    expect(dataLines).toBe(1);
    expect(parseFailures).toBe(1);
  });

  it('parses and formats AMFI dates', () => {
    expect(parseAmfiHistoryDate('15-Sep-2026')!.toISOString()).toBe('2026-09-15T00:00:00.000Z');
    expect(parseAmfiHistoryDate('2026-09-15')).toBeNull();
    expect(toAmfiDateParam(day('2026-09-05'))).toBe('05-Sep-2026');
  });
});

describe('gap detection', () => {
  const full = 8000;
  const mk = (date: string, funds: number) => ({ date: day(date), funds });

  it('bounds the gap between the last two days the sync worked', () => {
    const days = [
      mk('2026-08-03', full),
      mk('2026-08-04', full),
      // sync stops here
      mk('2026-08-06', 3),
      mk('2026-08-10', 1),
      // and resumes
      mk('2026-09-18', full),
    ];
    const gap = findNavGap(days);
    expect(gap.start!.toISOString().slice(0, 10)).toBe('2026-08-05');
    expect(gap.end!.toISOString().slice(0, 10)).toBe('2026-09-17');
    expect(gap.healthyDailyFunds).toBe(full);
    expect(gap.thinDays).toBe(2);
    expect(gap.emptyDays).toBeGreaterThan(20);
  });

  // The failure the first version of this detector had: on a database whose
  // early history was seeded rather than synced, every old day looks thin and
  // the walk runs off the start of the table.
  it('refuses to guess when only one day ever carried a full NAV set', () => {
    const gap = findNavGap([mk('2020-01-02', 4), mk('2026-09-18', full)]);
    expect(gap.start).toBeNull();
    expect(gap.basis).toContain('cannot be bounded');
  });

  it('reports no gap for two consecutive healthy days', () => {
    const gap = findNavGap([mk('2026-09-17', full), mk('2026-09-18', full)]);
    expect(gap.start).toBeNull();
    expect(gap.basis).toContain('no gap');
  });

  it('does not count an empty weekend as an outage', () => {
    // 2026-09-18 is a Friday; 19th and 20th are the weekend.
    const gap = findNavGap([mk('2026-09-18', full), mk('2026-09-21', full)]);
    expect(gap.start).toBeNull();
  });

  it('handles an empty table', () => {
    expect(findNavGap([]).start).toBeNull();
  });
});

describe('monthWindows', () => {
  it('splits a range into calendar months', () => {
    const w = monthWindows(day('2026-08-05'), day('2026-10-03'));
    expect(w.map((x) => [x.from, x.to].map((d) => d.toISOString().slice(0, 10)))).toEqual([
      ['2026-08-05', '2026-08-31'],
      ['2026-09-01', '2026-09-30'],
      ['2026-10-01', '2026-10-03'],
    ]);
  });

  it('keeps a within-month range as one window', () => {
    const w = monthWindows(day('2026-08-05'), day('2026-08-09'));
    expect(w.length).toBe(1);
    expect(w[0]!.to.toISOString().slice(0, 10)).toBe('2026-08-09');
  });
});
