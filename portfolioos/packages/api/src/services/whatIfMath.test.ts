import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { isLongTerm, simulateSale, type SaleLot } from './whatIfMath.js';

const rates = { stcgEquityPct: 20, ltcgEquityPct: 12.5, ltcgOtherPct: 12.5, slabPct: 30, slabIsEstimate: true };
const D = (n: number) => new Decimal(n);

function lot(costPerUnit: number, quantity: number, longTerm: boolean, buyDate = '2020-01-01'): SaleLot {
  return { buyDate: new Date(`${buyDate}T00:00:00Z`), quantity: D(quantity), costPerUnit: D(costPerUnit), longTerm };
}

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
  const equity = { assetClass: 'EQUITY', equityOriented: true, sellPrice: D(160), rates };

  it('short-term equity gain taxed at STCG rate', () => {
    const r = simulateSale({ ...equity, sellQty: D(50), lots: [lot(100, 50, false)] });
    expect(Number(r.proceeds)).toBe(8000);     // 160×50
    expect(Number(r.costBasis)).toBe(5000);    // 100×50
    expect(Number(r.realisedPnL)).toBe(3000);
    expect(r.term).toBe('SHORT');
    expect(Number(r.estTax)).toBeCloseTo(600, 2); // 3000×20%
    expect(Number(r.slabTaxableGain)).toBe(0);
  });

  it('long-term equity gain taxed at LTCG rate (flagged indicative for exemption)', () => {
    const r = simulateSale({ ...equity, sellQty: D(50), lots: [lot(100, 50, true)] });
    expect(r.term).toBe('LONG');
    expect(Number(r.estTax)).toBeCloseTo(375, 2); // 3000×12.5%
    expect(r.taxIndicative).toBe(true);           // ₹1.25L LTCG exemption applies at aggregate
  });

  it('a loss has no tax and is flagged harvestable', () => {
    const r = simulateSale({ ...equity, sellPrice: D(80), sellQty: D(50), lots: [lot(100, 50, false)] });
    expect(Number(r.realisedPnL)).toBe(-1000);
    expect(Number(r.estTax)).toBe(0);
    expect(r.isLoss).toBe(true);
  });

  // The bug this replaced: average cost understates the gain on anything
  // bought over time, because FIFO sells the oldest — usually cheapest — units.
  it('consumes the oldest lots first, not the average cost', () => {
    const lots = [lot(50, 10, true, '2019-04-02'), lot(150, 10, false, '2025-06-01')];
    const r = simulateSale({ ...equity, sellPrice: D(200), sellQty: D(10), lots });
    // FIFO: all 10 units from the ₹50 lot → cost 500, gain 1500.
    // Average cost (₹100) would have said cost 1000, gain 1000.
    expect(Number(r.costBasis)).toBe(500);
    expect(Number(r.realisedPnL)).toBe(1500);
    expect(r.term).toBe('LONG');
    expect(r.lotsMatched).toBe(1);
    expect(r.oldestMatchedBuyDate).toBe('2019-04-02');
  });

  it('splits a sale that straddles the long-term threshold and taxes each side', () => {
    const lots = [lot(50, 10, true, '2019-04-02'), lot(150, 10, false, '2025-06-01')];
    const r = simulateSale({ ...equity, sellPrice: D(200), sellQty: D(15), lots });
    expect(r.term).toBe('MIXED');
    // 10 long-term units: cost 500, gain 1500 at 12.5% = 187.50
    expect(Number(r.longTerm.quantity)).toBe(10);
    expect(Number(r.longTerm.realisedPnL)).toBe(1500);
    expect(Number(r.longTerm.estTax)).toBeCloseTo(187.5, 2);
    // 5 short-term units: cost 750, gain 250 at 20% = 50
    expect(Number(r.shortTerm.quantity)).toBe(5);
    expect(Number(r.shortTerm.realisedPnL)).toBe(250);
    expect(Number(r.shortTerm.estTax)).toBeCloseTo(50, 2);
    expect(Number(r.estTax)).toBeCloseTo(237.5, 2);
    expect(r.taxRatePct).toBeNull(); // no single rate describes a mixed sale
  });

  // The dangerous one: a slab-rated gain used to report estTax 0, so the UI
  // showed "Est. tax ₹0" and full net cash on a sale that is taxed hardest.
  it('taxes a non-equity short-term gain at the slab rate, never at zero', () => {
    const r = simulateSale({
      assetClass: 'MUTUAL_FUND',
      equityOriented: false,
      sellPrice: D(160),
      sellQty: D(50),
      lots: [lot(100, 50, false, '2025-01-01')],
      rates,
    });
    expect(r.term).toBe('SHORT');
    expect(Number(r.realisedPnL)).toBe(3000);
    expect(Number(r.estTax)).toBeCloseTo(900, 2);  // 3000×30% slab
    expect(Number(r.slabTaxableGain)).toBe(3000);
    expect(r.slabRatePct).toBe(30);
    expect(r.slabRateIsEstimate).toBe(true);
    expect(r.taxIndicative).toBe(true);
  });

  it("uses the user's own slab rate when one is recorded", () => {
    const r = simulateSale({
      assetClass: 'PHYSICAL_GOLD',
      equityOriented: false,
      sellPrice: D(160),
      sellQty: D(50),
      lots: [lot(100, 50, false, '2025-01-01')],
      rates: { ...rates, slabPct: 20, slabIsEstimate: false },
    });
    expect(Number(r.estTax)).toBeCloseTo(600, 2); // 3000×20%
    expect(r.slabRatePct).toBe(20);
    expect(r.slabRateIsEstimate).toBe(false);
  });

  it('taxes a long-term debt gain at the non-equity LTCG rate', () => {
    const r = simulateSale({
      assetClass: 'MUTUAL_FUND',
      equityOriented: false,
      sellPrice: D(160),
      sellQty: D(50),
      lots: [lot(100, 50, true, '2019-01-01')],
      rates,
    });
    expect(r.term).toBe('LONG');
    expect(Number(r.estTax)).toBeCloseTo(375, 2); // 3000×12.5%
    expect(Number(r.slabTaxableGain)).toBe(0);
  });

  it('a loss in one bucket is not netted against a gain taxed in the other', () => {
    // Long-term lot at a loss, short-term lot at a gain.
    const lots = [lot(300, 10, true, '2019-04-02'), lot(100, 10, false, '2025-06-01')];
    const r = simulateSale({ ...equity, sellPrice: D(200), sellQty: D(20), lots });
    expect(Number(r.longTerm.realisedPnL)).toBe(-1000);
    expect(Number(r.longTerm.estTax)).toBe(0);
    expect(Number(r.shortTerm.realisedPnL)).toBe(1000);
    expect(Number(r.shortTerm.estTax)).toBeCloseTo(200, 2); // 1000×20%
    expect(Number(r.realisedPnL)).toBe(0);
  });

  it('flags a sale it could not fully match to lots', () => {
    const r = simulateSale({ ...equity, sellQty: D(50), lots: [lot(100, 10, false)] });
    expect(r.lotsIncomplete).toBe(true);
    expect(Number(r.costBasis)).toBe(1000); // only what it could match
  });
});
