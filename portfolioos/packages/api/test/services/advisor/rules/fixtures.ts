/**
 * Hand-built AdvisorFacts fixtures for the rule suite.
 *
 * No DB, no mocks, no clock: every rule is a pure function of an AdvisorFacts
 * value, so a fixture is just an object literal and a test that needs "a
 * portfolio 20pp overweight equity with a stale price on the largest position"
 * can say exactly that in four lines.
 *
 * Not a *.test.ts file, so vitest treats it as a plain module.
 */

import { Decimal } from 'decimal.js';
import {
  ADVISOR_ASSET_BUCKETS,
  type AdvisorAllocationFact,
  type AdvisorAssetBucketValue,
  type AdvisorFacts,
  type AdvisorGoalFact,
  type AdvisorHarvestCandidateFact,
  type AdvisorHoldingFact,
  type AdvisorProductFact,
  type AdvisorTargetFact,
} from '../../../../src/services/advisor/types.js';

export const d = (v: string | number): Decimal => new Decimal(v);

/** Mid-December: inside the Oct 1 – Mar 31 harvest window. */
export const IN_HARVEST_WINDOW = new Date('2025-12-15T00:00:00.000Z');
/** Mid-June: outside it. */
export const OUT_OF_HARVEST_WINDOW = new Date('2025-06-15T00:00:00.000Z');

export function emptyProductMap(): Record<AdvisorAssetBucketValue, AdvisorProductFact[]> {
  const map = {} as Record<AdvisorAssetBucketValue, AdvisorProductFact[]>;
  for (const bucket of ADVISOR_ASSET_BUCKETS) map[bucket] = [];
  return map;
}

export function makeProduct(over: Partial<AdvisorProductFact> = {}): AdvisorProductFact {
  return {
    approvedProductId: 'ap-1',
    fundId: 'fund-1',
    stockId: null,
    label: 'ICICI Prudential Corporate Bond Fund',
    score: null,
    ...over,
  };
}

/** An approved-product map with one entry in each named bucket. */
export function approvedIn(
  entries: Partial<Record<AdvisorAssetBucketValue, AdvisorProductFact>>,
): Record<AdvisorAssetBucketValue, AdvisorProductFact[]> {
  const map = emptyProductMap();
  for (const [bucket, product] of Object.entries(entries)) {
    if (product) map[bucket as AdvisorAssetBucketValue] = [product];
  }
  return map;
}

export function targets(
  weights: Partial<Record<AdvisorAssetBucketValue, number>>,
): AdvisorTargetFact[] {
  return Object.entries(weights).map(([bucket, targetPct]) => ({
    bucket: bucket as AdvisorAssetBucketValue,
    targetPct: targetPct as number,
  }));
}

/** `allocation({ EQUITY_DOMESTIC: [60, 600_000] })` — pct and rupee value. */
export function allocation(
  rows: Partial<Record<AdvisorAssetBucketValue, [number, number | string]>>,
): AdvisorAllocationFact[] {
  return Object.entries(rows).map(([bucket, pair]) => {
    const [currentPct, currentValue] = pair as [number, number | string];
    return {
      bucket: bucket as AdvisorAssetBucketValue,
      currentPct,
      currentValue: d(currentValue),
    };
  });
}

export function makeHolding(over: Partial<AdvisorHoldingFact> = {}): AdvisorHoldingFact {
  const currentValue = over.currentValue ?? d(400_000);
  return {
    holdingKey: 'hk-1',
    portfolioId: 'pf-1',
    assetName: 'HDFC Top 100 Fund',
    assetClass: 'MUTUAL_FUND',
    bucket: 'EQUITY_DOMESTIC',
    fundId: 'fund-hdfc-top-100',
    stockId: null,
    isin: 'INF179K01BE2',
    quantity: d(500),
    currentPrice: d(800),
    currentValue,
    totalCost: d(350_000),
    unrealisedPnL: d(50_000),
    priceStale: false,
    ...over,
  };
}

export function makeGoal(over: Partial<AdvisorGoalFact> = {}): AdvisorGoalFact {
  return {
    goalId: 'goal-1',
    name: 'Kabir college fund',
    category: 'EDUCATION',
    priority: 'HIGH',
    targetAmount: d(2_000_000),
    currentValue: d(500_000),
    remaining: d(1_500_000),
    yearsRemaining: 8,
    expectedReturnPct: 12,
    requiredCagr: 0.18,
    isOnTrack: false,
    currentMonthlyContribution: d(2_000),
    ...over,
  };
}

export function makeHarvestCandidate(
  over: Partial<AdvisorHarvestCandidateFact> = {},
): AdvisorHarvestCandidateFact {
  return {
    portfolioId: 'pf-1',
    assetName: 'Vodafone Idea Ltd',
    assetClass: 'EQUITY',
    isin: 'INE669E01016',
    quantity: d(400),
    currentPrice: d(400),
    currentValue: d(160_000),
    unrealisedPnL: d(-40_000),
    longTermEligible: false,
    classification: 'STCG_LOSS',
    priceStale: false,
    ...over,
  };
}

/**
 * The neutral base: a user who exists and owns nothing. Every fixture below is
 * this plus the one thing the test is actually about.
 */
export function makeFacts(over: Partial<AdvisorFacts> = {}): AdvisorFacts {
  return {
    userId: 'user-1',
    asOf: IN_HARVEST_WINDOW,
    riskProfile: {
      assessmentId: 'assessment-1',
      category: 'BALANCED',
      age: 38,
      taxSlabPct: 30,
      assessedAt: new Date('2025-10-01T00:00:00.000Z'),
    },
    modelPortfolio: {
      id: 'mp-1',
      versionId: 'mpv-1',
      version: 1,
      targets: [],
    },
    totalPortfolioValue: d(0),
    currentAllocation: [],
    holdings: [],
    goals: [],
    harvestCandidates: [],
    approvedProducts: emptyProductMap(),
    fallbackRankings: emptyProductMap(),
    liquidity: {
      liquidAssets: d(0),
      monthlyExpenses: null,
      emergencyFundTarget: null,
      surplusOverTarget: null,
    },
    // Statutory rates as at the Finance Act 2024 regime, matching
    // tax.service.ratesForDate. slabPct is null unless a fixture sets one:
    // an unknown income slab must stay unknown.
    capitalGainsRates: {
      stcgEquityPct: 20,
      ltcgEquityPct: 12.5,
      ltcgOtherNonIndexedPct: 12.5,
      slabPct: 30,
    },
    defaultPortfolioId: 'pf-1',
    ...over,
  };
}

/** A completely empty portfolio — the "nothing to say" case every rule must
 *  survive without throwing. */
export function emptyPortfolioFacts(): AdvisorFacts {
  return makeFacts();
}

/**
 * ₹10L, 20pp overweight domestic equity and 17pp short on debt, with an
 * approved debt fund to buy. The canonical paired-rebalance fixture.
 */
export function driftedPortfolioFacts(over: Partial<AdvisorFacts> = {}): AdvisorFacts {
  return makeFacts({
    totalPortfolioValue: d(1_000_000),
    modelPortfolio: {
      id: 'mp-1',
      versionId: 'mpv-1',
      version: 1,
      targets: targets({
        EQUITY_DOMESTIC: 40,
        EQUITY_INTERNATIONAL: 5,
        DEBT: 37,
        GOLD: 8,
        CASH_EQUIVALENT: 10,
      }),
    },
    currentAllocation: allocation({
      EQUITY_DOMESTIC: [60, 600_000],
      EQUITY_INTERNATIONAL: [2, 20_000],
      DEBT: [20, 200_000],
      GOLD: [8, 80_000],
      CASH_EQUIVALENT: [10, 100_000],
    }),
    holdings: [
      makeHolding({ holdingKey: 'hk-hdfc', currentValue: d(400_000), currentPrice: d(800) }),
      makeHolding({
        holdingKey: 'hk-reliance',
        assetName: 'Reliance Industries',
        assetClass: 'EQUITY',
        fundId: null,
        stockId: 'stock-ril',
        quantity: d(80),
        currentPrice: d(2_500),
        currentValue: d(200_000),
      }),
      makeHolding({
        holdingKey: 'hk-gilt',
        assetName: 'SBI Magnum Gilt Fund',
        bucket: 'DEBT',
        fundId: 'fund-sbi-gilt',
        quantity: d(4_000),
        currentPrice: d(50),
        currentValue: d(200_000),
      }),
    ],
    approvedProducts: approvedIn({
      DEBT: makeProduct({ label: 'ICICI Prudential Corporate Bond Fund', fundId: 'fund-icici-cb' }),
      EQUITY_INTERNATIONAL: makeProduct({
        approvedProductId: 'ap-2',
        label: 'Motilal Oswal S&P 500 Index Fund',
        fundId: 'fund-mo-sp500',
      }),
    }),
    ...over,
  });
}
