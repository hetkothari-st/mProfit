/**
 * Fixture builders for the **portfolio-scope** rule tests (`mf.pf.*`).
 *
 * The nine portfolio rules read a different half of `MfAnalysisFacts` from the
 * fund rules: overlap pairs, look-through stocks, the allocation comparison,
 * the cost and tax blocks, goal fits and the family scope flags. None of them
 * looks inside `facts.funds` at metrics, peer percentiles or scores.
 *
 * This file is therefore **standalone** rather than an extension of
 * `_facts.fixture.ts`. That is a deliberate call about concurrency, not a
 * preference: both files are being written at the same time by different
 * agents, and a shared module that one of them is mid-edit on takes the
 * other's whole suite down with a transform error. Two independent fixtures
 * merge; one shared one conflicts. If the two are ever consolidated, the
 * builders below are the portfolio half of the result.
 *
 * Conventions, matching `mfAnalytics.types.ts`:
 *   - numerics are branded Decimal *strings*, never JS numbers;
 *   - a value that could not be computed is `null`, never `0`;
 *   - `asOf` is fixed, so what a rule does is a property of the fixture rather
 *     than of the day the suite runs;
 *   - **every default is deliberately silent.** A portfolio rule that fires
 *     against `makePortfolioFacts()` with no overrides is firing on data no
 *     fixture claimed, and several suites assert exactly that it does not.
 */

import {
  DEFAULT_MF_RULE_CONSTANTS,
  serializeMoney,
  serializePct,
  serializeRatio,
  type MfAllocationComparison,
  type MfAnalysisScope,
  type MfCostSummary,
  type MfGoalFitDto,
  type MfHeldFundDto,
  type MfLookThrough,
  type MfLookThroughStock,
  type MfLotDto,
  type MfOverlapPair,
  type MfPortfolioAnalysisDto,
  type MfPortfolioTotals,
  type MfSchemeMetaDto,
  type MfTaxSummary,
} from '@portfolioos/shared';

import type { EffectiveScope } from '../../../../src/services/familyScope.service.js';
import type { MfAnalysisFacts, MfFundFacts } from '../../../../src/services/mfAnalytics/types.js';

/**
 * Mid-February: inside the 60-day `LTCG_HEADROOM_UNUSED` window for FY
 * 2025-26 and outside it for most of the year, so that rule's fire and
 * no-fire cases are a one-line change to `asOf`.
 */
export const PF_AS_OF = '2026-02-15T00:00:00.000Z';

/** The financial year `PF_AS_OF` falls in, in the `YYYY-YY` shape `04 §5` uses. */
export const PF_FY = '2025-26';

export const PF_USER_ID = 'pf-fixture-user';
export const PF_RUN_ID = 'pf-fixture-run';

// ---------------------------------------------------------------------------
// Leaves
// ---------------------------------------------------------------------------

export function makeMeta(overrides: Partial<MfSchemeMetaDto> = {}): MfSchemeMetaDto {
  return {
    schemeCode: 'PF_A',
    isin: 'INF000PF0001',
    schemeName: 'Alpha Large Cap Fund',
    amcCode: 'PFAMC',
    amcName: 'Fixture Asset Management',
    sebiCategory: 'EQUITY',
    sebiSubCategory: 'Large Cap Fund',
    planType: 'DIRECT',
    optionType: 'GROWTH',
    benchmarkIndexCode: 'NIFTY100_TRI',
    inceptionDate: '2010-01-04',
    status: 'ACTIVE',
    statusChangedAt: null,
    predecessorSchemeCode: null,
    growthSiblingSchemeCode: null,
    riskometer: 'VERY_HIGH',
    exitLoadText: null,
    exitLoadRules: null,
    minSip: null,
    fundAgeYears: serializeRatio('16.100000'),
    ...overrides,
  };
}

export function makeLot(overrides: Partial<MfLotDto> = {}): MfLotDto {
  return {
    schemeCode: 'PF_A',
    schemeName: 'Alpha Large Cap Fund',
    units: '100.000000',
    cost: serializeMoney('100000'),
    currentValue: serializeMoney('140000'),
    gain: serializeMoney('40000'),
    purchaseDate: '2023-01-10',
    holdingDays: 1132,
    gainType: 'LTCG',
    daysToLtcg: null,
    grandfatheredCost: null,
    exitLoadPct: null,
    exitLoadInr: null,
    taxIfSoldTodayInr: null,
    harvestableLossInr: null,
    ...overrides,
  };
}

export function makeHeldFund(overrides: Partial<MfHeldFundDto> = {}): MfHeldFundDto {
  const meta = overrides.meta ?? makeMeta();
  return {
    schemeCode: meta.schemeCode,
    meta,
    units: '100.000000',
    investedValue: serializeMoney('100000'),
    currentValue: serializeMoney('140000'),
    absoluteGain: serializeMoney('40000'),
    absoluteGainPct: serializePct('40.000000'),
    userXirr: serializeRatio('0.128000'),
    userXirrStatus: 'OK',
    fundCagrSamePeriod: serializeRatio('0.142500'),
    timingGap: serializeRatio('-0.014500'),
    holdingPeriodDays: 1132,
    sipActive: false,
    weightInMfPortfolio: serializePct('100.000000'),
    weightInNetWorth: null,
    score: null,
    lots: [],
    ...overrides,
  };
}

/**
 * `n` held funds with distinct codes and names, for the rules that count funds
 * rather than looking inside them.
 */
export function makeHeldFunds(n: number, subCategory = 'Large Cap Fund'): MfHeldFundDto[] {
  return Array.from({ length: n }, (_, i) =>
    makeHeldFund({
      meta: makeMeta({
        schemeCode: `PF_${i + 1}`,
        schemeName: `Fund ${i + 1}`,
        sebiSubCategory: subCategory as MfSchemeMetaDto['sebiSubCategory'],
      }),
    }),
  );
}

/**
 * `overlapPct` is a **`Pct`**: `20.000000` means 20%, not 0.2.
 *
 * The default is comfortably under the 50% floor *when read correctly* and far
 * over it when read as a fraction, so a rule that forgets to scale shows up as
 * a fixture that fires when it should be silent.
 */
export function makeOverlapPair(overrides: Partial<MfOverlapPair> = {}): MfOverlapPair {
  return {
    schemeCodeA: 'PF_A',
    schemeCodeB: 'PF_B',
    schemeNameA: 'Alpha Large Cap Fund',
    schemeNameB: 'Beta Large Cap Fund',
    overlapPct: serializePct('20.000000'),
    sameSubCategory: true,
    snapshotAsOfA: '2026-01-31',
    snapshotAsOfB: '2026-01-31',
    topShared: [],
    ...overrides,
  };
}

export function makeLookThroughStock(
  overrides: Partial<MfLookThroughStock> = {},
): MfLookThroughStock {
  return {
    isin: 'INE009A01021',
    securityName: 'Fixture Industries Ltd',
    effectiveWeightPct: serializePct('2.000000'),
    effectiveWeightOfNetWorthPct: null,
    contributors: [],
    ...overrides,
  };
}

export function makeAllocationComparison(
  overrides: Partial<MfAllocationComparison> = {},
): MfAllocationComparison {
  return {
    model: 'BALANCED',
    actual: { EQUITY: serializePct('60.000000'), DEBT: serializePct('40.000000') },
    target: { EQUITY: serializePct('60.000000'), DEBT: serializePct('40.000000') },
    drift: { EQUITY: serializePct('0.000000'), DEBT: serializePct('0.000000') },
    outsideTolerance: [],
    ...overrides,
  };
}

export function makeLookThrough(overrides: Partial<MfLookThrough> = {}): MfLookThrough {
  return {
    topStocks: [],
    sectors: {},
    sectorsBenchmark: null,
    marketCap: { large: null, mid: null, small: null, unclassified: null },
    credit: null,
    assetClass: { EQUITY: serializePct('100.000000') },
    // Null, not an all-zero comparison: a user with no risk profile has no
    // model portfolio, and "0% drift" would be a claim we cannot make.
    target: null,
    fundsWithoutHoldings: [],
    ...overrides,
  };
}

export function makeCostSummary(overrides: Partial<MfCostSummary> = {}): MfCostSummary {
  return {
    // Null would mean "no held fund disclosed a TER", never "free".
    weightedTerPct: serializePct('0.620000'),
    annualCostInr: serializeMoney('868'),
    directPlanSavingsInr: serializeMoney('0'),
    // Null by default because that is production today: `terPct` is not among
    // `mfPeerRank`'s ranked metrics, so no `terPercentile` is ever written.
    costCategoryPercentile: null,
    byFund: [
      {
        schemeCode: 'PF_A',
        terPct: serializePct('0.620000'),
        directSiblingSchemeCode: null,
        directSiblingTerPct: null,
        annualSavingsInr: null,
      },
    ],
    ...overrides,
  };
}

export function makeTaxSummary(overrides: Partial<MfTaxSummary> = {}): MfTaxSummary {
  return {
    unrealisedStcg: serializeMoney('0'),
    unrealisedLtcg: serializeMoney('0'),
    ltcgExemptionHeadroomInr: serializeMoney('0'),
    financialYear: PF_FY,
    harvestCandidates: [],
    lots: [],
    ...overrides,
  };
}

export function makeTotals(overrides: Partial<MfPortfolioTotals> = {}): MfPortfolioTotals {
  return {
    investedValue: serializeMoney('100000'),
    currentValue: serializeMoney('140000'),
    absoluteGain: serializeMoney('40000'),
    portfolioXirr: serializeRatio('0.128000'),
    portfolioXirrStatus: 'OK',
    weightedTerPct: serializePct('0.620000'),
    annualCostInr: serializeMoney('868'),
    directPlanSavingsInr: serializeMoney('0'),
    effectiveFundCount: serializeRatio('1.000000'),
    redundancyScore: null,
    fundCount: 1,
    equityFundCount: 1,
    ...overrides,
  };
}

export function makeGoalFit(overrides: Partial<MfGoalFitDto> = {}): MfGoalFitDto {
  return {
    goalId: 'goal_1',
    goalName: 'New car',
    targetDate: '2028-04-01',
    horizonYears: serializeRatio('2.100000'),
    schemeCodes: ['PF_A'],
    suitability: 'SUITABLE',
    reason: 'Horizon and fund risk are aligned.',
    projectedValue: null,
    projectionBasis: 'CATEGORY_MEDIAN_ROLLING',
    targetValue: null,
    shortfall: null,
    ...overrides,
  };
}

/** A complete, unrestricted book: no aggregate below it is a floor. */
export function makeScope(overrides: Partial<MfAnalysisScope> = {}): MfAnalysisScope {
  return { partial: false, hiddenCategories: [], memberCount: null, ...overrides };
}

/** A restricted family view. Every aggregate computed under it is a floor. */
export function makePartialScope(overrides: Partial<MfAnalysisScope> = {}): MfAnalysisScope {
  return { partial: true, hiddenCategories: ['MUTUAL_FUND'], memberCount: 3, ...overrides };
}

const PERSONAL_SCOPE: EffectiveScope = {
  callerId: PF_USER_ID,
  familyId: null,
  role: null,
  readableUserIds: [PF_USER_ID],
  writableUserIds: [PF_USER_ID],
  readableFamilyIds: [],
  writableFamilyIds: [],
  // `null` = unrestricted. `[]` would mean deny-all — conflating the two is
  // the fail-open bug CONTEXT.md §6 records as having shipped once.
  allowedAssetClasses: null,
  allowedCategories: null,
};

// ---------------------------------------------------------------------------
// Composites
// ---------------------------------------------------------------------------

export function makePortfolioAnalysis(
  overrides: Partial<MfPortfolioAnalysisDto> = {},
): MfPortfolioAnalysisDto {
  const funds = overrides.funds ?? [makeHeldFund()];
  return {
    asOf: PF_AS_OF,
    runId: PF_RUN_ID,
    totals: makeTotals({ fundCount: funds.length, equityFundCount: funds.length }),
    funds,
    overlap: { pairs: [], debtPairs: [] },
    lookThrough: makeLookThrough(),
    cost: makeCostSummary(),
    tax: makeTaxSummary(),
    goals: [],
    scope: makeScope(),
    ...overrides,
  };
}

/**
 * A minimal `MfFundFacts`. Portfolio-scope rules never read metrics, peer
 * percentiles or scores, so those are the honest `null`s rather than invented
 * mid-pack numbers a rule might accidentally lean on.
 */
export function makeFundFacts(held: MfHeldFundDto): MfFundFacts {
  return {
    meta: held.meta,
    score: null,
    // Total over the key space: a horizon with no row is present as `null`,
    // never absent (`05 §2`).
    metrics: { '1': null, '3': null, '5': null, '7': null, '10': null },
    profile: null,
    peer: { '1': null, '3': null, '5': null, '7': null, '10': null },
    qualitative: [],
    held,
    categoryStats: {
      universeKey: null,
      universeSize: 0,
      medianComposite: null,
      topQuartileComposite: null,
    },
  };
}

export interface PortfolioFactsOptions {
  portfolio?: Partial<MfPortfolioAnalysisDto>;
  /** Merged over `DEFAULT_MF_RULE_CONSTANTS`, which is why `05 §4` routes
   *  thresholds through facts: a boundary test moves one number without
   *  touching production calibration. */
  constants?: Partial<MfAnalysisFacts['constants']>;
  /** Overrides the run instant. Time-dependent rules read this, never a clock. */
  asOf?: string;
}

export function makePortfolioFacts(options: PortfolioFactsOptions = {}): MfAnalysisFacts {
  const portfolio = makePortfolioAnalysis(options.portfolio ?? {});
  return {
    asOf: options.asOf ?? portfolio.asOf,
    userId: PF_USER_ID,
    scope: PERSONAL_SCOPE,
    constants: { ...DEFAULT_MF_RULE_CONSTANTS, ...(options.constants ?? {}) },
    portfolio,
    funds: Object.fromEntries(portfolio.funds.map((f) => [f.schemeCode, makeFundFacts(f)])),
    approvedUniverse: [],
    userProfile: { riskProfile: null, goals: [], incomeKnown: false },
  };
}
