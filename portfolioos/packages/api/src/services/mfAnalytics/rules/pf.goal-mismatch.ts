/**
 * `mf.pf.goal-mismatch` — `GOAL_MISMATCH` and `GOAL_UNDERPOWERED`
 * (`05 §4`, portfolio scope).
 *
 * One rule, two codes, because they are the two directions of a single
 * question — does the risk of the funds funding a goal match the time left to
 * it? (`04 §6`.)
 *
 *   - `GOAL_MISMATCH` — too much risk for the horizon. A small-cap fund
 *     funding a goal three years out can be 40% down on the day the money is
 *     needed, and there is no time to wait it out.
 *   - `GOAL_UNDERPOWERED` — too little. A liquid fund funding a fifteen-year
 *     goal is a near-certain real-terms shortfall, which is the quieter and
 *     more common failure.
 *
 * ── The verdict comes from the DTO, not from a matrix re-derived here ─────
 *
 * `MfGoalFitDto.suitability` is computed by `04 §6` from the fund's model key
 * against the goal horizon, and it carries `reason` — the sentence the goal
 * page already shows. Re-deriving the matrix in this rule would create a
 * second implementation of the same judgement, and the first user to see the
 * goals page say SUITABLE and this finding say MISMATCH would be right to
 * distrust both. `mfAnalytics.constants.ts` records the matching decision on
 * the constants side: these codes deliberately have no threshold entry,
 * because the input is a suitability matrix and not a scalar.
 *
 * ── Two findings maximum ──────────────────────────────────────────────────
 *
 * A portfolio-scope finding has `schemeCode: null`, so `makeFinding`'s id is
 * `rule@version:-:CODE` and two findings sharing a code would collide on the
 * dedupe key. The rule therefore emits at most one finding per code, naming
 * the worst-affected goal (shortest horizon for a mismatch, longest for an
 * underpowered one — in each case the goal where the gap bites hardest) and
 * counting the rest.
 */

import { serializeRatio, toDecimal, type MfEvidence, type MfFinding, type MfGoalFitDto } from '@portfolioos/shared';

import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.pf.goal-mismatch';
const RULE_VERSION = '1.0.0';

function clip(name: string, max: number): string {
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`;
}

interface CodeSpec {
  code: 'GOAL_MISMATCH' | 'GOAL_UNDERPOWERED';
  suitability: MfGoalFitDto['suitability'];
  /** How the headline describes the gap, in the user's terms. */
  problem: string;
  /** What would resolve it, named against the goal's own horizon. */
  remedy: (goal: MfGoalFitDto, years: string) => string;
  /** Of the affected goals, the one where the gap bites hardest. */
  worst: (a: MfGoalFitDto, b: MfGoalFitDto) => MfGoalFitDto;
}

const SPECS: readonly CodeSpec[] = [
  {
    code: 'GOAL_MISMATCH',
    suitability: 'MISMATCH',
    problem: 'is funded by funds too risky for its horizon',
    remedy: (_goal, years) =>
      `moving the money to funds whose risk suits a ${years}-year horizon — shorter horizons ` +
      'need debt or hybrid exposure, not equity that may still be recovering on the date ' +
      'the money is needed',
    // Shortest horizon first: the least time available to recover a fall.
    worst: (a, b) => (toDecimal(b.horizonYears).lessThan(toDecimal(a.horizonYears)) ? b : a),
  },
  {
    code: 'GOAL_UNDERPOWERED',
    suitability: 'UNDERPOWERED',
    problem: 'is funded by funds too conservative for its horizon',
    remedy: (_goal, years) =>
      `putting a share of it into growth assets suited to a ${years}-year horizon — cash-like ` +
      'funds over that long are a near-certain shortfall once inflation is taken off',
    // Longest horizon first: the most compounding given up.
    worst: (a, b) => (toDecimal(b.horizonYears).greaterThan(toDecimal(a.horizonYears)) ? b : a),
  },
];

export const pfGoalMismatchRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'PORTFOLIO',
  category: 'GOAL',

  evaluate(facts: MfAnalysisFacts): MfFinding[] {
    const goals = facts.portfolio.goals;
    // No goals, or none with funds mapped, means nothing to be suited to.
    if (goals.length === 0) return [];

    const partial = facts.portfolio.scope.partial;
    const findings: MfFinding[] = [];

    for (const spec of SPECS) {
      const affected = goals.filter((goal) => goal.suitability === spec.suitability);
      if (affected.length === 0) continue;

      const worst = affected.reduce(spec.worst);
      const years = toDecimal(worst.horizonYears).toFixed(1);

      const headline =
        `${clip(worst.goalName, 32)} (${years}y) ${spec.problem}` +
        (affected.length > 1 ? ` (+${affected.length - 1} more)` : '');

      const evidence: MfEvidence[] = [
        {
          metric: 'goals.horizonYears',
          label: `${worst.goalName} — years to its target date (${worst.targetDate})`,
          value: serializeRatio(worst.horizonYears),
          unit: 'ratio',
        },
        {
          metric: 'goals.schemeCodes.count',
          label: `Funds mapped to ${worst.goalName}: ${worst.reason}`,
          value: serializeRatio(worst.schemeCodes.length),
          unit: 'count',
        },
        {
          metric: 'goals.suitability.count',
          label: partial
            ? `Goals assessed ${spec.suitability} (floor — funded from shared holdings only)`
            : `Goals assessed ${spec.suitability}`,
          value: serializeRatio(affected.length),
          unit: 'count',
        },
      ];

      // Cited only where the projection ran. `projectedValue` and `shortfall`
      // are `| null`, and null means the category-median rolling return was
      // not available — never a shortfall of zero.
      if (worst.shortfall !== null) {
        evidence.push({
          metric: 'goals.shortfall',
          label: `${worst.goalName} — projected shortfall at the target date`,
          value: serializeRatio(toDecimal(worst.shortfall)),
          unit: 'inr',
        });
      }

      const counterfactual =
        `Would clear for ${clip(worst.goalName, 40)} by ${spec.remedy(worst, years)}, or by ` +
        `moving its target date, which is ${years} years out today. The assessment is ` +
        `${worst.suitability}: ${worst.reason}` +
        (partial
          ? ' Only the holdings shared with you were matched to goals, so the count above ' +
            'is a floor on how many of the household’s goals are affected.'
          : '');

      findings.push(
        makeFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          schemeCode: null,
          code: spec.code,
          category: 'GOAL',
          severity: 'WARNING',
          // Suitability rests on the fund's mandate and the goal's date, not
          // on a return series, so the structural-fact confidence applies.
          confidence: confidenceFor(),
          headline,
          evidence,
          whatWouldChangeThis: counterfactual,
        }),
      );
    }

    return findings;
  },
};
