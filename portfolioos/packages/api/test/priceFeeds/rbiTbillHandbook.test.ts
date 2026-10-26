/**
 * RBI Handbook 91-day T-bill auctions — golden fixtures are the real tables
 * of six annual editions, captured 2026-10-26 (see fixtures README).
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  parseHandbookDate,
  parseRbiTbillHandbook,
} from '../../src/priceFeeds/rbiTbillHandbook.parse.js';
import {
  fetchRbiTbillHistory,
  RBI_TBILL_HANDBOOK_EDITIONS,
} from '../../src/priceFeeds/rbiTbillHandbook.v1.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const fixture = (name: string): Promise<string> =>
  readFile(resolve(here, '../fixtures/mf/benchmarks/', name), 'utf8');
const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** Edition id -> [rows, first auction, its yield, last auction, its yield]. */
const GOLDEN: ReadonlyArray<readonly [number, number, string, string, string, string]> = [
  [15340, 57, '2012-07-04', '8.2692', '2013-08-07', '10.9185'],
  [16009, 59, '2013-07-03', '7.5186', '2014-08-20', '8.6456'],
  [16662, 56, '2014-07-02', '8.5201', '2015-07-22', '7.4769'],
  // Two auctions in this edition had every bid rejected (27-Jan and
  // 24-Feb-2016): no cut-off, so no rate, so 55 rows and two missing_rate.
  [17354, 55, '2015-07-02', '7.5602', '2016-07-27', '6.5634'],
  [17996, 56, '2016-07-05', '6.6048', '2017-07-26', '6.1495'],
  [18680, 56, '2017-07-05', '6.3149', '2018-07-25', '6.6877'],
];

describe('parseRbiTbillHandbook — real editions', () => {
  it.each(GOLDEN)('edition %i', async (id, count, firstDate, firstRate, lastDate, lastRate) => {
    const parsed = parseRbiTbillHandbook(await fixture(`rbi-tbill-handbook-${id}.table.html`));
    expect(parsed.series).toBe('TBILL_91D');
    expect(parsed.failures.map((f) => f.reason)).toEqual(
      id === 17354 ? ['missing_rate', 'missing_rate'] : [],
    );
    expect(parsed.rows).toHaveLength(count);
    expect(iso(parsed.rows[0]!.date)).toBe(firstDate);
    expect(parsed.rows[0]!.ratePct.toFixed(4)).toBe(firstRate);
    expect(iso(parsed.rows.at(-1)!.date)).toBe(lastDate);
    expect(parsed.rows.at(-1)!.ratePct.toFixed(4)).toBe(lastRate);
    // Aug-2013's rupee defence took the 91-day yield above 12%.
    for (const r of parsed.rows) {
      expect(r.ratePct.gt(3) && r.ratePct.lt(13), `${iso(r.date)} ${r.ratePct.toString()}`).toBe(true);
    }
  });

  it('reads the full page, navigation and all, the same as the bare table', async () => {
    const page = parseRbiTbillHandbook(await fixture('rbi-tbill-handbook-15340.page.html'));
    const table = parseRbiTbillHandbook(await fixture('rbi-tbill-handbook-15340.table.html'));
    expect(page.rows.map((r) => [iso(r.date), r.ratePct.toString()])).toEqual(
      table.rows.map((r) => [iso(r.date), r.ratePct.toString()]),
    );
  });

  it('never reads the notified amount as the cut-off price', async () => {
    // 2014-15 auctions notified ₹90 crore: "90.00" sits in the price band.
    const parsed = parseRbiTbillHandbook(await fixture('rbi-tbill-handbook-16662.table.html'));
    const jul2 = parsed.rows.find((r) => iso(r.date) === '2014-07-02');
    expect(jul2?.ratePct.toFixed(4)).toBe('8.5201');
  });
});

describe('parseRbiTbillHandbook — edge rows', () => {
  const row = (cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;

  it('a 12-column row (no Amount Outstanding) still yields its rate', () => {
    const html = `<table>${row(['03-Jul-2024', '04-Jul-2024', '8000', '93', '29591', '1965', '21', '7935', '1965', '9900', '98.34', '6.7810'])}</table>`;
    expect(parseRbiTbillHandbook(html).rows[0]!.ratePct.toFixed(4)).toBe('6.7810');
  });

  it('an auction with all bids rejected is missing_rate, never zero', () => {
    const html = `<table>${row(['20-Feb-2025', '21-Feb-2025', '14000', '131', '27118', '5452', '0', '0', '0', '0', '-', '-'])}</table>`;
    const parsed = parseRbiTbillHandbook(html);
    expect(parsed.rows).toEqual([]);
    expect(parsed.failures.map((f) => f.reason)).toEqual(['missing_rate']);
  });

  it('skips headers and fiscal-year dividers, and reports an empty table', () => {
    const html = `<table>${row(['Date of Auction', 'Date of Issue'])}${row(['2016-17', ''])}</table>`;
    expect(parseRbiTbillHandbook(html).failures.map((f) => f.reason)).toEqual(['empty_payload']);
  });

  it('parses DD-Mon-YYYY at UTC midnight and rejects impossible dates', () => {
    expect(parseHandbookDate('04-Jul-2012')?.toISOString()).toBe('2012-07-04T00:00:00.000Z');
    expect(parseHandbookDate('31-Feb-2013')).toBeNull();
    expect(parseHandbookDate('2012-07-04')).toBeNull();
  });
});

describe('fetchRbiTbillHistory', () => {
  const fromFixtures = async (url: string) => {
    const id = /id=(\d+)/.exec(url)?.[1];
    return { ok: true as const, text: await fixture(`rbi-tbill-handbook-${id}.table.html`) };
  };

  it('stitches the editions covering a range, without duplicates', async () => {
    const out = await fetchRbiTbillHistory(
      { from: new Date('2012-10-01T00:00:00Z'), to: new Date('2017-08-22T00:00:00Z') },
      { fetchText: fromFixtures },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.failures.map((f) => f.reason)).toEqual(['missing_rate', 'missing_rate']);
    expect(out.adapterId).toBe('rbi.handbook.tbill91');
    const dates = out.rows.map((r) => iso(r.date));
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates[0]! >= '2012-10-01').toBe(true);
    expect(dates.at(-1)! <= '2017-08-22').toBe(true);
    // Weekly auctions, no hole longer than a fortnight across five years.
    for (let i = 1; i < out.rows.length; i++) {
      const gapDays = (out.rows[i]!.date.getTime() - out.rows[i - 1]!.date.getTime()) / 86_400_000;
      expect(gapDays, dates[i]).toBeLessThanOrEqual(15);
    }
  });

  it('fails the whole fetch when one edition cannot be read', async () => {
    const out = await fetchRbiTbillHistory(
      { from: new Date('2012-07-01T00:00:00Z'), to: new Date('2018-07-31T00:00:00Z') },
      {
        fetchText: async (url) =>
          url.includes(`id=${RBI_TBILL_HANDBOOK_EDITIONS[2]!.id}`)
            ? { ok: false as const, reason: 'HTTP_ERROR' as const, detail: '503', httpStatus: 503 }
            : fromFixtures(url),
      },
    );
    expect(out.ok).toBe(false);
  });
});
