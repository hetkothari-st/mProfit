import { describe, it, expect } from 'vitest';
import { isPriceStale } from './priceStaleness.js';

describe('isPriceStale', () => {
  const now = new Date('2026-05-29T12:00:00Z'); // Friday
  it('fresh equity price (same day) is not stale', () => {
    expect(isPriceStale('EQUITY', new Date('2026-05-29T06:00:00Z'), now)).toBe(false);
  });
  it('equity price >3 days old is stale', () => {
    expect(isPriceStale('EQUITY', new Date('2026-05-25T06:00:00Z'), now)).toBe(true);
  });
  it('crypto price >1 day old is stale (24x7 market)', () => {
    expect(isPriceStale('CRYPTOCURRENCY', new Date('2026-05-27T12:00:00Z'), now)).toBe(true);
  });
  it('crypto price <1 day old is not stale', () => {
    expect(isPriceStale('CRYPTOCURRENCY', new Date('2026-05-29T00:00:00Z'), now)).toBe(false);
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
