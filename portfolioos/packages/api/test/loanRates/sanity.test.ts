import { describe, it, expect } from 'vitest';
import { checkReading, istDate, isSourceStale } from '../../src/services/loanRates/sanity.js';
import type { RateReading } from '../../src/services/loanRates/types.js';

const TODAY = '2026-10-12';
const r = (over: Partial<RateReading> = {}): RateReading => ({
  sourceId: 'x.home', basis: 'OTHER', tenor: null, minRatePct: '8.50', maxRatePct: null, effectiveDate: null, ...over,
});
const verdict = (reading: RateReading, last: string | null = null) => checkReading(reading, last, TODAY);

describe('checkReading', () => {
  it('a plain reading is ACTIVE', () => expect(verdict(r())).toEqual({ status: 'ACTIVE', reasons: [] }));
  it.each(['3.99', '30.01'])('min %s is outside 4-30', (min) => expect(verdict(r({ minRatePct: min })).reasons).toEqual(['OUT_OF_RANGE']));
  it('the bounds themselves are fine', () => {
    expect(verdict(r({ minRatePct: '4.00' })).status).toBe('ACTIVE');
    expect(verdict(r({ minRatePct: '30.00' })).status).toBe('ACTIVE');
  });
  it('a ceiling above 30 is fine up to 40 (Kotak business 30.50)', () => {
    expect(verdict(r({ maxRatePct: '30.50' })).status).toBe('ACTIVE');
    expect(verdict(r({ maxRatePct: '40.01' })).reasons).toEqual(['BAD_MAX']);
    expect(verdict(r({ maxRatePct: '8.00' })).reasons).toEqual(['BAD_MAX']);
  });
  it('more than 2 pp from the last ACTIVE min is a jump, either way; exactly 2 is not', () => {
    expect(verdict(r({ minRatePct: '10.51' }), '8.50').reasons).toEqual(['JUMP']);
    expect(verdict(r({ minRatePct: '6.49' }), '8.50').reasons).toEqual(['JUMP']);
    expect(verdict(r({ minRatePct: '10.50' }), '8.50').status).toBe('ACTIVE');
  });
  it('as-of more than 7 days ahead is a misparse', () => {
    expect(verdict(r({ effectiveDate: '2026-10-19' })).status).toBe('ACTIVE');
    expect(verdict(r({ effectiveDate: '2026-10-20' })).reasons).toEqual(['ASOF_FUTURE']);
  });
  it('a product sheet older than 400 days, or MCLR older than 180 days, is stale', () => {
    expect(verdict(r({ effectiveDate: '2025-09-07' })).status).toBe('ACTIVE');
    expect(verdict(r({ effectiveDate: '2025-09-06' })).reasons).toEqual(['ASOF_STALE']);
    expect(verdict(r({ tenor: '1Y', basis: 'MCLR', effectiveDate: '2026-04-15' })).status).toBe('ACTIVE');
    expect(verdict(r({ tenor: '1Y', basis: 'MCLR', effectiveDate: '2026-04-14' })).reasons).toEqual(['ASOF_STALE']);
  });
  it('reasons accumulate', () => {
    expect(verdict(r({ minRatePct: '2.00', effectiveDate: '2027-01-01' }), '8.50').reasons).toEqual(['OUT_OF_RANGE', 'JUMP', 'ASOF_FUTURE']);
  });
});

describe('dates and staleness', () => {
  it('istDate turns over at 18:30 UTC', () => {
    expect(istDate(new Date('2026-10-11T18:29:00Z'))).toBe('2026-10-11');
    expect(istDate(new Date('2026-10-11T18:31:00Z'))).toBe('2026-10-12');
  });
  it('an AUTO source is stale after 7 days without success, counting from creation if it never succeeded', () => {
    const now = new Date('2026-10-12T02:00:00Z');
    const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
    expect(isSourceStale({ mode: 'AUTO', lastSuccessAt: days(7), createdAt: days(30) }, now)).toBe(false);
    expect(isSourceStale({ mode: 'AUTO', lastSuccessAt: days(7.01), createdAt: days(30) }, now)).toBe(true);
    expect(isSourceStale({ mode: 'AUTO', lastSuccessAt: null, createdAt: days(8) }, now)).toBe(true);
    expect(isSourceStale({ mode: 'AUTO', lastSuccessAt: null, createdAt: days(1) }, now)).toBe(false);
    expect(isSourceStale({ mode: 'MANUAL', lastSuccessAt: null, createdAt: days(400) }, now)).toBe(false);
  });
});
