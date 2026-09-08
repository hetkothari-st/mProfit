/**
 * Tests for the MFAPI NAV-history parser.
 *
 * FIXTURES ARE CAPTURED FROM THE LIVE API, not hand-written. That is the whole
 * point of this file: the AMFI scheme-master parser shipped with synthetic
 * fixtures written from the same wrong assumption as the code, so both agreed
 * and both were wrong on 95% of real rows. A fixture that a human invented can
 * only confirm what that human already believed.
 *
 * `test/fixtures/mf/mfapi/` therefore contains real responses, trimmed but
 * never edited:
 *
 *   scheme-120465-growth.json        Axis Large Cap, DIRECT/GROWTH. Trimmed to
 *                                    58 of 3,375 points, deliberately KEEPING
 *                                    the genuine `{"date":"07-04-2013",
 *                                    "nav":"0.00000"}` and its neighbours.
 *   scheme-119551-idcw-reinvest.json ABSL Banking & PSU Debt, IDCW-reinvest —
 *                                    a second option type, and a `meta` with a
 *                                    non-null `isin_div_reinvestment`.
 *   unknown-scheme.json              The verbatim 200 response for scheme code
 *                                    99999999. This is what MFAPI returns for
 *                                    an unknown scheme: not a 404.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseMfapiNavHistory,
  parseMfapiDate,
} from '../../src/priceFeeds/mfapiNavHistory.parse.js';

const here = fileURLToPath(new URL('.', import.meta.url));

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(here, '../fixtures/mf/mfapi', name), 'utf8')) as unknown;
}

const GROWTH = fixture('scheme-120465-growth.json');
const IDCW = fixture('scheme-119551-idcw-reinvest.json');
const UNKNOWN = fixture('unknown-scheme.json');

const iso = (d: Date): string => d.toISOString().slice(0, 10);

describe('parseMfapiDate — DD-MM-YYYY is DAY-FIRST', () => {
  /**
   * The load-bearing case. "07-04-2013" is 7 April, not 4 July. A month-first
   * reading produces a valid `Date` on a wrong day for the first 12 days of
   * every month and is undetectable downstream.
   */
  it('reads an ambiguous date day-first', () => {
    expect(iso(parseMfapiDate('07-04-2013')!)).toBe('2013-04-07');
    expect(iso(parseMfapiDate('01-12-2020')!)).toBe('2020-12-01');
    expect(iso(parseMfapiDate('12-01-2020')!)).toBe('2020-01-12');
  });

  it('reads an unambiguous date the same way', () => {
    // Day > 12, so only one reading is even possible. If this passed while the
    // ambiguous cases above failed, the bug would look like "mostly works".
    expect(iso(parseMfapiDate('31-12-2025')!)).toBe('2025-12-31');
    expect(iso(parseMfapiDate('24-08-2026')!)).toBe('2026-08-24');
  });

  it('anchors at UTC midnight so a @db.Date round-trip cannot shift the day', () => {
    const d = parseMfapiDate('07-04-2013')!;
    expect(d.getUTCHours()).toBe(0);
    expect(d.toISOString()).toBe('2013-04-07T00:00:00.000Z');
  });

  it('rejects impossible calendar days instead of rolling them forward', () => {
    // `Date.UTC(2020, 1, 31)` silently becomes 2 March. Returning a valid Date
    // for 31 February is worse than returning null.
    expect(parseMfapiDate('31-02-2020')).toBeNull();
    expect(parseMfapiDate('00-01-2020')).toBeNull();
    expect(parseMfapiDate('01-13-2020')).toBeNull();
  });

  it('rejects other date formats rather than guessing', () => {
    expect(parseMfapiDate('2013-04-07')).toBeNull();
    expect(parseMfapiDate('07-Apr-2013')).toBeNull();
    expect(parseMfapiDate('')).toBeNull();
    expect(parseMfapiDate('not a date')).toBeNull();
  });
});

describe('parseMfapiNavHistory — the real response shape', () => {
  it('parses the live growth-scheme payload', () => {
    const r = parseMfapiNavHistory(GROWTH);

    expect(r.status).toBe('SUCCESS');
    expect(r.isEmpty).toBe(false);
    expect(r.dateFormatWarning).toBeNull();

    // `scheme_code` arrives as a JSON NUMBER and must come back as a string,
    // because every scheme key in this repo is a string.
    expect(r.meta.schemeCode).toBe('120465');
    expect(typeof r.meta.schemeCode).toBe('string');
    expect(r.meta.fundHouse).toBe('Axis Mutual Fund');
    expect(r.meta.isinGrowth).toBe('INF846K01DP8');
    expect(r.meta.isinDivReinvestment).toBeNull();
  });

  it('parses the live IDCW-reinvest payload, including its second ISIN', () => {
    const r = parseMfapiNavHistory(IDCW);
    expect(r.meta.schemeCode).toBe('119551');
    expect(r.meta.isinDivReinvestment).toBe('INF209KA13Z9');
    expect(r.points.length).toBeGreaterThan(20);
  });

  it('returns points ASCENDING even though the API sends newest-first', () => {
    // MFAPI's own ordering is descending. Every consumer in the repo reads a
    // chronological series, so no consumer should depend on the API's order.
    const raw = (GROWTH as { data: Array<{ date: string }> }).data;
    expect(raw[0]!.date).toBe('04-09-2026');
    expect(raw[raw.length - 1]!.date).toBe('02-01-2013');

    const r = parseMfapiNavHistory(GROWTH);
    const times = r.points.map((p) => p.date.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(iso(r.points[0]!.date)).toBe('2013-01-02');
    expect(iso(r.points[r.points.length - 1]!.date)).toBe('2026-09-04');
  });

  it('keeps NAV as an exact Decimal(18,4) string, never a JS number', () => {
    const r = parseMfapiNavHistory(GROWTH);
    const latest = r.points[r.points.length - 1]!;
    // Source is "69.66000" (5 dp). `MFNav.nav` is Decimal(18,4).
    expect(latest.nav).toBe('69.6600');
    expect(typeof latest.nav).toBe('string');
    for (const p of r.points) expect(typeof p.nav).toBe('string');
  });
});

describe('parseMfapiNavHistory — the malformed point that is really in the data', () => {
  /**
   * Not an invented edge case. Scheme 120465 publishes a literal
   * `{"date":"07-04-2013","nav":"0.00000"}` between 11.98 and 11.97. Writing
   * it would read as a -100% day followed by a +infinity day and would destroy
   * the volatility and max-drawdown of every horizon spanning it.
   */
  it('rejects the live zero NAV and reports it, keeping every other point', () => {
    const raw = (GROWTH as { data: Array<{ date: string; nav: string }> }).data;
    expect(raw.some((d) => d.date === '07-04-2013' && d.nav === '0.00000')).toBe(true);

    const r = parseMfapiNavHistory(GROWTH);

    expect(r.points.some((p) => iso(p.date) === '2013-04-07')).toBe(false);
    const failure = r.failures.find((f) => f.reason === 'non_positive_nav');
    expect(failure).toBeDefined();
    expect(failure!.raw).toContain('07-04-2013');

    // The neighbours survive: one bad point costs one point, not the series.
    expect(r.points.some((p) => iso(p.date) === '2013-04-08')).toBe(true);
    expect(r.points.some((p) => iso(p.date) === '2013-04-05')).toBe(true);
    expect(r.points.length).toBe(raw.length - 1);
  });

  it('rejects a malformed date, a malformed NAV and a non-object point independently', () => {
    const r = parseMfapiNavHistory({
      meta: { scheme_code: 1, scheme_name: 'X' },
      status: 'SUCCESS',
      data: [
        { date: '02-01-2013', nav: '10.0000' }, // good
        { date: '31-02-2013', nav: '10.0000' }, // impossible day
        { date: '03-01-2013', nav: 'N.A.' }, // not a decimal
        { date: '04-01-2013', nav: '1,234.50' }, // thousands separator
        { date: '05-01-2013', nav: '-1.0000' }, // negative
        'not an object',
        { date: '06-01-2013' }, // nav missing
        { date: '07-01-2013', nav: 11.5 }, // a JSON NUMBER, not a string
        { date: '08-01-2013', nav: '11.0000' }, // good
      ],
    });

    expect(r.points.map((p) => iso(p.date))).toEqual(['2013-01-02', '2013-01-08']);
    const reasons = r.failures.map((f) => f.reason).sort();
    expect(reasons).toEqual([
      'malformed_date',
      'malformed_nav',
      'malformed_nav',
      'malformed_point',
      'malformed_point',
      'malformed_point',
      'non_positive_nav',
    ]);
  });

  it('refuses a JSON-number NAV even though it would coerce cleanly', () => {
    // A JSON number has already been through IEEE-754 before we see it, so
    // accepting one would launder a rounded value into a Decimal column and
    // look entirely fine (`CONTEXT.md §3.1`).
    const r = parseMfapiNavHistory({
      data: [{ date: '02-01-2013', nav: 10.1 }],
    });
    expect(r.points).toHaveLength(0);
    expect(r.failures[0]!.reason).toBe('malformed_point');
    expect(r.failures[0]!.detail).toContain('nav=number');
  });

  it('keeps the first of two points on the same date, deterministically', () => {
    const r = parseMfapiNavHistory({
      data: [
        { date: '02-01-2013', nav: '10.0000' },
        { date: '02-01-2013', nav: '99.0000' },
      ],
    });
    expect(r.points).toHaveLength(1);
    expect(r.points[0]!.nav).toBe('10.0000');
    expect(r.failures[0]!.reason).toBe('duplicate_date');
  });
});

describe('parseMfapiNavHistory — the unknown-scheme response', () => {
  /**
   * MFAPI answers an unknown scheme code with HTTP 200, `status: "SUCCESS"`
   * and an empty `data`. Nothing about the envelope says "not found", so
   * `isEmpty` is the only signal a caller has.
   */
  it('reports the live 200-with-empty-data response as empty, not as a failure', () => {
    const r = parseMfapiNavHistory(UNKNOWN);
    expect(r.status).toBe('SUCCESS');
    expect(r.isEmpty).toBe(true);
    expect(r.points).toHaveLength(0);
    // Blank strings in `meta` must not become a scheme code of "" or "0".
    expect(r.meta.schemeCode).toBeNull();
    expect(r.meta.fundHouse).toBeNull();
    // An empty array is a legitimate answer, not a parse failure.
    expect(r.failures).toHaveLength(0);
  });

  it('distinguishes an absent `data` key from an empty `data` array', () => {
    const absent = parseMfapiNavHistory({ meta: {}, status: 'SUCCESS' });
    expect(absent.isEmpty).toBe(true);
    expect(absent.failures[0]!.reason).toBe('malformed_point');
    expect(absent.failures[0]!.detail).toContain('absent');
  });

  it('never throws on a payload that is not even an object', () => {
    for (const bad of [null, undefined, 42, 'text', []]) {
      const r = parseMfapiNavHistory(bad);
      expect(r.isEmpty).toBe(true);
      expect(r.failures.length).toBeGreaterThan(0);
    }
  });
});

describe('parseMfapiNavHistory — the day-first format guard', () => {
  it('trips when a date has a month position above 12', () => {
    // A month-first payload would look like this. Because no downstream check
    // could catch it, the parser refuses to vouch for ANY date in the payload.
    const r = parseMfapiNavHistory({
      data: [
        { date: '04-09-2026', nav: '10.0000' },
        { date: '09-25-2026', nav: '10.1000' }, // 25 in the month position
      ],
    });
    expect(r.dateFormatWarning).not.toBeNull();
    expect(r.dateFormatWarning).toContain('25');
  });

  it('does not trip on a real payload', () => {
    expect(parseMfapiNavHistory(GROWTH).dateFormatWarning).toBeNull();
    expect(parseMfapiNavHistory(IDCW).dateFormatWarning).toBeNull();
  });

  it('does not trip on a short series where every day happens to be <= 12', () => {
    // A two-week-old scheme can legitimately have no date whose day exceeds
    // 12. "Looks month-first" is not evidence of anything; only the impossible
    // direction is a failure.
    const r = parseMfapiNavHistory({
      data: [
        { date: '01-09-2026', nav: '10.0000' },
        { date: '02-09-2026', nav: '10.1000' },
      ],
    });
    expect(r.dateFormatWarning).toBeNull();
    expect(r.points).toHaveLength(2);
  });
});
