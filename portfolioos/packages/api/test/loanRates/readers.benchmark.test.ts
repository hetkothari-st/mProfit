import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { MclrTenor, RateReading } from '../../src/services/loanRates/types.js';
import { rbiHomeReader } from '../../src/services/loanRates/sources/rbi.js';
import { sbiRatesReader } from '../../src/services/loanRates/sources/sbi.js';
import { bobRetailReader, pnbMclrReader, unionRatesReader } from '../../src/services/loanRates/sources/psuMclr.js';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/loanRates/${name}`, import.meta.url), 'utf8');

function mclr(sourceId: string, effectiveDate: string, rates: [string, string, string, string, string]): RateReading[] {
  const tenors: MclrTenor[] = ['ON', '1M', '3M', '6M', '1Y'];
  return tenors.map((tenor, i) => ({ sourceId, basis: 'MCLR', tenor, minRatePct: rates[i]!, maxRatePct: null, effectiveDate }));
}

const product = (sourceId: string, basis: RateReading['basis'], min: string, effectiveDate: string | null = null): RateReading => ({
  sourceId, basis, tenor: null, minRatePct: min, maxRatePct: null, effectiveDate,
});

const SBI_WIDGET: RateReading[] = [
  product('sbi.home', 'REPO_LINKED', '7.25', '2026-04-01'),
  product('sbi.personal', 'OTHER', '10.00'),
  product('sbi.gold', 'OTHER', '9.15'),
  product('sbi.education', 'OTHER', '6.90'),
  product('sbi.car', 'OTHER', '8.30'),
  product('sbi.las', 'OTHER', '9.95', '2025-12-15'),
];

describe('rbi.home', () => {
  it('reads the policy repo rate (the page gives no change date)', () => {
    expect(rbiHomeReader.read(fixture('rbi-home.html'))).toEqual([product('rbi.repo', 'OTHER', '5.50')]);
  });
  it('finds nothing on a bank page', () => {
    expect(rbiHomeReader.read(fixture('sbi-mclr.html'))).toEqual([]);
  });
});

describe('sbi.rates', () => {
  it('reads the MCLR table with its "With Effect From" date, then the headline widget', () => {
    expect(sbiRatesReader.read(fixture('sbi-mclr.html'))).toEqual([
      ...mclr('sbi.mclr', '2026-09-15', ['7.85', '7.85', '8.25', '8.60', '8.70']),
      ...SBI_WIDGET,
    ]);
  });
  it.each(['sbi-eblr.html', 'sbi-rates-index.html', 'sbi-LAP.html'])(
    'reads the same widget on %s (no MCLR table there; the LAP page renders the widget twice)',
    (name) => {
      expect(sbiRatesReader.read(fixture(name))).toEqual(SBI_WIDGET);
    },
  );
  it('finds nothing on another bank page', () => {
    expect(sbiRatesReader.read(fixture('axis-HOME.html'))).toEqual([]);
  });
});

describe('PSU MCLR pages', () => {
  it('pnb.mclr takes the revised column and the latest w.e.f. date', () => {
    expect(pnbMclrReader.read(fixture('pnb-MCLR.html'))).toEqual(mclr('pnb.mclr', '2026-10-01', ['8.00', '8.25', '8.50', '8.65', '8.80']));
  });
  it('bob.retail reads only the MCLR table', () => {
    expect(bobRetailReader.read(fixture('bob-retail.html'))).toEqual(mclr('bob.mclr', '2026-10-12', ['7.85', '7.95', '8.30', '8.50', '8.75']));
  });
  it('union.rates dates MCLR from its heading, not the base-rate row below', () => {
    expect(unionRatesReader.read(fixture('union-loans.html'))).toEqual(mclr('union.mclr', '2026-09-21', ['7.90', '8.10', '8.35', '8.65', '8.80']));
  });
  it('an MCLR reader finds nothing on a page without an MCLR table', () => {
    expect(pnbMclrReader.read(fixture('icici-HOME.html'))).toEqual([]);
    expect(unionRatesReader.read(fixture('canara-RANGE.html'))).toEqual([]);
  });
});
