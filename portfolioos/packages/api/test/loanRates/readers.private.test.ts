import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { load } from 'cheerio';
import type { MclrTenor, RateReading } from '../../src/services/loans/loanRates/types.js';
import { hdfcHomeReader, hdfcRatesReader } from '../../src/services/loans/loanRates/sources/hdfc.js';
import { iciciHomeReader, iciciPersonalReader, iciciRatesReader } from '../../src/services/loans/loanRates/sources/icici.js';
import { axisHomeReader, axisMclrReader } from '../../src/services/loans/loanRates/sources/axis.js';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/loanRates/${name}`, import.meta.url), 'utf8');

function mclr(sourceId: string, effectiveDate: string, rates: [string, string, string, string, string]): RateReading[] {
  const tenors: MclrTenor[] = ['ON', '1M', '3M', '6M', '1Y'];
  return tenors.map((tenor, i) => ({ sourceId, basis: 'MCLR', tenor, minRatePct: rates[i]!, maxRatePct: null, effectiveDate }));
}

/** The real capture with the tables matching `drop` removed: what the page looks like if a table goes away. */
function without(name: string, drop: RegExp): string {
  const $ = load(fixture(name));
  const tables = $('table').filter((_i, t) => drop.test($(t).text()));
  expect(tables.length).toBeGreaterThan(0);
  tables.remove();
  return $.html();
}

const range = (sourceId: string, basis: RateReading['basis'], min: string, max: string | null): RateReading => ({
  sourceId, basis, tenor: null, minRatePct: min, maxRatePct: max, effectiveDate: null,
});

describe('hdfc.home', () => {
  it.each(['hdfc-HOME.html', 'hdfc-HOME2.html'])('reads the effective range after "=" on %s', (name) => {
    expect(hdfcHomeReader.read(fixture(name))).toEqual([range('hdfc.home', 'REPO_LINKED', '8.00', '13.45')]);
  });
  it('finds nothing on the ICICI home page', () => {
    expect(hdfcHomeReader.read(fixture('icici-HOME.html'))).toEqual([]);
  });
});

describe('hdfc.rates negatives', () => {
  it.each(['hdfc-HOME.html', 'icici-HOME.html', 'axis-HOME.html'])('finds nothing on %s', (name) => {
    expect(hdfcRatesReader.read(fixture(name))).toEqual([]);
  });
});

describe('hdfc.rates', () => {
  it('reads MCLR (dated October 07, 2026) and the personal/car carousel, not the carousel home figure', () => {
    expect(hdfcRatesReader.read(fixture('hdfc-rates.html'))).toEqual([
      ...mclr('hdfc.mclr', '2026-10-07', ['7.80', '7.75', '7.95', '8.15', '8.30']),
      range('hdfc.personal', 'OTHER', '9.99', null),
      range('hdfc.car', 'OTHER', '9.32', null),
    ]);
  });
});

describe('icici', () => {
  it('home: lowest..highest of the credit-score and loan-slab tables, not the PSL table', () => {
    expect(iciciHomeReader.read(fixture('icici-HOME.html'))).toEqual([range('icici.home', 'REPO_LINKED', '8.75', '10.05')]);
  });
  it('personal: "Between 9.99% and 16.50%" on MCLR + spread', () => {
    expect(iciciPersonalReader.read(fixture('icici-PERSONAL.html'))).toEqual([range('icici.personal', 'MCLR', '9.99', '16.50')]);
  });
  it('rates page: I-MCLR effective September 22, 2026', () => {
    expect(iciciRatesReader.read(fixture('icici-rates.html'))).toEqual(mclr('icici.mclr', '2026-09-22', ['7.80', '7.85', '8.10', '8.35', '8.40']));
  });
  it('home: needs both the credit-score and the loan-slab table, else nothing', () => {
    expect(iciciHomeReader.read(without('icici-HOME.html', /^\s*Loan Slab\s*Salaried\s*Self/))).toEqual([]);
    expect(iciciHomeReader.read(without('icici-HOME.html', /^\s*Credit Score\s*Salaried/))).toEqual([]);
  });
  it('each ICICI reader finds nothing on the other ICICI pages', () => {
    expect(iciciHomeReader.read(fixture('icici-PERSONAL.html'))).toEqual([]);
    expect(iciciPersonalReader.read(fixture('icici-HOME.html'))).toEqual([]);
    expect(iciciRatesReader.read(fixture('icici-HOME.html'))).toEqual([]);
  });
});

describe('axis', () => {
  it('home: the "Effective Rate of Interest" column', () => {
    expect(axisHomeReader.read(fixture('axis-HOME.html'))).toEqual([range('axis.home', 'REPO_LINKED', '8.00', '9.10')]);
  });
  it('mclr: w.e.f 18th Sept 2026, ignoring the base-rate date after the table', () => {
    expect(axisMclrReader.read(fixture('axis-MCLR.html'))).toEqual(mclr('axis.mclr', '2026-09-18', ['8.45', '8.45', '8.55', '8.60', '8.65']));
  });
  it('home: never reads the ASHA Home Loans table, even when the Cibil table is gone', () => {
    expect(axisHomeReader.read(without('axis-HOME.html', /^\s*Interest Rates \(per annum\)\s*Cibil Score/))).toEqual([]);
  });
  it('finds nothing on the other Axis page', () => {
    expect(axisHomeReader.read(fixture('axis-MCLR.html'))).toEqual([]);
    expect(axisMclrReader.read(fixture('axis-HOME.html'))).toEqual([]);
  });
});
