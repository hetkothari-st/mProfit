import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { isLongTerm, simulateSale } from './whatIfMath.js';

const rates = { stcgEquityPct: 20, ltcgEquityPct: 12.5, ltcgOtherPct: 12.5 };
const D = (n: number) => new Decimal(n);

describe('isLongTerm', () => {
  it('equity/MF/ETF turn long-term at 12 months', () => {
    expect(isLongTerm('EQUITY', 200)).toBe(false);
    expect(isLongTerm('EQUITY', 400)).toBe(true);
    expect(isLongTerm('MUTUAL_FUND', 400)).toBe(true);
  });
  it('other assets need 36 months', () => {
    expect(isLongTerm('PHYSICAL_GOLD', 400)).toBe(false);
    expect(isLongTerm('PHYSICAL_GOLD', 1100)).toBe(true);
  });
  it('foreign equity needs 24 months', () => {
    expect(isLongTerm('FOREIGN_EQUITY', 400)).toBe(false);
    expect(isLongTerm('FOREIGN_EQUITY', 800)).toBe(true);
  });
});

describe('simulateSale', () => {
  const baseEquity = {
    assetClass: 'EQUITY',
    avgCost: D(100),
    sellQty: D(50),
    sellPrice: D(160),
    rates,
  };

  it('short-term equity gain taxed at STCG rate', () => {
    const r = simulateSale({ ...baseEquity, holdingPeriodDays: 100 });
    expect(Number(r.proceeds)).toBe(8000);     // 160×50
    expect(Number(r.costBasis)).toBe(5000);    // 100×50
    expect(Number(r.realisedPnL)).toBe(3000);
    expect(r.term).toBe('SHORT');
    expect(Number(r.estTax)).toBeCloseTo(600, 2); // 3000×20%
  });

  it('long-term equity gain taxed at LTCG rate (flagged indicative for exemption)', () => {
    const r = simulateSale({ ...baseEquity, holdingPeriodDays: 400 });
    expect(r.term).toBe('LONG');
    expect(Number(r.estTax)).toBeCloseTo(375, 2); // 3000×12.5%
    expect(r.taxIndicative).toBe(true);           // ₹1.25L LTCG exemption applies at aggregate
  });

  it('a loss has no tax and is flagged harvestable', () => {
    const r = simulateSale({ ...baseEquity, sellPrice: D(80), holdingPeriodDays: 100 });
    expect(Number(r.realisedPnL)).toBe(-1000);
    expect(Number(r.estTax)).toBe(0);
    expect(r.isLoss).toBe(true);
  });
});
