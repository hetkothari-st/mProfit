/**
 * The whole value of this matcher is what it REFUSES.
 *
 * "UTI Nifty Midcap 150 Quality 50 Index Fund" contains "Nifty Midcap 150" and
 * tracks a different index. Assigning it the parent index would compute
 * tracking error and alpha against a series the fund never followed — a wrong
 * number, presented with the same confidence as a right one, inside the pillar
 * the INDEX model is built on. A fund left unbenchmarked merely goes unrated.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveIndexFundBenchmark,
  resolveBenchmarkCode,
} from '../../src/priceFeeds/amfiSchemeMaster.v1.js';

describe('resolveIndexFundBenchmark', () => {
  it('matches plain trackers across the eight priced indices', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['HDFC Nifty 50 Index Fund', 'NIFTY50_TRI'],
      ['UTI Nifty 50 Index Fund', 'NIFTY50_TRI'],
      ['Kotak Nifty 50 ETF', 'NIFTY50_TRI'],
      ['Axis Nifty 100 Index Fund', 'NIFTY100_TRI'],
      ['Motilal Oswal Nifty 500 Index Fund', 'NIFTY500_TRI'],
      ['DSP Nifty Midcap 150 Index Fund', 'NIFTY_MIDCAP150_TRI'],
      ['DSP Nifty Smallcap 250 ETF', 'NIFTY_SMALLCAP250_TRI'],
      ['Mirae Asset Nifty LargeMidcap 250 Index Fund', 'NIFTY_LARGEMIDCAP250_TRI'],
    ];
    for (const [name, code] of cases) {
      expect(resolveIndexFundBenchmark(name), name).toBe(code);
    }
  });

  it('tolerates the spacing AMCs actually use', () => {
    expect(resolveIndexFundBenchmark('Axis Nifty50 Index Fund')).toBe('NIFTY50_TRI');
    expect(resolveIndexFundBenchmark('Nippon India ETF Nifty 100')).toBe('NIFTY100_TRI');
  });

  it('REFUSES factor and smart-beta variants of an index it knows', () => {
    // Each of these contains a known index as a substring and tracks another.
    for (const name of [
      'UTI Nifty Midcap 150 Quality 50 Index Fund',
      'DSP Nifty Midcap 150 Quality 50 ETF',
      'Axis Nifty50 Equal Weight Index Fund',
      'Mirae Asset Nifty50 Equal Weight ETF',
      'ICICI Prudential Nifty200 Value 30 ETF',
      'Mirae Asset Nifty500 Multicap 50:25:25 ETF',
      'Tata Nifty500 Multicap Infrastructure 50:30:20 Index Fund',
      'UTI Nifty Midsmallcap 400 Momentum Quality 100 Index Fund',
    ]) {
      expect(resolveIndexFundBenchmark(name), name).toBeNull();
    }
  });

  it('refuses indices we hold no prices for', () => {
    for (const name of [
      'Kotak Nifty Next 50 Index Fund',
      'Groww Nifty PSU Bank Index Fund',
      'Nippon India Nifty Pharma ETF',
      'Bandhan BSE Healthcare Index Fund',
      'Aditya Birla Sun Life Gold ETF',
      'Nippon India ETF Nifty SDL Apr 2026 Top 20 Equal Weight',
    ]) {
      expect(resolveIndexFundBenchmark(name), name).toBeNull();
    }
  });

  it('ignores AMFI rename annotations', () => {
    expect(resolveIndexFundBenchmark('SBI Nifty 50 Index Fund (erstwhile SBI Nifty Index Fund)')).toBe(
      'NIFTY50_TRI',
    );
  });

  it('returns null when no index token is present at all', () => {
    expect(resolveIndexFundBenchmark('Some Balanced Advantage Fund')).toBeNull();
  });
});

describe('resolveBenchmarkCode routes index funds by name', () => {
  it('uses the name for Index Funds/ETFs', () => {
    expect(resolveBenchmarkCode('Index Funds/ETFs', 'HDFC Nifty 50 Index Fund')).toBe(
      'NIFTY50_TRI',
    );
    expect(resolveBenchmarkCode('Index Funds/ETFs', 'Nippon India Nifty Auto ETF')).toBeNull();
  });

  it('returns null for an index fund when no name is available', () => {
    // Rather than falling through to a category default, which would be wrong
    // for nearly every member of this sub-category.
    expect(resolveBenchmarkCode('Index Funds/ETFs')).toBeNull();
  });

  it('leaves other sub-categories on their category default', () => {
    expect(resolveBenchmarkCode('Large Cap Fund', 'Anything At All')).toBe('NIFTY100_TRI');
  });
});
