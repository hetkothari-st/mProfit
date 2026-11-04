import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  declaredLeanIncome,
  floorToStep,
  istMonth,
  lastTwelveMonths,
  missedSipMonths,
  monthlySip,
  percentile,
  safeAmount,
  shiftMonth,
  stabilityLabel,
  stabilityScore,
  topUp,
} from './safeToInvestMath.js';

const D = (v: string | number) => new Decimal(v);

describe('percentile', () => {
  it('interpolates like PERCENTILE.INC', () => {
    // 12 freelance months, sorted: 90k … 2.1L
    const months = [140, 118, 160, 135, 112, 175, 132, 150, 110, 190, 145, 138].map((k) => D(k * 1000));
    // rank = 0.2 × 11 = 2.2 → 118k + 0.2 × (132k − 118k) = 120,800
    expect(percentile(months, 20)!.toString()).toBe('120800');
    // median of 12 = average of 6th and 7th: (138k + 140k) / 2
    expect(percentile(months, 50)!.toString()).toBe('139000');
  });
  it('handles one value and none', () => {
    expect(percentile([D(5)], 20)!.toString()).toBe('5');
    expect(percentile([], 20)).toBeNull();
  });
});

describe('stability', () => {
  it('is the lean month as a share of a typical month', () => {
    expect(stabilityScore(D(120800), D(139000))).toBe(87);
    expect(stabilityScore(D(58000), D(100000))).toBe(58);
    expect(stabilityScore(D(1), D(0))).toBeNull();
  });
  it('labels the score', () => {
    expect(stabilityLabel(90)).toBe('STABLE');
    expect(stabilityLabel(70)).toBe('SOMEWHAT_VARIABLE');
    expect(stabilityLabel(58)).toBe('VARIABLE');
    expect(stabilityLabel(null)).toBeNull();
  });
});

describe('safe amount and top-up', () => {
  it('matches the worked example: 1,18,000 − 71,000 − 25,000 = 22,000', () => {
    expect(safeAmount(D(118000), D(71000), D(25000)).toString()).toBe('22000');
  });
  it('rounds down to ₹500 and never goes negative', () => {
    expect(safeAmount(D(118000), D(71000), D(25499)).toString()).toBe('21500');
    expect(safeAmount(D(50000), D(71000), D(25000)).toString()).toBe('0');
  });
  it('tops up a share of the surplus, rounded down to ₹100', () => {
    const r = topUp(D(142350), D(118000), D('0.5'));
    expect(r.surplus.toString()).toBe('24350');
    expect(r.topUp.toString()).toBe('12100');
    expect(topUp(D(100000), D(118000), D('0.5')).topUp.toString()).toBe('0');
  });
  it('floors to a step', () => {
    expect(floorToStep(D('999.99'), 500).toString()).toBe('500');
  });
});

describe('declared income fallback', () => {
  it('trims salary 10%, rent 15%, others 20%, and skips capital gains', () => {
    const lean = declaredLeanIncome([
      { type: 'SALARY', monthly: D(100000) },
      { type: 'RENTAL', monthly: D(20000) },
      { type: 'FREELANCE', monthly: D(50000) },
      { type: 'CAPITAL_GAINS', monthly: D(80000) },
    ]);
    expect(lean.toString()).toBe(String(90000 + 17000 + 40000));
  });
});

describe('months', () => {
  it('uses the IST calendar month', () => {
    // 31 Oct 2026 20:00 UTC is already 1 Nov in India.
    expect(istMonth(new Date('2026-10-31T20:00:00Z'))).toBe('2026-11');
  });
  it('lists the twelve complete months before now, oldest first', () => {
    const m = lastTwelveMonths(new Date('2026-11-04T06:00:00Z'));
    expect(m).toHaveLength(12);
    expect(m[0]).toBe('2025-11');
    expect(m[11]).toBe('2026-10');
  });
  it('shifts across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
  });
});

describe('SIPs', () => {
  it('normalises to monthly', () => {
    expect(monthlySip(D(30000), 'QUARTERLY').toString()).toBe('10000');
    expect(monthlySip(D(120000), 'ANNUAL').toString()).toBe('10000');
    expect(monthlySip(D(5000), 'MONTHLY').toString()).toBe('5000');
  });
  it('counts missed months only after the first SIP', () => {
    const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
    expect(missedSipMonths(months, new Set(['2026-03', '2026-05']))).toBe(2); // Apr and Jun
    expect(missedSipMonths(months, new Set())).toBe(0);
  });
});
