import { describe, it, expect } from 'vitest';
import { Decimal } from '@everypaisa/shared';
import { GOLD_KARATS, SILVER_PURITIES, pricePerGram } from './metalPurity';

describe('metal purities', () => {
  it('lists gold karats with their hallmark fineness, finest first', () => {
    expect(GOLD_KARATS.map((k) => [k.value, k.fineness])).toEqual([
      ['24', '999'],
      ['22', '916'],
      ['18', '750'],
      ['14', '585'],
    ]);
  });

  it('lists the silver grades the app values holdings in', () => {
    expect(SILVER_PURITIES.map((p) => p.value)).toEqual(['999', '925', '800']);
  });
});

describe('pricePerGram', () => {
  it('scales gold by karat / 24 — the same math as holdings valuation', () => {
    expect(pricePerGram('GOLD', '7000', '24')).toBe('7000.00');
    // 7000 × 22 / 24 = 6416.666…
    expect(pricePerGram('GOLD', '7000', '22')).toBe('6416.67');
    expect(pricePerGram('GOLD', '7000', '18')).toBe('5250.00');
    expect(pricePerGram('GOLD', '7000', '14')).toBe(new Decimal(7000).times(14).div(24).toFixed(2));
  });

  it('scales silver by grade', () => {
    expect(pricePerGram('SILVER', '90', '999')).toBe('90.00');
    expect(pricePerGram('SILVER', '90', '925')).toBe('83.25');
    expect(pricePerGram('SILVER', '90', '800')).toBe('72.00');
  });

  it('has no price without a base price or with an unknown purity', () => {
    expect(pricePerGram('GOLD', null, '22')).toBeNull();
    expect(pricePerGram('GOLD', '7000', '99')).toBeNull();
  });
});
