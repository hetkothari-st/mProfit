/**
 * The verdict decision table (`docs/mf-analytics/05-FINDINGS-ENGINE.md §5`,
 * `§8` item 3).
 *
 * `mfVerdict.ts` is a pure function of (findings, facts), so this file needs no
 * database and no `scope.runAs` — it builds facts with the shared rule-test
 * fixture and bends one field at a time.
 *
 * Three things are under test, in descending order of how badly a regression
 * would hurt:
 *
 *  1. **Order sensitivity.** The six rows are first-match-wins, and a fund can
 *     satisfy several at once. A fund satisfying rows 3 and 4 must get row 3:
 *     "here is what to switch to" and "this needs a look" are materially
 *     different things to tell someone, and an unordered implementation would
 *     silently pick whichever branch was written first.
 *  2. **Row 3 cannot fire while `REPLACEMENT_EXPECTED_EDGE` is null.** The
 *     entire `SWITCH_CANDIDATE`-by-projection path is gated on a break-even
 *     that divides by a coefficient the backtest (`06 §3`, Task 2.7) has not
 *     produced. Asserted twice: that it does not fire today, and — with the
 *     constant module mocked to supply an edge — that the row is nonetheless
 *     complete and starts working the moment the coefficient lands.
 *  3. **`REGULAR_PLAN_COST` never drives `SWITCH_CANDIDATE`.** It is a switch
 *     to the *same fund's* direct plan, at no exit load and usually no tax
 *     event, and letting it corroborate a recommendation to leave the fund
 *     entirely would be the wrong remedy attached to the right observation.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type {
  MfFinding,
  MfFindingCategory,
  MfFindingSeverity,
  MfSchemeMetaDto,
} from '@portfolioos/shared';
import { serializeMoney, serializePct, serializeRatio } from '@portfolioos/shared';

import {
  CRITICAL_ELIGIBLE_CODES,
  REPLACEMENT_EDGE_AVAILABLE,
  computeSwitchCost,
  decideVerdict,
  decideVerdicts,
  findReplacement,
} from '../../../src/services/mfAnalytics/mfVerdict.js';
import { REPLACEMENT_EXPECTED_EDGE } from '../../../src/services/mfAnalytics/constants.js';
import { makeFinding, type MfAnalysisFacts } from '../../../src/services/mfAnalytics/types.js';
import type { AdvisorApprovedProductFacts } from '../../../src/services/mfAnalytics/types.js';
import {
  SCHEME,
  factsForFund,
  makeFacts,
  makeFundFacts,
  makeLot,
  makeScore,
  type FundFactsOptions,
} from './rules/_facts.fixture.js';

// ---------------------------------------------------------------------------
// Local builders
// ---------------------------------------------------------------------------

/**
 * A finding with the given code and severity, built through `makeFinding` so
 * the fixtures obey the same invariants production findings do (non-empty
 * counterfactual, non-empty evidence, headline length, confidence in [0,1]).
 * A test that hand-rolled the object could assert a verdict for a finding the
 * engine would have refused to construct.
 */
function finding(
  facts: MfAnalysisFacts,
  code: string,
  severity: MfFindingSeverity,
  opts: { schemeCode?: string | null; category?: MfFindingCategory } = {},
): MfFinding {
  return makeFinding(facts, {
    ruleId: `mf.test.${code.toLowerCase()}`,
    ruleVersion: '1.0.0',
    schemeCode: opts.schemeCode === undefined ? SCHEME : opts.schemeCode,
    code,
    category: opts.category ?? 'PERFORMANCE',
    severity,
    confidence: serializeRatio('0.800000'),
    headline: `${code} fired`,
    evidence: [{ metric: 'test.metric', label: 'Test', value: serializeRatio('1'), unit: 'ratio' }],
    whatWouldChangeThis: `Would clear when ${code} no longer holds.`,
  });
}

/** An adviser-approved replacement candidate. Defaults to exactly the shape
 *  `05 §5` row 3 looks for: same sub-category as the fixture fund, 5 stars. */
function approved(
  overrides: Partial<AdvisorApprovedProductFacts> = {},
): AdvisorApprovedProductFacts {
  return {
    approvedProductId: 'appr-1',
    bucket: 'EQUITY_DOMESTIC',
    rank: 1,
    label: 'Replacement Large Cap Fund',
    fundId: 'fund-appr-1',
    schemeCode: 'REPLACEMENT_1',
    schemeName: 'Replacement Large Cap Fund - Direct - Growth',
    sebiSubCategory: 'Large Cap Fund',
    planType: 'DIRECT',
    rating: 5,
    composite: serializeRatio('88.000000'),
    terPct: serializePct('0.550000'),
    ...overrides,
  };
}

/** Facts for one fund with a given rating, plus optional approved universe. */
function factsRated(
  rating: 1 | 2 | 3 | 4 | 5 | null,
  opts: { approvedUniverse?: AdvisorApprovedProductFacts[]; fund?: FundFactsOptions } = {},
) {
  return factsForFund(
    { ...(opts.fund ?? {}), score: makeScore({ rating }) },
    opts.approvedUniverse === undefined ? {} : { approvedUniverse: opts.approvedUniverse },
  );
}

// ---------------------------------------------------------------------------
// Row 1 — INSUFFICIENT_DATA
// ---------------------------------------------------------------------------

describe('row 1 — not rated', () => {
  it('returns INSUFFICIENT_DATA when the score is not RATED', () => {
    const { facts, schemeCode } = factsForFund({
      score: makeScore({ ratingStatus: 'INSUFFICIENT_HISTORY', composite: null, rating: null }),
    });

    const decision = decideVerdict(facts, schemeCode, []);

    expect(decision.verdict).toBe('INSUFFICIENT_DATA');
    expect(decision.matchedRow).toBe(1);
    expect(decision.suggestedReplacementSchemeCode).toBeNull();
    expect(decision.switchCost).toBeNull();
  });

  it('returns INSUFFICIENT_DATA when there is no score at all', () => {
    const { facts, schemeCode } = factsForFund({ score: null });
    expect(decideVerdict(facts, schemeCode, []).verdict).toBe('INSUFFICIENT_DATA');
  });

  it('cites INSUFFICIENT_HISTORY when the rule emitted it, so chip and finding agree', () => {
    const { facts, schemeCode } = factsForFund({
      score: makeScore({ ratingStatus: 'INSUFFICIENT_HISTORY', composite: null, rating: null }),
    });
    const findings = [finding(facts, 'INSUFFICIENT_HISTORY', 'INFO', { category: 'DATA' })];

    expect(decideVerdict(facts, schemeCode, findings).reasons).toEqual(['INSUFFICIENT_HISTORY']);
  });

  it('yields to row 2: an unrated fund with a CRITICAL finding is not "no data"', () => {
    // We know plenty about this fund. `05 §5` row 1 carries "and no CRITICAL
    // finding" for exactly this case, and dropping the clause would report a
    // regulatory action against a young fund as "we cannot say".
    const { facts, schemeCode } = factsForFund({
      score: makeScore({ ratingStatus: 'INSUFFICIENT_HISTORY', composite: null, rating: null }),
    });
    const findings = [finding(facts, 'AMC_REGULATORY_ACTION', 'CRITICAL', { category: 'PEOPLE' })];

    const decision = decideVerdict(facts, schemeCode, findings);
    expect(decision.matchedRow).toBe(2);
    expect(decision.verdict).toBe('REVIEW'); // no approved replacement in these facts
  });
});

// ---------------------------------------------------------------------------
// Row 2 — CRITICAL
// ---------------------------------------------------------------------------

describe('row 2 — a CRITICAL finding', () => {
  it('is SWITCH_CANDIDATE when a replacement exists, and carries the switch cost', () => {
    const { facts, schemeCode } = factsRated(3, {
      approvedUniverse: [approved()],
      fund: { held: { lots: [makeLot({ exitLoadInr: serializeMoney('500') })] } },
    });
    const findings = [finding(facts, 'LOW_CREDIT_QUALITY', 'CRITICAL', { category: 'DEBT' })];

    const decision = decideVerdict(facts, schemeCode, findings);

    expect(decision.matchedRow).toBe(2);
    expect(decision.verdict).toBe('SWITCH_CANDIDATE');
    expect(decision.suggestedReplacementSchemeCode).toBe('REPLACEMENT_1');
    expect(decision.reasons).toEqual(['LOW_CREDIT_QUALITY']);
    // Row 2 does not consult break-even, but the cost of leaving is still a
    // real number the user is entitled to see before acting.
    expect(decision.switchCost).not.toBeNull();
    expect(decision.switchCost!.exitLoadInr).toBe(serializeMoney('500'));
    expect(decision.switchCost!.taxInr).toBe(serializeMoney('15000'));
  });

  it('degrades to REVIEW when nothing on the approved list fits', () => {
    const { facts, schemeCode } = factsRated(3);
    const findings = [finding(facts, 'AMC_REGULATORY_ACTION', 'CRITICAL', { category: 'PEOPLE' })];

    const decision = decideVerdict(facts, schemeCode, findings);
    expect(decision.matchedRow).toBe(2);
    expect(decision.verdict).toBe('REVIEW');
    expect(decision.suggestedReplacementSchemeCode).toBeNull();
  });

  it('escalates on severity, not on a code allow-list', () => {
    // The reserved codes are documentation (`05 §5`); the trigger is CRITICAL.
    // A future rule that legitimately reaches CRITICAL must escalate without
    // also being added to a list, because the alternative is a CRITICAL
    // finding the conclusion silently ignores.
    const { facts, schemeCode } = factsRated(5);
    const findings = [finding(facts, 'SOME_FUTURE_CODE', 'CRITICAL')];

    expect(decideVerdict(facts, schemeCode, findings).matchedRow).toBe(2);
    expect(CRITICAL_ELIGIBLE_CODES).toContain('AMC_REGULATORY_ACTION');
    expect(CRITICAL_ELIGIBLE_CODES).toContain('LOW_CREDIT_QUALITY');
  });
});

// ---------------------------------------------------------------------------
// Row 3 — the projected switch, which cannot fire yet
// ---------------------------------------------------------------------------

/**
 * Facts that satisfy every clause of row 3 **and** every clause of row 4:
 * rating 2 (row 4's "rating <= 2"), `PERSISTENT_UNDERPERFORMANCE` plus a second
 * warning (row 4's ">= 2 WARNING"), and a 5-star approved replacement in the
 * same sub-category. The only thing that separates the two rows is the
 * break-even gate.
 */
function rows3and4() {
  const { facts, schemeCode } = factsRated(2, {
    approvedUniverse: [approved()],
    fund: {
      held: {
        currentValue: serializeMoney('520000'),
        lots: [
          makeLot({
            exitLoadInr: serializeMoney('0'),
            taxIfSoldTodayInr: serializeMoney('1000'),
          }),
        ],
      },
    },
  });
  const findings = [
    finding(facts, 'PERSISTENT_UNDERPERFORMANCE', 'WARNING'),
    finding(facts, 'HIGH_DOWN_CAPTURE', 'WARNING', { category: 'RISK' }),
  ];
  return { facts, schemeCode, findings };
}

describe('row 3 — blocked while the backtest coefficient is missing', () => {
  it('REPLACEMENT_EXPECTED_EDGE is null, so there is no measured edge to project', () => {
    // The premise of everything below. If this ever fails, Task 2.7 landed and
    // the expectations in this describe block need revisiting rather than
    // patching.
    expect(REPLACEMENT_EXPECTED_EDGE).toBeNull();
    expect(REPLACEMENT_EDGE_AVAILABLE).toBe(false);
  });

  it('leaves breakEvenMonths null even with a fully known switch cost', () => {
    const { facts, schemeCode } = rows3and4();
    const cost = computeSwitchCost(facts.funds[schemeCode]!);

    // Both components are known and finite …
    expect(cost.exitLoadInr).toBe(serializeMoney('0'));
    expect(cost.taxInr).toBe(serializeMoney('1000'));
    // … and the break-even is still null, because the denominator does not
    // exist. Null is "unknown", never "fine".
    expect(cost.breakEvenMonths).toBeNull();
  });

  it('falls through to row 4 (REVIEW) instead of naming a replacement', () => {
    const { facts, schemeCode, findings } = rows3and4();
    const decision = decideVerdict(facts, schemeCode, findings);

    expect(decision.matchedRow).toBe(4);
    expect(decision.verdict).toBe('REVIEW');
    // The honest outcome: "this needs your attention" without "and here is
    // what to buy instead".
    expect(decision.suggestedReplacementSchemeCode).toBeNull();
    expect(decision.switchCost).toBeNull();
    expect(decision.reasons).toEqual(['PERSISTENT_UNDERPERFORMANCE', 'HIGH_DOWN_CAPTURE']);
  });

  it('is not rescued by a replacement being available and obviously better', () => {
    const { facts, schemeCode, findings } = rows3and4();
    // The candidate is genuinely eligible — the block is the projection, not
    // the candidate.
    expect(findReplacement(facts, schemeCode)?.schemeCode).toBe('REPLACEMENT_1');
    expect(decideVerdict(facts, schemeCode, findings).verdict).not.toBe('SWITCH_CANDIDATE');
  });
});

// ---------------------------------------------------------------------------
// Row 3 — with the coefficient supplied, which is how it will behave
// ---------------------------------------------------------------------------

/**
 * The other half of the row-3 guarantee: the row is *implemented*, not merely
 * unreachable. `constants.ts` is re-mocked with a measured edge and
 * `mfVerdict.ts` re-imported against it, which is the exact change Task 2.7
 * will make to production. Nothing else in the module moves.
 *
 * `vi.doMock` (not `vi.mock`) plus `vi.resetModules` keeps the mock scoped to
 * these dynamic imports, so the tests above still exercise the real constant.
 */
async function verdictWithEdge(edge: string) {
  vi.resetModules();
  vi.doMock('../../../src/services/mfAnalytics/constants.js', async () => {
    const actual = await vi.importActual<
      typeof import('../../../src/services/mfAnalytics/constants.js')
    >('../../../src/services/mfAnalytics/constants.js');
    return { ...actual, REPLACEMENT_EXPECTED_EDGE: edge };
  });
  return import('../../../src/services/mfAnalytics/mfVerdict.js');
}

describe('row 3 — once the backtest coefficient exists', () => {
  afterEach(() => {
    vi.doUnmock('../../../src/services/mfAnalytics/constants.js');
    vi.resetModules();
  });

  it('fires, and beats row 4 — order sensitivity, the point of the table', async () => {
    // A 3% projected annual edge on ₹520,000 is ₹1,300/month; a ₹1,000 switch
    // cost breaks even in well under a month, comfortably inside the 24-month
    // ceiling.
    const mod = await verdictWithEdge('0.03');
    const { facts, schemeCode, findings } = rows3and4();

    const decision = mod.decideVerdict(facts, schemeCode, findings);

    // These facts satisfy row 4 in full as well. First match wins, and row 3
    // is first: the more specific, more useful conclusion beats the catch-all.
    expect(decision.matchedRow).toBe(3);
    expect(decision.verdict).toBe('SWITCH_CANDIDATE');
    expect(decision.suggestedReplacementSchemeCode).toBe('REPLACEMENT_1');
    expect(decision.switchCost?.breakEvenMonths).not.toBeNull();
  });

  it('still refuses when the break-even is beyond 24 months', async () => {
    // A 0.05% edge on ₹520,000 is ~₹21.67/month against a ₹1,000 cost — about
    // 46 months. The projection has to hold for longer than most people hold
    // the fund, so the recommendation is really a bet on the projection.
    const mod = await verdictWithEdge('0.0005');
    const { facts, schemeCode, findings } = rows3and4();

    const decision = mod.decideVerdict(facts, schemeCode, findings);
    expect(decision.matchedRow).toBe(4);
    expect(decision.verdict).toBe('REVIEW');
  });

  it('refuses when a lot carries no exit-load figure — a floor is not a cost', async () => {
    const mod = await verdictWithEdge('0.03');
    const { facts, schemeCode } = factsRated(2, {
      approvedUniverse: [approved()],
      fund: {
        // `exitLoadInr: null` on `makeLot` means "we do not know", not zero.
        held: { lots: [makeLot(), makeLot({ exitLoadInr: serializeMoney('250') })] },
      },
    });
    const findings = [
      finding(facts, 'PERSISTENT_UNDERPERFORMANCE', 'WARNING'),
      finding(facts, 'HIGH_DOWN_CAPTURE', 'WARNING', { category: 'RISK' }),
    ];

    expect(mod.computeSwitchCost(facts.funds[schemeCode]!).breakEvenMonths).toBeNull();
    expect(mod.decideVerdict(facts, schemeCode, findings).verdict).toBe('REVIEW');
  });

  it('REGULAR_PLAN_COST cannot be the corroborating warning', async () => {
    // `05 §5`: it "never drives SWITCH_CANDIDATE on its own". The remedy it
    // points at is the same fund's direct plan — no exit load, usually no tax
    // event — so it must not be half the evidence for leaving the fund.
    const mod = await verdictWithEdge('0.03');
    const { facts, schemeCode } = factsRated(2, {
      approvedUniverse: [approved()],
      fund: { held: { lots: [makeLot({ exitLoadInr: serializeMoney('0') })] } },
    });
    const findings = [
      finding(facts, 'PERSISTENT_UNDERPERFORMANCE', 'WARNING'),
      finding(facts, 'REGULAR_PLAN_COST', 'WARNING', { category: 'COST' }),
    ];

    const decision = mod.decideVerdict(facts, schemeCode, findings);
    expect(decision.verdict).toBe('REVIEW');
    expect(decision.matchedRow).toBe(4);
    expect(decision.suggestedReplacementSchemeCode).toBeNull();
  });

  it('REGULAR_PLAN_COST still counts toward REVIEW and MONITOR', async () => {
    // Excluded from row 3's corroboration, not from the table. A user with
    // money on the table deserves to be told.
    const mod = await verdictWithEdge('0.03');
    const { facts, schemeCode } = factsRated(5);
    const findings = [finding(facts, 'REGULAR_PLAN_COST', 'WARNING', { category: 'COST' })];

    const decision = mod.decideVerdict(facts, schemeCode, findings);
    expect(decision.verdict).toBe('MONITOR');
    expect(decision.reasons).toEqual(['REGULAR_PLAN_COST']);
  });
});

// ---------------------------------------------------------------------------
// Rows 4, 5, 6
// ---------------------------------------------------------------------------

describe('row 4 — REVIEW', () => {
  it('fires on a weak rating alone, with an empty reasons list', () => {
    const { facts, schemeCode } = factsRated(2);
    const decision = decideVerdict(facts, schemeCode, []);

    expect(decision.matchedRow).toBe(4);
    expect(decision.verdict).toBe('REVIEW');
    // The rating lives on the score, not in the findings. Inventing a
    // `LOW_RATING` token here would put something in `reasons` that links back
    // to no evidence at all.
    expect(decision.reasons).toEqual([]);
  });

  it('fires on two warnings even when the rating is excellent', () => {
    const { facts, schemeCode } = factsRated(5);
    const findings = [
      finding(facts, 'HIGH_DOWN_CAPTURE', 'WARNING', { category: 'RISK' }),
      finding(facts, 'STYLE_DRIFT', 'WARNING', { category: 'PORTFOLIO' }),
    ];

    const decision = decideVerdict(facts, schemeCode, findings);
    expect(decision.matchedRow).toBe(4);
    expect(decision.reasons).toEqual(['HIGH_DOWN_CAPTURE', 'STYLE_DRIFT']);
  });
});

describe('row 5 — MONITOR', () => {
  it('fires on a middling rating', () => {
    const { facts, schemeCode } = factsRated(3);
    const decision = decideVerdict(facts, schemeCode, []);
    expect(decision.matchedRow).toBe(5);
    expect(decision.verdict).toBe('MONITOR');
  });

  it('fires on exactly one warning', () => {
    const { facts, schemeCode } = factsRated(5);
    const findings = [finding(facts, 'HIGH_DOWN_CAPTURE', 'WARNING', { category: 'RISK' })];
    expect(decideVerdict(facts, schemeCode, findings).matchedRow).toBe(5);
  });

  it('fires on MANAGER_CHANGE / RECENT_REVERSAL with no warnings at all', () => {
    const { facts, schemeCode } = factsRated(5);
    const findings = [
      finding(facts, 'MANAGER_CHANGE', 'NOTICE', { category: 'PEOPLE' }),
      finding(facts, 'RECENT_REVERSAL', 'NOTICE'),
    ];

    const decision = decideVerdict(facts, schemeCode, findings);
    expect(decision.matchedRow).toBe(5);
    expect(decision.reasons).toEqual(['MANAGER_CHANGE', 'RECENT_REVERSAL']);
  });

  it('yields to row 4 when the rating is weak', () => {
    const { facts, schemeCode } = factsRated(2);
    const findings = [finding(facts, 'MANAGER_CHANGE', 'NOTICE', { category: 'PEOPLE' })];
    expect(decideVerdict(facts, schemeCode, findings).matchedRow).toBe(4);
  });
});

describe('row 6 — HOLD', () => {
  it('is the fallthrough: rated well, nothing to say', () => {
    const { facts, schemeCode } = factsRated(4);
    const findings = [finding(facts, 'EXIT_LOAD_ACTIVE', 'INFO', { category: 'USER' })];

    const decision = decideVerdict(facts, schemeCode, findings);
    expect(decision.matchedRow).toBe(6);
    expect(decision.verdict).toBe('HOLD');
    expect(decision.reasons).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Replacement selection
// ---------------------------------------------------------------------------

describe('findReplacement', () => {
  it('rejects a candidate below the minimum rating', () => {
    // A 3-star replacement for a 2-star fund is churn dressed as advice: the
    // costs are real and the improvement is inside the rating's own noise.
    const { facts, schemeCode } = factsRated(2, { approvedUniverse: [approved({ rating: 3 })] });
    expect(findReplacement(facts, schemeCode)).toBeNull();
  });

  it('rejects an unrated candidate rather than assuming a 3', () => {
    const { facts, schemeCode } = factsRated(2, {
      approvedUniverse: [approved({ rating: null, composite: null })],
    });
    expect(findReplacement(facts, schemeCode)).toBeNull();
  });

  it('rejects a candidate in a different sub-category', () => {
    const { facts, schemeCode } = factsRated(2, {
      approvedUniverse: [approved({ sebiSubCategory: 'Mid Cap Fund' })],
    });
    expect(findReplacement(facts, schemeCode)).toBeNull();
  });

  it('never matches UNMAPPED on either side — "same" is unknowable, not true', () => {
    const unmapped: Partial<MfSchemeMetaDto> = { sebiSubCategory: 'UNMAPPED' };
    const a = factsRated(2, {
      approvedUniverse: [approved({ sebiSubCategory: 'UNMAPPED' })],
      fund: { meta: unmapped },
    });
    expect(findReplacement(a.facts, a.schemeCode)).toBeNull();

    const b = factsRated(2, { approvedUniverse: [approved({ sebiSubCategory: 'UNMAPPED' })] });
    expect(findReplacement(b.facts, b.schemeCode)).toBeNull();
  });

  it('rejects the fund itself', () => {
    const { facts, schemeCode } = factsRated(2, {
      approvedUniverse: [approved({ schemeCode: SCHEME })],
    });
    expect(findReplacement(facts, schemeCode)).toBeNull();
  });

  it("honours the adviser's own rank before its own opinion of the rating", () => {
    const { facts, schemeCode } = factsRated(2, {
      approvedUniverse: [
        approved({ approvedProductId: 'b', schemeCode: 'CAND_B', rank: 2, rating: 5 }),
        approved({ approvedProductId: 'a', schemeCode: 'CAND_A', rank: 1, rating: 4 }),
      ],
    });
    expect(findReplacement(facts, schemeCode)?.schemeCode).toBe('CAND_A');
  });
});

// ---------------------------------------------------------------------------
// decideVerdicts — partitioning
// ---------------------------------------------------------------------------

describe('decideVerdicts', () => {
  it('never lets a portfolio-level finding drive a fund verdict', () => {
    // One household-level observation must not become twelve fund-level
    // accusations.
    const { facts, schemeCode } = factsRated(5);
    const findings = [
      finding(facts, 'ALLOCATION_DRIFT', 'WARNING', {
        schemeCode: null,
        category: 'ALLOCATION',
      }),
      finding(facts, 'REDUNDANT_FUNDS', 'WARNING', { schemeCode: null, category: 'PORTFOLIO' }),
    ];

    const [decision] = decideVerdicts(facts, findings);
    expect(decision?.schemeCode).toBe(schemeCode);
    expect(decision?.verdict).toBe('HOLD');
    expect(decision?.reasons).toEqual([]);
  });

  it('decides one verdict per held fund, in a deterministic order', () => {
    const facts = makeFacts({
      funds: {
        ZZZ: makeFundFacts({ meta: { schemeCode: 'ZZZ' }, score: makeScore({ rating: 5 }) }),
        AAA: makeFundFacts({ meta: { schemeCode: 'AAA' }, score: makeScore({ rating: 2 }) }),
      },
    });

    const decisions = decideVerdicts(facts, []);
    expect(decisions.map((d) => d.schemeCode)).toEqual(['AAA', 'ZZZ']);
    expect(decisions.map((d) => d.verdict)).toEqual(['REVIEW', 'HOLD']);
  });

  it('throws rather than guessing when asked about a scheme it has no facts for', () => {
    const { facts } = factsRated(3);
    expect(() => decideVerdict(facts, 'NOT_HELD', [])).toThrow(/no facts for scheme/);
  });
});
