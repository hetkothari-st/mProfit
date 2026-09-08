/**
 * Golden-fixture tests for the MF-analytics benchmark and risk-free parsers
 * (`docs/mf-analytics/07-IMPLEMENTATION-PLAN.md` Task 1.3).
 *
 * Every NSE and BSE fixture here is a **real captured response** (see
 * `test/fixtures/mf/benchmarks/README.md` for the exact request that produced
 * each one and the date it was captured). That is the whole point: the previous
 * generation of these tests passed against hand-written CSV fixtures that
 * agreed with a parser expecting a format niftyindices has never served.
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
  parseNiftyTriJson,
  parseIndexDate,
  parseIndexValue,
  detectGaps,
  countBusinessDaysBetween,
  type IndexPriceRow,
} from '../../src/priceFeeds/nseIndices.parse.js';
import { parseBseIndexJson, bseDateCell } from '../../src/priceFeeds/bseIndices.parse.js';
import {
  NSE_INDEX_REQUEST_NAME,
  buildTriRequestBody,
  looksLikeJson,
  formatNiftyDate,
} from '../../src/priceFeeds/nseIndices.v1.js';
import {
  BSE_INDEX_REQUEST_CODE,
  formatBseDate,
} from '../../src/priceFeeds/bseIndices.v1.js';
import {
  parseFbilTbillCurve,
  parseFbilDate,
  parseRatePct,
  forwardFillToDates,
  FBIL_RISK_FREE_TENOR,
} from '../../src/priceFeeds/riskFree.parse.js';
import { formatFbilDate } from '../../src/priceFeeds/fbilTbillCurve.v1.js';
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

  it('flags the entries with no free TRI feed, all of which are seeded', () => {
    expect(BENCHMARK_TRI_NOT_FREELY_AVAILABLE).toContain('CRISIL_COMPOSITE_BOND');
    for (const code of BENCHMARK_TRI_NOT_FREELY_AVAILABLE) {
      expect(findBenchmarkSeed(code), `${code} flagged but not seeded`).toBeDefined();
    }
  });

  /**
   * The availability list and the request maps are two halves of one fact.
   * If they drift apart, the job either silently stops fetching an index that
   * works, or alerts every night for one that cannot.
   */
  it('every seeded code is either fetchable or explicitly flagged unavailable', () => {
    for (const entry of BENCHMARK_INDEX_SEED) {
      const fetchable =
        NSE_INDEX_REQUEST_NAME[entry.code] !== undefined ||
        BSE_INDEX_REQUEST_CODE[entry.code] !== undefined;
      const flagged = BENCHMARK_TRI_NOT_FREELY_AVAILABLE.includes(entry.code);
      expect(fetchable !== flagged, `${entry.code}: fetchable=${fetchable} flagged=${flagged}`).toBe(true);
    }
  });

  it('findBenchmarkSeed returns undefined for an unknown code', () => {
    expect(findBenchmarkSeed('NIFTY_NOT_A_REAL_INDEX')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// nseIndices.v1 — the request shape, verified 2026-09-07
// ---------------------------------------------------------------------------

describe('NSE TRI request', () => {
  it('maps exactly the eight broad-market equity codes proven to resolve', () => {
    expect(Object.keys(NSE_INDEX_REQUEST_NAME).sort()).toEqual([
      'NIFTY100_TRI',
      'NIFTY200_TRI',
      'NIFTY500_TRI',
      'NIFTY50_TRI',
      'NIFTY_LARGEMIDCAP250_TRI',
      'NIFTY_MIDCAP150_TRI',
      'NIFTY_MIDSMALLCAP400_TRI',
      'NIFTY_SMALLCAP250_TRI',
    ]);
  });

  it('never appends a "TRI" suffix to the index name', () => {
    // The endpoint IS the TRI endpoint. Asking it for "NIFTY 50 - TRI" — the
    // shape this repo previously guessed at — returns an empty array.
    for (const name of Object.values(NSE_INDEX_REQUEST_NAME)) {
      expect(name).not.toMatch(/TRI/i);
    }
  });

  it('builds the single-quoted cinfo envelope the endpoint expects', () => {
    const body = buildTriRequestBody('NIFTY 50', {
      from: utc(2024, 1, 1),
      to: utc(2024, 1, 31),
    });
    expect(JSON.parse(body)).toEqual({
      cinfo:
        "{'name':'NIFTY 50','startDate':'01-Jan-2024','endDate':'31-Jan-2024','indexName':'NIFTY 50'}",
    });
  });

  it('formats range dates from UTC parts, never local', () => {
    // A date built at UTC midnight must format as that same day regardless of
    // the machine's zone; formatting from local parts moves it on an IST box.
    expect(formatNiftyDate(utc(2024, 1, 1))).toBe('01-Jan-2024');
    expect(formatNiftyDate(utc(2024, 12, 31))).toBe('31-Dec-2024');
    expect(formatBseDate(utc(2024, 1, 1))).toBe('01/01/2024');
  });

  it('sniffs JSON by its first byte, because the content-type header lies', async () => {
    // The successful TRI response is served as `text/html; charset=utf-8`.
    expect(looksLikeJson(await fixture('nse-nifty50-tri-2024-01.json'))).toBe(true);
    expect(looksLikeJson(await fixture('nse-html-shell-not-json.html'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// nseIndices.parse — against real captures
// ---------------------------------------------------------------------------

describe('parseNiftyTriJson', () => {
  it('round-trips the real Nifty 50 TRI capture for January 2024', async () => {
    const { rows, failures } = parseNiftyTriJson(await fixture('nse-nifty50-tri-2024-01.json'));

    expect(failures).toEqual([]);
    expect(rows).toHaveLength(22);

    // Source is newest-first; we always emit oldest-first.
    expect(iso(rows[0]!.date)).toBe('2024-01-01');
    expect(iso(rows.at(-1)!.date)).toBe('2024-01-31');
    expect(rows[0]!.value.toString()).toBe('31949.36');
    expect(rows.at(-1)!.value.toString()).toBe('31939.59');
  });

  it('reads TotalReturnsIndex and never the net-of-tax NTR_Value', async () => {
    // NSE ships NTR_Value for only three indices. Preferring it "when present"
    // would put those three on a systematically lower series than the rest, so
    // a fund's score would depend on which benchmark it happened to have.
    const { rows } = parseNiftyTriJson(await fixture('nse-nifty50-tri-2024-01.json'));
    // 01 Jan 2024: TotalReturnsIndex 31949.36, NTR_Value 28945.65.
    expect(rows[0]!.value.toString()).toBe('31949.36');
    expect(rows[0]!.value.toString()).not.toBe('28945.65');
  });

  it('handles an index whose NTR_Value is the literal "-"', async () => {
    // The majority case: only NIFTY 50 / MIDCAP 50 / 500 carry a real NTR.
    const { rows, failures } = parseNiftyTriJson(await fixture('nse-midcap150-tri-2024-01.json'));
    expect(failures).toEqual([]);
    expect(rows).toHaveLength(22);
    expect(rows[0]!.value.toString()).toBe('21600.17');
  });

  it('parses a second index capture with the same code path', async () => {
    const { rows, failures } = parseNiftyTriJson(await fixture('nse-nifty500-tri-2024-01.json'));
    expect(failures).toEqual([]);
    expect(rows).toHaveLength(22);
    expect(rows[0]!.value.toString()).toBe('30480.99');
  });

  it('keeps the provider’s exact digits — no float round-trip', async () => {
    // Every numeric on this feed arrives as a JSON *string*, so `toDecimal`
    // sees the provider's digits and nothing has been through a double.
    const raw = JSON.parse(await fixture('nse-nifty50-tri-2024-01.json')) as {
      Date: string;
      TotalReturnsIndex: string;
    }[];
    const { rows } = parseNiftyTriJson(await fixture('nse-nifty50-tri-2024-01.json'));
    const byDate = new Map(rows.map((r) => [iso(r.date), r.value.toString()]));
    for (const r of raw) {
      const key = iso(parseIndexDate(r.Date)!);
      expect(byDate.get(key)).toBe(toDecimal(r.TotalReturnsIndex).toString());
    }
  });

  it('is deterministic — parsing twice gives identical output', async () => {
    const text = await fixture('nse-nifty50-tri-2024-01.json');
    const a = parseNiftyTriJson(text);
    const b = parseNiftyTriJson(text);
    expect(snapshotRows(a.rows)).toEqual(snapshotRows(b.rows));
    expect(a.failures).toEqual(b.failures);
  });

  it('routes every malformed element to failures and never throws', async () => {
    const { rows, failures } = parseNiftyTriJson(
      await fixture('nse-nifty50-tri-derived-malformed.json'),
    );

    expect(rows.map((r) => iso(r.date))).toEqual(['2024-01-01', '2024-01-09', '2024-01-10']);

    // Reported in ascending element order, so a DLQ row reads top-to-bottom.
    expect(failures.map((f) => ({ line: f.line, reason: f.reason }))).toEqual([
      { line: 2, reason: 'not_an_object' },
      { line: 3, reason: 'missing_date' },
      { line: 4, reason: 'bad_date' },
      { line: 5, reason: 'missing_value' },
      { line: 6, reason: 'bad_value' },
      { line: 7, reason: 'non_positive_value' },
      { line: 9, reason: 'duplicate_date' },
    ]);
  });

  it('reports the real empty-array response as empty_payload, not success', async () => {
    // Captured from `name: 'NIFTY NOT A REAL INDEX'`. This is how the endpoint
    // reports an unknown index: `[]` under HTTP 200. Treating it as "no
    // trading this month" is how a benchmark silently stops updating.
    const { rows, failures } = parseNiftyTriJson(await fixture('nse-unknown-index-empty.json'));
    expect(rows).toEqual([]);
    expect(failures.map((f) => f.reason)).toEqual(['empty_payload']);
  });

  it('reports the real HTML-shell response as not_json', async () => {
    const { rows, failures } = parseNiftyTriJson(await fixture('nse-html-shell-not-json.html'));
    expect(rows).toEqual([]);
    expect(failures[0]!.reason).toBe('not_json');
    expect(failures[0]!.raw).toContain('<!DOCTYPE html>');
  });

  it('rejects valid JSON that is not an array', () => {
    expect(parseNiftyTriJson('{"d":"[]"}').failures[0]!.reason).toBe('not_array');
    expect(parseNiftyTriJson('"a string"').failures[0]!.reason).toBe('not_array');
  });

  it('returns a not_json failure for empty input', () => {
    expect(parseNiftyTriJson('').failures[0]!.reason).toBe('not_json');
  });
});

describe('parseIndexDate', () => {
  it('accepts every format the sources emit, in UTC', () => {
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
    const out = parseIndexValue('1,23,456.78');
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
  it('does not flag a real month containing two weekday market holidays', async () => {
    // January 2024 is a good adversarial case: it contains a genuine Saturday
    // trading session (20 Jan 2024, NSE's special live session) and two
    // weekday closures (22 Jan, Ram Mandir; 26 Jan, Republic Day).
    const { rows } = parseNiftyTriJson(await fixture('nse-nifty50-tri-2024-01.json'));
    expect(detectGaps(rows, 5)).toEqual([]);

    // At the strictest threshold the two weekday holidays do show up, one
    // business day each — which is exactly the resolution we want: visible if
    // you look, never loud enough to alert.
    const strict = detectGaps(rows, 0);
    expect(strict.map((g) => [iso(g.from), iso(g.to), g.businessDays])).toEqual([
      ['2024-01-20', '2024-01-23', 1],
      ['2024-01-25', '2024-01-29', 1],
    ]);
  });

  it('stays silent across the real Diwali 2024 holiday cluster', async () => {
    const { rows } = parseNiftyTriJson(await fixture('nse-nifty50-tri-2024-10-holidays.json'));
    expect(rows).toHaveLength(15);
    // Includes the 01-Nov-2024 Muhurat session. Not one weekday is missing, so
    // even threshold 0 is clean.
    expect(detectGaps(rows, 0)).toEqual([]);
  });

  it('finds the manufactured 15-business-day hole', async () => {
    // Derived by deleting 08–25 Jan from the real capture: the Indian market
    // has no genuine closure longer than five business days, so this case
    // cannot be captured live.
    const { rows } = parseNiftyTriJson(await fixture('nse-nifty50-tri-derived-gap.json'));
    const gaps = detectGaps(rows, 5);

    expect(gaps).toHaveLength(1);
    expect(iso(gaps[0]!.from)).toBe('2024-01-05');
    expect(iso(gaps[0]!.to)).toBe('2024-01-29');
    expect(gaps[0]!.businessDays).toBe(15);
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
    const { rows } = parseNiftyTriJson(await fixture('nse-nifty50-tri-derived-gap.json'));
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
// bseIndices.parse — against a real capture that must NEVER be ingested
// ---------------------------------------------------------------------------

describe('parseBseIndexJson', () => {
  it('round-trips the real BSE archive capture past its Table envelope', async () => {
    const { rows, failures } = parseBseIndexJson(await fixture('bse-sensex-archive-2024-01.json'));

    expect(failures).toEqual([]);
    expect(rows).toHaveLength(22);
    // BSE serves oldest-first; the shared row loop sorts ascending regardless.
    expect(iso(rows[0]!.date)).toBe('2024-01-01');
    expect(iso(rows.at(-1)!.date)).toBe('2024-01-31');
    expect(rows[0]!.value.toString()).toBe('72271.94');
    expect(rows.at(-1)!.value.toString()).toBe('71752.11');
  });

  it('takes the date half of a zone-less timestamp without local drift', () => {
    // `new Date('2024-01-01T00:00:00')` is *local* midnight in V8, which on an
    // IST box is 2023-12-31T18:30Z — a whole series shifted by a day.
    expect(bseDateCell('2024-01-01T00:00:00')).toBe('2024-01-01');
    expect(iso(parseIndexDate(bseDateCell('2024-01-01T00:00:00'))!)).toBe('2024-01-01');
    // Unexpected shapes pass through so they surface as `bad_date`, not as a
    // silently wrong date.
    expect(bseDateCell('01/01/2024')).toBe('01/01/2024');
  });

  it('is deterministic', async () => {
    const text = await fixture('bse-sensex-archive-2024-01.json');
    expect(snapshotRows(parseBseIndexJson(text).rows)).toEqual(
      snapshotRows(parseBseIndexJson(text).rows),
    );
  });

  it('shares gap semantics with the NSE parser', async () => {
    const { rows } = parseBseIndexJson(await fixture('bse-sensex-archive-2024-01.json'));
    expect(detectGaps(rows, 5)).toEqual([]);
  });

  it('reports BSE’s empty Table as empty_payload', async () => {
    const { rows, failures } = parseBseIndexJson(await fixture('bse-unknown-index-empty.json'));
    expect(rows).toEqual([]);
    expect(failures.map((f) => f.reason)).toEqual(['empty_payload']);
  });

  it('rejects an unrecognised body without throwing', () => {
    expect(parseBseIndexJson('nothing,useful\n1,2\n').failures[0]!.reason).toBe('not_json');
    expect(parseBseIndexJson('{"NotTable":[]}').failures[0]!.reason).toBe('not_array');
  });
});

/**
 * The one thing that must never regress. BSE serves no free total-return
 * series; the code that IS available returns the price-return Sensex, which
 * parses and stores perfectly and inflates every benchmark-relative metric by
 * roughly the market's dividend yield.
 */
describe('BSE has no free total-return series (verified 2026-09-07)', () => {
  it('maps no BSE index code at all', () => {
    expect(Object.keys(BSE_INDEX_REQUEST_CODE)).toEqual([]);
  });

  it('never maps SENSEX_TRI to the price-return SENSEX', () => {
    expect(BSE_INDEX_REQUEST_CODE['SENSEX_TRI']).toBeUndefined();
    expect(Object.values(BSE_INDEX_REQUEST_CODE)).not.toContain('SENSEX');
  });

  it('confirms BSE’s own index picker still lists no total-return variant', async () => {
    // If BSE ever publishes one, this test fails and tells us to go wire it up
    // — which is a much better outcome than nobody noticing for two years.
    const list = JSON.parse(await fixture('bse-index-list.json')) as {
      Table: { Indx_cd: string; shortalias: string }[];
    };
    expect(list.Table.length).toBe(149);
    const tr = list.Table.filter(
      (t) =>
        /total\s*return/i.test(t.shortalias) ||
        /\bTRI\b/i.test(t.shortalias) ||
        /TRI$|_TRI$/i.test(t.Indx_cd),
    );
    expect(tr).toEqual([]);
  });

  it('pins the price-return level, so a future TRI series is unmistakable', async () => {
    // The Sensex TRI was around 110,000 on 01-Jan-2024. Anything this API
    // returns near 72,000 is the price-return index.
    const { rows } = parseBseIndexJson(await fixture('bse-sensex-archive-2024-01.json'));
    expect(rows[0]!.value.lt(80_000)).toBe(true);
  });
});


// ---------------------------------------------------------------------------
// riskFree.parse — FBIL T-Bill curve, against real captures
//
// The RBI DBIE CSV parser this section used to test is gone, along with its
// hand-written fixture: that CSV never existed. See `fbilTbillCurve.v1.ts`.
// ---------------------------------------------------------------------------

describe('FBIL risk-free request', () => {
  it('formats dates as YYYY-MM-DD from UTC parts', () => {
    // Load-bearing: FBIL answers DD-MM-YYYY with HTTP 500 and a Java stack
    // trace. Every other Indian source in this repo wants day-first.
    expect(formatFbilDate(utc(2026, 8, 24))).toBe('2026-08-24');
    expect(formatFbilDate(utc(2026, 1, 5))).toBe('2026-01-05');
  });

  it('takes the 3-month point as the risk-free tenor', () => {
    expect(FBIL_RISK_FREE_TENOR).toBe('3 Months');
  });
});

describe('parseFbilTbillCurve', () => {
  it('round-trips the real FBIL capture and keeps only the 3-month tenor', async () => {
    const result = parseFbilTbillCurve(await fixture('fbil-tbill-curve-2026-08.json'));

    expect(result.series).toBe('FBIL_TBILL_3M');
    expect(result.failures).toEqual([]);
    // 56 elements in the capture (14 tenors x 4 dates); we keep 4.
    expect(result.rows).toHaveLength(4);

    // FBIL serves newest-first; we always emit oldest-first.
    expect(result.rows.map((r) => iso(r.date))).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-27',
      '2026-08-28',
    ]);
    expect(result.rows.map((r) => r.ratePct.toString())).toEqual(['5.27', '5.26', '5.27', '5.28']);
  });

  it('does not mistake another tenor for the 3-month rate', async () => {
    // 7 Days closed at 5.13 on 2026-08-28; 3 Months at 5.28. Picking the wrong
    // point on the curve produces a series that parses and stores perfectly.
    const { rows } = parseFbilTbillCurve(await fixture('fbil-tbill-curve-2026-08.json'));
    expect(rows.at(-1)!.ratePct.toString()).toBe('5.28');

    const sevenDay = parseFbilTbillCurve(await fixture('fbil-tbill-curve-2026-08.json'), '7 Days');
    expect(sevenDay.rows.at(-1)!.ratePct.toString()).toBe('5.13');
  });

  it('is deterministic', async () => {
    const text = await fixture('fbil-tbill-curve-2026-08.json');
    expect(snapshotRows(parseFbilTbillCurve(text).rows)).toEqual(
      snapshotRows(parseFbilTbillCurve(text).rows),
    );
  });

  it('routes every malformed element to failures, and skips other tenors silently', async () => {
    const { rows, failures } = parseFbilTbillCurve(
      await fixture('fbil-tbill-derived-malformed.json'),
    );

    expect(rows.map((r) => iso(r.date))).toEqual(['2026-08-24', '2026-08-28']);

    // Element 3 is a valid `7 Days` row: not wanted, and NOT a failure. On a
    // ten-year backfill that distinction is the difference between ~2,200 DLQ
    // rows and ~29,000.
    expect(failures.map((f) => ({ line: f.line, reason: f.reason }))).toEqual([
      { line: 2, reason: 'not_an_object' },
      { line: 4, reason: 'missing_date' },
      { line: 5, reason: 'bad_date' },
      { line: 6, reason: 'missing_rate' },
      { line: 7, reason: 'bad_rate' },
      { line: 8, reason: 'rate_out_of_range' },
      { line: 10, reason: 'duplicate_date' },
    ]);
  });

  it('reports a null rate as missing, never as zero', async () => {
    // A zero risk-free rate turns every Sharpe ratio in the system into a plain
    // return/volatility ratio — wrong, and entirely reasonable-looking.
    const { rows, failures } = parseFbilTbillCurve(
      await fixture('fbil-tbill-derived-malformed.json'),
    );
    expect(rows.every((r) => r.ratePct.gt(0))).toBe(true);
    expect(failures.some((f) => f.reason === 'missing_rate')).toBe(true);
  });

  it('reports the real pre-history empty response as empty_payload', async () => {
    // FBIL's curve begins 2017-08-23; 2010 returns a bare `[]` under HTTP 200.
    const result = parseFbilTbillCurve(await fixture('fbil-tbill-empty-pre-history.json'));
    expect(result.rows).toEqual([]);
    expect(result.failures.map((f) => f.reason)).toEqual(['empty_payload']);
  });

  it('reports the real HTTP-500 body as not_json or not_array, never as a rate', async () => {
    // Captured by sending `fromDate=01-01-2026`. The body IS valid JSON — a
    // serialised Java exception — so the first-byte sniff alone would let it
    // through; it is the array check that rejects it.
    const result = parseFbilTbillCurve(await fixture('fbil-tbill-bad-date-500.txt'));
    expect(result.rows).toEqual([]);
    expect(['not_json', 'not_array']).toContain(result.failures[0]!.reason);
  });

  it('flags a payload with rows but no matching tenor', async () => {
    // If FBIL renames its tenors this must be loud. Silently returning zero
    // rows would let the risk-free series stop updating unnoticed.
    const result = parseFbilTbillCurve(
      await fixture('fbil-tbill-curve-2026-08.json'),
      '91 Days (renamed)',
    );
    expect(result.rows).toEqual([]);
    expect(result.failures.map((f) => f.reason)).toEqual(['tenor_not_found']);
  });
});

describe('parseFbilDate', () => {
  it('anchors a zone-less timestamp to UTC midnight', () => {
    // `new Date('2026-08-28 00:00:00')` is LOCAL midnight in V8, which on an
    // IST box is 2026-08-27T18:30Z — the whole series one day out.
    expect(parseFbilDate('2026-08-28 00:00:00')!.toISOString()).toBe('2026-08-28T00:00:00.000Z');
    expect(parseFbilDate('2026-08-28')!.toISOString()).toBe('2026-08-28T00:00:00.000Z');
  });

  it('returns null on any other shape, so it surfaces as bad_date', () => {
    for (const raw of ['28-08-2026 00:00:00', '2026-02-31 00:00:00', '', 'today']) {
      expect(parseFbilDate(raw), raw).toBeNull();
    }
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

  it('rejects a rate far outside the plausible band', () => {
    // 999 is not a rate spike; it is a mis-read field.
    const out = parseRatePct('999.00');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('rate_out_of_range');
  });

  it('accepts a trailing percent sign', () => {
    const out = parseRatePct('6.89 %');
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.toString()).toBe('6.89');
  });
});

describe('forwardFillToDates', () => {
  it('carries the last observation on or before each target date', async () => {
    const { rows } = parseFbilTbillCurve(await fixture('fbil-tbill-curve-2026-08.json'));

    const filled = forwardFillToDates(rows, [
      utc(2026, 8, 24), // exactly on an observation
      utc(2026, 8, 26), // a real hole in the capture -> carries 25 Aug
      utc(2026, 8, 27), // exactly on the next observation
      utc(2026, 9, 4), // after the final observation -> carries it forward
    ]);

    expect(filled.map((f) => f.ratePct?.toString() ?? null)).toEqual([
      '5.27',
      '5.26',
      '5.27',
      '5.28',
    ]);
  });

  it('returns null — never the first rate — before the first observation', async () => {
    // Back-filling would assert that today's risk-free rate applied ten years
    // ago, corrupting exactly the long-horizon metrics that matter most. This
    // matters more with FBIL than with a longer series: its history begins on
    // 2017-08-23, so pre-2017 windows genuinely have no rate.
    const { rows } = parseFbilTbillCurve(await fixture('fbil-tbill-curve-2026-08.json'));
    const filled = forwardFillToDates(rows, [utc(2026, 8, 23), utc(2026, 8, 24)]);
    expect(filled[0]!.ratePct).toBeNull();
    expect(filled[1]!.ratePct!.toString()).toBe('5.27');
  });

  it('preserves the caller’s target order even when targets are unsorted', async () => {
    const { rows } = parseFbilTbillCurve(await fixture('fbil-tbill-curve-2026-08.json'));
    const filled = forwardFillToDates(rows, [utc(2026, 8, 28), utc(2026, 8, 24), utc(2026, 8, 27)]);
    expect(filled.map((f) => iso(f.date))).toEqual(['2026-08-28', '2026-08-24', '2026-08-27']);
    expect(filled.map((f) => f.ratePct!.toString())).toEqual(['5.28', '5.27', '5.27']);
  });

  it('returns all nulls when there are no observations', () => {
    const filled = forwardFillToDates([], [utc(2026, 8, 24)]);
    expect(filled).toEqual([{ date: utc(2026, 8, 24), ratePct: null }]);
  });

  it('does not mutate its inputs', async () => {
    const { rows } = parseFbilTbillCurve(await fixture('fbil-tbill-curve-2026-08.json'));
    const before = snapshotRows(rows);
    const targets = [utc(2026, 8, 28), utc(2026, 8, 24)];
    forwardFillToDates(rows, targets);
    expect(snapshotRows(rows)).toEqual(before);
    expect(targets.map(iso)).toEqual(['2026-08-28', '2026-08-24']);
  });
});
