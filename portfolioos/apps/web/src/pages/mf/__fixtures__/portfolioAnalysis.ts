/**
 * Fixture states for the portfolio analysis page (Task 4.3).
 *
 * One per honesty state the page has to survive, because the done-criterion is
 * "fixture states render" and the states that matter are the ones where a
 * number is ABSENT. A fixture where everything resolves exercises none of the
 * branches this page exists to get right.
 *
 * Everything is typed as the real DTO from `@portfolioos/shared` — that is as
 * much the point of the fixtures as of the page. A field renamed on the
 * contract breaks this file at compile time, which is precisely what did NOT
 * happen on `/advisor`, where the client had its own shapes and `tsc` had
 * nothing to compare them against (CONTEXT.md §11). The `as Ratio` / `as Pct` /
 * `as Money` casts are the only concession: the brands exist to stop arithmetic
 * on wire strings, and a literal is the one place a cast is legitimate.
 */

import type {
  MfCostSummary,
  MfHeldFundDto,
  MfLookThrough,
  MfLotDto,
  MfOverlapPair,
  MfPortfolioAnalysisDto,
  MfPortfolioTotals,
  MfTaxSummary,
  Money,
  Pct,
  Ratio,
} from '@portfolioos/shared';
import { makeMeta, makeScore } from './fundAnalytics';

const r = (s: string) => s as Ratio;
const p = (s: string) => s as Pct;
const m = (s: string) => s as Money;

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

export function makeLot(overrides: Partial<MfLotDto> = {}): MfLotDto {
  return {
    schemeCode: '120503',
    schemeName: 'Testwell Flexi Cap Fund - Direct Growth',
    units: '412.556000',
    cost: m('50000.0000'),
    currentValue: m('68400.0000'),
    gain: m('18400.0000'),
    purchaseDate: '2024-02-14',
    holdingDays: 936,
    gainType: 'LTCG',
    daysToLtcg: null,
    grandfatheredCost: null,
    exitLoadPct: p('0.000000'),
    exitLoadInr: m('0.0000'),
    taxIfSoldTodayInr: m('1840.0000'),
    harvestableLossInr: null,
    ...overrides,
  };
}

/**
 * The lot that carries every "we do not know" at once: an unknown exit load
 * (null ≠ zero), and a short-term gain on a non-equity fund whose tax depends
 * on an income slab we do not hold.
 */
export function makeUnknownsLot(): MfLotDto {
  return makeLot({
    schemeCode: '119551',
    schemeName: 'Testwell Corporate Bond Fund - Regular Growth',
    units: '1500.000000',
    cost: m('30000.0000'),
    currentValue: m('31200.0000'),
    gain: m('1200.0000'),
    purchaseDate: '2026-05-02',
    holdingDays: 128,
    gainType: 'STCG',
    daysToLtcg: 41,
    exitLoadPct: null,
    exitLoadInr: null,
    taxIfSoldTodayInr: null,
  });
}

export function makeHeldFund(overrides: Partial<MfHeldFundDto> = {}): MfHeldFundDto {
  return {
    schemeCode: '120503',
    meta: makeMeta(),
    units: '412.556000',
    investedValue: m('50000.0000'),
    currentValue: m('68400.0000'),
    absoluteGain: m('18400.0000'),
    absoluteGainPct: p('36.800000'),
    userXirr: r('0.142300'),
    userXirrStatus: 'OK',
    fundCagrSamePeriod: r('0.163900'),
    timingGap: r('-0.021600'),
    holdingPeriodDays: 936,
    sipActive: true,
    weightInMfPortfolio: p('68.700000'),
    weightInNetWorth: p('12.400000'),
    score: makeScore(),
    lots: [makeLot()],
    ...overrides,
  };
}

/**
 * A second fund with no computable XIRR, no fund CAGR and no net-worth weight —
 * three different nulls that must each render as a stated reason rather than as
 * a zero return, a zero CAGR and a zero share.
 */
export function makeUnconvergedFund(): MfHeldFundDto {
  return makeHeldFund({
    schemeCode: '119551',
    meta: makeMeta({
      schemeCode: '119551',
      schemeName: 'Testwell Corporate Bond Fund - Regular Growth',
      sebiCategory: 'DEBT',
      sebiSubCategory: 'Corporate Bond Fund',
      planType: 'REGULAR',
      riskometer: 'Moderate',
    }),
    units: '1500.000000',
    investedValue: m('30000.0000'),
    currentValue: m('31200.0000'),
    absoluteGain: m('1200.0000'),
    absoluteGainPct: p('4.000000'),
    userXirr: null,
    userXirrStatus: 'INSUFFICIENT_DATA',
    userXirrStatusReason: 'the solver did not converge within its iteration cap',
    fundCagrSamePeriod: null,
    timingGap: null,
    holdingPeriodDays: 128,
    sipActive: false,
    weightInMfPortfolio: p('31.300000'),
    weightInNetWorth: null,
    score: makeScore({
      schemeCode: '119551',
      // The score carries its own denormalised copy of the risk-o-meter, and
      // the UI prefers it over the meta's — that is the disclosure which
      // travelled WITH the rating (`06 §4`). It must therefore agree with the
      // scheme's own band, not inherit a default from another fund's fixture.
      riskometer: 'Moderate',
      ratingStatus: 'INSUFFICIENT_HISTORY',
      composite: null,
      rating: null,
      historyMonths: 18,
      ratedFrom: '2027-11-04',
    }),
    lots: [makeUnknownsLot()],
  });
}

export function makeOverlapPair(overrides: Partial<MfOverlapPair> = {}): MfOverlapPair {
  return {
    schemeCodeA: '120503',
    schemeCodeB: '118989',
    schemeNameA: 'Testwell Flexi Cap Fund - Direct Growth',
    schemeNameB: 'Testwell Large Cap Fund - Direct Growth',
    // A `Pct`: 55.0 means 55%. Its neighbour `redundancyScore` is a `Ratio` and
    // 0.31 means 31%. The fixture carries both so a formatter swap on either
    // shows up as a wrong number in a test rather than in production.
    overlapPct: p('55.000000'),
    sameSubCategory: false,
    snapshotAsOfA: '2026-07-31',
    snapshotAsOfB: '2026-07-31',
    topShared: [
      {
        isin: 'INE002A01018',
        securityName: 'Reliance Industries',
        weightInA: p('7.200000'),
        weightInB: p('8.100000'),
      },
      {
        isin: 'INE467B01029',
        securityName: 'Tata Consultancy Services',
        weightInA: p('4.800000'),
        weightInB: p('5.900000'),
      },
    ],
    ...overrides,
  };
}

export function makeLookThrough(overrides: Partial<MfLookThrough> = {}): MfLookThrough {
  return {
    topStocks: [
      {
        isin: 'INE002A01018',
        securityName: 'Reliance Industries',
        effectiveWeightPct: p('5.940000'),
        effectiveWeightOfNetWorthPct: p('1.070000'),
        contributors: [
          {
            schemeCode: '120503',
            schemeName: 'Testwell Flexi Cap Fund - Direct Growth',
            weightPct: p('7.200000'),
          },
        ],
      },
      {
        isin: null,
        securityName: 'HDFC Bank',
        effectiveWeightPct: p('4.110000'),
        // The net-worth denominator is not visible: a share of it cannot be
        // stated, and a zero share would be a fabricated ratio.
        effectiveWeightOfNetWorthPct: null,
        contributors: [
          {
            schemeCode: '120503',
            schemeName: 'Testwell Flexi Cap Fund - Direct Growth',
            weightPct: p('5.000000'),
          },
        ],
      },
    ],
    sectors: {
      Financials: p('31.400000'),
      Technology: p('18.200000'),
      Energy: p('9.900000'),
    },
    sectorsBenchmark: {
      Financials: p('33.100000'),
      Technology: p('14.700000'),
    },
    marketCap: {
      large: p('62.400000'),
      mid: p('21.100000'),
      small: p('9.300000'),
      // Reported, not folded into another bucket.
      unclassified: p('7.200000'),
    },
    credit: null,
    assetClass: {
      Equity: p('78.400000'),
      Debt: p('18.100000'),
      Cash: p('3.500000'),
    },
    target: null,
    fundsWithoutHoldings: [],
    ...overrides,
  };
}

export function makeCost(overrides: Partial<MfCostSummary> = {}): MfCostSummary {
  return {
    weightedTerPct: p('0.740000'),
    annualCostInr: m('735.6000'),
    directPlanSavingsInr: m('4820.0000'),
    costCategoryPercentile: r('0.610000'),
    byFund: [
      {
        schemeCode: '120503',
        terPct: p('0.520000'),
        directSiblingSchemeCode: null,
        directSiblingTerPct: null,
        annualSavingsInr: null,
      },
      {
        schemeCode: '119551',
        terPct: p('1.220000'),
        directSiblingSchemeCode: '119552',
        directSiblingTerPct: p('0.360000'),
        annualSavingsInr: m('4820.0000'),
      },
    ],
    ...overrides,
  };
}

export function makeTax(overrides: Partial<MfTaxSummary> = {}): MfTaxSummary {
  return {
    unrealisedStcg: m('1200.0000'),
    unrealisedLtcg: m('18400.0000'),
    ltcgExemptionHeadroomInr: m('106000.0000'),
    financialYear: '2026-27',
    harvestCandidates: [],
    lots: [makeLot(), makeUnknownsLot()],
    ...overrides,
  };
}

export function makeTotals(overrides: Partial<MfPortfolioTotals> = {}): MfPortfolioTotals {
  return {
    investedValue: m('80000.0000'),
    currentValue: m('99600.0000'),
    absoluteGain: m('19600.0000'),
    portfolioXirr: r('0.131000'),
    portfolioXirrStatus: 'OK',
    weightedTerPct: p('0.740000'),
    annualCostInr: m('735.6000'),
    directPlanSavingsInr: m('4820.0000'),
    // A `Ratio` that is a COUNT of funds, not a fraction. Percent-formatting it
    // renders "182%", which is the bug this fixture is here to catch.
    effectiveFundCount: r('1.820000'),
    // A `Ratio` that IS a fraction: 0.31 → "31.0%".
    redundancyScore: r('0.310000'),
    fundCount: 2,
    equityFundCount: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Whole-page fixtures
// ---------------------------------------------------------------------------

export function makeAnalysis(
  overrides: Partial<MfPortfolioAnalysisDto> = {},
): MfPortfolioAnalysisDto {
  return {
    asOf: '2026-09-04',
    runId: 'unpersisted',
    totals: makeTotals(),
    funds: [makeHeldFund(), makeUnconvergedFund()],
    overlap: { pairs: [makeOverlapPair()], debtPairs: [] },
    lookThrough: makeLookThrough(),
    cost: makeCost(),
    tax: makeTax(),
    goals: [
      {
        goalId: 'g1',
        goalName: "Child's education",
        targetDate: '2038-06-01',
        // A `Ratio` in YEARS. Not a fraction, not a percentage.
        horizonYears: r('11.700000'),
        schemeCodes: ['120503'],
        suitability: 'SUITABLE',
        reason:
          'A flexi-cap mandate suits a horizon this long; the fund can hold equity through a full cycle.',
        projectedValue: m('412000.0000'),
        projectionBasis: 'CATEGORY_MEDIAN_ROLLING',
        targetValue: m('500000.0000'),
        shortfall: m('88000.0000'),
      },
    ],
    scope: { partial: false, hiddenCategories: [], memberCount: null },
    ...overrides,
  };
}

/** The everything-resolves baseline. */
export const populatedFixture = (): MfPortfolioAnalysisDto => makeAnalysis();

/**
 * An empty book. Every aggregate is genuinely zero — there is nothing to total —
 * which is a different claim from "we could not measure it", and the page must
 * say the first without implying the second.
 */
export const emptyFixture = (): MfPortfolioAnalysisDto =>
  makeAnalysis({
    totals: makeTotals({
      investedValue: m('0.0000'),
      currentValue: m('0.0000'),
      absoluteGain: m('0.0000'),
      portfolioXirr: null,
      portfolioXirrStatus: 'INSUFFICIENT_DATA',
      weightedTerPct: null,
      annualCostInr: null,
      directPlanSavingsInr: m('0.0000'),
      effectiveFundCount: r('0.000000'),
      redundancyScore: null,
      fundCount: 0,
      equityFundCount: 0,
    }),
    funds: [],
    overlap: { pairs: [], debtPairs: [] },
    lookThrough: makeLookThrough({
      topStocks: [],
      sectors: {},
      sectorsBenchmark: null,
      marketCap: { large: null, mid: null, small: null, unclassified: null },
      assetClass: {},
    }),
    cost: makeCost({
      weightedTerPct: null,
      annualCostInr: null,
      directPlanSavingsInr: m('0.0000'),
      costCategoryPercentile: null,
      byFund: [],
    }),
    tax: makeTax({
      unrealisedStcg: m('0.0000'),
      unrealisedLtcg: m('0.0000'),
      lots: [],
      harvestCandidates: [],
    }),
    goals: [],
  });

/**
 * A household view with an asset-class cap in force. Every aggregate is a floor
 * and the page must say so in the family layer's own vocabulary, not in a
 * second dialect invented here (CONTEXT.md §6).
 */
export const partialScopeFixture = (): MfPortfolioAnalysisDto =>
  makeAnalysis({
    scope: {
      partial: true,
      // `ETF` is a capped asset class; `NET_WORTH` is the token the service
      // appends whenever ANY cap exists, because the net-worth denominator
      // behind the weight columns is then itself a floor.
      hiddenCategories: ['ETF', 'NET_WORTH'],
      memberCount: 3,
    },
  });

/**
 * **The most dangerous state on the page.** No held fund has disclosed a TER,
 * so `weightedTerPct` and `annualCostInr` are null. Rendering either as zero
 * would tell the reader their portfolio is free to run — a confident false
 * claim, not an omission, because zero is a real and excellent expense ratio.
 */
export const nullTerFixture = (): MfPortfolioAnalysisDto =>
  makeAnalysis({
    totals: makeTotals({ weightedTerPct: null, annualCostInr: null }),
    cost: makeCost({
      weightedTerPct: null,
      annualCostInr: null,
      costCategoryPercentile: null,
      byFund: [
        {
          schemeCode: '120503',
          terPct: null,
          directSiblingSchemeCode: null,
          directSiblingTerPct: null,
          annualSavingsInr: null,
        },
        {
          schemeCode: '119551',
          terPct: null,
          directSiblingSchemeCode: '119552',
          directSiblingTerPct: null,
          annualSavingsInr: null,
        },
      ],
    }),
  });

/**
 * A fund whose holdings we have never ingested. The look-through is then a
 * floor: that fund's stocks, sectors and asset mix are absent from every
 * aggregate, so each one under-states the reader's true exposure — the
 * direction that would falsely reassure someone checking for concentration.
 */
export const fundsWithoutHoldingsFixture = (): MfPortfolioAnalysisDto =>
  makeAnalysis({
    lookThrough: makeLookThrough({ fundsWithoutHoldings: ['119551'] }),
    overlap: { pairs: [], debtPairs: [] },
  });
