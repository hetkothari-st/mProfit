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
  it('matches plain trackers across the eight broad-market indices', () => {
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

  it('matches sectoral, thematic and factor trackers to their own index', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['Kotak Nifty Next 50 Index Fund', 'NIFTY_NEXT50_TRI'],
      ['Groww Nifty PSU Bank Index Fund', 'NIFTY_PSU_BANK_TRI'],
      ['Nippon India Nifty Pharma ETF', 'NIFTY_PHARMA_TRI'],
      ['Nippon India ETF Nifty PSU Bank BeES', 'NIFTY_PSU_BANK_TRI'],
      ['ICICI Prudential Nifty Financial Services Ex-Bank ETF', 'NIFTY_FIN_SERVICES_EX_BANK_TRI'],
      ['ICICI Prudential Nifty Alpha Low- Volatility 30 ETF', 'NIFTY_ALPHA_LOW_VOL30_TRI'],
      ['Motilal Oswal Nifty 200 Momentum 30 Index Fund', 'NIFTY200_MOMENTUM30_TRI'],
      ['ICICI Prudential Nifty200 Momentum 30 ETF', 'NIFTY200_MOMENTUM30_TRI'],
      ['Axis NIFTY India Consumption ETF', 'NIFTY_INDIA_CONSUMPTION_TRI'],
      ['Motilal Oswal Nifty Microcap 250 Index Fund', 'NIFTY_MICROCAP250_TRI'],
    ];
    for (const [name, code] of cases) {
      expect(resolveIndexFundBenchmark(name), name).toBe(code);
    }
  });

  it('gives a factor variant ITS index, never the parent it contains', () => {
    // Each of these contains a known parent index as a substring. Matching the
    // parent would compute tracking error against a series the fund never
    // followed; the exact-residual rule sends each to its own index instead.
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['UTI Nifty Midcap 150 Quality 50 Index Fund', 'NIFTY_MIDCAP150_QUALITY50_TRI'],
      ['DSP Nifty Midcap 150 Quality 50 ETF', 'NIFTY_MIDCAP150_QUALITY50_TRI'],
      ['Axis Nifty50 Equal Weight Index Fund', 'NIFTY50_EQUAL_WEIGHT_TRI'],
      ['Mirae Asset Nifty50 Equal Weight ETF', 'NIFTY50_EQUAL_WEIGHT_TRI'],
      ['Tata Nifty Midcap 150 Momentum 50 Index Fund', 'NIFTY_MIDCAP150_MOMENTUM50_TRI'],
    ];
    for (const [name, code] of cases) {
      expect(resolveIndexFundBenchmark(name), name).toBe(code);
    }
  });

  it('REFUSES variants of a known index that we hold no prices for', () => {
    for (const name of [
      'ICICI Prudential Nifty200 Value 30 ETF',
      'Mirae Asset Nifty500 Multicap 50:25:25 ETF',
      'Tata Nifty500 Multicap Infrastructure 50:30:20 Index Fund',
      'UTI Nifty Midsmallcap 400 Momentum Quality 100 Index Fund',
    ]) {
      expect(resolveIndexFundBenchmark(name), name).toBeNull();
    }
  });

  it('refuses indices with no free TRI', () => {
    for (const name of [
      'HDFC BSE Sensex Index Fund',
      'Bandhan BSE Healthcare Index Fund',
      'Aditya Birla Sun Life Gold ETF',
      'ICICI Prudential NASDAQ 100 Index Fund',
      'Nippon India ETF Nifty SDL Apr 2026 Top 20 Equal Weight',
      'HDFC Nifty G-Sec Jun 2036 Index Fund',
    ]) {
      expect(resolveIndexFundBenchmark(name), name).toBeNull();
    }
  });

  it('reads a bare "Nifty" as the Nifty 50', () => {
    expect(resolveIndexFundBenchmark('SBI NIFTY INDEX FUND')).toBe('NIFTY50_TRI');
    expect(resolveIndexFundBenchmark('Nippon India ETF Nifty BeES')).toBe('NIFTY50_TRI');
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
    expect(resolveBenchmarkCode('Index Funds/ETFs', 'Nippon India Nifty Auto ETF')).toBe(
      'NIFTY_AUTO_TRI',
    );
    expect(resolveBenchmarkCode('Index Funds/ETFs', 'SBI BSE Sensex Index Fund')).toBeNull();
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
