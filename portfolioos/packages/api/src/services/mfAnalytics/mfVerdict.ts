/**
 * The verdict decision table (`docs/mf-analytics/05-FINDINGS-ENGINE.md §5`).
 *
 * One fund in, one of five verdicts out. This module is a **pure function of
 * (findings, facts)** — no clock, no database, no randomness — for the same
 * reason `MfRule.evaluate` is: the verdict is the single conclusion in this
 * layer that is regulated advice (`06 §4`), and advice that cannot be
 * reproduced from its stored inputs cannot be defended to the person who acted
 * on it or to the regulator who asks why.
 *
 * ---------------------------------------------------------------------------
 * Order is the whole design
 * ---------------------------------------------------------------------------
 *
 * `05 §5`'s six rows are evaluated **in order, first match wins**. That is not
 * an implementation detail to be optimised away into a score: a fund can
 * satisfy rows 3 and 4 simultaneously (a 2-star fund with persistent
 * underperformance and a second warning satisfies both "row 3" and row 4's
 * "rating <= 2 or >= 2 WARNING"), and the two rows say materially different
 * things to the user — "move to this specific fund" versus "look at this". The
 * ordering is what makes the stronger, more specific conclusion win over the
 * weaker catch-all. `mfVerdict.test.ts` pins that case explicitly.
 *
 * ---------------------------------------------------------------------------
 * Row 3 cannot fire today, on purpose
 * ---------------------------------------------------------------------------
 *
 * Row 3 is the only route to `SWITCH_CANDIDATE` that rests on a *projection*
 * rather than on an observed fact, and its gate is
 * `switchCost.breakEvenMonths <= 24`. `breakEvenMonths` divides by
 * `REPLACEMENT_EXPECTED_EDGE`, which `constants.ts` sets to `null` because the
 * backtest regression coefficient it is defined in terms of (`06 §3`, Task
 * 2.7) has not been run. See `computeSwitchCost` below: a null edge yields a
 * null `breakEvenMonths`, null is not `<= 24`, row 3 does not match, and the
 * fund falls through to row 4 (`REVIEW`).
 *
 * That is the correct and honest outcome — "this needs your attention" without
 * "and here is what to buy instead". Row 3 is nonetheless implemented in full
 * so it starts working the day the coefficient lands, rather than being
 * reconstructed from memory by whoever ships Task 2.7.
 *
 * Row 2's `SWITCH_CANDIDATE` does not go through break-even at all — a
 * regulator acting against the AMC or a debt book stuffed with below-IG paper
 * is an observed fact, not a forecast — and is unaffected.
 */

import { serializeMoney, serializeRatio, toDecimal } from '@portfolioos/shared';
import type {
  MfFinding,
  MfFindingSeverity,
  MfLotDto,
  MfSwitchCost,
  MfVerdictKind,
  SebiSubCategory,
} from '@portfolioos/shared';
import {
  REPLACEMENT_EXPECTED_EDGE,
  VERDICT_MAX_BREAK_EVEN_MONTHS,
  VERDICT_MAX_RATING_FOR_REVIEW,
  VERDICT_MIN_REPLACEMENT_RATING,
} from './constants.js';
import type { AdvisorApprovedProductFacts, MfAnalysisFacts, MfFundFacts } from './types.js';

// ---------------------------------------------------------------------------
// Finding codes the table reasons about by name
// ---------------------------------------------------------------------------

/**
 * The codes below are matched **by value** against what a rule stamps on its
 * finding. A typo here does not fail a build and does not fail a rule test —
 * it silently removes a row's trigger, which is the failure mode
 * `people.amc-action.ts` warns about in its own header. They are collected in
 * one block so a rename shows up as one diff.
 */
const CODE_PERSISTENT_UNDERPERFORMANCE = 'PERSISTENT_UNDERPERFORMANCE';
const CODE_INSUFFICIENT_HISTORY = 'INSUFFICIENT_HISTORY';
const CODE_MANAGER_CHANGE = 'MANAGER_CHANGE';
const CODE_RECENT_REVERSAL = 'RECENT_REVERSAL';

/**
 * `REGULAR_PLAN_COST` is a WARNING and it is deliberately **not** allowed to
 * corroborate row 3.
 *
 * `05 §5`: it "never drives `SWITCH_CANDIDATE` on its own — it is a
 * plan-switch within the same fund and gets its own action type
 * (`SWITCH_TO_DIRECT`) surfaced from the finding, not the verdict."
 *
 * The strict reading matters. Row 3 needs `PERSISTENT_UNDERPERFORMANCE` plus
 * "≥ 1 more WARNING"; if `REGULAR_PLAN_COST` could be that second warning,
 * then "you are in the regular plan" would be half the evidence for telling
 * someone to sell their fund and buy a different AMC's — when the remedy it
 * actually points at is switching to the same fund's direct plan, at no exit
 * load and usually no tax event. Excluding it from the corroboration count
 * makes the two remedies structurally impossible to confuse.
 *
 * It still counts toward rows 4 and 5. A fund whose only warning is that it is
 * the expensive plan of itself genuinely does deserve a `MONITOR` — the user
 * has money on the table — it just does not deserve a replacement.
 */
const CODE_REGULAR_PLAN_COST = 'REGULAR_PLAN_COST';

/**
 * The codes `05 §5` row 2 reserves CRITICAL for.
 *
 * Exported as documentation and asserted by the tests, **not** used as a
 * filter. Row 2's condition is "any CRITICAL finding": the severity is the
 * contract, and a future rule that legitimately reaches CRITICAL must escalate
 * the verdict without also having to be added to a list here. Screening by
 * code would mean a CRITICAL finding could exist and be silently ignored by
 * the conclusion drawn from it, which is worse than a surprising escalation.
 *
 * Note for the reader of a live database: no rule emits CRITICAL today
 * (`people.amc-action` and `debt.credit-quality` both emit WARNING, pending
 * the "fund-specific impact" and "below-IG > 10%" escalations `05 §5`
 * describes). Row 2 is therefore dormant in production, and that is a property
 * of the rules, not of this table.
 */
export const CRITICAL_ELIGIBLE_CODES: readonly string[] = Object.freeze([
  'AMC_REGULATORY_ACTION',
  'LOW_CREDIT_QUALITY',
]);

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

/** Which row of `05 §5` matched. Diagnostic — never persisted, but the thing
 *  a test asserts when it wants to prove *why* a verdict came out. */
export type MfVerdictRow = 1 | 2 | 3 | 4 | 5 | 6;

export interface MfVerdictDecision {
  schemeCode: string;
  verdict: MfVerdictKind;
  /**
   * The finding codes that drove this verdict, deduped, in the order the
   * findings were presented. Strictly finding codes: the schema comment on
   * `MfFundVerdict.reasons` calls this "the audit link from conclusion back to
   * evidence", and a synthetic token like `LOW_RATING` would link to nothing.
   *
   * Consequence, accepted deliberately: a fund driven to `REVIEW` by its
   * rating alone, with no finding attached, carries an **empty** reasons list.
   * That is honest — the rating is on the fund's score, not in the findings —
   * and it is also what makes the supersede comparison stable, since a rating
   * that drifts 2 -> 1 without changing the verdict is not new advice.
   */
  reasons: string[];
  /** Only ever non-null for `SWITCH_CANDIDATE` (`05 §1`). */
  suggestedReplacementSchemeCode: string | null;
  suggestedReplacementName: string | null;
  /** Only ever non-null for `SWITCH_CANDIDATE`. */
  switchCost: MfSwitchCost | null;
  matchedRow: MfVerdictRow;
}

// ---------------------------------------------------------------------------
// Severity buckets
// ---------------------------------------------------------------------------

/**
 * Distinct codes at one severity, in first-seen order.
 *
 * Deduped by **code** rather than counted as findings because two findings
 * sharing a code cannot exist for one scheme — `makeFinding` derives the id
 * from `(ruleId, schemeCode, code)` — and because rows 4 and 5 hinge on "how
 * many *different things* are wrong", not on how many rows a rule wrote.
 */
function codesAtSeverity(findings: readonly MfFinding[], severity: MfFindingSeverity): string[] {
  const out: string[] = [];
  for (const f of findings) {
    if (f.severity === severity && !out.includes(f.code)) out.push(f.code);
  }
  return out;
}

function hasCode(findings: readonly MfFinding[], code: string): boolean {
  return findings.some((f) => f.code === code);
}

// ---------------------------------------------------------------------------
// Replacement selection (`05 §5` rows 2 and 3)
// ---------------------------------------------------------------------------

/**
 * The best adviser-approved replacement for one fund, or null.
 *
 * Three filters, each of which is a refusal rather than a preference:
 *
 *  - **Same SEBI sub-category.** A replacement that changes the category
 *    changes the user's asset allocation, which is a different decision made
 *    for different reasons and belongs to the advisor engine's `REBALANCE`
 *    rule. `'UNMAPPED'` never matches — on either side — because an unmapped
 *    scheme has no known category and "same" is unknowable, not true.
 *  - **Rated, at or above `VERDICT_MIN_REPLACEMENT_RATING`.** An unrated
 *    candidate is never defaulted to a 3 (see `AdvisorApprovedProductFacts
 *    .rating`); no rating means no evidence, and no evidence means we do not
 *    name it.
 *  - **Not the fund itself.** The approved list legitimately contains funds
 *    the user already holds; "switch into what you already own" is not advice.
 *
 * The candidate comes from `facts.approvedUniverse`, which
 * `mfFacts.builder.ts` denormalised precisely so this function stays pure —
 * a lookup here is a database call inside a decision procedure that has to be
 * replayable from a snapshot.
 *
 * Ordering: the adviser's own `rank` first (it is their preference list, and
 * overriding it silently would be this engine substituting its judgement for
 * theirs), then rating descending, then scheme code, so the choice is
 * deterministic across runs over identical facts.
 */
export function findReplacement(
  facts: MfAnalysisFacts,
  schemeCode: string,
): AdvisorApprovedProductFacts | null {
  const fund = facts.funds[schemeCode];
  if (fund === undefined) return null;

  const target: SebiSubCategory | 'UNMAPPED' = fund.meta.sebiSubCategory;
  if (target === 'UNMAPPED') return null;

  const eligible = facts.approvedUniverse.filter(
    (c) =>
      c.schemeCode !== null &&
      c.schemeCode !== schemeCode &&
      c.sebiSubCategory === target &&
      c.rating !== null &&
      c.rating >= VERDICT_MIN_REPLACEMENT_RATING,
  );
  if (eligible.length === 0) return null;

  return [...eligible].sort(
    (a, b) =>
      a.rank - b.rank ||
      (b.rating ?? 0) - (a.rating ?? 0) ||
      (a.schemeCode ?? '').localeCompare(b.schemeCode ?? ''),
  )[0]!;
}

// ---------------------------------------------------------------------------
// Switch cost (`05 §5`)
// ---------------------------------------------------------------------------

/**
 * `REPLACEMENT_EXPECTED_EDGE` widened to its eventual type at the one place it
 * is read.
 *
 * The constant is declared `: null` in `constants.ts`, which is deliberate —
 * it makes "there is no measured edge" a fact TypeScript itself knows. Binding
 * it here as `string | null` is what keeps the rest of `computeSwitchCost`
 * type-checkable, executable code rather than a block TypeScript narrows to
 * `never` and nobody can compile. The `edge === null` guard immediately below
 * is therefore *live* code that happens to always take its early return today,
 * and starts taking the other branch the moment Task 2.7 replaces the
 * constant's value and type. Nothing else in this file changes.
 */
const REPLACEMENT_EDGE: string | null = REPLACEMENT_EXPECTED_EDGE;

/** True iff a measured replacement edge exists. Exported so a test can assert
 *  the premise of "row 3 cannot fire" rather than assuming it. */
export const REPLACEMENT_EDGE_AVAILABLE: boolean = REPLACEMENT_EDGE !== null;

/**
 * Sum a per-lot cost, refusing to guess at a lot that does not carry one.
 *
 * Returns `null` when **any** lot's figure is missing. `MfLotDto` is explicit
 * that a null `exitLoadPct` means "we do not know this scheme's load, not that
 * it is zero", and the same applies to tax: a total assembled by skipping the
 * unknowns is a *floor*, and a floor in the numerator of a break-even makes
 * the break-even look shorter than it is — which biases the engine toward
 * recommending switches. Unknown in, unknown out.
 *
 * A fund with no lots at all sums to zero, which is a real answer: nothing to
 * redeem, nothing to pay.
 */
function sumLotCost(lots: readonly MfLotDto[], pick: (lot: MfLotDto) => string | null): string | null {
  let total = toDecimal(0);
  for (const lot of lots) {
    const value = pick(lot);
    if (value === null) return null;
    total = total.plus(toDecimal(value));
  }
  return total.toFixed();
}

/**
 * What it costs to leave this fund today, and how long the replacement has to
 * out-earn it before the move pays for itself.
 *
 * `05 §5`:
 *
 *     breakEvenMonths = (exitLoadInr + taxInr)
 *                     / (replacementExpectedEdge x currentValue / 12)
 *
 * where the edge is "the category-median TER difference plus half the
 * composite-score gap mapped to alpha via the backtest coefficient". `05 §5`
 * is emphatic about what it is *not*: "Do not use the replacement's past
 * return — that is the over-promise every 'switch' recommendation
 * industry-wide makes." Past return is the number that is available, easy and
 * flattering, which is exactly why the doc rules it out.
 *
 * `breakEvenMonths` is null — meaning "unknown", never "fine" — when:
 *
 *  1. `REPLACEMENT_EXPECTED_EDGE` is null (today, always). No measured edge,
 *     no projection, no denominator.
 *  2. Any lot's exit load or tax is unknown, so the numerator is a floor.
 *  3. The current value is zero or negative, so the denominator is not a rate.
 *
 * The row-3 guard tests `breakEvenMonths !== null && <= 24`, so every one of
 * those three cases blocks a `SWITCH_CANDIDATE` rather than passing an
 * optimistic default through to the user.
 */
export function computeSwitchCost(fund: MfFundFacts): MfSwitchCost {
  const exitLoad = sumLotCost(fund.held.lots, (lot) => lot.exitLoadInr);
  const tax = sumLotCost(fund.held.lots, (lot) => lot.taxIfSoldTodayInr);

  return {
    // A missing component is reported as 0 in the displayed cost but is what
    // makes `breakEvenMonths` null below: the user sees "we could only account
    // for this much", the decision procedure sees "unknown".
    exitLoadInr: serializeMoney(exitLoad ?? 0),
    taxInr: serializeMoney(tax ?? 0),
    breakEvenMonths: computeBreakEvenMonths(fund, exitLoad, tax),
  };
}

function computeBreakEvenMonths(
  fund: MfFundFacts,
  exitLoad: string | null,
  tax: string | null,
): MfSwitchCost['breakEvenMonths'] {
  // (1) No measured edge. This is the branch that is taken on every run today.
  const edge = REPLACEMENT_EDGE;
  if (edge === null) return null;

  // (2) A cost we could not fully account for.
  if (exitLoad === null || tax === null) return null;

  // (3) A denominator that is not a rate.
  const currentValue = toDecimal(fund.held.currentValue);
  if (currentValue.lessThanOrEqualTo(0)) return null;

  const edgeDecimal = toDecimal(edge);
  if (edgeDecimal.lessThanOrEqualTo(0)) return null;

  const monthlyGain = edgeDecimal.times(currentValue).dividedBy(12);
  if (monthlyGain.lessThanOrEqualTo(0)) return null;

  const cost = toDecimal(exitLoad).plus(toDecimal(tax));
  // A free switch breaks even immediately. Guarded explicitly so the division
  // below never has to represent "zero months" as a rounding artefact.
  if (cost.lessThanOrEqualTo(0)) return serializeRatio(0);

  return serializeRatio(cost.dividedBy(monthlyGain));
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

function noReplacement(
  schemeCode: string,
  verdict: MfVerdictKind,
  reasons: string[],
  matchedRow: MfVerdictRow,
): MfVerdictDecision {
  return {
    schemeCode,
    verdict,
    reasons,
    suggestedReplacementSchemeCode: null,
    suggestedReplacementName: null,
    switchCost: null,
    matchedRow,
  };
}

/**
 * `05 §5` applied to one fund. Pure.
 *
 * `findings` must already be filtered to this scheme; `decideVerdicts` below
 * does that. Passing the whole run's findings would let a portfolio-level
 * `WARNING` (allocation drift, say) push every individual fund to `REVIEW`,
 * which is how one household-level observation becomes twelve fund-level
 * accusations.
 */
export function decideVerdict(
  facts: MfAnalysisFacts,
  schemeCode: string,
  findings: readonly MfFinding[],
): MfVerdictDecision {
  const fund = facts.funds[schemeCode];
  if (fund === undefined) {
    throw new Error(
      `decideVerdict: no facts for scheme ${schemeCode}. The verdict table is a ` +
        'pure function of the facts it was given; it cannot look one up.',
    );
  }

  const criticalCodes = codesAtSeverity(findings, 'CRITICAL');
  const warningCodes = codesAtSeverity(findings, 'WARNING');
  const score = fund.score;
  const rating = score !== null && score.ratingStatus === 'RATED' ? score.rating : null;

  // ---- Row 1: unrated, and nothing critical -------------------------------
  // Order matters here too: an unrated fund with a CRITICAL finding is NOT
  // "insufficient data". We know enough. `05 §5` row 1 carries the "and no
  // CRITICAL finding" clause for exactly that case, and dropping it would let
  // a regulatory action against a young fund be reported as "we cannot say".
  if ((score === null || score.ratingStatus !== 'RATED') && criticalCodes.length === 0) {
    // The rating status is on the score, not in the findings. The one finding
    // that *is* the user-facing statement of it is cited when the rule emitted
    // it, so the verdict chip and the finding beneath it agree.
    const reasons = hasCode(findings, CODE_INSUFFICIENT_HISTORY) ? [CODE_INSUFFICIENT_HISTORY] : [];
    return noReplacement(schemeCode, 'INSUFFICIENT_DATA', reasons, 1);
  }

  // ---- Row 2: any CRITICAL finding ----------------------------------------
  // No break-even gate. A CRITICAL finding is an observed fact about the fund
  // as it stands, not a projection about how a replacement might do, so the
  // one number this engine cannot yet compute is not in the way.
  if (criticalCodes.length > 0) {
    const replacement = findReplacement(facts, schemeCode);
    if (replacement === null) {
      return noReplacement(schemeCode, 'REVIEW', criticalCodes, 2);
    }
    return {
      schemeCode,
      verdict: 'SWITCH_CANDIDATE',
      reasons: criticalCodes,
      suggestedReplacementSchemeCode: replacement.schemeCode,
      suggestedReplacementName: replacement.schemeName,
      switchCost: computeSwitchCost(fund),
      matchedRow: 2,
    };
  }

  // ---- Row 3: the evidenced, costed switch --------------------------------
  // Every clause of `05 §5` row 3, in the doc's order. It is written out in
  // full rather than short-circuited early so that the day
  // `REPLACEMENT_EXPECTED_EDGE` becomes a measured number, this row works
  // without anyone having to re-derive it.
  const ratingWeak = rating !== null && rating <= VERDICT_MAX_RATING_FOR_REVIEW;
  const underperforms = hasCode(findings, CODE_PERSISTENT_UNDERPERFORMANCE);
  // "at least one MORE warning" — beside PERSISTENT_UNDERPERFORMANCE itself,
  // and never REGULAR_PLAN_COST (see its constant above).
  const corroborating = warningCodes.filter(
    (c) => c !== CODE_PERSISTENT_UNDERPERFORMANCE && c !== CODE_REGULAR_PLAN_COST,
  );

  if (ratingWeak && underperforms && corroborating.length >= 1) {
    const replacement = findReplacement(facts, schemeCode);
    if (replacement !== null) {
      const switchCost = computeSwitchCost(fund);
      const breakEven = switchCost.breakEvenMonths;
      // THE GATE. `null` is not `<= 24`. With no measured edge this is null on
      // every run, so control falls through to row 4 and the fund is returned
      // as REVIEW — attention without a named replacement.
      if (
        breakEven !== null &&
        toDecimal(breakEven).lessThanOrEqualTo(VERDICT_MAX_BREAK_EVEN_MONTHS)
      ) {
        return {
          schemeCode,
          verdict: 'SWITCH_CANDIDATE',
          reasons: [CODE_PERSISTENT_UNDERPERFORMANCE, ...corroborating],
          suggestedReplacementSchemeCode: replacement.schemeCode,
          suggestedReplacementName: replacement.schemeName,
          switchCost,
          matchedRow: 3,
        };
      }
    }
  }

  // ---- Row 4: weak rating, or two things wrong ----------------------------
  if (ratingWeak || warningCodes.length >= 2) {
    return noReplacement(schemeCode, 'REVIEW', warningCodes, 4);
  }

  // ---- Row 5: watch it ----------------------------------------------------
  const watchCodes = [CODE_MANAGER_CHANGE, CODE_RECENT_REVERSAL].filter((c) =>
    hasCode(findings, c),
  );
  if (rating === 3 || warningCodes.length === 1 || watchCodes.length > 0) {
    // Warnings first: if a fund is on MONITOR because of a single warning,
    // that warning is the reason, and the watch codes are the colour.
    const reasons = [...warningCodes, ...watchCodes.filter((c) => !warningCodes.includes(c))];
    return noReplacement(schemeCode, 'MONITOR', reasons, 5);
  }

  // ---- Row 6: nothing to say ----------------------------------------------
  return noReplacement(schemeCode, 'HOLD', [], 6);
}

/**
 * `decideVerdict` for every fund in the facts.
 *
 * Findings are partitioned by `schemeCode` here rather than by the caller so
 * the "portfolio-level findings never reach a fund verdict" rule lives in one
 * place. Scheme codes are iterated in sorted order so two runs over identical
 * facts write verdict rows in identical sequence — which is what lets the
 * supersede test in `mfAnalysisEngine.test.ts` compare runs row by row.
 */
export function decideVerdicts(
  facts: MfAnalysisFacts,
  findings: readonly MfFinding[],
): MfVerdictDecision[] {
  const byScheme = new Map<string, MfFinding[]>();
  for (const f of findings) {
    if (f.schemeCode === null) continue;
    const bucket = byScheme.get(f.schemeCode);
    if (bucket === undefined) byScheme.set(f.schemeCode, [f]);
    else bucket.push(f);
  }

  return Object.keys(facts.funds)
    .sort()
    .map((schemeCode) => decideVerdict(facts, schemeCode, byScheme.get(schemeCode) ?? []));
}
