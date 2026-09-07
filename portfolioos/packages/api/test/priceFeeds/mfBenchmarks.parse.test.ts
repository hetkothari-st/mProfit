/**
 * Golden-fixture tests for the MF-analytics benchmark and risk-free parsers
 * (`docs/mf-analytics/07-IMPLEMENTATION-PLAN.md` Task 1.3).
 *
 * Everything under test is pure — no DB, no `scope.runAs`, no network — so this
 * file runs in milliseconds and does not need the RLS test harness.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toDecimal } from '@portfolioos/shared';

import {
  parseNiftyIndexCsv,
  parseIndexDate,
  parseIndexValue,
  detectGaps,
  countBusinessDaysBetween,
  type IndexPriceRow,
} from '../../src/priceFeeds/nseIndices.parse.js';
import { parseBseIndexCsv } from '../../src/priceFeeds/bseIndices.parse.js';
import {
  parseRbi91DayTbill,
  parseRatePct,
  forwardFillToDates,
} from '../../src/priceFeeds/rbiRiskFree.parse.js';
import {
  BENCHMARK_INDEX_SEED,
  BENCHMARK_TRI_NOT_FREELY_AVAILABLE,
  assertTotalReturnIndex,
  findBenchmarkSeed,
  PriceReturnIndexRejectedError,
} from '../../src/priceFeeds/benchmarkIndexSeed.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const fixture = (name: string): Promise<string> =>
  readFile(resolve(here, '../fixtures/mf/benchmarks/', name), 'utf8');

const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date): string => d.toISOString().slice(0, 10);
/** Stable, Decimal-free view of a parse result for determinism comparisons. */
const snapshotRows = (rows: readonly { date: Date; value?: unknown; ratePct?: unknown }[]) =>
  rows.map((r) => ({
    date: iso(r.date),
    value: (r.value ?? r.ratePct)?.toString(),
  }));

// ---------------------------------------------------------------------------
// BENCHMARK_INDEX_SEED — the TRI-only invariant (00 §9, 01 §6, 06 §1)
// ---------------------------------------------------------------------------

describe('BENCHMARK_INDEX_SEED', () => {
  it('contains every code listed in 01 §3 plus a BSE Sensex TRI', () => {
    const codes = BENCHMARK_INDEX_SEED.map((e) => e.code);
    expect(codes).toEqual([
      'NIFTY50_TRI',
      'NIFTY100_TRI',
      'NIFTY200_TRI',
      'NIFTY500_TRI',
      'NIFTY_MIDCAP150_TRI',
      'NIFTY_SMALLCAP250_TRI',
      'NIFTY_LARGEMIDCAP250_TRI',
      'NIFTY_MIDSMALLCAP400_TRI',
      'NIFTY50_HYBRID_COMPOSITE_DEBT_65_35_TRI',
      'NIFTY_SHORT_DURATION_DEBT',
      'NIFTY_CORPORATE_BOND',
      'NIFTY_LIQUID',
      'CRISIL_COMPOSITE_BOND',
      'SENSEX_TRI',
    ]);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('every seeded index is a total-return index', () => {
    for (const entry of BENCHMARK_INDEX_SEED) {
      expect(() => assertTotalReturnIndex(entry)).not.toThrow();
    }
  });

  it('assertTotalReturnIndex throws on a price-return index', () => {
    // A PRI benchmark hands the fund the market's whole dividend yield as
    // phantom alpha. It must be impossible to seed one.
    expect(() =>
      assertTotalReturnIndex({ code: 'NIFTY50_PRI', isTotalReturn: false }),
    ).toThrow(PriceReturnIndexRejectedError);

    try {
      assertTotalReturnIndex({ code: 'NIFTY50_PRI', isTotalReturn: false });
      expect.unreachable('assertTotalReturnIndex accepted a PRI');
    } catch (err) {
      expect(err).toBeInstanceOf(PriceReturnIndexRejectedError);
      expect((err as PriceReturnIndexRejectedError).code).toBe('NIFTY50_PRI');
    }
  });

  it('flags the entries with no free TRI download, all of which are seeded', () => {
    expect(BENCHMARK_TRI_NOT_FREELY_AVAILABLE).toContain('CRISIL_COMPOSITE_BOND');
    for (const code of BENCHMARK_TRI_NOT_FREELY_AVAILABLE) {
      expect(findBenchmarkSeed(code), `${code} flagged but not seeded`).toBeDefined();
    }
  });

  it('findBenchmarkSeed returns undefined for an unknown code', () => {
    expect(findBenchmarkSeed('NIFTY_NOT_A_REAL_INDEX')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// nseIndices.parse
// ---------------------------------------------------------------------------

describe('parseNiftyIndexCsv', () => {
  it('round-trips the normal Nifty 50 TRI fixture', async () => {
    const { rows, failures } = parseNiftyIndexCsv(await fixture('nifty50-tri-normal.csv'));

    expect(failures).toEqual([]);
    expect(rows).toHaveLength(22);

    // Source is newest-first; we always emit oldest-first.
    expect(iso(rows[0]!.date)).toBe('2024-04-01');
    expect(iso(rows.at(-1)!.date)).toBe('2024-04-30');
    expect(rows[0]!.value.toString()).toBe('32357.41');
    expect(rows.at(-1)!.value.toString()).toBe('33344.18');

    // Quoted turnover ("18,442.31") must not shift the close column.
    expect(rows.every((r) => r.value.gt(30_000) && r.value.lt(40_000))).toBe(true);
  });

  it('is deterministic — parsing twice gives identical output', async () => {
    const text = await fixture('nifty50-tri-normal.csv');
    const a = parseNiftyIndexCsv(text);
    const b = parseNiftyIndexCsv(text);
    expect(snapshotRows(a.rows)).toEqual(snapshotRows(b.rows));
    expect(a.failures).toEqual(b.failures);
  });

  it('routes every malformed row to failures and never throws', async () => {
    const text = await fixture('nifty50-tri-malformed.csv');
    const { rows, failures } = parseNiftyIndexCsv(text);

    // Only 01, 02, 05 and 11 April survive; the file also exercises the
    // DD-MM-YYYY date variant.
    expect(rows.map((r) => iso(r.date))).toEqual([
      '2024-04-01',
      '2024-04-02',
      '2024-04-05',
      '2024-04-11',
    ]);

    const reasons = failures.map((f) => f.reason);
    expect(reasons).toEqual([
      'bad_date', // 31-Foo-2024
      'non_positive_value', // close of -32388.93
      'duplicate_date', // 05-04-2024 repeated
      'short_row', // two columns only
      'missing_value', // close of "-"
      'bad_value', // close of "not-a-number"
      'bad_date', // 29-02-2023, not a leap year
    ]);
    // Line numbers are 1-based against the original file so a human can find them.
    expect(failures[0]!.line).toBe(4);
  });

  it('rejects a file with no recognisable header instead of throwing', () => {
    const { rows, failures } = parseNiftyIndexCsv('total garbage\nmore garbage\n');
    expect(rows).toEqual([]);
    expect(failures).toEqual([
      { line: 1, raw: 'total garbage', reason: 'missing_header' },
    ]);
  });

  it('returns a missing_header failure for empty input', () => {
    expect(parseNiftyIndexCsv('').failures[0]!.reason).toBe('missing_header');
  });
});

describe('parseIndexDate', () => {
  it('accepts every format the two NSE endpoints emit, in UTC', () => {
    for (const raw of ['05 Apr 2024', '05-04-2024', '05-Apr-2024', '2024-04-05']) {
      const d = parseIndexDate(raw);
      expect(d, raw).not.toBeNull();
      // UTC midnight exactly — no IST drift (§14.2).
      expect(d!.toISOString()).toBe('2024-04-05T00:00:00.000Z');
    }
  });

  it('treats a numeric DD-MM-YYYY as day-first', () => {
    // "05-04-2024" is 5 April, never 4 May. Month-first would silently move a
    // whole month of index history.
    expect(parseIndexDate('05-04-2024')!.getUTCMonth()).toBe(3);
  });

  it('returns null on impossible and unparseable dates', () => {
    for (const raw of ['29-02-2023', '31-04-2024', '31 Foo 2024', '', 'yesterday']) {
      expect(parseIndexDate(raw), raw).toBeNull();
    }
  });
});

describe('parseIndexValue (01 §6 validation)', () => {
  it('accepts a grouped decimal as a Decimal, not a float', () => {
    const out = parseIndexValue('"1,23,456.78"'.replace(/"/g, ''));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.toString()).toBe('123456.78');
  });

  it('rejects a non-positive index value', () => {
    for (const raw of ['0', '0.00', '-1', '-32388.93']) {
      const out = parseIndexValue(raw);
      expect(out.ok, raw).toBe(false);
      if (!out.ok) expect(out.reason).toBe('non_positive_value');
    }
  });

  it('separates a missing value from a malformed one', () => {
    for (const raw of ['', '-', 'NA', 'n.a.']) {
      const out = parseIndexValue(raw);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.reason, raw).toBe('missing_value');
    }
    const bad = parseIndexValue('not-a-number');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('bad_value');
  });
});

// ---------------------------------------------------------------------------
// detectGaps (02 §1 BENCHMARK_UNAVAILABLE, 06 §7 staleness alert)
// ---------------------------------------------------------------------------

describe('detectGaps', () => {
  it('does not flag ordinary weekends in a clean series', async () => {
    const { rows } = parseNiftyIndexCsv(await fixture('nifty50-tri-normal.csv'));
    expect(detectGaps(rows, 5)).toEqual([]);
    // Even at the strictest useful threshold a Fri→Mon weekend is not a gap.
    expect(detectGaps(rows, 0)).toEqual([]);
  });

  it('finds the 10-business-day hole in the gap fixture', async () => {
    const { rows } = parseNiftyIndexCsv(await fixture('nifty50-tri-gap.csv'));
    const gaps = detectGaps(rows, 5);

    expect(gaps).toHaveLength(1);
    expect(iso(gaps[0]!.from)).toBe('2024-04-05');
    expect(iso(gaps[0]!.to)).toBe('2024-04-22');
    expect(gaps[0]!.businessDays).toBe(10);
  });

  it('reports a single missing weekday as a one-day gap', () => {
    const rows: IndexPriceRow[] = [
      { date: utc(2024, 4, 16), value: toDecimal('100') }, // Tue
      { date: utc(2024, 4, 18), value: toDecimal('101') }, // Thu — Wed missing
    ];
    const gaps = detectGaps(rows, 0);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.businessDays).toBe(1);
  });

  it('does not mutate or reorder the caller’s array', async () => {
    const { rows } = parseNiftyIndexCsv(await fixture('nifty50-tri-gap.csv'));
    const before = snapshotRows(rows);
    detectGaps(rows, 5);
    expect(snapshotRows(rows)).toEqual(before);
  });

  it('returns no gaps for zero or one observation', () => {
    expect(detectGaps([], 5)).toEqual([]);
  });
});

describe('countBusinessDaysBetween', () => {
  it('counts weekdays strictly between two dates', () => {
    // Fri 5 Apr → Mon 8 Apr: the weekend only.
    expect(countBusinessDaysBetween(utc(2024, 4, 5), utc(2024, 4, 8))).toBe(0);
    // Mon 1 Apr → Fri 5 Apr: Tue, Wed, Thu.
    expect(countBusinessDaysBetween(utc(2024, 4, 1), utc(2024, 4, 5))).toBe(3);
    // Fri 5 Apr → Mon 22 Apr: the 10-day hole.
    expect(countBusinessDaysBetween(utc(2024, 4, 5), utc(2024, 4, 22))).toBe(10);
    // Adjacent days and same day: nothing between.
    expect(countBusinessDaysBetween(utc(2024, 4, 16), utc(2024, 4, 17))).toBe(0);
    expect(countBusinessDaysBetween(utc(2024, 4, 16), utc(2024, 4, 16))).toBe(0);
  });

  it('counts a full calendar month correctly', () => {
    // 31 Mar 2024 (Sun) → 1 May 2024 (Wed): all 22 weekdays of April.
    expect(countBusinessDaysBetween(utc(2024, 3, 31), utc(2024, 5, 1))).toBe(22);
  });
});

// ---------------------------------------------------------------------------
// bseIndices.parse
// ---------------------------------------------------------------------------

describe('parseBseIndexCsv', () => {
  it('round-trips the Sensex TRI fixture past its preamble', async () => {
    const { rows, failures } = parseBseIndexCsv(await fixture('sensex-tri.csv'));

    expect(failures).toEqual([]);
    expect(rows).toHaveLength(10);
    expect(iso(rows[0]!.date)).toBe('2024-04-01');
    expect(iso(rows.at(-1)!.date)).toBe('2024-04-12');
    expect(rows[0]!.value.toString()).toBe('110812.33');
    expect(rows.at(-1)!.value.toString()).toBe('112166.3');
  });

  it('is deterministic', async () => {
    const text = await fixture('sensex-tri.csv');
    expect(snapshotRows(parseBseIndexCsv(text).rows)).toEqual(
      snapshotRows(parseBseIndexCsv(text).rows),
    );
  });

  it('shares gap semantics with the NSE parser', async () => {
    const { rows } = parseBseIndexCsv(await fixture('sensex-tri.csv'));
    expect(detectGaps(rows, 5)).toEqual([]);
  });

  it('rejects an unrecognised file without throwing', () => {
    const { rows, failures } = parseBseIndexCsv('nothing,useful\n1,2\n');
    expect(rows).toEqual([]);
    expect(failures[0]!.reason).toBe('missing_header');
  });
});

// ---------------------------------------------------------------------------
// rbiRiskFree.parse
// ---------------------------------------------------------------------------

describe('parseRbi91DayTbill', () => {
  it('round-trips the DBIE fixture and tags the series', async () => {
    const result = parseRbi91DayTbill(await fixture('rbi-tbill-91d.csv'));

    expect(result.series).toBe('TBILL_91D');
    expect(result.rows).toHaveLength(8);
    expect(iso(result.rows[0]!.date)).toBe('2024-04-05');
    expect(result.rows[0]!.ratePct.toString()).toBe('6.8912');
    expect(iso(result.rows.at(-1)!.date)).toBe('2024-06-14');
  });

  it('records the no-auction week, the junk row and the out-of-range row', async () => {
    const { failures } = parseRbi91DayTbill(await fixture('rbi-tbill-91d.csv'));
    expect(failures.map((f) => f.reason)).toEqual([
      'missing_rate', // "-" — no auction that week
      'bad_rate', // "not-a-rate"
      'rate_out_of_range', // 999.00 — a mis-columned parse, not a rate
    ]);
  });

  it('is deterministic', async () => {
    const text = await fixture('rbi-tbill-91d.csv');
    expect(snapshotRows(parseRbi91DayTbill(text).rows)).toEqual(
      snapshotRows(parseRbi91DayTbill(text).rows),
    );
  });

  it('rejects a file with no recognisable header', () => {
    const result = parseRbi91DayTbill('Reserve Bank of India\nsome prose\n');
    expect(result.rows).toEqual([]);
    expect(result.failures[0]!.reason).toBe('missing_header');
    expect(result.series).toBe('TBILL_91D');
  });
});

describe('parseRatePct', () => {
  it('rejects a non-positive rate rather than storing a zero risk-free rate', () => {
    for (const raw of ['0', '-1.5']) {
      const out = parseRatePct(raw);
      expect(out.ok, raw).toBe(false);
      if (!out.ok) expect(out.reason).toBe('rate_out_of_range');
    }
  });

  it('accepts a trailing percent sign', () => {
    const out = parseRatePct('6.89 %');
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.toString()).toBe('6.89');
  });
});

describe('forwardFillToDates', () => {
  it('carries the last observation on or before each target date', async () => {
    const { rows } = parseRbi91DayTbill(await fixture('rbi-tbill-91d.csv'));

    const filled = forwardFillToDates(rows, [
      utc(2024, 4, 5), // exactly on an observation
      utc(2024, 4, 9), // between 05 and 12 Apr → carries 05 Apr
      utc(2024, 4, 12), // exactly on the next observation
      utc(2024, 5, 6), // 03 May had no auction, so 26 Apr is the last real one
      utc(2024, 7, 1), // after the final observation → carries it forward
    ]);

    expect(filled.map((f) => f.ratePct?.toString() ?? null)).toEqual([
      '6.8912',
      '6.8912',
      '6.875',
      '6.884',
      '6.8801',
    ]);
  });

  it('returns null — never the first rate — before the first observation', () => {
    // Back-filling would assert that today's risk-free rate applied ten years
    // ago, corrupting exactly the long-horizon metrics that matter most.
    const { rows } = parseRbi91DayTbill(
      'Date,91-Day Treasury Bill (Primary) Yield\n05 Apr 2024,6.8912\n',
    );
    const filled = forwardFillToDates(rows, [utc(2024, 4, 4), utc(2024, 4, 5)]);
    expect(filled[0]!.ratePct).toBeNull();
    expect(filled[1]!.ratePct!.toString()).toBe('6.8912');
  });

  it('preserves the caller’s target order even when targets are unsorted', async () => {
    const { rows } = parseRbi91DayTbill(await fixture('rbi-tbill-91d.csv'));
    const filled = forwardFillToDates(rows, [
      utc(2024, 6, 14),
      utc(2024, 4, 5),
      utc(2024, 4, 19),
    ]);
    expect(filled.map((f) => iso(f.date))).toEqual([
      '2024-06-14',
      '2024-04-05',
      '2024-04-19',
    ]);
    expect(filled.map((f) => f.ratePct!.toString())).toEqual([
      '6.8801',
      '6.8912',
      '6.9015',
    ]);
  });

  it('returns all nulls when there are no observations', () => {
    const filled = forwardFillToDates([], [utc(2024, 4, 5)]);
    expect(filled).toEqual([{ date: utc(2024, 4, 5), ratePct: null }]);
  });

  it('does not mutate its inputs', async () => {
    const { rows } = parseRbi91DayTbill(await fixture('rbi-tbill-91d.csv'));
    const before = snapshotRows(rows);
    const targets = [utc(2024, 6, 14), utc(2024, 4, 5)];
    forwardFillToDates(rows, targets);
    expect(snapshotRows(rows)).toEqual(before);
    expect(targets.map(iso)).toEqual(['2024-06-14', '2024-04-05']);
  });
});
