import { describe, it, expect } from 'vitest';
import { isPriceStale } from './priceStaleness.js';

describe('isPriceStale', () => {
  const now = new Date('2026-05-29T12:00:00Z'); // Friday
  it('fresh equity price (same day) is not stale', () => {
    expect(isPriceStale('EQUITY', new Date('2026-05-29T00:00:00Z'), now)).toBe(false);
  });
  it('a Friday close read on Monday evening is not stale', () => {
    expect(isPriceStale('EQUITY', new Date('2026-05-22T00:00:00Z'), new Date('2026-05-25T13:00:00Z'))).toBe(false);
  });
  it('a Thursday close over a Friday holiday and weekend is not stale on Monday', () => {
    expect(isPriceStale('MUTUAL_FUND', new Date('2026-05-21T00:00:00Z'), new Date('2026-05-25T13:00:00Z'))).toBe(false);
  });
  it('equity price a week old is stale', () => {
    expect(isPriceStale('EQUITY', new Date('2026-05-22T00:00:00Z'), now)).toBe(true);
  });
  it('crypto price more than 2 days old is stale (24x7 market)', () => {
    expect(isPriceStale('CRYPTOCURRENCY', new Date('2026-05-26T00:00:00Z'), now)).toBe(true);
  });
  it("crypto price from yesterday's row is not stale", () => {
    expect(isPriceStale('CRYPTOCURRENCY', new Date('2026-05-28T00:00:00Z'), now)).toBe(false);
  });
  it('null as-of on a market asset is treated as stale', () => {
    expect(isPriceStale('EQUITY', null, now)).toBe(true);
  });
  it('accrual / non-market classes are never stale (no market price)', () => {
    expect(isPriceStale('FIXED_DEPOSIT', null, now)).toBe(false);
    expect(isPriceStale('NSC', null, now)).toBe(false);
    expect(isPriceStale('REAL_ESTATE', null, now)).toBe(false);
  });
});

// Launch review follow-up: exchange prices are judged by trading sessions.
describe('session rule for exchange prices', () => {
  const ist = (isoLocal: string) => new Date(`${isoLocal}+05:30`);
  it('a Friday close read on Sunday is current', () => {
    expect(isPriceStale('EQUITY', new Date('2026-11-20T00:00:00Z'), ist('2026-11-22T11:00:00'))).toBe(false);
  });
  it('a Friday close on Tuesday evening is stale (two sessions missed), though under 5 days old', () => {
    expect(isPriceStale('EQUITY', new Date('2026-11-20T00:00:00Z'), ist('2026-11-24T18:00:00'))).toBe(true);
  });
  it('crypto keeps its calendar-day tolerance', () => {
    expect(isPriceStale('CRYPTOCURRENCY', new Date('2026-11-20T00:00:00Z'), ist('2026-11-21T11:00:00'))).toBe(false);
    expect(isPriceStale('CRYPTOCURRENCY', new Date('2026-11-20T00:00:00Z'), ist('2026-11-22T11:00:00'))).toBe(true);
  });
});
