/**
 * Unit tests for the shared normalisation layer.
 *
 * These are the tests that matter most in this task: every AMC parser delegates
 * its semantic decisions here, so a bug in this file is a bug in all three at
 * once — and none of the bugs it can hold (a rating on the wrong rung, a
 * market-cap bucket derived rather than looked up, a weights-sum check that
 * does not fire) throws. They just change a number.
 */

import { describe, it, expect } from 'vitest';
import { Decimal, serializePct } from '@portfolioos/shared';
import {
  CREDIT_RATING_SCALE,
  buildAmfiMarketCapLookup,
  classifyHoldingKind,
  compareCreditRating,
  creditRatingOrdinal,
  csvToGrid,
  headerKey,
  normaliseCreditRating,
  normaliseHoldingCreditRating,
  normaliseIsin,
  parseExitLoad,
  parseFactsheetDate,
  parseIndianDecimal,
  resolveMarketCapBucket,
  validateSnapshot,
  validateTerPct,
} from '../../../src/adapters/mfFactsheet/normalise.js';
import { normaliseCreditRating as mathNormaliseCreditRating } from '../../../src/services/mfAnalytics/mfMetricsMath.js';

describe('credit rating normalisation', () => {
  it('is the SAME function the metrics layer uses', () => {
    // The whole point of the re-export. If these ever diverge, ingest and the
    // metrics layer bucket the same holding differently and creditQualitySplit
    // silently disagrees with belowAAPct computed from the same rows.
    expect(normaliseCreditRating).toBe(mathNormaliseCreditRating);
  });

  it('covers the whole ordinal scale', () => {
    const cases: [string, string][] = [
      ['SOV', 'SOV'],
      ['Sovereign', 'SOV'],
      ['AAA', 'AAA'],
      ['AA+', 'AA_PLUS'],
      ['AA', 'AA'],
      ['AA-', 'AA_MINUS'],
      ['A+', 'A_PLUS'],
      ['A', 'A'],
      ['A-', 'A_MINUS'],
      ['BBB+', 'BBB_PLUS'],
      ['BBB', 'BBB'],
      ['BBB-', 'BBB_MINUS'],
      ['BB', 'BELOW_IG'],
      ['D', 'BELOW_IG'],
      ['Unrated', 'UNRATED'],
    ];
    for (const [raw, expected] of cases) {
      expect(normaliseCreditRating(raw), raw).toBe(expected);
    }
    // Every rung of the published ladder is reachable from some input.
    const reached = new Set(cases.map(([, g]) => g));
    for (const grade of CREDIT_RATING_SCALE) {
      expect(reached.has(grade), `no case reaches ${grade}`).toBe(true);
    }
  });

  it('strips agency prefixes', () => {
    for (const raw of [
      'CRISIL AA+',
      '[ICRA]AA+',
      'CARE AA+',
      'IND AA+',
      'BWR AA+',
      'Brickwork AA+',
      'ACUITE AA+',
      'India Ratings AA+',
    ]) {
      expect(normaliseCreditRating(raw), raw).toBe('AA_PLUS');
    }
  });

  it('strips credit-enhancement and outlook suffixes', () => {
    for (const raw of [
      'CRISIL AAA(CE)',
      'IND AAA (CE)',
      '[ICRA]AAA(SO)',
      'CRISIL AAA /Stable',
      'CARE AAA; Positive',
      'ICRA AAA (Negative)',
      'CRISIL AAA rating watch',
    ]) {
      expect(normaliseCreditRating(raw), raw).toBe('AAA');
    }
  });

  it('folds short-term ratings onto the long-term ladder', () => {
    expect(normaliseCreditRating('CARE A1+')).toBe('AAA');
    expect(normaliseCreditRating('CRISIL A1')).toBe('AA');
    expect(normaliseCreditRating('ICRA A2')).toBe('A');
    expect(normaliseCreditRating('A3')).toBe('BBB');
    expect(normaliseCreditRating('A4')).toBe('BELOW_IG');
  });

  it('sends anything unrecognised to UNRATED — the conservative bucket', () => {
    // Conservative because a parse miss can only ever make a fund look WORSE
    // (UNRATED counts towards belowAAPct), never better.
    for (const raw of ['ZZZ', '???', 'Provisional Grade X', '']) {
      expect(normaliseCreditRating(raw), raw).toBe('UNRATED');
    }
    expect(normaliseCreditRating(null)).toBe('UNRATED');
  });

  it('orders the ladder best-first', () => {
    expect(creditRatingOrdinal('SOV')).toBe(0);
    expect(creditRatingOrdinal('UNRATED')).toBe(CREDIT_RATING_SCALE.length - 1);
    expect(compareCreditRating('AAA', 'AA')).toBeLessThan(0);
    expect(compareCreditRating('BBB', 'AA_MINUS')).toBeGreaterThan(0);
  });

  it('returns null (not UNRATED) for a holding with no rating cell', () => {
    // An equity row has no rating column. Writing UNRATED there would fabricate
    // a debt attribute the AMC never disclosed.
    expect(normaliseHoldingCreditRating('')).toBeNull();
    expect(normaliseHoldingCreditRating('   ')).toBeNull();
    expect(normaliseHoldingCreditRating(null)).toBeNull();
    expect(normaliseHoldingCreditRating('CRISIL AA-')).toBe('AA_MINUS');
    // But an unrecognised NON-empty rating is still UNRATED, not null.
    expect(normaliseHoldingCreditRating('Grade Q')).toBe('UNRATED');
  });
});

describe('parseIndianDecimal', () => {
  it('reads lakh-grouped numbers, currency marks and units', () => {
    expect(parseIndianDecimal('1,20,000')?.toString()).toBe('120000');
    expect(parseIndianDecimal('Rs. 45,678.90 Cr')?.toString()).toBe('45678.9');
    expect(parseIndianDecimal('₹ 1,884.221')?.toString()).toBe('1884.221');
    expect(parseIndianDecimal('1.45%')?.toString()).toBe('1.45');
  });

  it('reads accounting negatives', () => {
    expect(parseIndianDecimal('(95.00)')?.toString()).toBe('-95');
    expect(parseIndianDecimal('-0.15')?.toString()).toBe('-0.15');
  });

  it('returns null — never 0 — for nil markers and blanks', () => {
    for (const raw of ['', '   ', '-', '–', 'N.A.', 'NA', 'Nil', 'None']) {
      expect(parseIndianDecimal(raw), raw).toBeNull();
    }
  });

  it('keeps a real zero distinguishable from an absent value', () => {
    expect(parseIndianDecimal('0.00')?.isZero()).toBe(true);
  });
});

describe('parseFactsheetDate', () => {
  it('reads the formats Indian factsheets use, at UTC midnight', () => {
    const cases: [string, string][] = [
      ['31-Mar-2026', '2026-03-31T00:00:00.000Z'],
      ['31 Mar 26', '2026-03-31T00:00:00.000Z'],
      ['March 31, 2026', '2026-03-31T00:00:00.000Z'],
      ['July 29, 2022', '2022-07-29T00:00:00.000Z'],
      ['2026-03-31', '2026-03-31T00:00:00.000Z'],
    ];
    for (const [raw, iso] of cases) {
      expect(parseFactsheetDate(raw)?.toISOString(), raw).toBe(iso);
    }
  });

  it('reads bare numeric dates day-first', () => {
    // Indian documents are never month-first; reading 03/04/2026 as 4 March
    // would shift a snapshot into the wrong month without ever looking wrong.
    expect(parseFactsheetDate('03/04/2026')?.toISOString()).toBe('2026-04-03T00:00:00.000Z');
  });

  it('rejects impossible dates rather than rolling them over', () => {
    expect(parseFactsheetDate('31-Feb-2026')).toBeNull();
    expect(parseFactsheetDate('not a date')).toBeNull();
    expect(parseFactsheetDate(null)).toBeNull();
  });
});

describe('normaliseIsin', () => {
  it('accepts well-formed ISINs and rejects everything else', () => {
    expect(normaliseIsin('INE040A01034')).toBe('INE040A01034');
    expect(normaliseIsin(' in0020230028 ')).toBe('IN0020230028');
    expect(normaliseIsin('-')).toBeNull();
    expect(normaliseIsin('CRISIL AAA')).toBeNull();
    expect(normaliseIsin(null)).toBeNull();
  });
});

describe('classifyHoldingKind', () => {
  it('lets the section heading override the instrument name', () => {
    // "HDFC Bank Limited" under DEBT INSTRUMENTS is a bond ISSUED BY the bank,
    // not a share IN it. Classifying it as equity moves a debt exposure into
    // the equity market-cap split and understates the fund's credit risk.
    expect(
      classifyHoldingKind({ securityName: 'HDFC Bank Limited', section: 'DEBT INSTRUMENTS' }),
    ).toBe('DEBT');
    expect(
      classifyHoldingKind({
        securityName: 'HDFC Bank Limited',
        section: 'Listed / awaiting listing on Stock Exchanges',
        isin: 'INE040A01034',
      }),
    ).toBe('EQUITY');
  });

  it('classifies cash equivalents ahead of everything else', () => {
    for (const name of [
      'TREPS / Reverse Repo',
      'TREPS - Tri-party Repo',
      'Net Receivables / (Payables)',
      'Net Current Assets',
      'CBLO',
      'Cash and Cash Equivalent',
    ]) {
      expect(classifyHoldingKind({ securityName: name, section: null }), name).toBe('CASH');
    }
  });

  it('classifies debt from the instrument name when there is no section', () => {
    for (const name of [
      '7.26% GOI 2033',
      'Bajaj Finance Ltd CP 91D',
      'State Development Loan 2032',
      '364 Day Treasury Bill',
    ]) {
      expect(classifyHoldingKind({ securityName: name, section: null }), name).toBe('DEBT');
    }
  });

  it('recognises derivatives, gold and REIT/InvIT', () => {
    expect(classifyHoldingKind({ securityName: 'NIFTY 50 Index Future 25-Jun-2026' })).toBe(
      'DERIVATIVE',
    );
    expect(classifyHoldingKind({ securityName: 'Electronic Gold Receipt 995' })).toBe('GOLD');
    expect(classifyHoldingKind({ securityName: 'Embassy Office Parks REIT' })).toBe('REIT_INVIT');
  });

  it('falls back to OTHER rather than dropping a row', () => {
    // A row we cannot classify still carries weight, and its weight still has
    // to reach the 97–103% check or the check silently stops working.
    expect(classifyHoldingKind({ securityName: 'Something Unclassifiable' })).toBe('OTHER');
  });
});

describe('resolveMarketCapBucket', () => {
  const lookup = buildAmfiMarketCapLookup(new Date(Date.UTC(2026, 0, 1)), [
    { isin: 'INE040A01034', bucket: 'LARGE' },
    { isin: 'INE296A14BX7', bucket: 'MID' },
    { isin: 'ine467b01029', bucket: 'small' },
  ]);

  it('reads the seeded AMFI list', () => {
    expect(resolveMarketCapBucket('INE040A01034', lookup)).toBe('LARGE');
    expect(resolveMarketCapBucket('INE296A14BX7', lookup)).toBe('MID');
    // Case is normalised on both sides of the index.
    expect(resolveMarketCapBucket('INE467B01029', lookup)).toBe('SMALL');
  });

  it('returns null for a name that is NOT on the published list', () => {
    // null means "unclassified" and is reported as such — never redistributed
    // into the other three buckets, and never derived from live market cap.
    // SEBI's half-yearly list is the universe the fund is measured against; a
    // derived bucket would score it against a universe nobody holds it to.
    expect(resolveMarketCapBucket('INE009A01021', lookup)).toBeNull();
    expect(resolveMarketCapBucket(null, lookup)).toBeNull();
    expect(resolveMarketCapBucket('INE040A01034', null)).toBeNull();
  });

  it('ignores malformed rows in the seed', () => {
    const l = buildAmfiMarketCapLookup(new Date(0), [
      { isin: 'not-an-isin', bucket: 'LARGE' },
      { isin: 'INE040A01034', bucket: 'MEGA' },
    ]);
    expect(resolveMarketCapBucket('INE040A01034', l)).toBeNull();
  });
});

describe('validateSnapshot (01 §6, weights 97–103%)', () => {
  const h = (pct: string) => ({ weightPct: serializePct(new Decimal(pct)) });

  it('accepts a snapshot summing to 100', () => {
    const v = validateSnapshot([h('95.20'), h('4.95'), h('-0.15')]);
    expect(v.ok).toBe(true);
    expect(new Decimal(v.weightSumPct).toFixed(2)).toBe('100.00');
    expect(v.failures).toEqual([]);
  });

  it('accepts the edges of the band', () => {
    expect(validateSnapshot([h('97')]).ok).toBe(true);
    expect(validateSnapshot([h('103')]).ok).toBe(true);
  });

  it('rejects below the floor with reason weights_sum', () => {
    const v = validateSnapshot([h('62.50'), h('17.50')]);
    expect(v.ok).toBe(false);
    expect(v.failures[0]?.reason).toBe('weights_sum');
    expect(v.failures[0]?.detail).toContain('80.0000');
  });

  it('rejects above the ceiling with reason weights_sum', () => {
    const v = validateSnapshot([h('100.00'), h('95.20')]);
    expect(v.ok).toBe(false);
    expect(v.failures[0]?.reason).toBe('weights_sum');
  });

  it('reports no_holdings for an empty list and never throws', () => {
    const v = validateSnapshot([]);
    expect(v.ok).toBe(false);
    expect(v.failures[0]?.reason).toBe('no_holdings');
  });
});

describe('validateTerPct (01 §6, 0.01–3.0%)', () => {
  it('accepts a plausible TER', () => {
    expect(validateTerPct(serializePct(new Decimal('1.45'))).ok).toBe(true);
    expect(validateTerPct(serializePct(new Decimal('0.01'))).ok).toBe(true);
    expect(validateTerPct(serializePct(new Decimal('3.0'))).ok).toBe(true);
  });

  it('treats a null TER as a gap, not a failure', () => {
    // Null = the factsheet did not disclose one; the cost pillar reports
    // INSUFFICIENT_DATA. That is a different thing from a misread column.
    expect(validateTerPct(null).ok).toBe(true);
  });

  it('rejects zero — SEBI permits no zero-expense scheme', () => {
    const v = validateTerPct(serializePct(new Decimal('0')));
    expect(v.ok).toBe(false);
    expect(v.failures[0]?.reason).toBe('ter_range');
  });

  it('rejects an implausibly high TER', () => {
    expect(validateTerPct(serializePct(new Decimal('14.5'))).ok).toBe(false);
    expect(validateTerPct(serializePct(new Decimal('3.9'))).ok).toBe(false);
  });
});

describe('parseExitLoad', () => {
  it('reads a percent-first sentence', () => {
    expect(parseExitLoad('1.00% if redeemed within 365 days from allotment; Nil thereafter')).toEqual(
      [{ daysUpTo: 365, pct: serializePct(new Decimal('1')) }],
    );
  });

  it('reads a window-first sentence', () => {
    expect(
      parseExitLoad('Upto 1 Year from allotment - 1% of applicable NAV, more than 1 Year - Nil'),
    ).toEqual([{ daysUpTo: 365, pct: serializePct(new Decimal('1')) }]);
  });

  it('reads a months window', () => {
    expect(parseExitLoad('Exit load of 0.50% if redeemed on or before 12 months')).toEqual([
      { daysUpTo: 360, pct: serializePct(new Decimal('0.5')) },
    ]);
  });

  it('returns [] for an explicit Nil', () => {
    expect(parseExitLoad('Nil')).toEqual([]);
  });

  it('returns null — not [] — when the text is present but unreadable', () => {
    // [] would claim the fund has NO exit load, and a switch recommendation
    // costed against a zero load understates the real cost of acting on it.
    expect(parseExitLoad('Please refer to the SID for applicable load structure')).toBeNull();
    expect(parseExitLoad(null)).toBeNull();
  });
});

describe('headerKey and csvToGrid', () => {
  it('strips footnote decoration from header cells', () => {
    expect(headerKey('Industry^ / Rating')).toBe('industryrating');
    expect(headerKey('Industry+ / Rating')).toBe('industryrating');
    expect(headerKey('% to NAV')).toBe('tonav');
    expect(headerKey('Market/Fair Value (Rs. in Lacs)')).toBe('marketfairvaluersinlacs');
  });

  it('honours CSV quoting so a lakh-grouped number stays one cell', () => {
    const grid = csvToGrid('a,"1,20,000",c\nd,e,f\n');
    expect(grid).toEqual([
      ['a', '1,20,000', 'c'],
      ['d', 'e', 'f'],
    ]);
  });

  it('handles escaped quotes and CRLF', () => {
    expect(csvToGrid('"say ""hi""",b\r\nc,d')).toEqual([
      ['say "hi"', 'b'],
      ['c', 'd'],
    ]);
  });
});
