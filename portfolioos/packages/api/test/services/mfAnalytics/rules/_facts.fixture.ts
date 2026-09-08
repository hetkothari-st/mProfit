/**
 * Fixture builders for the MF findings-engine rule tests.
 *
 * Every rule is a pure function of `MfAnalysisFacts` (`05 §3`), so its test
 * needs exactly one thing: a facts value it can bend one field at a time. That
 * is what this file is. It is deliberately *complete* rather than partial —
 * each builder is annotated with the shared DTO, so if `MfHorizonMetrics` or
 * `MfCurrentProfile` ever gains a required field this file stops compiling
 * before a rule can be written against a shape the builder no longer produces.
 *
 * The leading underscore keeps it out of any `rules/*.test.ts` enumeration and
 * makes it obvious at a glance that it holds no assertions. (It sits under
 * `test/`, not `src/services/mfAnalytics/rules/`, so
 * `test/invariants/mf-rules-pure.test.ts` — which reads only the source rules
 * directory — never sees it either way.)
 *
 * Convention throughout: **nothing here is a plausible default that a test
 * might accidentally rely on.** Metric values are deliberately mid-range and
 * far from every threshold in `DEFAULT_MF_RULE_CONSTANTS`, so a rule that
 * fires against the bare fixture is firing on data the fixture never claimed —
 * which is a bug in the rule, and shows up as a failing "does not fire" case.
 */

import {
  DEFAULT_MF_RULE_CONSTANTS,
  serializeMoney,
  serializePct,
  serializeRatio,
  type MfCostSummary,
  type MfCurrentProfile,
  type MfHeldFundDto,
  type MfHorizonMetrics,
  type MfHorizonYears,
  type MfPeerPercentiles,
  type MfPortfolioAnalysisDto,
  type MfRuleConstants,
  type MfSchemeMetaDto,
  type MfSchemeScoreDto,
  type Ratio,
} from '@portfolioos/shared';
import type { EffectiveScope } from '../../../../src/services/familyScope.service.js';
import type {
  AdvisorApprovedProductFacts,
  MfAnalysisFacts,
  MfFundFacts,
  MfHorizonKey,
  RiskProfileFacts,
} from '../../../../src/services/mfAnalytics/types.js';
import type { RiskCategoryValue } from '../../../../src/services/riskProfileMath.js';

export const AS_OF = '2026-08-31';
export const SCHEME = 'FIXTURE_SCHEME_1';
export const USER_ID = 'fixture-user-1';
export const RUN_ID = 'fixture-run-1';

/** Every horizon key, so the per-horizon maps below are total (`types.ts`). */
const HORIZON_KEYS: readonly MfHorizonKey[] = ['1', '3', '5', '7', '10'];

// ---------------------------------------------------------------------------
// Leaf builders
// ---------------------------------------------------------------------------

export function makeMeta(overrides: Partial<MfSchemeMetaDto> = {}): MfSchemeMetaDto {
  return {
    schemeCode: SCHEME,
    isin: 'INF000FIXTURE',
    schemeName: 'Fixture Large Cap Fund - Direct - Growth',
    amcCode: 'FIXAMC',
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
    exitLoadText: '1% if redeemed within 365 days',
    exitLoadRules: [{ daysUpTo: 365, pct: serializePct('1.000000') }],
    minSip: serializeMoney('500'),
    fundAgeYears: serializeRatio('16.600000'),
    ...overrides,
  };
}

/**
 * One horizon's metrics, with every number sitting comfortably inside "fine".
 * Down-capture 0.92 (threshold 1.10), drawdown -18% against a 20% category
 * median, rolling beat 0.62 (floors 0.30 / 0.70) — nothing here trips a rule.
 *
 * Named `makeMetricsRow` rather than `makeHorizonMetrics` because the horizon
 * is a positional argument here, not an override — the builder cannot produce
 * a row without being told which horizon it is for.
 */
export function makeMetricsRow(
  horizonYears: MfHorizonYears,
  overrides: Partial<MfHorizonMetrics> = {},
): MfHorizonMetrics {
  return {
    asOf: AS_OF,
    horizonYears,
    observationsMonthly: horizonYears * 12,
    status: 'OK',
    benchmarkCode: 'NIFTY100_TRI',
    riskFreeSeries: 'TBILL_91D',
    mathVersion: '1.0.0',
    returns: {
      // SEBI convention: 1y is absolute, longer horizons are annualised.
      cagr: horizonYears === 1 ? null : serializeRatio('0.142500'),
      absolute: horizonYears === 1 ? serializeRatio('0.118000') : null,
      benchmarkCagr: serializeRatio('0.131000'),
      categoryMedianCagr: serializeRatio('0.127500'),
      rolling1y: null,
      rolling3y: null,
      rolling5y: null,
      calendarYears: [],
      sipXirr: serializeRatio('0.151200'),
    },
    risk: {
      stdDevAnn: serializeRatio('0.138000'),
      downsideDevAnn: serializeRatio('0.091000'),
      // Stored NEGATIVE: -0.18 is an 18% peak-to-trough fall (`02 §9`).
      maxDrawdown: serializeRatio('-0.180000'),
      maxDrawdownDurationDays: 214,
      recoveryDays: null,
      worstMonth: serializeRatio('-0.112000'),
      bestMonth: serializeRatio('0.128000'),
      worstCalendarYear: serializeRatio('-0.041000'),
      var95Monthly: serializeRatio('-0.068000'),
      cvar95Monthly: serializeRatio('-0.094000'),
      pctNegativeMonths: serializeRatio('0.336000'),
    },
    riskAdjusted: {
      sharpe: serializeRatio('0.712000'),
      sortino: serializeRatio('1.041000'),
      beta: serializeRatio('0.940000'),
      jensenAlphaAnn: serializeRatio('0.008000'),
      treynor: serializeRatio('0.061000'),
      trackingErrorAnn: serializeRatio('0.042000'),
      informationRatio: serializeRatio('0.274000'),
      calmar: serializeRatio('0.501000'),
      omega: serializeRatio('1.310000'),
      m2: serializeRatio('0.139000'),
    },
    relative: {
      upCapture: serializeRatio('1.042000'),
      downCapture: serializeRatio('0.918000'),
      captureRatio: serializeRatio('1.135000'),
      battingAverage: serializeRatio('0.583000'),
      outperformanceAnn: serializeRatio('0.011500'),
    },
    consistency: {
      rollingBeatBenchPct: serializeRatio('0.620000'),
      rollingBeatCategoryPct: serializeRatio('0.640000'),
      quartileHistory: [],
      quartileConsistency: serializeRatio('0.600000'),
      survivorshipAdjusted: true,
    },
    // Only non-OK fields get an entry (`mfMetrics.service.ts` FieldStatus).
    fieldStatus: {},
    ...overrides,
  };
}

export function makeProfile(overrides: Partial<MfCurrentProfile> = {}): MfCurrentProfile {
  return {
    asOf: AS_OF,
    snapshotAsOf: '2026-07-31',
    status: 'OK',
    numHoldings: 52,
    top10WeightPct: serializePct('41.200000'),
    hhi: serializeRatio('0.043000'),
    effectiveHoldings: serializeRatio('23.250000'),
    cashPct: serializePct('3.100000'),
    // Non-null here so a fixture can exercise CLOSET_INDEX. In production this
    // is always null (BENCHMARK_UNAVAILABLE) — see that rule's header.
    activeShare: serializeRatio('0.620000'),
    marketCapSplit: {
      large: serializePct('88.400000'),
      mid: serializePct('7.900000'),
      small: serializePct('2.600000'),
      unclassified: serializePct('1.100000'),
    },
    sectorWeights: null,
    sectorActiveWeights: null,
    turnoverPct: serializePct('38.000000'),
    turnoverIsEstimated: true,
    styleBox: { cap: 'LARGE', style: 'BLEND' },
    // Percentage points of worst breach across the lookback window (`02 §7`).
    // 0 = never outside the mandated band.
    styleDrift: serializeRatio('0.000000'),
    topHoldings: [],
    modifiedDuration: null,
    durationIsApproximated: false,
    averageMaturityYears: null,
    ytmPct: null,
    creditQualitySplit: null,
    belowAAPct: null,
    topIssuerPct: null,
    terPct: serializePct('0.620000'),
    terCategoryMedianPct: serializePct('0.780000'),
    // Higher = better = cheaper (`03 §1` direction table).
    terPercentile: serializeRatio('0.810000'),
    aum: serializeMoney('184000000000'),
    aumGrowth12mPct: serializePct('12.400000'),
    aumCategoryPercentile: serializeRatio('0.900000'),
    managerTenureYears: serializeRatio('6.240000'),
    managerChangesLast3y: 0,
    currentManagers: [],
    fundAgeYears: serializeRatio('16.600000'),
    exitLoadMaxDays: 365,
    fieldStatus: {},
    ...overrides,
  };
}

export function makePeer(
  percentiles: Record<string, string> = {},
  medians: Record<string, string> = {},
  universeSize = 42,
): MfPeerPercentiles {
  const asRatios = (m: Record<string, string>): Record<string, Ratio> => {
    const out: Record<string, Ratio> = {};
    for (const [k, v] of Object.entries(m)) out[k] = serializeRatio(v);
    return out;
  };
  return {
    universeKey: 'Large Cap Fund|DIRECT',
    universeSize,
    percentiles: asRatios(percentiles),
    medians: asRatios(medians),
  };
}

/** Peer percentiles comfortably mid-pack on every metric a rule looks at. */
export function makeNeutralPeer(): MfPeerPercentiles {
  return makePeer(
    {
      cagr: '0.600000',
      absolute: '0.600000',
      downCapture: '0.600000',
      maxDrawdown: '0.600000',
      stdDevAnn: '0.600000',
    },
    {
      downCapture: '0.950000',
      // Median drawdown is stored as a MAGNITUDE by the peer ranker
      // (`RANKED_METRICS` marks maxDrawdown `magnitude: true`).
      maxDrawdown: '0.200000',
      stdDevAnn: '0.140000',
    },
  );
}

export function makeScore(overrides: Partial<MfSchemeScoreDto> = {}): MfSchemeScoreDto {
  return {
    schemeCode: SCHEME,
    asOf: AS_OF,
    methodologyVersion: 'score-active-equity-v1',
    modelKey: 'ACTIVE_EQUITY',
    ratingStatus: 'RATED',
    composite: serializeRatio('62.000000'),
    rating: 3,
    pillars: {
      // Pillar scores are percentiles in [0,1] (`mfScoreMath.composite`).
      PERFORMANCE: {
        score: serializeRatio('0.580000'),
        weight: serializeRatio('0.300000'),
        inputs: {},
      },
      CONSISTENCY: {
        score: serializeRatio('0.540000'),
        weight: serializeRatio('0.200000'),
        inputs: {},
      },
    },
    universeKey: 'Large Cap Fund|DIRECT',
    universeSize: 42,
    computedAt: AS_OF,
    riskometer: 'VERY_HIGH',
    historyMonths: null,
    ratedFrom: null,
    ...overrides,
  };
}

export function makeHeld(overrides: Partial<MfHeldFundDto> = {}): MfHeldFundDto {
  return {
    schemeCode: SCHEME,
    meta: makeMeta(),
    units: '1000.000000',
    investedValue: serializeMoney('400000'),
    currentValue: serializeMoney('520000'),
    absoluteGain: serializeMoney('120000'),
    absoluteGainPct: serializePct('30.000000'),
    userXirr: serializeRatio('0.128000'),
    userXirrStatus: 'OK',
    fundCagrSamePeriod: serializeRatio('0.142500'),
    timingGap: serializeRatio('-0.014500'),
    holdingPeriodDays: 900,
    sipActive: true,
    weightInMfPortfolio: serializePct('100.000000'),
    weightInNetWorth: null,
    score: makeScore(),
    lots: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Composite builders
// ---------------------------------------------------------------------------

export interface FundFactsOptions {
  meta?: Partial<MfSchemeMetaDto>;
  score?: MfSchemeScoreDto | null;
  profile?: Partial<MfCurrentProfile> | null;
  /** Per-horizon overrides; a horizon set to `null` is explicitly absent. */
  metrics?: Partial<Record<MfHorizonKey, Partial<MfHorizonMetrics> | null>>;
  peer?: Partial<Record<MfHorizonKey, MfPeerPercentiles | null>>;
  held?: Partial<MfHeldFundDto>;
}

export function makeFundFacts(options: FundFactsOptions = {}): MfFundFacts {
  const metrics = {} as Record<MfHorizonKey, MfHorizonMetrics | null>;
  const peer = {} as Record<MfHorizonKey, MfPeerPercentiles | null>;

  for (const key of HORIZON_KEYS) {
    const metricOverride = options.metrics?.[key];
    metrics[key] =
      metricOverride === null
        ? null
        : makeMetricsRow(Number(key) as MfHorizonYears, metricOverride ?? {});

    const peerOverride = options.peer?.[key];
    peer[key] = peerOverride === undefined ? makeNeutralPeer() : peerOverride;
  }

  const meta = makeMeta(options.meta ?? {});
  return {
    meta,
    score: options.score === undefined ? makeScore() : options.score,
    metrics,
    profile: options.profile === null ? null : makeProfile(options.profile ?? {}),
    peer,
    qualitative: [],
    held: makeHeld({ meta, ...(options.held ?? {}) }),
    categoryStats: {
      universeKey: 'Large Cap Fund|DIRECT',
      universeSize: 42,
      medianComposite: serializeRatio('58.000000'),
      topQuartileComposite: serializeRatio('74.000000'),
    },
  };
}

const EMPTY_SCOPE: EffectiveScope = {
  callerId: USER_ID,
  familyId: null,
  role: null,
  readableUserIds: [USER_ID],
  writableUserIds: [USER_ID],
  readableFamilyIds: [],
  writableFamilyIds: [],
  allowedAssetClasses: null,
  allowedCategories: null,
};

export function makeCostSummary(overrides: Partial<MfCostSummary> = {}): MfCostSummary {
  return {
    weightedTerPct: serializePct('0.620000'),
    annualCostInr: serializeMoney('3224'),
    directPlanSavingsInr: serializeMoney('0'),
    costCategoryPercentile: serializeRatio('0.700000'),
    byFund: [
      {
        schemeCode: SCHEME,
        terPct: serializePct('0.620000'),
        directSiblingSchemeCode: null,
        directSiblingTerPct: null,
        annualSavingsInr: null,
      },
    ],
    ...overrides,
  };
}

export function makePortfolio(
  funds: MfHeldFundDto[],
  overrides: Partial<MfPortfolioAnalysisDto> = {},
): MfPortfolioAnalysisDto {
  return {
    asOf: AS_OF,
    runId: RUN_ID,
    totals: {
      investedValue: serializeMoney('400000'),
      currentValue: serializeMoney('520000'),
      absoluteGain: serializeMoney('120000'),
      portfolioXirr: serializeRatio('0.128000'),
      portfolioXirrStatus: 'OK',
      weightedTerPct: serializePct('0.620000'),
      annualCostInr: serializeMoney('3224'),
      directPlanSavingsInr: serializeMoney('0'),
      effectiveFundCount: serializeRatio('1.000000'),
      redundancyScore: null,
      fundCount: funds.length,
      equityFundCount: funds.length,
    },
    funds,
    overlap: { pairs: [], debtPairs: [] },
    lookThrough: {
      topStocks: [],
      sectors: {},
      sectorsBenchmark: null,
      marketCap: { large: null, mid: null, small: null, unclassified: null },
      credit: null,
      assetClass: {},
      target: null,
      fundsWithoutHoldings: [],
    },
    cost: makeCostSummary(),
    tax: {
      unrealisedStcg: serializeMoney('0'),
      unrealisedLtcg: serializeMoney('120000'),
      ltcgExemptionHeadroomInr: serializeMoney('125000'),
      financialYear: '2026-27',
      harvestCandidates: [],
      lots: [],
    },
    goals: [],
    scope: { partial: false, hiddenCategories: [], memberCount: null },
    ...overrides,
  };
}

export function makeRiskProfile(category: RiskCategoryValue): RiskProfileFacts {
  return {
    assessmentId: 'fixture-assessment-1',
    category,
    assessedAt: '2026-01-15T00:00:00.000Z',
    taxSlabPct: 30,
    age: 38,
  };
}

export interface FactsOptions {
  funds?: Record<string, MfFundFacts>;
  constants?: Partial<MfRuleConstants>;
  riskProfile?: RiskProfileFacts | null;
  cost?: Partial<MfCostSummary>;
  approvedUniverse?: AdvisorApprovedProductFacts[];
  portfolio?: Partial<MfPortfolioAnalysisDto>;
}

/**
 * A complete `MfAnalysisFacts` holding exactly one, unremarkable, fund.
 *
 * Thresholds come from `DEFAULT_MF_RULE_CONSTANTS` merged with any override,
 * which is the whole reason `05 §4` routes constants through facts: a boundary
 * test moves one number without touching production calibration.
 */
export function makeFacts(options: FactsOptions = {}): MfAnalysisFacts {
  const funds = options.funds ?? { [SCHEME]: makeFundFacts() };
  const held = Object.values(funds).map((f) => f.held);
  const portfolio = makePortfolio(held, {
    ...(options.cost === undefined ? {} : { cost: makeCostSummary(options.cost) }),
    ...(options.portfolio ?? {}),
  });

  return {
    asOf: AS_OF,
    userId: USER_ID,
    scope: EMPTY_SCOPE,
    constants: { ...DEFAULT_MF_RULE_CONSTANTS, ...(options.constants ?? {}) },
    portfolio,
    funds,
    approvedUniverse: options.approvedUniverse ?? [],
    userProfile: {
      riskProfile: options.riskProfile === undefined ? null : options.riskProfile,
      goals: [],
      incomeKnown: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Fund-scope additions (`05 §4` rows 13-24)
//
// A second block, added by a parallel task, in its own section with its own
// import statement so the two halves of this file can be edited without
// touching each other's lines. Everything here is **additive**: it builds on
// the builders above rather than redefining any of them, and changes no
// baseline they establish.
//
// What is added, and why each one is not already above:
//   - date shifts relative to `AS_OF`, so a test can say "90 days stale"
//     instead of hard-coding a date that silently stops meaning that;
//   - `makeLot`, because `makeHeld` ships with `lots: []` and four fund-scope
//     rules read lots;
//   - a debt-profile base, because `makeProfile` is an equity fund and leaves
//     every debt-only field null;
//   - `makeQualitativeFact`, which `FundFactsOptions` has no slot for;
//   - `factsForFund`, a one-fund convenience over `makeFacts`/`makeFundFacts`.
// ---------------------------------------------------------------------------

import type { MfLotDto, MfQualitativeFactDto } from '@portfolioos/shared';

/**
 * `YYYY-MM-DD` for `AS_OF` shifted by whole days.
 *
 * A `Date` is fine here — the ban in `05 §3` is on a *rule* reading the clock,
 * and this reads a constant. `test/invariants/mf-rules-pure.test.ts` only
 * inspects `src/services/mfAnalytics/rules/`, so it never sees this file.
 */
export function isoDaysFromAsOf(days: number): string {
  return new Date(Date.parse(`${AS_OF}T00:00:00.000Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * `YYYY-MM-DD` for `AS_OF` shifted by whole calendar months.
 *
 * The day of month is pinned to the 28th rather than carried from `AS_OF`,
 * which is the 31st. Shifting the 31st back six months lands on 31 February
 * and rolls forward into March, which would make "six months ago" quietly
 * mean five — and the rules that read this compare day-of-month to decide
 * whether a month is complete. The 28th exists in every month, so the shift
 * is exact for every offset.
 */
export function isoMonthsFromAsOf(months: number): string {
  const y = Number.parseInt(AS_OF.slice(0, 4), 10);
  const m = Number.parseInt(AS_OF.slice(5, 7), 10);
  const total = y * 12 + (m - 1) + months;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${String(yy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-28`;
}

/**
 * One open tax lot, long-term and in profit, with **no exit load on file**.
 *
 * `exitLoadPct: null` is the deliberate default: it means "we do not know this
 * scheme's load, not that it is zero" (`MfLotDto`), and a rule that reads it
 * as zero is the bug `user.exit-load-window.ts` and `tax.harvest.ts` exist to
 * avoid. A test that wants a known-free lot must say `serializePct(0)`.
 */
export function makeLot(overrides: Partial<MfLotDto> = {}): MfLotDto {
  return {
    schemeCode: SCHEME,
    schemeName: 'Fixture Large Cap Fund - Direct - Growth',
    units: '1000.000000',
    cost: serializeMoney('400000'),
    currentValue: serializeMoney('520000'),
    gain: serializeMoney('120000'),
    purchaseDate: isoDaysFromAsOf(-900),
    holdingDays: 900,
    gainType: 'LTCG',
    daysToLtcg: null,
    grandfatheredCost: null,
    exitLoadPct: null,
    exitLoadInr: null,
    taxIfSoldTodayInr: serializeMoney('15000'),
    harvestableLossInr: null,
    ...overrides,
  };
}

/**
 * A debt fund's horizon-0 fields, all comfortably inside every SEBI band.
 *
 * Spread into `FundFactsOptions.profile`, which is merged over `makeProfile`
 * — so this turns the equity baseline into a debt one without duplicating the
 * other forty fields.
 *
 * A modified duration of 2.0 at a 7.2% yield implies a Macaulay duration of
 * 2.14, inside the Short Duration band (1-3 years) with or without the
 * conversion, so `DURATION_MISMATCH` is silent here for the right reason.
 */
export const DEBT_PROFILE_BASE: Partial<MfCurrentProfile> = Object.freeze({
  activeShare: null,
  marketCapSplit: null,
  styleBox: null,
  modifiedDuration: serializeRatio('2.000000'),
  durationIsApproximated: false,
  averageMaturityYears: serializeRatio('2.400000'),
  ytmPct: serializePct('7.200000'),
  creditQualitySplit: {
    sov: serializePct('20.000000'),
    aaa: serializePct('65.000000'),
    aaPlus: serializePct('8.000000'),
    aa: serializePct('5.000000'),
    aaMinus: serializePct('2.000000'),
    aAndBelow: serializePct('0.000000'),
    unrated: serializePct('0.000000'),
  },
  belowAAPct: serializePct('2.000000'),
  topIssuerPct: serializePct('6.000000'),
});

export function makeQualitativeFact(
  overrides: Partial<MfQualitativeFactDto> = {},
): MfQualitativeFactDto {
  return {
    factType: 'STRATEGY_CAPACITY_CAP',
    value: {},
    validFrom: isoMonthsFromAsOf(-6),
    validTo: null,
    source: 'https://example.test/admin-note',
    ...overrides,
  };
}

/**
 * Facts holding exactly one fund, plus the scheme code to evaluate it under.
 *
 * A thin wrapper over `makeFundFacts` + `makeFacts`: fund-scope rules are
 * called as `evaluate(facts, schemeCode)`, and returning the pair keeps every
 * test from repeating the `{ [SCHEME]: … }` plumbing and from being able to
 * get the two out of step.
 *
 * `qualitative` is threaded here because `FundFactsOptions` has no slot for it
 * and `mf.people.amc-action` is the only rule that reads it.
 */
export function factsForFund(
  options: FundFactsOptions & { qualitative?: MfQualitativeFactDto[] } = {},
  factsOptions: Omit<FactsOptions, 'funds'> = {},
): { facts: MfAnalysisFacts; schemeCode: string } {
  const { qualitative, ...fundOptions } = options;
  const fund: MfFundFacts = {
    ...makeFundFacts(fundOptions),
    ...(qualitative === undefined ? {} : { qualitative }),
  };
  const schemeCode = fund.meta.schemeCode;
  return { facts: makeFacts({ ...factsOptions, funds: { [schemeCode]: fund } }), schemeCode };
}
