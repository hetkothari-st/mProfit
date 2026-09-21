import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseAmfiNavText,
  parseAmfiNavTextWithCounts,
} from '../../src/priceFeeds/amfi.service.js';

/**
 * The live bug this file exists for.
 *
 * AMFI's NAVAll.txt used to be six semicolon-separated fields:
 *   code;isin;isinReinvest;name;NAV;date
 * It gained Plan and Option as their own columns:
 *   code;isin;isinReinvest;name;Plan;Option;NAV;date
 *
 * Read with the old offsets, field 4 is "Direct Plan" rather than a number.
 * Every row failed `isNaN(Number(nav))`, the loop skipped every row, the job
 * reported success, and the NAV sync imported zero rows for weeks.
 *
 * The excerpt is a slice of the file AMFI actually served on 18 Sep 2026.
 */

const FIXTURE = join(__dirname, '..', 'fixtures', 'amfi', 'navall-excerpt.txt');
const eightColumnText = readFileSync(FIXTURE, 'utf8');

// The same schemes as the fixture's first rows, in the layout AMFI published
// before the change — kept so a rollback on their side is not an outage here.
const sixColumnText = [
  'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date',
  '',
  "Open Ended Schemes(Children's Fund - Childrens' Fund)",
  '',
  'Axis Mutual Fund',
  '',
  "135762;INF846K01WO1;-;Axis Children's Fund - Direct Plan - Growth Option;29.8856;18-Sep-2026",
  "135759;INF846K01WJ1;-;Axis Children's Fund - Regular Plan - Growth Option;26.0243;18-Sep-2026",
].join('\n');

describe('AMFI NAVAll parser', () => {
  it('reads NAV and date from the eight-column layout', () => {
    const rows = parseAmfiNavText(eightColumnText);
    const row = rows.find((r) => r.schemeCode === '135762');
    expect(row).toBeTruthy();
    expect(row!.nav).toBe('29.8856');
    expect(row!.date).toBe('18-Sep-2026');
    expect(row!.schemeName).toBe("Axis Children's Fund");
    expect(row!.planType).toBe('Direct Plan');
    expect(row!.optionType).toBe('Growth Option');
  });

  // The regression itself: with the old offsets every NAV here is a plan name.
  it('never returns a non-numeric NAV', () => {
    const rows = parseAmfiNavText(eightColumnText);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(Number.isNaN(Number(r.nav))).toBe(false);
    }
  });

  it('reads the whole real excerpt with no parse failures', () => {
    const { rows, dataLines, parseFailures } = parseAmfiNavTextWithCounts(eightColumnText);
    expect(dataLines).toBe(12);
    expect(rows.length).toBe(12);
    expect(parseFailures).toBe(0);
  });

  it('still reads the legacy six-column layout', () => {
    const { rows, parseFailures } = parseAmfiNavTextWithCounts(sixColumnText);
    expect(parseFailures).toBe(0);
    expect(rows.length).toBe(2);
    expect(rows[0]!.nav).toBe('29.8856');
    expect(rows[0]!.date).toBe('18-Sep-2026');
    // The legacy file carried plan and option inside the name, so there is
    // nothing to publish here — null, not a guess.
    expect(rows[0]!.planType).toBeNull();
    expect(rows[0]!.optionType).toBeNull();
  });

  it('carries the AMC and the category bucket down from the section headers', () => {
    const rows = parseAmfiNavText(eightColumnText);
    expect(rows.find((r) => r.schemeCode === '135762')!.amcName).toBe('Axis Mutual Fund');
    expect(rows.find((r) => r.schemeCode === '135762')!.category).toBe('SOLUTION_ORIENTED');
    expect(rows.find((r) => r.schemeCode === '119551')!.amcName).toBe(
      'Aditya Birla Sun Life Mutual Fund',
    );
    expect(rows.find((r) => r.schemeCode === '119551')!.category).toBe('DEBT');
  });

  it('counts a row it cannot read instead of dropping it quietly', () => {
    const { rows, dataLines, parseFailures } = parseAmfiNavTextWithCounts(
      [
        'Axis Mutual Fund',
        '',
        "135762;INF846K01WO1;-;Axis Children's Fund;Direct Plan;Growth Option;29.8856;18-Sep-2026",
        // NAV column holding a plan name — the shape of the original bug.
        "135765;INF846K01WP8;-;Axis Children's Fund;Direct Plan;IDCW Option;Direct Plan;18-Sep-2026",
      ].join('\n'),
    );
    expect(dataLines).toBe(2);
    expect(rows.length).toBe(1);
    expect(parseFailures).toBe(1);
  });

  it('treats "N.A." as an answer, not a failure', () => {
    const { rows, dataLines, parseFailures } = parseAmfiNavTextWithCounts(
      [
        'Axis Mutual Fund',
        '',
        "135762;INF846K01WO1;-;Axis Children's Fund;Direct Plan;Growth Option;N.A.;18-Sep-2026",
      ].join('\n'),
    );
    expect(dataLines).toBe(1);
    expect(rows).toEqual([]);
    expect(parseFailures).toBe(0);
  });

  // Had this counter existed, the failure rate on the day AMFI changed the
  // file would have been 100% and the run would have stopped there.
  it('reports a total failure when the whole file is read with the wrong offsets', () => {
    const shifted = eightColumnText
      .split('\n')
      .map((line) => {
        const p = line.split(';');
        // Drop the NAV and date, leaving plan/option where the NAV would be:
        // exactly what the old parser saw in the new file.
        return p.length >= 8 ? p.slice(0, 6).join(';') : line;
      })
      .join('\n');
    const { rows, dataLines, parseFailures } = parseAmfiNavTextWithCounts(shifted);
    expect(dataLines).toBe(12);
    expect(rows).toEqual([]);
    expect(parseFailures).toBe(12);
  });
});
