/**
 * Fixture states for the findings / verdict section of the fund page (Task 5.6).
 *
 * One export per honesty state in `06-QUALITY-COMPLIANCE.md §6` that this
 * section owns: verified prose, unverified prose, a `PARTIAL` run, an
 * RIA-gated verdict, and a fund the run examined and said nothing about.
 *
 * Everything is typed as the real DTO from `@portfolioos/shared`. That is as
 * much the point of the fixtures as of the components: a field renamed on the
 * contract breaks this file at compile time, which is precisely what did NOT
 * happen on `/advisor` because the client had shapes of its own (CONTEXT.md
 * §11, §16.6). The `as Ratio` / `as Pct` / `as Money` casts are the only
 * concession — the brands exist to stop arithmetic on wire strings, and a
 * literal is the one place a cast is legitimate.
 */

import type {
  MfAnalysisRunDto,
  MfEvidence,
  MfFinding,
  MfFundVerdictDto,
  MfHeldFundDto,
  MfPortfolioAnalysisDto,
  MfSchemeMetaDto,
  Money,
  Pct,
  Ratio,
} from '@portfolioos/shared';

const r = (s: string) => s as Ratio;
const p = (s: string) => s as Pct;
const m = (s: string) => s as Money;

export const FIXTURE_SCHEME = '120503';
const RUN_ID = 'run_mfa56_1';

function meta(): MfSchemeMetaDto {
  return {
    schemeCode: FIXTURE_SCHEME,
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
    exitLoadText: null,
    exitLoadRules: null,
    minSip: null,
    fundAgeYears: r('12.400000'),
  };
}

function heldFund(): MfHeldFundDto {
  return {
    schemeCode: FIXTURE_SCHEME,
    meta: meta(),
    units: '1250.500000',
    investedValue: m('125000.0000'),
    currentValue: m('148250.7500'),
    absoluteGain: m('23250.7500'),
    absoluteGainPct: p('18.600600'),
    userXirr: r('0.142500'),
    userXirrStatus: 'OK',
    fundCagrSamePeriod: r('0.151000'),
    timingGap: r('-0.008500'),
    holdingPeriodDays: 940,
    sipActive: true,
    weightInMfPortfolio: p('100.000000'),
    weightInNetWorth: null,
    score: null,
    lots: [],
  };
}

/**
 * `MfAnalysisRunDto.portfolioAnalysis` is required by the contract and is not
 * read by the findings section, but it is filled honestly anyway: a fixture
 * that stubbed it with a cast would stop being the compile-time conformance
 * check this file exists to be.
 *
 * The nulls are deliberate and are the `06 §6` rule in miniature —
 * `weightedTerPct: null` means no held fund disclosed a TER, and a `0` there
 * would tell the reader their portfolio is free.
 */
function portfolioAnalysis(): MfPortfolioAnalysisDto {
  return {
    asOf: '2026-08-31',
    runId: RUN_ID,
    totals: {
      investedValue: m('125000.0000'),
      currentValue: m('148250.7500'),
      absoluteGain: m('23250.7500'),
      portfolioXirr: r('0.142500'),
      portfolioXirrStatus: 'OK',
      weightedTerPct: null,
      annualCostInr: null,
      directPlanSavingsInr: m('0.0000'),
      effectiveFundCount: r('1.000000'),
      redundancyScore: null,
      fundCount: 1,
      equityFundCount: 1,
    },
    funds: [heldFund()],
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
    cost: {
      weightedTerPct: null,
      annualCostInr: null,
      directPlanSavingsInr: m('0.0000'),
      costCategoryPercentile: null,
      byFund: [],
    },
    tax: {
      unrealisedStcg: m('0.0000'),
      unrealisedLtcg: m('23250.7500'),
      ltcgExemptionHeadroomInr: m('125000.0000'),
      financialYear: '2026-27',
      harvestCandidates: [],
      lots: [],
    },
    goals: [],
    scope: { partial: false, hiddenCategories: [], memberCount: null },
  };
}

/**
 * Evidence with one fully-populated row and one row missing its median and
 * percentile.
 *
 * The second row is the one that matters: an absent `categoryMedian` must
 * render as a stated unavailability, never as a dash and never as `0.00`. A
 * fixture where every cell resolved would never exercise that branch, and the
 * digit-in-a-non-OK-metric walker would pass vacuously.
 */
function evidence(): MfEvidence[] {
  return [
    {
      metric: 'relative.downCapture',
      label: 'Downside capture vs benchmark',
      horizonYears: 3,
      value: r('1.184000'),
      categoryMedian: r('0.996000'),
      percentile: r('0.180000'),
      benchmarkValue: r('1.000000'),
      unit: 'ratio',
    },
    {
      metric: 'risk.maxDrawdown',
      label: 'Worst peak-to-trough fall',
      horizonYears: 3,
      value: r('-0.412000'),
      // No median, no percentile: the category had too few peers with a full
      // drawdown history for either to mean anything.
      unit: 'ratio',
    },
  ];
}

export function makeFinding(overrides: Partial<MfFinding> = {}): MfFinding {
  return {
    id: 'find_1',
    runId: RUN_ID,
    schemeCode: FIXTURE_SCHEME,
    ruleId: 'mf.risk.high-down-capture',
    ruleVersion: '1.0.0',
    code: 'HIGH_DOWN_CAPTURE',
    category: 'RISK',
    severity: 'WARNING',
    confidence: r('0.700000'),
    headline: 'Captured 118.4% of benchmark losses (category median 99.6%)',
    evidence: evidence(),
    whatWouldChangeThis: 'Would clear at a downside capture of 1.10 or better.',
    createdAt: '2026-09-01T10:00:04.000Z',
    ...overrides,
  };
}

/** A structural finding: no metric cited, which is a legitimate state. */
export function makeStructuralFinding(): MfFinding {
  return makeFinding({
    id: 'find_2',
    ruleId: 'mf.people.manager-change',
    code: 'MANAGER_CHANGE',
    category: 'PEOPLE',
    severity: 'NOTICE',
    confidence: r('1.000000'),
    headline: 'The lead manager changed in the last twelve months',
    evidence: [],
    whatWouldChangeThis:
      'The track record before the handover belongs to the previous manager; this clears twelve months after the change.',
  });
}

export function makeVerdict(overrides: Partial<MfFundVerdictDto> = {}): MfFundVerdictDto {
  return {
    id: 'verd_1',
    runId: RUN_ID,
    schemeCode: FIXTURE_SCHEME,
    verdict: 'MONITOR',
    reasons: ['HIGH_DOWN_CAPTURE'],
    suggestedReplacementSchemeCode: null,
    suggestedReplacementName: null,
    switchCost: null,
    prose:
      'This fund has fallen further than its peers in every down market since 2023, though its long-run record is intact.',
    proseModel: 'claude-haiku-4-5-20251001',
    proseVerified: true,
    supersededById: null,
    createdAt: '2026-09-01T10:00:04.000Z',
    advisoryGated: false,
    ...overrides,
  };
}

export function makeRun(overrides: Partial<MfAnalysisRunDto> = {}): MfAnalysisRunDto {
  return {
    id: RUN_ID,
    asOf: '2026-08-31T00:00:00.000Z',
    status: 'COMPLETED',
    triggeredBy: 'HOLDINGS_CHANGE',
    startedAt: '2026-09-01T10:00:00.000Z',
    completedAt: '2026-09-01T10:00:04.000Z',
    portfolioAnalysis: portfolioAnalysis(),
    findings: [makeFinding()],
    verdicts: [makeVerdict()],
    ruleVersionsSnapshot: [
      { ruleId: 'mf.risk.high-down-capture', version: '1.0.0', ran: true, emitted: 1 },
      { ruleId: 'mf.perf.recent-reversal', version: '1.0.0', ran: true, emitted: 0 },
    ],
    missingCategories: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The `06 §6` states, one export each
// ---------------------------------------------------------------------------

export interface AnalysisFixture {
  run: MfAnalysisRunDto | null;
  findings: MfFinding[];
  verdict: MfFundVerdictDto | null;
}

/** Everything present and verified — the baseline the others deviate from. */
export const verifiedProseFixture = (): AnalysisFixture => ({
  run: makeRun(),
  findings: [makeFinding(), makeStructuralFinding()],
  verdict: makeVerdict(),
});

/**
 * The narration failed numeric verification, so the server withheld it. The
 * page shows headlines and says nothing about the failure — `06 §6`: "show
 * headlines; no prose; no error to the user".
 */
export const unverifiedProseFixture = (): AnalysisFixture => ({
  run: makeRun(),
  findings: [makeFinding()],
  verdict: makeVerdict({ proseVerified: false, prose: null, proseModel: null }),
});

/** A rule errored: the banner must name the category it would have covered. */
export const partialRunFixture = (): AnalysisFixture => ({
  run: makeRun({
    status: 'PARTIAL',
    missingCategories: ['COST'],
    ruleVersionsSnapshot: [
      { ruleId: 'mf.risk.high-down-capture', version: '1.0.0', ran: true, emitted: 1 },
      {
        ruleId: 'mf.cost.high-ter',
        version: '1.0.0',
        ran: true,
        emitted: 0,
        error: "[120503] Cannot read properties of undefined (reading 'terPct')",
      },
    ],
  }),
  findings: [makeFinding()],
  verdict: makeVerdict(),
});

/**
 * A rule was deleted after the run that recorded its failure, so the server
 * could resolve no category for it. The banner must still name what failed —
 * "some checks failed" with nothing after it is the silent omission the banner
 * exists to prevent.
 */
export const partialRunUnmappedFixture = (): AnalysisFixture => ({
  run: makeRun({
    status: 'PARTIAL',
    missingCategories: [],
    ruleVersionsSnapshot: [
      {
        ruleId: 'mf.retired.some-old-rule',
        version: '0.9.0',
        ran: true,
        emitted: 0,
        error: 'boom',
      },
    ],
  }),
  findings: [makeFinding()],
  verdict: makeVerdict(),
});

/**
 * `RIA_VERDICTS_ENABLED = false` against a stored `SWITCH_CANDIDATE`: the API
 * has downgraded it to `REVIEW`, stripped the replacement, and flagged it. The
 * switch cost survives — what it would cost to leave a fund you own is a fact
 * about your own lots, not a recommendation.
 */
export const gatedVerdictFixture = (): AnalysisFixture => ({
  run: makeRun(),
  findings: [makeFinding()],
  verdict: makeVerdict({
    verdict: 'REVIEW',
    advisoryGated: true,
    reasons: ['PERSISTENT_UNDERPERFORMANCE', 'HIGH_DOWN_CAPTURE'],
    suggestedReplacementSchemeCode: null,
    suggestedReplacementName: null,
    switchCost: {
      exitLoadInr: m('0.0000'),
      taxInr: m('1482.5000'),
      // Null: the expected edge of a replacement cannot be estimated until the
      // backtest coefficient lands, and a zero here would read as "switching
      // pays for itself immediately".
      breakEvenMonths: null,
    },
  }),
});

/** The same row with the gate open, for the inverse assertion. */
export const ungatedSwitchFixture = (): AnalysisFixture => ({
  run: makeRun(),
  findings: [makeFinding()],
  verdict: makeVerdict({
    verdict: 'SWITCH_CANDIDATE',
    advisoryGated: false,
    reasons: ['PERSISTENT_UNDERPERFORMANCE', 'HIGH_DOWN_CAPTURE'],
    suggestedReplacementSchemeCode: '119551',
    suggestedReplacementName: 'Testwell Large Cap Fund - Direct Growth',
    switchCost: {
      exitLoadInr: m('0.0000'),
      taxInr: m('1482.5000'),
      breakEvenMonths: r('14.300000'),
    },
  }),
});

/** The run examined this fund and no rule fired. NOT a clean bill of health. */
export const noFindingsFixture = (): AnalysisFixture => ({
  run: makeRun({ findings: [] }),
  findings: [],
  verdict: makeVerdict({ verdict: 'HOLD', reasons: [], prose: null, proseVerified: false }),
});

/** No analysis has ever run for this user. */
export const noRunFixture = (): AnalysisFixture => ({
  run: null,
  findings: [],
  verdict: null,
});
