import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { cashGrowth, navGrowth, navVsCash, directVsRegular, sipDipGain, loanInterestSaved, missesPromise } from './measureMath.js';

const d = (v: number | string) => new Decimal(v);

describe('measure maths', () => {
  it('the spec example: ₹1,80,000 at 3% for a year is ₹5,400; a fund going 100 → 106.5 is ₹11,700; difference ₹6,300', () => {
    expect(cashGrowth(d(180_000), 3, 365).toNumber()).toBe(5_400);
    expect(navGrowth(d(180_000), d(100), d(106.5)).toNumber()).toBe(11_700);
    expect(navVsCash(d(180_000), d(100), d(106.5), 3, 365).toNumber()).toBe(6_300);
  });

  it('direct vs regular: the gap between the two NAV paths on the same money', () => {
    // Regular 50 → 55 (10%), direct 60 → 66.72 (11.2%): ₹5,00,000 gains ₹6,000 more on direct.
    expect(directVsRegular(d(500_000), { start: d(50), end: d(55) }, { start: d(60), end: d(66.72) }).toNumber()).toBeCloseTo(6_000, 6);
  });

  it('SIP through a dip: what the missed instalments gained by today', () => {
    // ₹10,000 bought at 90 and at 95, worth 100 now: 1,111.11 + 526.32.
    expect(sipDipGain([{ amount: d(10_000), nav: d(90) }, { amount: d(10_000), nav: d(95) }], d(100)).toFixed(2)).toBe('1637.43');
  });

  it('loan: interest saved on the outstanding at the rate gap, pro rata', () => {
    expect(loanInterestSaved(d(4_000_000), 9.4, 8.4, 365).toNumber()).toBe(40_000);
  });

  it('a result is a miss when it delivered under half of the promised gain', () => {
    expect(missesPromise(d(6_300), d(3_000))).toBe(true);
    expect(missesPromise(d(6_300), d(3_200))).toBe(false);
    expect(missesPromise(null, d(0))).toBe(false);
  });
});
