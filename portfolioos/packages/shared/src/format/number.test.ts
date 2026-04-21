import { describe, it, expect } from 'vitest';
import { formatINR, formatPercent, formatQuantity, signOf, compactIndian } from './number.js';

describe('formatINR', () => {
  it('formats a basic positive amount with INR symbol', () => {
    expect(formatINR(1234.5)).toBe('₹1,234.50');
  });

  it('returns dash for null/undefined/empty', () => {
    expect(formatINR(null)).toBe('-');
    expect(formatINR(undefined)).toBe('-');
    expect(formatINR('')).toBe('-');
  });

  it('supports compact Indian formatting (lakh/crore)', () => {
    expect(formatINR(150000, { compact: true })).toBe('₹1.5 L');
    expect(formatINR(30000000, { compact: true })).toBe('₹3 Cr');
  });
});

describe('compactIndian', () => {
  it('strips trailing zeros in compact form', () => {
    expect(compactIndian(200000)).toBe('2 L');
    expect(compactIndian(20000000)).toBe('2 Cr');
  });
});

describe('formatPercent', () => {
  it('formats positive and negative percents', () => {
    expect(formatPercent(12.345)).toBe('12.35%');
    expect(formatPercent(-3.1)).toBe('-3.10%');
  });
});

describe('formatQuantity', () => {
  it('formats quantity in Indian grouping', () => {
    expect(formatQuantity(1234.56, 2)).toBe('1,234.56');
  });
});

describe('signOf', () => {
  it('classifies sign correctly', () => {
    expect(signOf(5)).toBe('positive');
    expect(signOf(-5)).toBe('negative');
    expect(signOf(0)).toBe('zero');
    expect(signOf(null)).toBe('zero');
  });
});
