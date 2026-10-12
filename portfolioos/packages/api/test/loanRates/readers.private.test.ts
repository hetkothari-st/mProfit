import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { MclrTenor, RateReading } from '../../src/services/loanRates/types.js';
import { hdfcHomeReader, hdfcRatesReader } from '../../src/services/loanRates/sources/hdfc.js';
import { iciciHomeReader, iciciPersonalReader, iciciRatesReader } from '../../src/services/loanRates/sources/icici.js';
import { axisHomeReader, axisMclrReader } from '../../src/services/loanRates/sources/axis.js';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/loanRates/${name}`, import.meta.url), 'utf8');

function mclr(sourceId: string, effectiveDate: string, rates: [string, string, string, string, string]): RateReading[] {
  const tenors: MclrTenor[] = ['ON', '1M', '3M', '6M', '1Y'];
  return tenors.map((tenor, i) => ({ sourceId, basis: 'MCLR', tenor, minRatePct: rates[i]!, maxRatePct: null, effectiveDate }));
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
  it('finds nothing on the other Axis page', () => {
    expect(axisHomeReader.read(fixture('axis-MCLR.html'))).toEqual([]);
    expect(axisMclrReader.read(fixture('axis-HOME.html'))).toEqual([]);
  });
});
