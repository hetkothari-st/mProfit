import { Decimal } from 'decimal.js';

/**
 * Pure health-score math, extracted so formulas are unit-testable without a
 * DB (mirrors the goalMath.ts / goals.service.ts split). All monetary
 * inputs are Decimal; callers (healthScore.service.ts) supply pre-aggregated
 * totals.
 */

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/** Liquid assets ÷ (6 × monthly expenses) × 100, capped [0,100]. */
export function emergencyFundScore(
  liquidAssets: Decimal,
  monthlyExpenses: Decimal,
): { score: number; monthsCovered: number } {
  if (monthlyExpenses.lessThanOrEqualTo(0)) {
    return { score: 100, monthsCovered: liquidAssets.greaterThan(0) ? Infinity : 0 };
  }
  const monthsCovered = liquidAssets.dividedBy(monthlyExpenses).toNumber();
  const score = clampScore((monthsCovered / 6) * 100);
  return { score, monthsCovered };
}

/** Monthly investment ÷ monthly income, target 20%. */
export function investmentRateScore(
  monthlyInvestment: Decimal,
  monthlyIncome: Decimal,
): { score: number; ratePct: number } {
  if (monthlyIncome.lessThanOrEqualTo(0)) return { score: 0, ratePct: 0 };
  const ratePct = monthlyInvestment.dividedBy(monthlyIncome).times(100).toNumber();
  const score = clampScore((ratePct / 20) * 100);
  return { score, ratePct };
}

/** EMIs + CC minimums ÷ monthly income. 100 at ≤20%, 0 at ≥60%, linear between. */
export function debtBurdenScore(
  monthlyDebtPayments: Decimal,
  monthlyIncome: Decimal,
): { score: number; burdenPct: number } {
  if (monthlyIncome.lessThanOrEqualTo(0)) {
    return { score: monthlyDebtPayments.lessThanOrEqualTo(0) ? 100 : 0, burdenPct: 0 };
  }
  const burdenPct = monthlyDebtPayments.dividedBy(monthlyIncome).times(100).toNumber();
  if (burdenPct <= 20) return { score: 100, burdenPct };
  if (burdenPct >= 60) return { score: 0, burdenPct };
  const score = clampScore(100 - ((burdenPct - 20) / 40) * 100);
  return { score, burdenPct };
}

export interface DiversificationInput {
  classPercents: Array<{ assetClass: string; percent: number }>;
  largestSingleHoldingPct: number;
  equityPct: number;
  age: number | null;
}

/**
 * Weighted average of three sub-rules: no asset class >60%, equity% within
 * 10pts of (100-age), no single holding >50%. The age sub-rule is dropped
 * (weight redistributed) when age is unknown — we don't have User.dob for
 * every account.
 */
export function diversificationScore(input: DiversificationInput): { score: number } {
  const maxClassPct = input.classPercents.reduce((m, c) => Math.max(m, c.percent), 0);
  const subClassConcentration = clampScore(maxClassPct <= 60 ? 100 : 100 - (maxClassPct - 60) * 2.5);
  const subHoldingConcentration = clampScore(
    input.largestSingleHoldingPct <= 50 ? 100 : 100 - (input.largestSingleHoldingPct - 50) * 2,
  );

  if (input.age == null) {
    const score = (subClassConcentration + subHoldingConcentration) / 2;
    return { score: clampScore(score) };
  }

  const targetEquityPct = Math.max(0, 100 - input.age);
  const equityGap = Math.abs(input.equityPct - targetEquityPct);
  const subEquityGuideline = clampScore(100 - equityGap * 5);

  const score = (subClassConcentration + subHoldingConcentration + subEquityGuideline) / 3;
  return { score: clampScore(score) };
}

/** Sum-assured (life-type policies only) ÷ 10x annual income. 50 if no policies at all. */
export function insuranceScore(
  totalLifeSumAssured: Decimal,
  annualIncome: Decimal,
  hasLifePolicies: boolean,
): { score: number } {
  if (!hasLifePolicies) return { score: 50 };
  if (annualIncome.lessThanOrEqualTo(0)) return { score: totalLifeSumAssured.greaterThan(0) ? 100 : 0 };
  const requiredCover = annualIncome.times(10);
  const ratio = totalLifeSumAssured.dividedBy(requiredCover).toNumber();
  return { score: clampScore(ratio * 100) };
}

/** Average of per-goal progressPct (already capped at 100 each). 50 with no goals. */
export function goalProgressScore(progressPcts: number[]): { score: number } {
  if (progressPcts.length === 0) return { score: 50 };
  const capped = progressPcts.map((p) => Math.min(100, p));
  const avg = capped.reduce((s, p) => s + p, 0) / capped.length;
  return { score: clampScore(avg) };
}

export interface SubScores {
  emergencyFund: number;
  investmentRate: number;
  debtBurden: number;
  diversification: number;
  insurance: number;
  goalProgress: number;
}

const WEIGHTS: SubScores = {
  emergencyFund: 0.2, investmentRate: 0.2, debtBurden: 0.2,
  diversification: 0.2, insurance: 0.1, goalProgress: 0.1,
};

export function weightedOverall(subScores: SubScores): { overall: number; grade: string } {
  const overall = Math.round(
    subScores.emergencyFund * WEIGHTS.emergencyFund +
    subScores.investmentRate * WEIGHTS.investmentRate +
    subScores.debtBurden * WEIGHTS.debtBurden +
    subScores.diversification * WEIGHTS.diversification +
    subScores.insurance * WEIGHTS.insurance +
    subScores.goalProgress * WEIGHTS.goalProgress,
  );
  const grade = overall >= 85 ? 'A' : overall >= 70 ? 'B' : overall >= 55 ? 'C' : overall >= 40 ? 'D' : 'F';
  return { overall, grade };
}
