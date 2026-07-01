import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  emergencyFundScore, investmentRateScore, debtBurdenScore,
  diversificationScore, insuranceScore, goalProgressScore, weightedOverall,
} from './healthScoreMath.js';

const D = (n: number | string) => new Decimal(n);

describe('emergencyFundScore', () => {
  it('is 100 when liquid assets cover 6+ months of expenses', () => {
    expect(emergencyFundScore(D(600000), D(100000)).score).toBe(100);
    expect(emergencyFundScore(D(600000), D(100000)).monthsCovered).toBeCloseTo(6, 6);
  });
  it('is 0 when there are no liquid assets', () => {
    expect(emergencyFundScore(D(0), D(100000)).score).toBe(0);
  });
  it('scales linearly between 0 and 6 months', () => {
    expect(emergencyFundScore(D(300000), D(100000)).score).toBeCloseTo(50, 6);
  });
  it('is 100 (not undefined/NaN) when monthly expenses are 0', () => {
    expect(emergencyFundScore(D(100000), D(0)).score).toBe(100);
  });
});

describe('investmentRateScore', () => {
  it('is 100 at or above 20% of income', () => {
    expect(investmentRateScore(D(20000), D(100000)).score).toBe(100);
    expect(investmentRateScore(D(30000), D(100000)).score).toBe(100);
  });
  it('scales linearly below 20%', () => {
    expect(investmentRateScore(D(10000), D(100000)).score).toBeCloseTo(50, 6);
  });
  it('is 0 when income is 0 (cannot compute a rate)', () => {
    expect(investmentRateScore(D(5000), D(0)).score).toBe(0);
  });
});

describe('debtBurdenScore', () => {
  it('is 100 at or below 20% of income', () => {
    expect(debtBurdenScore(D(20000), D(100000)).score).toBe(100);
    expect(debtBurdenScore(D(10000), D(100000)).score).toBe(100);
  });
  it('is 0 at or above 60% of income', () => {
    expect(debtBurdenScore(D(60000), D(100000)).score).toBe(0);
    expect(debtBurdenScore(D(80000), D(100000)).score).toBe(0);
  });
  it('scales linearly between 20% and 60%', () => {
    expect(debtBurdenScore(D(40000), D(100000)).score).toBeCloseTo(50, 6);
  });
  it('is 100 when income is 0 and there is no debt', () => {
    expect(debtBurdenScore(D(0), D(0)).score).toBe(100);
  });
});

describe('diversificationScore', () => {
  it('is 100 for a well-spread portfolio with no concentration and matching equity guideline', () => {
    const r = diversificationScore({
      classPercents: [{ assetClass: 'EQUITY', percent: 40 }, { assetClass: 'MUTUAL_FUND', percent: 30 }, { assetClass: 'FIXED_DEPOSIT', percent: 30 }],
      largestSingleHoldingPct: 10,
      equityPct: 40,
      age: 60, // (100-60)=40 target equity, exact match
    });
    expect(r.score).toBe(100);
  });
  it('penalises a single asset class over 60%', () => {
    const r = diversificationScore({
      classPercents: [{ assetClass: 'EQUITY', percent: 90 }, { assetClass: 'FIXED_DEPOSIT', percent: 10 }],
      largestSingleHoldingPct: 20,
      equityPct: 90,
      age: null,
    });
    expect(r.score).toBeLessThan(100);
  });
  it('penalises a single holding over 50%', () => {
    const r = diversificationScore({
      classPercents: [{ assetClass: 'EQUITY', percent: 50 }, { assetClass: 'FIXED_DEPOSIT', percent: 50 }],
      largestSingleHoldingPct: 55,
      equityPct: 50,
      age: null,
    });
    expect(r.score).toBeLessThan(100);
  });
  it('skips the age-guideline sub-rule when age is unknown, without crashing', () => {
    // 60/40 split sits exactly at the ≤60% concentration threshold — no
    // penalty triggers, isolating this test to "does it crash" rather than
    // also asserting a concentration-penalty outcome.
    const r = diversificationScore({
      classPercents: [{ assetClass: 'EQUITY', percent: 60 }, { assetClass: 'FIXED_DEPOSIT', percent: 40 }],
      largestSingleHoldingPct: 15,
      equityPct: 60,
      age: null,
    });
    expect(r.score).toBe(100);
  });
});

describe('insuranceScore', () => {
  it('is 50 when there are no life policies at all (data unavailable)', () => {
    expect(insuranceScore(D(0), D(1000000), false).score).toBe(50);
  });
  it('is 100 when sum assured is at least 10x annual income', () => {
    expect(insuranceScore(D(10000000), D(1000000), true).score).toBe(100);
  });
  it('scales linearly below 10x income (1x income = 10% of target = score 10)', () => {
    expect(insuranceScore(D(1000000), D(1000000), true).score).toBeCloseTo(10, 6);
  });
  it('is 0 when policies exist but sum assured is 0', () => {
    expect(insuranceScore(D(0), D(1000000), true).score).toBe(0);
  });
});

describe('goalProgressScore', () => {
  it('is 50 with a nudge when there are no goals', () => {
    expect(goalProgressScore([]).score).toBe(50);
  });
  it('averages progress percentages across goals, capped at 100', () => {
    expect(goalProgressScore([50, 100, 150]).score).toBeCloseTo((50 + 100 + 100) / 3, 6);
  });
});

describe('weightedOverall', () => {
  it('weights emergency/investment/debt/diversification at 20% each, insurance/goal at 10% each', () => {
    const r = weightedOverall({
      emergencyFund: 100, investmentRate: 100, debtBurden: 100,
      diversification: 100, insurance: 100, goalProgress: 100,
    });
    expect(r.overall).toBe(100);
    expect(r.grade).toBe('A');
  });
  it('assigns grade thresholds A85 B70 C55 D40 F<40', () => {
    expect(weightedOverall({ emergencyFund: 85, investmentRate: 85, debtBurden: 85, diversification: 85, insurance: 85, goalProgress: 85 }).grade).toBe('A');
    expect(weightedOverall({ emergencyFund: 70, investmentRate: 70, debtBurden: 70, diversification: 70, insurance: 70, goalProgress: 70 }).grade).toBe('B');
    expect(weightedOverall({ emergencyFund: 55, investmentRate: 55, debtBurden: 55, diversification: 55, insurance: 55, goalProgress: 55 }).grade).toBe('C');
    expect(weightedOverall({ emergencyFund: 40, investmentRate: 40, debtBurden: 40, diversification: 40, insurance: 40, goalProgress: 40 }).grade).toBe('D');
    expect(weightedOverall({ emergencyFund: 0, investmentRate: 0, debtBurden: 0, diversification: 0, insurance: 0, goalProgress: 0 }).grade).toBe('F');
  });
});
