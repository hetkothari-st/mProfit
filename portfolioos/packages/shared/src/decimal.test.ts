import { describe, it, expect } from 'vitest';
import {
  Decimal,
  toDecimal,
  assertDecimal,
  serializeMoney,
  serializeQuantity,
  sumDecimal,
} from './decimal.js';

describe('toDecimal', () => {
  it('passes through Decimal instances', () => {
    const d = new Decimal('33.33');
    expect(toDecimal(d)).toBe(d);
  });

  it('parses strings exactly', () => {
    expect(toDecimal('0.1').equals(new Decimal('0.1'))).toBe(true);
  });

  it('accepts finite numbers', () => {
    expect(toDecimal(100).equals(new Decimal('100'))).toBe(true);
  });

  it('rejects NaN / Infinity', () => {
    expect(() => toDecimal(NaN)).toThrow(/non-finite/);
    expect(() => toDecimal(Infinity)).toThrow(/non-finite/);
  });

  it('rejects null/undefined', () => {
    expect(() => toDecimal(null)).toThrow(/null\/undefined/);
    expect(() => toDecimal(undefined)).toThrow(/null\/undefined/);
  });

  it('accepts Prisma-Decimal-like objects via toString()', () => {
    const prismaLike = { toString: () => '123.4567' };
    expect(toDecimal(prismaLike).equals(new Decimal('123.4567'))).toBe(true);
  });
});

describe('assertDecimal', () => {
  it('passes for a Decimal', () => {
    expect(() => assertDecimal(new Decimal('1'))).not.toThrow();
  });

  it('refuses JS numbers — the whole point of the guard', () => {
    expect(() => assertDecimal(1.23)).toThrow(/refusing JS number/);
  });

  it('refuses strings', () => {
    expect(() => assertDecimal('1.23')).toThrow(/expected Decimal/);
  });
});

describe('sumDecimal', () => {
  it('1000 × 0.10 is exactly 100 (no IEEE-754 drift)', () => {
    const values = Array.from({ length: 1000 }, () => '0.10');
    expect(sumDecimal(values).equals(new Decimal('100'))).toBe(true);
  });

  it('3 × 33.33 is exactly 99.99', () => {
    expect(sumDecimal(['33.33', '33.33', '33.33']).equals(new Decimal('99.99'))).toBe(true);
  });

  it('empty iterable returns 0', () => {
    expect(sumDecimal([]).equals(new Decimal('0'))).toBe(true);
  });
});

describe('serializeMoney', () => {
  it('serializes with 4 fractional digits (DB Decimal(18,4) shape)', () => {
    expect(serializeMoney('100')).toBe('100.0000');
    expect(serializeMoney('33.33')).toBe('33.3300');
  });

  it('uses banker\'s rounding (ROUND_HALF_EVEN)', () => {
    // 0.00005 is exactly halfway between 0.0000 and 0.0001. Banker's rounding
    // picks the even digit (0) → "0.0000". Half-up would give "0.0001".
    expect(serializeMoney('0.00005')).toBe('0.0000');
    // 0.00015 → rounds to even (0.0002).
    expect(serializeMoney('0.00015')).toBe('0.0002');
  });
});

describe('serializeQuantity', () => {
  it('serializes with 6 fractional digits (DB Decimal(18,6) shape)', () => {
    expect(serializeQuantity('1.5')).toBe('1.500000');
    expect(serializeQuantity('10')).toBe('10.000000');
  });
});
