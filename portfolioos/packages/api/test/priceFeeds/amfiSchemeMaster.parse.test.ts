/**
 * Golden tests for the AMFI scheme-master parser.
 *
 * Pure: no DB, no `scope.runAs`. Everything here reads a fixture off disk and
 * asserts on the returned object.
 *
 * The assertions are weighted towards the two things that fail silently in
 * production — carried header state (category/AMC) and the growth-sibling
 * link — because a wrong value in either produces a plausible-looking row that
 * only shows up as a wrong rating months later.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseAmfiNavAll,
  parsePlanAndOption,
  resolveSchemeCategory,
  growthSiblingKey,
  linkGrowthSiblings,
  computeSchemeSourceHash,
  parseAmfiDate,
  isEtfName,
  type ParsedSchemeRow,
} from '../../src/priceFeeds/amfiSchemeMaster.parse.js';

const here = fileURLToPath(new URL('.', import.meta.url));

function fixture(name: string): Promise<string> {
  return readFile(resolve(here, '../fixtures/mf/amfi', name), 'utf8');
}

function byCode(rows: readonly ParsedSchemeRow[], code: string): ParsedSchemeRow {
  const row = rows.find((r) => r.schemeCode === code);
  if (!row) throw new Error(`no parsed row for scheme code ${code}`);
  return row;
}

// ---------------------------------------------------------------------------
// Fixture (a) — carried header state across categories and AMCs
// ---------------------------------------------------------------------------

describe('parseAmfiNavAll — multi-AMC, multi-category header state', () => {
  it('attaches the right category and AMC to every row', async () => {
    const { schemes, failures } = parseAmfiNavAll(
      await fixture('navall-multi-amc-multi-category.txt'),
    );

    expect(failures).toEqual([]);
    expect(schemes).toHaveLength(9);

    // Block 1: Large Cap / ABSL
    expect(byCode(schemes, '119551')).toMatchObject({
      amcName: 'Aditya Birla Sun Life Mutual Fund',
      sebiCategory: 'EQUITY',
      sebiSubCategory: 'Large Cap Fund',
      planType: 'DIRECT',
      optionType: 'IDCW_PAYOUT',
    });

    // Block 2: category persists, AMC changes.
    expect(byCode(schemes, '118989')).toMatchObject({
      amcName: 'HDFC Mutual Fund',
      sebiSubCategory: 'Large Cap Fund',
    });

    // Block 3: category changes, AMC resets to the one restated under it.
    expect(byCode(schemes, '119553')).toMatchObject({
      amcName: 'Aditya Birla Sun Life Mutual Fund',
      sebiCategory: 'DEBT',
      sebiSubCategory: 'Liquid Fund',
    });
    expect(byCode(schemes, '119805')).toMatchObject({
      amcName: 'Nippon India Mutual Fund',
      sebiSubCategory: 'Liquid Fund',
    });

    // Block 4: a sub-category whose *name* contains an option keyword.
    expect(byCode(schemes, '119560')).toMatchObject({
      sebiSubCategory: 'Dividend Yield Fund',
      optionType: 'GROWTH',
    });
    expect(byCode(schemes, '119561').optionType).toBe('IDCW_PAYOUT');
  });

  it('parses NAV as a 4dp decimal string and the date as UTC midnight', async () => {
    const { schemes } = parseAmfiNavAll(await fixture('navall-multi-amc-multi-category.txt'));
    const row = byCode(schemes, '119805');
    expect(row.nav).toBe('6012.4432');
    expect(typeof row.nav).toBe('string');
    expect(row.navDate?.toISOString()).toBe('2025-12-31T00:00:00.000Z');
  });

  it('does not link an IDCW row to a growth option of the other plan type', async () => {
    const { schemes } = parseAmfiNavAll(await fixture('navall-multi-amc-multi-category.txt'));
    // HDFC has only a DIRECT growth option in this file; the REGULAR IDCW row
    // must stay unlinked rather than borrow the direct plan's NAV series.
    expect(byCode(schemes, '118990')).toMatchObject({
      planType: 'REGULAR',
      optionType: 'IDCW_REINVEST',
      growthSiblingSchemeCode: null,
    });
    expect(byCode(schemes, '119551').growthSiblingSchemeCode).toBe('119552');
  });

  it('is stable across re-parses (snapshot)', async () => {
    const text = await fixture('navall-multi-amc-multi-category.txt');
    const a = parseAmfiNavAll(text);
    const b = parseAmfiNavAll(text);
    expect(a).toEqual(b);
    expect(a.schemes).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Fixture (b) — awkward plan/option suffixes
// ---------------------------------------------------------------------------

describe('parsePlanAndOption — real-world suffix variants', () => {
  const cases: Array<[string, ReturnType<typeof parsePlanAndOption>]> = [
    ['X Fund - Direct Plan - Growth', { planType: 'DIRECT', optionType: 'GROWTH' }],
    ['X Fund - DIRECT - IDCW', { planType: 'DIRECT', optionType: 'IDCW_PAYOUT' }],
    [
      'X Fund - Regular Plan - IDCW Reinvestment',
      { planType: 'REGULAR', optionType: 'IDCW_REINVEST' },
    ],
    ['X Fund - Direct - Dividend Payout', { planType: 'DIRECT', optionType: 'IDCW_PAYOUT' }],
    ['X Fund - Growth Option - Direct Plan', { planType: 'DIRECT', optionType: 'GROWTH' }],
    ['X Fund - Direct Plan (G)', { planType: 'DIRECT', optionType: 'GROWTH' }],
    ['X Fund (G)', { planType: 'REGULAR', optionType: 'GROWTH' }],
    ['X Fund - Direct Growth', { planType: 'DIRECT', optionType: 'GROWTH' }],
    // No plan marker at all → REGULAR by AMFI convention, not "unknown".
    ['X Fund - Growth', { planType: 'REGULAR', optionType: 'GROWTH' }],
    [
      'X Fund - Payout of Income Distribution cum capital Withdrawal option - Direct Plan',
      { planType: 'DIRECT', optionType: 'IDCW_PAYOUT' },
    ],
    [
      'X Fund - Reinvestment of Income Distribution cum capital Withdrawal option - Regular Plan',
      { planType: 'REGULAR', optionType: 'IDCW_REINVEST' },
    ],
    [
      'X Fund-Direct Plan-Daily Dividend Re-investment',
      { planType: 'DIRECT', optionType: 'IDCW_REINVEST' },
    ],
    ['X Fund - Direct Plan - Div - Payout', { planType: 'DIRECT', optionType: 'IDCW_PAYOUT' }],
    // The sub-category name contains "Dividend"; the option is Growth.
    [
      'ABSL Dividend Yield Fund - Direct Plan - Growth',
      { planType: 'DIRECT', optionType: 'GROWTH' },
    ],
    // …and the mirror image: "Growth" in the fund name, IDCW option.
    [
      'Nippon India Growth Fund - Direct Plan - IDCW',
      { planType: 'DIRECT', optionType: 'IDCW_PAYOUT' },
    ],
    // No option marker anywhere -- but an ETF, which structurally has no plan
    // and no option, so DIRECT/GROWTH is the accurate reading rather than a
    // guess. See the `exchange-traded funds` block below.
    ['Nippon India ETF Nifty 50 BeES', { planType: 'DIRECT', optionType: 'GROWTH' }],
    // Genuinely undeterminable: no option marker, and not an ETF.
    ['Awkward Flexi Cap Fund - Some Unknown Variant', null],
  ];

  for (const [name, expected] of cases) {
    it(`parses ${JSON.stringify(name)}`, () => {
      expect(parsePlanAndOption(name)).toEqual(expected);
    });
  }

  it('defaults a bare IDCW option to payout, not reinvestment', () => {
    // Documented in the parser: AMFI's column 2 is "ISIN Div Payout/ISIN
    // Growth", so an unqualified IDCW row is already the payout variant, and
    // payout is the conservative error (it never fabricates units).
    expect(parsePlanAndOption('X Fund - Direct Plan - IDCW')?.optionType).toBe('IDCW_PAYOUT');
  });
});

describe('parseAmfiNavAll — awkward suffix fixture', () => {
  it('classifies every row and DLQs only the one with no option marker', async () => {
    const { schemes, failures } = parseAmfiNavAll(await fixture('navall-awkward-suffixes.txt'));

    // 14, not 13: the ETF row is now parsed rather than DLQ'd. An ETF has no
    // plan/option to be ambiguous about, and dropping it would empty the
    // INDEX model's universe (03 §2).
    expect(schemes).toHaveLength(14);
    expect(failures).toHaveLength(0);

    const etf = schemes.find((r) => r.schemeCode === '900014');
    expect(etf).toMatchObject({ isEtf: true, planType: 'DIRECT', optionType: 'GROWTH' });

    expect(schemes.map((r) => [r.schemeCode, r.planType, r.optionType])).toMatchSnapshot();
  });

  it('collapses every suffix variant onto one growth-sibling key', async () => {
    const { schemes } = parseAmfiNavAll(await fixture('navall-awkward-suffixes.txt'));
    // The ETF is a different fund, so it legitimately has its own sibling key;
    // every *conventional* suffix variant still collapses onto one.
    const keys = new Set(
      schemes.filter((r) => !r.isEtf).map((r) => r.growthSiblingKey),
    );
    expect([...keys]).toEqual(['awkward flexi cap fund']);
  });

  it('links each IDCW row to the lowest-numbered growth option of its own plan', async () => {
    const { schemes } = parseAmfiNavAll(await fixture('navall-awkward-suffixes.txt'));
    // DIRECT growth options here are 900001/900005/900006/900008; the tie-break
    // is the lowest scheme code so output does not depend on file order.
    for (const code of ['900002', '900004', '900010', '900012', '900013']) {
      expect(byCode(schemes, code).growthSiblingSchemeCode).toBe('900001');
    }
    // REGULAR growth options are 900007/900009.
    for (const code of ['900003', '900011']) {
      expect(byCode(schemes, code).growthSiblingSchemeCode).toBe('900007');
    }
    // A growth row never points at itself or anything else.
    expect(byCode(schemes, '900001').growthSiblingSchemeCode).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fixture (c) — unmapped SEBI category
// ---------------------------------------------------------------------------

describe('resolveSchemeCategory', () => {
  it('unwraps the parenthesised payload and defers to the shared SEBI map', () => {
    expect(resolveSchemeCategory('Open Ended Schemes(Equity Scheme - Large Cap Fund)')).toEqual({
      sebiCategory: 'EQUITY',
      sebiSubCategory: 'Large Cap Fund',
    });
    expect(resolveSchemeCategory('Open Ended Schemes(Debt Scheme - Banking and PSU Fund)')).toEqual(
      { sebiCategory: 'DEBT', sebiSubCategory: 'Banking and PSU Fund' },
    );
  });

  it('marks unresolvable text UNMAPPED, keeping the broad category AMFI stated', () => {
    expect(
      resolveSchemeCategory('Open Ended Schemes(Other Scheme - Capital Protection Oriented Fund)'),
    ).toEqual({ sebiCategory: 'OTHER', sebiSubCategory: 'UNMAPPED' });
    expect(resolveSchemeCategory('Close Ended Schemes(Income)')).toEqual({
      sebiCategory: 'OTHER',
      sebiSubCategory: 'UNMAPPED',
    });
  });
});

describe('parseAmfiNavAll — unmapped category fixture', () => {
  it('keeps the scheme with sebiSubCategory UNMAPPED *and* records a failure', async () => {
    const { schemes, failures } = parseAmfiNavAll(await fixture('navall-unmapped-category.txt'));

    // 01 §3: stored (so the scheme exists) and DLQ'd (so it is visible), then
    // excluded from universes downstream by the UNMAPPED marker.
    expect(schemes).toHaveLength(3);
    expect(failures).toHaveLength(2);
    expect(failures.every((f) => f.reason === 'unmapped_sebi_category')).toBe(true);

    expect(byCode(schemes, '112932').sebiSubCategory).toBe('Corporate Bond Fund');
    expect(byCode(schemes, '140233').sebiSubCategory).toBe('UNMAPPED');
    expect(byCode(schemes, '140234').sebiSubCategory).toBe('UNMAPPED');
    expect(failures.map((f) => f.line)).toEqual(
      ['140233', '140234'].map((c) => byCode(schemes, c).line),
    );
  });
});

// ---------------------------------------------------------------------------
// Fixture (d) — malformed rows
// ---------------------------------------------------------------------------

describe('parseAmfiNavAll — malformed rows', () => {
  it('records each bad row with a reason instead of throwing or dropping it', async () => {
    const { schemes, failures } = parseAmfiNavAll(await fixture('navall-malformed-rows.txt'));

    expect(schemes.map((r) => r.schemeCode)).toEqual(['120841', '120844', '120845']);
    expect(failures).toHaveLength(3);
    expect(failures.every((f) => f.reason === 'malformed_row')).toBe(true);
    expect(failures.map((f) => f.detail)).toEqual([
      'expected 6 semicolon-delimited fields, got 3',
      'scheme code is not numeric: "BADCODE"',
      'empty scheme name',
    ]);
    // Every failure carries enough to reconstruct the source line for the DLQ.
    for (const f of failures) {
      expect(f.line).toBeGreaterThan(0);
      expect(f.raw.length).toBeGreaterThan(0);
    }
  });

  it('treats an unusable NAV or date as a null field, not a rejected row', async () => {
    const { schemes } = parseAmfiNavAll(await fixture('navall-malformed-rows.txt'));
    // "N.A." NAV — the scheme metadata is still good; NAV quarantine is the
    // job layer's problem (01 §6 / Task 1.4).
    expect(byCode(schemes, '120844').nav).toBeNull();
    // 31-Feb-2025 must not silently roll forward to 03-Mar.
    expect(byCode(schemes, '120845').navDate).toBeNull();
    expect(byCode(schemes, '120845').nav).toBe('88.1234');
  });
});

describe('parseAmfiDate', () => {
  it('returns UTC midnight for a valid DD-MMM-YYYY', () => {
    expect(parseAmfiDate('01-Jan-2024')?.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(parseAmfiDate('29-Feb-2024')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
  });

  it('returns null for impossible or malformed dates', () => {
    expect(parseAmfiDate('31-Feb-2025')).toBeNull();
    expect(parseAmfiDate('29-Feb-2025')).toBeNull();
    expect(parseAmfiDate('2025-12-31')).toBeNull();
    expect(parseAmfiDate('31-Xyz-2025')).toBeNull();
    expect(parseAmfiDate('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fixture (e) — growth-sibling linking
// ---------------------------------------------------------------------------

describe('growthSiblingKey', () => {
  it('strips plan and option suffixes down to the fund identity', () => {
    const expected = 'sbi bluechip fund';
    for (const name of [
      'SBI Bluechip Fund - Direct Plan - Growth',
      'SBI Bluechip Fund - Regular Plan - IDCW Reinvestment',
      'SBI Bluechip Fund - DIRECT - IDCW',
      'SBI Bluechip Fund (G)',
      'SBI Bluechip Fund-Direct Plan-Daily Dividend Re-investment',
    ]) {
      expect(growthSiblingKey(name)).toBe(expected);
    }
  });

  it('keeps a hyphen that belongs to the fund name', () => {
    expect(growthSiblingKey('ICICI Prudential Nifty Next 50 Index Fund - Growth')).toBe(
      'icici prudential nifty next 50 index fund',
    );
  });

  it('normalises & to "and" so punctuation variants collide on purpose', () => {
    expect(growthSiblingKey('ABSL Banking & PSU Debt Fund - Direct - Growth')).toBe(
      growthSiblingKey('ABSL Banking and PSU Debt Fund - Direct - IDCW'),
    );
  });
});

describe('parseAmfiNavAll — growth siblings', () => {
  it('links DIRECT IDCW to the DIRECT growth row, never the REGULAR one', async () => {
    const { schemes, failures } = parseAmfiNavAll(await fixture('navall-idcw-growth-siblings.txt'));
    expect(failures).toEqual([]);
    expect(schemes).toHaveLength(7);

    expect(byCode(schemes, '119599').growthSiblingSchemeCode).toBe('119598');
    expect(byCode(schemes, '119600').growthSiblingSchemeCode).toBe('119598');
    // The REGULAR growth option is 103504 — explicitly *not* the answer above.
    expect(byCode(schemes, '119599').growthSiblingSchemeCode).not.toBe('103504');
    expect(byCode(schemes, '103505').growthSiblingSchemeCode).toBe('103504');
    expect(byCode(schemes, '120717').growthSiblingSchemeCode).toBe('120716');

    for (const row of schemes.filter((r) => r.optionType === 'GROWTH')) {
      expect(row.growthSiblingSchemeCode).toBeNull();
    }
  });

  it('uses the reinvestment ISIN as the row identity for a reinvest option', async () => {
    const { schemes } = parseAmfiNavAll(await fixture('navall-idcw-growth-siblings.txt'));
    const reinvest = byCode(schemes, '119600');
    expect(reinvest.optionType).toBe('IDCW_REINVEST');
    expect(reinvest.isin).toBe('INF200K01T77');
    expect(byCode(schemes, '119599').isin).toBe('INF200K01T51');
  });
});

describe('linkGrowthSiblings', () => {
  const base = {
    isinPayoutOrGrowth: null,
    isinReinvest: null,
    isin: null,
    categoryHeaderText: 'Open Ended Schemes(Equity Scheme - Large Cap Fund)',
    sebiCategory: 'EQUITY',
    sebiSubCategory: 'Large Cap Fund',
    nav: null,
    navDate: null,
    growthSiblingSchemeCode: null,
    sourceHash: 'x',
    sourceAdapter: 'amfi.schemeMaster',
    sourceAdapterVer: '1',
    line: 1,
  } as const;

  function row(
    schemeCode: string,
    amcName: string,
    planType: 'DIRECT' | 'REGULAR',
    optionType: 'GROWTH' | 'IDCW_PAYOUT',
  ): ParsedSchemeRow {
    return {
      ...base,
      schemeCode,
      schemeName: `Alpha Fund - ${planType} - ${optionType}`,
      amcName,
      planType,
      optionType,
      growthSiblingKey: 'alpha fund',
    } as ParsedSchemeRow;
  }

  it('never matches across AMCs, even on an identical fund name and plan', () => {
    // Two AMCs cannot use the same scheme name in the real file, but the AMC is
    // in the key anyway: a cross-AMC match would silently attribute one AMC's
    // NAV history to another's fund.
    const linked = linkGrowthSiblings([
      row('1', 'Alpha Mutual Fund', 'DIRECT', 'GROWTH'),
      row('2', 'Beta Mutual Fund', 'DIRECT', 'IDCW_PAYOUT'),
    ]);
    expect(linked[1]?.growthSiblingSchemeCode).toBeNull();
  });

  it('is order-independent', () => {
    const rows = [
      row('9', 'Alpha Mutual Fund', 'DIRECT', 'IDCW_PAYOUT'),
      row('3', 'Alpha Mutual Fund', 'DIRECT', 'GROWTH'),
      row('7', 'Alpha Mutual Fund', 'DIRECT', 'GROWTH'),
    ];
    const forward = linkGrowthSiblings(rows);
    const reversed = linkGrowthSiblings([...rows].reverse());
    expect(forward.find((r) => r.schemeCode === '9')?.growthSiblingSchemeCode).toBe('3');
    expect(reversed.find((r) => r.schemeCode === '9')?.growthSiblingSchemeCode).toBe('3');
  });

  it('does not mutate the input rows', () => {
    const input = [row('1', 'Alpha Mutual Fund', 'DIRECT', 'GROWTH')];
    linkGrowthSiblings(input);
    expect(input[0]?.growthSiblingSchemeCode).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Idempotency (CONTEXT.md §3.3)
// ---------------------------------------------------------------------------

describe('computeSchemeSourceHash', () => {
  it('is deterministic across re-parses of the same file', async () => {
    const text = await fixture('navall-multi-amc-multi-category.txt');
    const first = parseAmfiNavAll(text).schemes.map((r) => r.sourceHash);
    const second = parseAmfiNavAll(text).schemes.map((r) => r.sourceHash);
    expect(second).toEqual(first);
    expect(first[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignores NAV and NAV date — a daily NAV move is not a metadata change', async () => {
    const text = await fixture('navall-multi-amc-multi-category.txt');
    const moved = text.replace('6012.4432;31-Dec-2025', '6100.0000;01-Jan-2026');
    expect(moved).not.toBe(text);
    const before = byCode(parseAmfiNavAll(text).schemes, '119805');
    const after = byCode(parseAmfiNavAll(moved).schemes, '119805');
    expect(after.nav).not.toBe(before.nav);
    expect(after.sourceHash).toBe(before.sourceHash);
  });

  it('changes when an identity field changes', () => {
    const identity = {
      schemeCode: '119805',
      isin: 'INF204K01XY7',
      isinPayoutOrGrowth: 'INF204K01XY7',
      isinReinvest: null,
      schemeName: 'Nippon India Liquid Fund - Direct Plan - Growth',
      amcName: 'Nippon India Mutual Fund',
      sebiCategory: 'DEBT',
      sebiSubCategory: 'Liquid Fund',
      planType: 'DIRECT',
      optionType: 'GROWTH',
    } as const;
    const h = computeSchemeSourceHash(identity);
    expect(computeSchemeSourceHash({ ...identity, sebiSubCategory: 'UNMAPPED' })).not.toBe(h);
    expect(computeSchemeSourceHash({ ...identity, planType: 'REGULAR' })).not.toBe(h);
    expect(computeSchemeSourceHash({ ...identity, isin: null })).not.toBe(h);
  });
});

// ---------------------------------------------------------------------------
// Structural edge cases
// ---------------------------------------------------------------------------

describe('parseAmfiNavAll — structural edges', () => {
  it('returns empty results for empty input rather than throwing', () => {
    expect(parseAmfiNavAll('')).toEqual({ schemes: [], failures: [] });
  });

  it('DLQs a scheme row that appears before any category header', () => {
    const text = '119551;INF1;;Some Fund - Direct Plan - Growth;10.0000;31-Dec-2025\n';
    const { schemes, failures } = parseAmfiNavAll(text);
    expect(schemes).toEqual([]);
    expect(failures[0]).toMatchObject({
      reason: 'malformed_row',
      detail: 'scheme row appeared before any category header',
    });
  });

  it('DLQs a scheme row whose category header has no AMC under it', () => {
    const text = [
      'Open Ended Schemes(Equity Scheme - Large Cap Fund)',
      '119551;INF1;;Some Fund - Direct Plan - Growth;10.0000;31-Dec-2025',
    ].join('\n');
    const { schemes, failures } = parseAmfiNavAll(text);
    expect(schemes).toEqual([]);
    expect(failures[0]?.detail).toBe('scheme row appeared before any AMC header');
  });

  it('skips repeated column-header lines wherever they appear', () => {
    const text = [
      'Open Ended Schemes(Equity Scheme - Large Cap Fund)',
      'Alpha Mutual Fund',
      'Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date',
      '119551;INF1;;Alpha Large Cap Fund - Direct Plan - Growth;10.0000;31-Dec-2025',
      'Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date',
      '119552;INF2;;Alpha Large Cap Fund - Direct Plan - IDCW;9.0000;31-Dec-2025',
    ].join('\n');
    const { schemes, failures } = parseAmfiNavAll(text);
    expect(failures).toEqual([]);
    expect(schemes).toHaveLength(2);
  });

  it('handles CRLF line endings', () => {
    const text = [
      'Open Ended Schemes(Equity Scheme - Large Cap Fund)',
      'Alpha Mutual Fund',
      '119551;INF1;;Alpha Large Cap Fund - Direct Plan - Growth;10.0000;31-Dec-2025',
    ].join('\r\n');
    const { schemes } = parseAmfiNavAll(text);
    expect(schemes).toHaveLength(1);
    expect(schemes[0]?.nav).toBe('10.0000');
  });

  it('stamps every row with the adapter id and version', async () => {
    const { schemes } = parseAmfiNavAll(await fixture('navall-idcw-growth-siblings.txt'));
    for (const row of schemes) {
      expect(row.sourceAdapter).toBe('amfi.schemeMaster');
      expect(row.sourceAdapterVer).toBe('1');
    }
  });
});

describe('exchange-traded funds', () => {
  /**
   * These exist because the naive reading of "no plan/option suffix means we
   * cannot tell" drops every ETF in the file, and `03 §2` routes the whole
   * Index Funds/ETFs sub-category to the INDEX scoring model. Silently losing
   * them leaves that model with an empty universe and no ETF ever rated —
   * a failure that is invisible until someone asks why their Nifty BeES has
   * no score.
   */
  it('recognises ETFs by name, including the BeES brand which omits "ETF"', () => {
    expect(isEtfName('Nippon India ETF Nifty 50 BeES')).toBe(true);
    expect(isEtfName('Nippon India ETF Nifty Bank BeES')).toBe(true);
    expect(isEtfName('SBI Exchange Traded Fund Nifty 50')).toBe(true);
    expect(isEtfName('Nippon India Nifty 50 Index Fund - Direct Plan - Growth')).toBe(false);
    expect(isEtfName('SBI Nifty Index Fund - Direct Plan - Growth')).toBe(false);
  });

  it('classifies a suffix-less ETF as DIRECT/GROWTH rather than unparseable', () => {
    // An ETF is a single listed class of units: no distributor trail, so no
    // Direct/Regular split, and no IDCW variant. DIRECT is the economically
    // accurate reading, not a convenient default.
    expect(parsePlanAndOption('Nippon India ETF Nifty 50 BeES')).toEqual({
      planType: 'DIRECT',
      optionType: 'GROWTH',
    });
  });

  it('still returns null for a genuinely unparseable non-ETF name', () => {
    expect(parsePlanAndOption('Some Fund With No Option Marker At All')).toBeNull();
  });

  it('parses an ETF fixture with zero failures and flags isEtf per row', async () => {
    const { schemes, failures } = parseAmfiNavAll(await fixture('navall-etfs.txt'));
    expect(failures).toEqual([]);
    expect(schemes).toHaveLength(6);

    const byCode = new Map(schemes.map((r) => [r.schemeCode, r]));
    const bees = byCode.get('101000')!;
    expect(bees.isEtf).toBe(true);
    expect(bees.planType).toBe('DIRECT');
    expect(bees.optionType).toBe('GROWTH');

    // The index *fund* alongside it must NOT be flagged as an ETF — the
    // STRUCTURE pillar scores the two on different inputs.
    const indexFund = byCode.get('101002')!;
    expect(indexFund.isEtf).toBe(false);
    expect(indexFund.planType).toBe('DIRECT');

    // And the regular plan of that same index fund stays REGULAR.
    expect(byCode.get('101003')!.planType).toBe('REGULAR');
  });

  it('honours an explicit suffix on an ETF over the structural inference', () => {
    // Evidence beats inference: some gold ETFs historically carried one.
    expect(parsePlanAndOption('Alpha Gold ETF - Regular Plan - IDCW')).toEqual({
      planType: 'REGULAR',
      optionType: 'IDCW_PAYOUT',
    });
  });
});

