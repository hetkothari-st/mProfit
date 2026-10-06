import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { serializeUserFacts } from '../../src/ai/userFacts.js';
import type { AdvisorFacts } from '../../src/services/advisor/types.js';

const d = (v: string) => new Decimal(v);
const EMPTY_BUCKETS = {
  EQUITY_DOMESTIC: [],
  EQUITY_INTERNATIONAL: [],
  DEBT: [],
  GOLD: [],
  REAL_ASSETS: [],
  CASH_EQUIVALENT: [],
  OTHER_ALT: [],
};

function facts(over: Partial<AdvisorFacts> = {}): AdvisorFacts {
  return {
    userId: 'u1',
    asOf: new Date('2026-09-11T06:00:00Z'),
    riskProfile: { assessmentId: 'r1', category: 'MODERATE', age: 38, taxSlabPct: 30, assessedAt: new Date('2026-01-10') },
    modelPortfolio: {
      id: 'm1',
      versionId: 'v1',
      version: 1,
      targets: [
        { bucket: 'EQUITY_DOMESTIC', targetPct: 60 },
        { bucket: 'DEBT', targetPct: 30 },
        { bucket: 'GOLD', targetPct: 10 },
      ],
    },
    totalPortfolioValue: d('9800000'),
    currentAllocation: [
      { bucket: 'EQUITY_DOMESTIC', currentPct: 78, currentValue: d('7644000') },
      { bucket: 'DEBT', currentPct: 14, currentValue: d('1372000') },
      { bucket: 'GOLD', currentPct: 8, currentValue: d('784000') },
    ],
    holdings: [],
    goals: [
      {
        goalId: 'g1',
        name: 'Retirement',
        category: 'RETIREMENT',
        priority: 'HIGH',
        targetAmount: d('50000000'),
        currentValue: d('6000000'),
        remaining: d('44000000'),
        yearsRemaining: 22,
        expectedReturnPct: 11,
        requiredCagr: 9.5,
        isOnTrack: true,
        currentMonthlyContribution: d('60000'),
      },
    ],
    harvestCandidates: [],
    approvedProducts: { ...EMPTY_BUCKETS },
    fallbackRankings: { ...EMPTY_BUCKETS },
    liquidity: { liquidAssets: d('420000'), monthlyExpenses: d('140000'), emergencyFundTarget: d('840000'), surplusOverTarget: d('-420000') },
    capitalGainsRates: { stcgEquityPct: 20, ltcgEquityPct: 12.5, ltcgOtherNonIndexedPct: 12.5, slabPct: 30 },
    defaultPortfolioId: 'p1',
    ...over,
  };
}

const base = {
  profile: { firstName: 'Rohan', totalNetWorth: 14200000, totalLiabilities: 1600000, portfolioXirr: 12.4, age: 38 },
  insurance: { lifeCover: '15000000', healthCover: '1000000', policies: 3, nomineeGaps: 1 },
  healthScore: { overallScore: 71, grade: 'B' },
  openRecommendations: 2,
  viewingAsFamily: false,
  today: '2026-09-11',
  financialYear: '2026-27',
};

describe('serializeUserFacts', () => {
  it('states the client’s numbers plainly, in Indian units', () => {
    const text = serializeUserFacts({ ...base, advisor: facts() });
    expect(text).toContain('Net worth: ₹1.42 Cr');
    expect(text).toContain('Risk profile: MODERATE');
    expect(text).toMatch(/Equity \(India\): 78% now vs 60% target/);
    expect(text).toMatch(/Emergency fund: ₹4.2 L in liquid assets .* about 3 months of expenses/);
    expect(text).toMatch(/Retirement: .*22 years.*on track/);
    expect(text).toContain('Today: 2026-09-11; financial year 2026-27');
  });

  it('marks unknowns as not on file, never as zero', () => {
    const text = serializeUserFacts({
      ...base,
      profile: { firstName: 'Rohan', totalNetWorth: null, totalLiabilities: null, portfolioXirr: null, age: null },
      advisor: facts({
        riskProfile: { assessmentId: null, category: null, age: null, taxSlabPct: null, assessedAt: null },
        liquidity: { liquidAssets: d('0'), monthlyExpenses: null, emergencyFundTarget: null, surplusOverTarget: null },
      }),
      insurance: null,
      healthScore: null,
      openRecommendations: null,
    });
    expect(text).toContain('Net worth: not on file');
    expect(text).toContain('Risk profile: not on file');
    expect(text).toContain('Monthly expenses: not on file');
    expect(text).toContain('Insurance: not on file');
    expect(text).not.toMatch(/Net worth: ₹0/);
  });

  it('says when it is a household view that may be partial', () => {
    const text = serializeUserFacts({ ...base, advisor: facts(), viewingAsFamily: true });
    expect(text).toMatch(/Household view/);
  });

  it('names the largest holdings, so the adviser never asks what is in a bucket', () => {
    const h = (assetName: string, value: string, bucket: string) =>
      ({ assetName, bucket, currentValue: d(value), assetClass: 'X' }) as unknown as AdvisorFacts['holdings'][number];
    const text = serializeUserFacts({
      ...base,
      advisor: facts({ holdings: [h('Small fund', '98000', 'DEBT'), h('Bitcoin', '6370000', 'OTHER_ALT')] }),
    });
    expect(text).toMatch(/Largest holdings:[\s\S]*Bitcoin: 65% of investments \(Other\)/);
    expect(text.indexOf('Bitcoin')).toBeLessThan(text.indexOf('Small fund'));
  });

  it('lays out the whole balance sheet: banks, asset classes, property, vehicles, loans, cards, alerts', () => {
    const text = serializeUserFacts({
      ...base,
      advisor: facts(),
      balanceSheet: {
        bankBalance: '340000',
        bankAccounts: 2,
        byAssetClass: [
          { label: 'Crypto', value: '6370000', pct: 65.2 },
          { label: 'Fixed Deposit', value: '500000', pct: 5.1 },
        ],
        ownedPropertyValue: '8500000',
        rentalValue: null,
        monthlyRent: null,
        rentOverdue: 0,
        vehicleValue: '900000',
        pendingChallans: 1,
        loanOutstanding: '2500000',
        monthlyEmi: '45000',
        loans: 2,
        overdueEmis: [{ lender: 'HDFC Bank', daysOverdue: 72 }],
        cardOutstanding: '34000',
        cards: 1,
        alerts: ['HDFC Bank EMI overdue', 'LIC TERM premium due'],
      },
    });
    expect(text).toContain('Bank balances: ₹3.4 L across 2 accounts');
    expect(text).toMatch(/By asset class:[\s\S]*- Crypto: ₹63.7 L \(65%\)[\s\S]*- Fixed Deposit: ₹5 L \(5%\)/);
    expect(text).toContain('Owned property: ₹85 L');
    expect(text).toContain('Vehicles: ₹9 L; 1 pending challan');
    expect(text).toContain('Loans: ₹25 L outstanding across 2; EMIs ₹45,000 a month; overdue: HDFC Bank 72 days');
    expect(text).toContain('Credit cards: ₹34 K outstanding across 1');
    expect(text).toContain('Alerts: HDFC Bank EMI overdue; LIC TERM premium due');
    expect(text).not.toMatch(/Rental property/);
  });

  it('says so when the balance sheet could not be read, rather than showing zeros', () => {
    const text = serializeUserFacts({ ...base, advisor: facts(), balanceSheet: null });
    expect(text).toContain('Balance sheet: not available right now');
    expect(text).not.toMatch(/Loans: ₹0/);
  });

  it('copes with no advisor facts at all', () => {
    const text = serializeUserFacts({ ...base, advisor: null });
    expect(text).toContain('Allocation vs target: not on file');
  });
});
