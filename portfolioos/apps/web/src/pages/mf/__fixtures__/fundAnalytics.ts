/**
 * Fixture states for the fund detail page.
 *
 * One per honesty state in `06-QUALITY-COMPLIANCE.md §6`, because Task 3.2's
 * done-criterion is "page renders every fixture state (rated, unrated,
 * small-category, stale holdings, benchmark unavailable)" — plus the
 * `NOT_APPLICABLE` metric case, which is the one most likely to be rendered as
 * a zero by a well-meaning consumer following the older five-value status list.
 *
 * Everything here is typed as the real DTO from `@portfolioos/shared`. That is
 * the point of the fixtures as much as of the page: a field renamed on the
 * contract breaks this file at compile time, which is exactly what did NOT
 * happen on `/advisor` because the client had its own shapes (CONTEXT.md §11).
 * The `as Ratio` / `as Pct` / `as Money` casts are the only concession — the
 * brands exist to stop arithmetic on wire strings, and a literal is the one
 * place a cast is legitimate.
 */

import type {
  MfCurrentProfile,
  MfFundAnalyticsDto,
  MfHorizonMetrics,
  MfSchemeMetaDto,
  MfSchemeScoreDto,
  Money,
  Pct,
  Ratio,
} from '@portfolioos/shared';

const r = (s: string) => s as Ratio;
const p = (s: string) => s as Pct;
const m = (s: string) => s as Money;

/** ISO date `n` days before now — used for the stale-snapshot fixture. */
export function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function makeMeta(overrides: Partial<MfSchemeMetaDto> = {}): MfSchemeMetaDto {
  return {
    schemeCode: '120503',
    isin: 'INF204K01XY9',
    schemeName: 'Testwell Flexi Cap Fund - Direct Growth',
    amcCode: 'TESTWELL',
    amcName: 'Testwell Asset Management',
    sebiCategory: 'EQUITY',
    sebiSubCategory: 'Flexi Cap Fund',
    planType: 'DIRECT',
    optionType: 'GROWTH',
    benchmarkIndexCode: 'NIFTY500TRI',
    inceptionDate: '2013-04-01',
    status: 'ACTIVE',
    statusChangedAt: null,
    predecessorSchemeCode: null,
    growthSiblingSchemeCode: null,
    riskometer: 'Very High',
    exitLoadText: '1% if redeemed within 365 days',
    exitLoadRules: [{ daysUpTo: 365, pct: p('1.000000') }],
    minSip: m('500.0000'),
    fundAgeYears: r('12.400000'),
    ...overrides,
  };
}

/**
 * A healthy 3-year horizon, deliberately carrying two `NOT_APPLICABLE` metrics
 * (Treynor at a near-zero beta, Calmar over a shallow drawdown) and one
 * `INSUFFICIENT_DATA`. A fixture where everything resolves would never exercise
 * the branch that matters.
 */
export function makeMetrics(overrides: Partial<MfHorizonMetrics> = {}): MfHorizonMetrics {
  return {
    asOf: '2026-08-31',
    horizonYears: 3,
    observationsMonthly: 36,
    status: 'OK',
    benchmarkCode: 'NIFTY500TRI',
    riskFreeSeries: 'TBILL91D',
    mathVersion: 'metrics-v1',
    returns: {
      cagr: r('0.184300'),
      absolute: null,
      benchmarkCagr: r('0.152100'),
      categoryMedianCagr: r('0.161000'),
      rolling1y: {
        windowYears: 1,
        observations: 25,
        mean: r('0.191000'),
        median: r('0.183000'),
        min: r('-0.084000'),
        max: r('0.412000'),
        p10: r('0.021000'),
        p25: r('0.099000'),
        p75: r('0.271000'),
        p90: r('0.338000'),
        pctNegative: r('0.080000'),
        pctBelowBenchmark: r('0.320000'),
        pctBelowCategoryMedian: r('0.400000'),
      },
      rolling3y: null,
      rolling5y: null,
      calendarYears: [
        {
          year: 2025,
          fund: r('0.219000'),
          benchmark: r('0.183000'),
          categoryMedian: r('0.192000'),
          rank: 8,
          universeSize: 42,
          quartile: 1,
        },
        {
          year: 2024,
          fund: r('0.141000'),
          benchmark: r('0.160000'),
          categoryMedian: r('0.158000'),
          rank: 31,
          universeSize: 41,
          quartile: 3,
        },
        {
          // Partial year: the fund existed but was not ranked. `quartile: null`
          // must not render as a 4th-quartile year.
          year: 2023,
          fund: r('0.088000'),
          benchmark: null,
          categoryMedian: null,
          rank: null,
          universeSize: null,
          quartile: null,
        },
      ],
      sipXirr: r('0.171000'),
    },
    risk: {
      stdDevAnn: r('0.142000'),
      downsideDevAnn: r('0.091000'),
      maxDrawdown: r('-0.212000'),
      maxDrawdownDurationDays: 143,
      recoveryDays: null, // "has not recovered yet" — a fact, not a gap.
      worstMonth: r('-0.081000'),
      bestMonth: r('0.094000'),
      worstCalendarYear: r('-0.031000'),
      var95Monthly: r('-0.061000'),
      cvar95Monthly: r('-0.088000'),
      pctNegativeMonths: r('0.333000'),
    },
    riskAdjusted: {
      sharpe: r('1.120000'),
      sortino: r('1.640000'),
      beta: r('0.050000'),
      jensenAlphaAnn: r('0.028000'),
      treynor: null, // NOT_APPLICABLE — beta too close to zero.
      trackingErrorAnn: r('0.043000'),
      informationRatio: r('0.740000'),
      calmar: null, // NOT_APPLICABLE — drawdown shallower than the floor.
      omega: r('1.380000'),
      m2: r('0.166000'),
    },
    relative: {
      upCapture: r('1.080000'),
      downCapture: r('0.870000'),
      captureRatio: r('1.241000'),
      battingAverage: r('0.611000'),
      outperformanceAnn: r('0.032000'),
    },
    consistency: {
      rollingBeatBenchPct: r('0.680000'),
      rollingBeatCategoryPct: r('0.600000'),
      quartileHistory: [
        { year: 2024, quartile: 3 },
        { year: 2025, quartile: 1 },
      ],
      quartileConsistency: r('0.500000'),
      survivorshipAdjusted: true,
    },
    fieldStatus: {
      'returns.absolute': 'NOT_APPLICABLE',
      'riskAdjusted.treynor': 'NOT_APPLICABLE',
      'riskAdjusted.calmar': 'NOT_APPLICABLE',
      'risk.recoveryDays': 'OK',
    },
    ...overrides,
  };
}

/** A horizon with no benchmark: relative metrics gone, absolute ones intact. */
export function makeBenchmarklessMetrics(): MfHorizonMetrics {
  const base = makeMetrics();
  return {
    ...base,
    benchmarkCode: null,
    returns: { ...base.returns, benchmarkCagr: null },
    riskAdjusted: {
      ...base.riskAdjusted,
      beta: null,
      jensenAlphaAnn: null,
      trackingErrorAnn: null,
      informationRatio: null,
      m2: null,
    },
    relative: {
      upCapture: null,
      downCapture: null,
      captureRatio: null,
      battingAverage: null,
      outperformanceAnn: null,
    },
    consistency: { ...base.consistency, rollingBeatBenchPct: null },
    fieldStatus: {
      ...base.fieldStatus,
      'returns.benchmarkCagr': 'BENCHMARK_UNAVAILABLE',
      'riskAdjusted.beta': 'BENCHMARK_UNAVAILABLE',
      'riskAdjusted.jensenAlphaAnn': 'BENCHMARK_UNAVAILABLE',
      'riskAdjusted.trackingErrorAnn': 'BENCHMARK_UNAVAILABLE',
      'riskAdjusted.informationRatio': 'BENCHMARK_UNAVAILABLE',
      'riskAdjusted.m2': 'BENCHMARK_UNAVAILABLE',
      'relative.upCapture': 'BENCHMARK_UNAVAILABLE',
      'relative.downCapture': 'BENCHMARK_UNAVAILABLE',
      'relative.captureRatio': 'BENCHMARK_UNAVAILABLE',
      'relative.battingAverage': 'BENCHMARK_UNAVAILABLE',
      'relative.outperformanceAnn': 'BENCHMARK_UNAVAILABLE',
      'consistency.rollingBeatBenchPct': 'BENCHMARK_UNAVAILABLE',
    },
  };
}

export function makeProfile(overrides: Partial<MfCurrentProfile> = {}): MfCurrentProfile {
  return {
    asOf: '2026-08-31',
    snapshotAsOf: daysAgoIso(35), // Normal monthly lag — no amber badge.
    status: 'OK',
    numHoldings: 48,
    top10WeightPct: p('41.200000'),
    hhi: r('0.041000'),
    effectiveHoldings: r('24.400000'),
    cashPct: p('3.100000'),
    activeShare: r('0.612000'),
    marketCapSplit: {
      large: p('62.000000'),
      mid: p('24.000000'),
      small: p('11.000000'),
      unclassified: p('3.000000'),
    },
    sectorWeights: {
      Financials: p('28.400000'),
      Technology: p('14.100000'),
      Energy: p('9.800000'),
    },
    sectorActiveWeights: { Financials: p('2.100000') },
    turnoverPct: p('38.000000'),
    turnoverIsEstimated: true,
    styleBox: { cap: 'LARGE', style: 'BLEND' },
    styleDrift: r('0.081000'),
    topHoldings: [
      {
        isin: 'INE040A01034',
        securityName: 'HDFC Bank Ltd',
        kind: 'EQUITY',
        weightPct: p('8.410000'),
        sector: 'Financials',
        marketCapBucket: 'LARGE',
      },
      {
        isin: null,
        securityName: 'Unlisted Holding Pvt Ltd',
        kind: 'OTHER',
        weightPct: p('0.400000'),
        sector: null,
        marketCapBucket: null,
      },
    ],
    modifiedDuration: null,
    durationIsApproximated: false,
    averageMaturityYears: null,
    ytmPct: null,
    creditQualitySplit: null,
    belowAAPct: null,
    topIssuerPct: null,
    terPct: p('0.680000'),
    terCategoryMedianPct: p('0.910000'),
    terPercentile: r('0.820000'),
    aum: m('184300000000.0000'),
    aumGrowth12mPct: p('18.400000'),
    aumCategoryPercentile: r('0.910000'),
    managerTenureYears: r('6.200000'),
    managerChangesLast3y: 0,
    currentManagers: [{ name: 'A. Manager', role: 'Lead', fromDate: '2020-06-01' }],
    fundAgeYears: r('12.400000'),
    exitLoadMaxDays: 365,
    fieldStatus: {},
    ...overrides,
  };
}

export function makeScore(overrides: Partial<MfSchemeScoreDto> = {}): MfSchemeScoreDto {
  return {
    schemeCode: '120503',
    asOf: '2026-08-31',
    methodologyVersion: 'score-active-equity-v1',
    modelKey: 'ACTIVE_EQUITY',
    ratingStatus: 'RATED',
    composite: r('78.400000'),
    rating: 4,
    pillars: {
      riskAdjustedReturn: {
        score: r('81.200000'),
        weight: r('0.400000'),
        inputs: {
          sortino: {
            value: r('1.120000'),
            percentile: r('0.780000'),
            status: 'OK',
            universeMedian: r('0.870000'),
            horizonBlend: { '3': r('0.710000'), '5': r('0.800000'), '10': r('0.790000') },
            weight: r('0.600000'),
          },
          treynor: {
            // The NOT_APPLICABLE case inside the explainability payload.
            value: null,
            percentile: null,
            status: 'NOT_APPLICABLE',
            universeMedian: r('0.410000'),
            weight: r('0.400000'),
          },
        },
      },
      cost: {
        // No usable input: the pillar scored nothing and its weight was
        // redistributed. Must never render as a zero pillar.
        score: null,
        weight: r('0.000000'),
        inputs: {
          ter: {
            value: null,
            percentile: null,
            status: 'INSUFFICIENT_DATA',
            universeMedian: null,
            weight: r('1.000000'),
          },
        },
      },
    },
    universeKey: 'EQUITY:Flexi Cap Fund:DIRECT',
    universeSize: 42,
    computedAt: '2026-09-01T04:00:00.000Z',
    riskometer: 'Very High',
    historyMonths: null,
    ratedFrom: null,
    ...overrides,
  };
}

export function makeAnalytics(
  overrides: Partial<MfFundAnalyticsDto> = {},
): MfFundAnalyticsDto {
  return {
    meta: makeMeta(),
    score: makeScore(),
    metrics: { '3': makeMetrics(), '5': makeMetrics({ horizonYears: 5 }) },
    profile: makeProfile(),
    peer: {
      '3': {
        universeKey: 'EQUITY:Flexi Cap Fund:DIRECT',
        universeSize: 42,
        percentiles: { sortino: r('0.780000') },
        medians: { sortino: r('0.870000') },
      },
    },
    qualitative: [],
    categoryStats: {
      universeKey: 'EQUITY:Flexi Cap Fund:DIRECT',
      universeSize: 42,
      medianComposite: r('61.500000'),
      topQuartileComposite: r('74.100000'),
    },
    // Null/empty because the user-scoped analysis engine (Phase 4/5) has not
    // been built. NOT a clean bill of health, and the page renders no section
    // that could be read as one.
    analyticsFromSchemeCode: null,
  held: null,
    findings: [],
    verdict: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The `06 §6` states, one export each
// ---------------------------------------------------------------------------

export const ratedFixture = (): MfFundAnalyticsDto => makeAnalytics();

export const insufficientHistoryFixture = (): MfFundAnalyticsDto =>
  makeAnalytics({
    score: makeScore({
      ratingStatus: 'INSUFFICIENT_HISTORY',
      composite: null,
      rating: null,
      historyMonths: 18,
      ratedFrom: '2027-11-01',
      pillars: {},
    }),
  });

export const categoryTooSmallFixture = (): MfFundAnalyticsDto =>
  makeAnalytics({
    score: makeScore({
      ratingStatus: 'CATEGORY_TOO_SMALL',
      composite: null,
      rating: null,
      universeSize: 6,
      pillars: {},
    }),
    categoryStats: {
      universeKey: 'EQUITY:Flexi Cap Fund:DIRECT',
      universeSize: 6,
      medianComposite: null,
      topQuartileComposite: null,
    },
  });

/** Snapshot older than the 60-day floor → amber "Portfolio as of {date}". */
export const staleHoldingsFixture = (): MfFundAnalyticsDto =>
  makeAnalytics({ profile: makeProfile({ snapshotAsOf: daysAgoIso(120) }) });

export const benchmarkUnavailableFixture = (): MfFundAnalyticsDto =>
  makeAnalytics({
    meta: makeMeta({ benchmarkIndexCode: null }),
    metrics: { '3': makeBenchmarklessMetrics() },
  });

/** No score row at all — distinct from every "Unrated" state above. */
export const unscoredFixture = (): MfFundAnalyticsDto => makeAnalytics({ score: null });

/** No portfolio disclosure ingested — distinct from an empty portfolio. */
export const noProfileFixture = (): MfFundAnalyticsDto => makeAnalytics({ profile: null });
