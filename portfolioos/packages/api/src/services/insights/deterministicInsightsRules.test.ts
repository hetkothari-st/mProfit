import { describe, it, expect } from 'vitest';
import { classifyFdMaturity, isTaxLossHarvestWindow } from './deterministicInsightsRules.js';

const NOW = new Date('2026-03-01T00:00:00.000Z');

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 86_400_000);
}

describe('classifyFdMaturity', () => {
  it('flags an FD maturing in 15 days', () => {
    expect(classifyFdMaturity(daysFromNow(15), NOW)).toEqual({ daysUntil: 15 });
  });

  it('does not flag an FD maturing in 60 days', () => {
    expect(classifyFdMaturity(daysFromNow(60), NOW)).toBeNull();
  });

  it('flags an FD maturing today', () => {
    expect(classifyFdMaturity(daysFromNow(0), NOW)).toEqual({ daysUntil: 0 });
  });

  it('flags an FD maturing exactly at the 30-day boundary', () => {
    expect(classifyFdMaturity(daysFromNow(30), NOW)).toEqual({ daysUntil: 30 });
  });

  it('does not flag an FD that has already matured', () => {
    expect(classifyFdMaturity(daysFromNow(-5), NOW)).toBeNull();
  });
});

describe('isTaxLossHarvestWindow', () => {
  it('is true in October', () => {
    expect(isTaxLossHarvestWindow(new Date('2026-10-15T00:00:00.000Z'))).toBe(true);
  });

  it('is true in January', () => {
    expect(isTaxLossHarvestWindow(new Date('2026-01-15T00:00:00.000Z'))).toBe(true);
  });

  it('is true on March 31', () => {
    expect(isTaxLossHarvestWindow(new Date('2026-03-31T00:00:00.000Z'))).toBe(true);
  });

  it('is false in June', () => {
    expect(isTaxLossHarvestWindow(new Date('2026-06-15T00:00:00.000Z'))).toBe(false);
  });

  it('is false in September', () => {
    expect(isTaxLossHarvestWindow(new Date('2026-09-15T00:00:00.000Z'))).toBe(false);
  });

  it('is false on April 1 (just outside the window)', () => {
    expect(isTaxLossHarvestWindow(new Date('2026-04-01T00:00:00.000Z'))).toBe(false);
  });
});
