import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { computeHarvestSavings } from './taxHarvestMath.js';

const base = {
  stcgRate: 0.20,
  ltcgRate: 0.125,
  ltcgExemption: new Decimal(125000),
};
const D = (n: number) => new Decimal(n);

describe('computeHarvestSavings', () => {
  it('applies STCL to STCG (higher rate) first, LTCL to LTCG, honouring the ₹1.25L exemption', () => {
    const r = computeHarvestSavings({
      ...base,
      realisedStcg: D(200000),
      realisedLtcg: D(300000),
      stcgLossAvailable: D(100000),
      ltcgLossAvailable: D(50000),
    });
    // before: 0.20×200000 + 0.125×(300000−125000) = 40000 + 21875 = 61875
    expect(Number(r.taxBefore)).toBeCloseTo(61875, 2);
    // after:  0.20×100000 + 0.125×(250000−125000) = 20000 + 15625 = 35625
    expect(Number(r.taxAfter)).toBeCloseTo(35625, 2);
    expect(Number(r.taxSaved)).toBeCloseTo(26250, 2);
    expect(Number(r.applied.stclVsStcg)).toBeCloseTo(100000, 2);
    expect(Number(r.applied.ltclVsLtcg)).toBeCloseTo(50000, 2);
  });

  it('spills leftover STCL onto LTCG (short-term loss can offset both)', () => {
    const r = computeHarvestSavings({
      ...base,
      realisedStcg: D(50000),
      realisedLtcg: D(400000),
      stcgLossAvailable: D(150000), // 50k absorbs STCG, 100k spills to LTCG
      ltcgLossAvailable: D(0),
    });
    expect(Number(r.applied.stclVsStcg)).toBeCloseTo(50000, 2);
    expect(Number(r.applied.stclVsLtcg)).toBeCloseTo(100000, 2);
  });

  it('no realised gains → nothing to save', () => {
    const r = computeHarvestSavings({
      ...base,
      realisedStcg: D(0),
      realisedLtcg: D(0),
      stcgLossAvailable: D(100000),
      ltcgLossAvailable: D(100000),
    });
    expect(Number(r.taxSaved)).toBe(0);
  });

  it('LTCL gives no benefit when realised LTCG sits under the exemption', () => {
    const r = computeHarvestSavings({
      ...base,
      realisedStcg: D(0),
      realisedLtcg: D(100000), // below ₹1.25L → already exempt
      stcgLossAvailable: D(0),
      ltcgLossAvailable: D(80000),
    });
    expect(Number(r.taxSaved)).toBe(0);
  });
});
