/**
 * Pure risk-profiling math. No DB, no I/O, no clock — every input arrives as an
 * argument so the whole module is trivially unit-testable, matching the
 * convention set by healthScoreMath.ts / goalMath.ts / deterministicInsightsRules.ts.
 *
 * This file is also the single home of the age-based equity guideline. Before
 * this existed the `100 - age` rule was recomputed inline in three unrelated
 * places (healthScoreMath.diversificationScore, healthScore.service, and
 * ai/contextBuilder.buildAllocationData) with subtly different floors, so the
 * "guideline" a user saw depended on which screen they were looking at.
 */

/** Bumped whenever the question set or the scoring bands change. Stamped onto
 *  every RiskProfileAssessment so an old verdict stays reconstructable under
 *  the rules that actually produced it. */
export const QUESTIONNAIRE_VERSION = 1;

export const RISK_CATEGORIES = ['CONSERVATIVE', 'BALANCED', 'GROWTH', 'AGGRESSIVE'] as const;
export type RiskCategoryValue = (typeof RISK_CATEGORIES)[number];

/**
 * Classic age-based equity guideline. A blunt heuristic, kept only as the
 * fallback for users who have not completed the questionnaire — a real risk
 * profile always wins (see riskProfile.service.resolveTargetEquityPct).
 *
 * Returns null for unknown age rather than a default, so callers must decide
 * what "we don't know" means for them instead of silently advising against a
 * number nobody chose.
 */
export function ageBasedEquityGuidelinePct(age: number | null): number | null {
  if (age == null || !Number.isFinite(age) || age <= 0) return null;
  return Math.max(0, 100 - age);
}

export type HorizonAnswer = 'LT_3Y' | 'Y3_7' | 'Y7_15' | 'GT_15Y';
export type DrawdownAnswer = 'SELL_ALL' | 'SELL_SOME' | 'HOLD' | 'BUY_MORE';
export type CapacityAnswer = 'LT_10' | 'PCT_10_20' | 'PCT_20_35' | 'GT_35';
export type ObjectiveAnswer = 'PRESERVE' | 'INCOME' | 'BALANCED_GROWTH' | 'MAX_GROWTH';
export type TaxSlabAnswer = 'PCT_5' | 'PCT_20' | 'PCT_30' | 'UNSURE';

export interface RiskAnswers {
  age: number | null;
  horizon: HorizonAnswer;
  drawdownReaction: DrawdownAnswer;
  investableShareOfIncome: CapacityAnswer;
  objective: ObjectiveAnswer;
  hasEmergencyFund: boolean;
  taxSlab: TaxSlabAnswer;
}

/**
 * Four scored dimensions. Willingness to sit through a drawdown carries the
 * most weight because it is the one that actually predicts whether a plan
 * survives contact with a bad year; stated objective carries less because
 * everyone says "growth" when nothing is falling.
 */
const WEIGHTS = { horizon: 20, drawdownReaction: 25, investableShareOfIncome: 15, objective: 20 } as const;
const MAX_RAW = WEIGHTS.horizon + WEIGHTS.drawdownReaction + WEIGHTS.investableShareOfIncome + WEIGHTS.objective;

const HORIZON_POINTS: Record<HorizonAnswer, number> = { LT_3Y: 0, Y3_7: 0.4, Y7_15: 0.75, GT_15Y: 1 };
const DRAWDOWN_POINTS: Record<DrawdownAnswer, number> = { SELL_ALL: 0, SELL_SOME: 0.35, HOLD: 0.8, BUY_MORE: 1 };
const CAPACITY_POINTS: Record<CapacityAnswer, number> = { LT_10: 0, PCT_10_20: 0.4, PCT_20_35: 0.75, GT_35: 1 };
const OBJECTIVE_POINTS: Record<ObjectiveAnswer, number> = { PRESERVE: 0, INCOME: 0.35, BALANCED_GROWTH: 0.7, MAX_GROWTH: 1 };

export const TAX_SLAB_PCT: Record<TaxSlabAnswer, number | null> = {
  PCT_5: 5,
  PCT_20: 20,
  PCT_30: 30,
  // Deliberately null, not 30. tax.service.ts already assumes a flat 30% and
  // that assumption is invisible to the user; here an unknown slab stays
  // unknown so advice text can say so rather than quietly guessing high.
  UNSURE: null,
};

/** Score bands. Widest in the middle: most people genuinely are BALANCED, and
 *  a narrow middle band makes the verdict flip on a single answer. */
export function categoryForScore(score: number): RiskCategoryValue {
  if (score < 30) return 'CONSERVATIVE';
  if (score < 55) return 'BALANCED';
  if (score < 80) return 'GROWTH';
  return 'AGGRESSIVE';
}

/** The age at or above which AGGRESSIVE is not offered regardless of score. */
export const AGGRESSIVE_AGE_CAP = 55;

export interface RiskAssessmentOutcome {
  score: number;
  category: RiskCategoryValue;
  taxSlabPct: number | null;
  /** Guardrails applied after scoring. Recorded rather than applied silently so
   *  a downgraded verdict can be explained to the person it was applied to. */
  overrides: Array<{ rule: string; from: RiskCategoryValue; to: RiskCategoryValue; reason: string }>;
}

export function scoreRiskQuestionnaire(answers: RiskAnswers): RiskAssessmentOutcome {
  const raw =
    HORIZON_POINTS[answers.horizon] * WEIGHTS.horizon +
    DRAWDOWN_POINTS[answers.drawdownReaction] * WEIGHTS.drawdownReaction +
    CAPACITY_POINTS[answers.investableShareOfIncome] * WEIGHTS.investableShareOfIncome +
    OBJECTIVE_POINTS[answers.objective] * WEIGHTS.objective;

  const score = Math.round((raw / MAX_RAW) * 100);
  const scored = categoryForScore(score);
  const overrides: RiskAssessmentOutcome['overrides'] = [];
  let category = scored;

  // Capacity guardrails. Both cap risk downward only — nothing here can push a
  // cautious answer set into a riskier band than the person asked for.
  if (category === 'AGGRESSIVE' && answers.age != null && answers.age >= AGGRESSIVE_AGE_CAP) {
    overrides.push({
      rule: 'AGE_CAP',
      from: category,
      to: 'GROWTH',
      reason: `Age ${answers.age} is at or above the ${AGGRESSIVE_AGE_CAP} cap for an aggressive allocation.`,
    });
    category = 'GROWTH';
  }

  if (!answers.hasEmergencyFund && (category === 'AGGRESSIVE' || category === 'GROWTH')) {
    const to = category === 'AGGRESSIVE' ? 'GROWTH' : 'BALANCED';
    overrides.push({
      rule: 'NO_EMERGENCY_FUND',
      from: category,
      to,
      reason: 'No emergency fund yet — a forced sale in a downturn is the likeliest way this plan fails.',
    });
    category = to;
  }

  return { score, category, taxSlabPct: TAX_SLAB_PCT[answers.taxSlab], overrides };
}
