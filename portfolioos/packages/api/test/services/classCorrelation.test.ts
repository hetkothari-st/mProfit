import { describe, it, expect } from 'vitest';
import {
  classMonthlyReturns,
  classCorrelationMatrix,
  pearson,
  MIN_CORRELATION_OBSERVATIONS,
  type MonthlyPositions,
} from '../../src/services/analytics.risk.js';

/**
 * Return correlation between asset classes, replacing the "Asset class weight
 * grid" — which drew min(weight_i, weight_j) in a correlation-matrix layout
 * and so looked like something it wasn't.
 */

type Pos = MonthlyPositions['positions'][number];

function month(i: number, positions: Pos[], corporateActionKeys: string[] = []): MonthlyPositions {
  const d = new Date(Date.UTC(2025, i, 28)).toISOString().slice(0, 10);
  return { date: d, positions, corporateActionKeys };
}

/** Build months from price paths: each key holds `qty` throughout. */
function series(paths: Record<string, { cls: string; qty: number; prices: Array<number | null> }>) {
  const n = Math.max(...Object.values(paths).map((p) => p.prices.length));
  return Array.from({ length: n }, (_, i) =>
    month(
      i,
      Object.entries(paths).map(([key, p]) => ({
        key,
        assetClass: p.cls,
        quantity: p.qty,
        price: p.prices[i] ?? null,
      })),
    ),
  );
}

const UP_DOWN = [100, 110, 99, 108.9, 104, 114.4, 103, 113.3, 120];

describe('classMonthlyReturns', () => {
  it('computes a price return per class', () => {
    const r = classMonthlyReturns(series({ a: { cls: 'EQUITY', qty: 10, prices: [100, 110, 99] } }));
    const eq = r.get('EQUITY')!;
    expect(eq[0]).toBeCloseTo(0.1, 10);
    expect(eq[1]).toBeCloseTo(-0.1, 10);
  });

  it('does not count new money as a return', () => {
    // Price is flat; the investor triples the holding in month 1. A
    // value-based return would read this as +200%.
    const months = [
      month(0, [{ key: 'a', assetClass: 'EQUITY', quantity: 10, price: 100 }]),
      month(1, [{ key: 'a', assetClass: 'EQUITY', quantity: 30, price: 100 }]),
    ];
    expect(classMonthlyReturns(months).get('EQUITY')![0]).toBe(0);
  });

  it('skips a holding in a month where a split changed its share count', () => {
    // 1:2 split: qty doubles and price halves. Without the exclusion this is a -50% "return".
    const months = [
      month(0, [{ key: 'a', assetClass: 'EQUITY', quantity: 10, price: 100 }]),
      month(1, [{ key: 'a', assetClass: 'EQUITY', quantity: 20, price: 50 }], ['a']),
    ];
    expect(classMonthlyReturns(months).get('EQUITY')![0]).toBeNull();
  });

  it('returns null for a class with no price history (FDs, real estate)', () => {
    const r = classMonthlyReturns(series({ fd: { cls: 'FIXED_DEPOSIT', qty: 1, prices: [null, null, null] } }));
    expect(r.get('FIXED_DEPOSIT')).toEqual([null, null]);
  });

  it('weights holdings within a class by their starting value', () => {
    // a: 10 × 100 = 1000, +10%; b: 1 × 1000 = 1000, 0% → class +5%.
    const r = classMonthlyReturns(
      series({
        a: { cls: 'EQUITY', qty: 10, prices: [100, 110] },
        b: { cls: 'EQUITY', qty: 1, prices: [1000, 1000] },
      }),
    );
    expect(r.get('EQUITY')![0]).toBeCloseTo(0.05, 10);
  });
});

describe('pearson', () => {
  it('is 1 for series that move together and -1 for opposite moves', () => {
    const a = [0.1, -0.1, 0.1, -0.05, 0.1, -0.1, 0.1];
    expect(pearson(a, a).r).toBeCloseTo(1, 10);
    expect(pearson(a, a.map((x) => -x)).r).toBeCloseTo(-1, 10);
  });

  it(`needs at least ${MIN_CORRELATION_OBSERVATIONS} shared months`, () => {
    const a = [0.1, -0.1, 0.1, -0.05, 0.1];
    const res = pearson(a, a);
    expect(res.r).toBeNull();
    expect(res.observations).toBe(5);
  });

  it('only pairs months where both series have a value', () => {
    const a = [0.1, null, -0.1, 0.1, -0.05, 0.1, -0.1, 0.1];
    const b = [0.1, 0.2, -0.1, 0.1, -0.05, 0.1, -0.1, 0.1];
    const res = pearson(a, b);
    expect(res.observations).toBe(7);
    expect(res.r).toBeCloseTo(1, 10);
  });

  it('is null for a flat series rather than a meaningless ±1', () => {
    const flat = [0, 0, 0, 0, 0, 0, 0];
    const moving = [0.1, -0.1, 0.1, -0.05, 0.1, -0.1, 0.1];
    expect(pearson(flat, moving).r).toBeNull();
  });
});

describe('classCorrelationMatrix', () => {
  it('builds a symmetric matrix with 1 on the diagonal for classes that move', () => {
    const returns = classMonthlyReturns(
      series({
        eq: { cls: 'EQUITY', qty: 10, prices: UP_DOWN },
        mf: { cls: 'MUTUAL_FUND', qty: 10, prices: UP_DOWN.map((p) => p * 2) },
        gold: { cls: 'GOLD', qty: 10, prices: UP_DOWN.map((p, i) => (i % 2 ? p * 0.9 : p)) },
      }),
    );
    const m = classCorrelationMatrix(returns);
    const i = (c: string) => m.classes.indexOf(c);
    expect(m.matrix[i('EQUITY')]![i('EQUITY')]).toBeCloseTo(1, 10);
    // Same percentage moves → perfectly correlated regardless of price level.
    expect(m.matrix[i('EQUITY')]![i('MUTUAL_FUND')]).toBeCloseTo(1, 10);
    for (let a = 0; a < m.classes.length; a++) {
      for (let b = 0; b < m.classes.length; b++) {
        expect(m.matrix[a]![b]).toBe(m.matrix[b]![a]);
      }
    }
  });

  it('leaves unpriced classes as null everywhere, including the diagonal', () => {
    const returns = classMonthlyReturns(
      series({
        eq: { cls: 'EQUITY', qty: 10, prices: UP_DOWN },
        fd: { cls: 'FIXED_DEPOSIT', qty: 1, prices: UP_DOWN.map(() => null) },
      }),
    );
    const m = classCorrelationMatrix(returns);
    const fd = m.classes.indexOf('FIXED_DEPOSIT');
    expect(m.matrix[fd]!.every((v) => v === null)).toBe(true);
  });
});
