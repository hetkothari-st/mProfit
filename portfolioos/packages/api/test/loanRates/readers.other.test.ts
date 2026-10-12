import { describe, it, expect } from 'vitest';
import type { RateReading } from '../../src/services/loanRates/types.js';
import { kotakRatesReader } from '../../src/services/loanRates/sources/kotak.js';
import { canaraRangeReader } from '../../src/services/loanRates/sources/canara.js';
import { licHomeReader } from '../../src/services/loanRates/sources/lic.js';
import { PAGE_READERS, READER_URLS, readerById } from '../../src/services/loanRates/sources/index.js';
import { READER_FIXTURES, fixture } from './readerFixtures.js';

const range = (sourceId: string, basis: RateReading['basis'], min: string, max: string, extra: Partial<RateReading> = {}): RateReading => ({
  sourceId, basis, tenor: null, minRatePct: min, maxRatePct: max, effectiveDate: null, ...extra,
});

const KOTAK: RateReading[] = [
  range('kotak.home', 'REPO_LINKED', '7.70', '13.05'),
  range('kotak.business', 'FIXED', '9.50', '30.50'),
  range('kotak.personal', 'FIXED', '10.25', '30.00'),
  range('kotak.lap', 'REPO_LINKED', '9.15', '16.00'),
  range('kotak.las', 'REPO_LINKED', '10.50', '12.00'),
  range('kotak.education', 'FIXED', '11.00', '17.00'),
];

describe('kotak.rates', () => {
  it.each(['kotak-rates.html', 'kotak-MCLR.html'])('reads the loans table on %s; housing spans its two "For ..." rows', (name) => {
    expect(kotakRatesReader.read(fixture(name))).toEqual(KOTAK);
  });
  it('finds nothing on another bank page', () => {
    expect(kotakRatesReader.read(fixture('axis-HOME.html'))).toEqual([]);
  });
});

describe('canara.range', () => {
  it('reads contracted-loan ranges dated w.e.f. 12.12.2025', () => {
    const note = { effectiveDate: '2025-12-12', note: 'Range of contracted loans' };
    expect(canaraRangeReader.read(fixture('canara-RANGE.html'))).toEqual([
      range('canara.home', 'OTHER', '7.40', '10.25', note),
      range('canara.car', 'OTHER', '7.70', '15.25', note),
      range('canara.lap', 'OTHER', '9.30', '11.80', note),
    ]);
  });
  it('finds nothing on the Kotak page', () => {
    expect(canaraRangeReader.read(fixture('kotak-rates.html'))).toEqual([]);
  });
});

describe('lic.home', () => {
  it('decodes the Next.js payload and spans both roi tables (one cell has no % sign)', () => {
    expect(licHomeReader.read(fixture('lic-HOME.html'))).toEqual([range('lic.home', 'OTHER', '7.15', '10.30')]);
  });
  it('finds nothing on a page without the payload', () => {
    expect(licHomeReader.read(fixture('kotak-rates.html'))).toEqual([]);
  });
});

describe('registry', () => {
  it('has 15 readers with unique ids and unique https URLs', () => {
    expect(PAGE_READERS).toHaveLength(15);
    expect(new Set(PAGE_READERS.map((r) => r.id)).size).toBe(15);
    expect(READER_URLS.size).toBe(15);
    for (const r of PAGE_READERS) {
      expect(new URL(r.url).protocol).toBe('https:');
      expect(r.version).toMatch(/^\d+$/);
    }
    expect(readerById('kotak.rates')).toBe(kotakRatesReader);
    expect(readerById('nope')).toBeUndefined();
  });

  it('every reader yields readings on every real capture listed for it, all with sane decimal strings', () => {
    expect(Object.keys(READER_FIXTURES).sort()).toEqual(PAGE_READERS.map((r) => r.id).sort());
    for (const reader of PAGE_READERS) {
      for (const name of READER_FIXTURES[reader.id]!) {
        const readings = reader.read(fixture(name));
        expect(readings.length, `${reader.id} on ${name}`).toBeGreaterThan(0);
        for (const r of readings) {
          expect(r.minRatePct).toMatch(/^\d{1,2}\.\d{2,3}$/);
          if (r.maxRatePct !== null) expect(r.maxRatePct).toMatch(/^\d{1,2}\.\d{2,3}$/);
          if (r.effectiveDate !== null) expect(r.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      }
    }
  });
});
