/**
 * Policy health score calculator.
 *
 * Pure, sterile: no I/O, no Prisma, no clock. Weights as data, not code.
 *
 * Five pillars:
 *  1. coverage_comprehensiveness  — what is covered (IPD, day care, AYUSH,
 *     ambulance, domiciliary, pre/post-hosp days)
 *  2. financial_restrictions      — co-payment, room rent, deductibles,
 *     sub-limits (penalties for each)
 *  3. waiting_periods             — initial, PED, specific disease waits
 *  4. exclusions                  — number and severity of exclusions
 *  5. benefits                    — NCB, restoration, OPD, CI cover,
 *     health checkup
 *
 * Rules:
 *  - Each pillar scores 0-100. Unknown inputs are dropped from that pillar's
 *    weight pool — NEVER scored as zero.
 *  - Composite = weighted sum of known pillars, normalised to [0, 100].
 *  - If >40% of pillar weight is unknown → INCOMPLETE_ANALYSIS.
 *  - `composite()` asserts result ∈ [0, 100] or throws.
 *
 * Thresholds:
 *  80-100 → Strong
 *  65-79  → Good
 *  45-64  → Needs Attention
 *  <45    → Significant Limitations
 */

import { Decimal } from '@everypaisa/shared';
import type { PolicyAnalysisFacts } from '../types.js';
import type { PolicyFindingDTO } from '@everypaisa/shared';
import type { PolicyScoreSnapshot, PolicyPillarScore } from '@everypaisa/shared';

// ---------------------------------------------------------------------------
// Pillar weight tables (data, not code)
// ---------------------------------------------------------------------------

/** Default pillar weights. Must sum to 1. */
export const DEFAULT_PILLAR_WEIGHTS = {
  coverage_comprehensiveness: new Decimal('0.30'),
  financial_restrictions: new Decimal('0.30'),
  waiting_periods: new Decimal('0.15'),
  exclusions: new Decimal('0.10'),
  benefits: new Decimal('0.15'),
} as const;

export type PillarKey = keyof typeof DEFAULT_PILLAR_WEIGHTS;

export const SCORING_VERSION = 'policy_score_v1';

const INCOMPLETE_THRESHOLD = new Decimal('0.40'); // >40% unknown weight → incomplete

// ---------------------------------------------------------------------------
// Individual pillar scorers (pure — only use facts, return 0-100 Decimal)
// ---------------------------------------------------------------------------

/** Returns [score, knownWeightFraction] */
function scoreCoverageComprehensiveness(facts: PolicyAnalysisFacts): {
  score: Decimal | null;
  inputs: Record<string, { value: string | null; note: string | null }>;
} {
  const inputs: Record<string, { value: string | null; note: string | null }> = {};
  const scores: Decimal[] = [];

  // IPD (in-patient) — most important; 25 points
  const ipd = facts.extraction.inPatientCovered;
  if (ipd.status !== 'NOT_FOUND') {
    const val = ipd.value ? new Decimal('100') : new Decimal('0');
    scores.push(val);
    inputs['inPatientCovered'] = { value: String(ipd.value), note: ipd.value ? null : 'IPD not covered' };
  } else {
    inputs['inPatientCovered'] = { value: null, note: 'NOT_FOUND' };
  }

  // Day care — 15 points
  const dc = facts.extraction.dayCareCovered;
  if (dc.status !== 'NOT_FOUND') {
    const val = dc.value ? new Decimal('100') : new Decimal('0');
    scores.push(val);
    inputs['dayCareCovered'] = { value: String(dc.value), note: null };
  } else {
    inputs['dayCareCovered'] = { value: null, note: 'NOT_FOUND' };
  }

  // Pre + post hospitalisation days (combined) — 20 points
  const pre = facts.extraction.preHospDays;
  const post = facts.extraction.postHospDays;
  if (pre.status !== 'NOT_FOUND' && post.status !== 'NOT_FOUND') {
    const preDays = pre.value ?? 0;
    const postDays = post.value ?? 0;
    // 60/180 is good, less is penalised
    const preScore = Math.min(100, (preDays / 60) * 100);
    const postScore = Math.min(100, (postDays / 180) * 100);
    scores.push(new Decimal((preScore + postScore) / 2).toDecimalPlaces(2));
    inputs['prePostHospDays'] = { value: `${preDays}/${postDays}`, note: null };
  } else {
    inputs['prePostHospDays'] = { value: null, note: 'NOT_FOUND' };
  }

  // AYUSH — 10 points
  const ayush = facts.extraction.ayushCovered;
  if (ayush.status !== 'NOT_FOUND') {
    scores.push(ayush.value ? new Decimal('100') : new Decimal('60'));
    inputs['ayushCovered'] = { value: String(ayush.value), note: null };
  }

  // Domiciliary — 10 points
  const dom = facts.extraction.domiciliaryCovered;
  if (dom.status !== 'NOT_FOUND') {
    scores.push(dom.value ? new Decimal('100') : new Decimal('70'));
    inputs['domiciliaryCovered'] = { value: String(dom.value), note: null };
  }

  if (scores.length === 0) return { score: null, inputs };
  const avg = scores.reduce((a, b) => a.plus(b), new Decimal('0')).div(scores.length);
  return { score: avg, inputs };
}

function scoreFinancialRestrictions(facts: PolicyAnalysisFacts): {
  score: Decimal | null;
  inputs: Record<string, { value: string | null; note: string | null }>;
} {
  const inputs: Record<string, { value: string | null; note: string | null }> = {};
  let score = new Decimal('100'); // start at 100, deduct for restrictions
  let knownCount = 0;

  // Co-payment
  const copay = facts.extraction.copaymentPct;
  if (copay.status !== 'NOT_FOUND' && copay.value !== null) {
    knownCount++;
    const pct = new Decimal(copay.value);
    // 0% = no deduction; 10% = -20 pts; 20% = -40 pts; 30%+ = -60 pts
    const deduction = Decimal.min(pct.mul('2'), new Decimal('60'));
    score = score.minus(deduction);
    inputs['copaymentPct'] = { value: copay.value, note: `Deducted ${deduction.toFixed(0)} pts` };
  } else {
    inputs['copaymentPct'] = { value: null, note: 'NOT_FOUND' };
  }

  // Room rent restriction
  const roomType = facts.extraction.roomRentLimitType;
  if (roomType.status !== 'NOT_FOUND' && roomType.value !== null) {
    knownCount++;
    const type = roomType.value;
    if (type === 'NO_LIMIT' || type === 'ACTUAL') {
      // No deduction
      inputs['roomRentLimitType'] = { value: type, note: null };
    } else if (type === 'SUB_LIMIT_PCT' || type === 'SUB_LIMIT_FIXED') {
      score = score.minus(new Decimal('15'));
      inputs['roomRentLimitType'] = { value: type, note: 'Deducted 15 pts for sub-limit' };
      // Extra deduction for proportionate deductions
      const prop = facts.extraction.proportionateDeductionApplies;
      if (prop.status !== 'NOT_FOUND' && prop.value === true) {
        score = score.minus(new Decimal('20'));
        inputs['proportionateDeduction'] = { value: 'true', note: 'Deducted 20 pts' };
      }
    }
  } else {
    inputs['roomRentLimitType'] = { value: null, note: 'NOT_FOUND' };
  }

  // Disease sub-limits
  const subLimits = facts.extraction.diseaseSubLimits;
  if (subLimits.status !== 'NOT_FOUND' && subLimits.value !== null) {
    knownCount++;
    const count = Object.keys(subLimits.value).length;
    const deduction = Decimal.min(new Decimal(count * 3), new Decimal('20'));
    score = score.minus(deduction);
    inputs['diseaseSubLimits'] = { value: String(count), note: `Deducted ${deduction.toFixed(0)} pts for ${count} sub-limit(s)` };
  }

  if (knownCount === 0) return { score: null, inputs };
  return { score: Decimal.max(score, new Decimal('0')), inputs };
}

function scoreWaitingPeriods(facts: PolicyAnalysisFacts): {
  score: Decimal | null;
  inputs: Record<string, { value: string | null; note: string | null }>;
} {
  const inputs: Record<string, { value: string | null; note: string | null }> = {};
  let score = new Decimal('100');
  let knownCount = 0;

  // PED waiting period
  const ped = facts.extraction.pedWaitingDays;
  if (ped.status !== 'NOT_FOUND' && ped.value !== null) {
    knownCount++;
    const days = ped.value;
    // 0 = 100, 365 = 85, 1095 (3yr) = 60, 1460 (4yr) = 40
    const pedScore = Math.max(0, 100 - (days / 1460) * 60);
    score = score.minus(new Decimal(100 - pedScore));
    inputs['pedWaitingDays'] = { value: String(days), note: null };
  } else {
    inputs['pedWaitingDays'] = { value: null, note: 'NOT_FOUND' };
  }

  // Initial waiting period
  const initial = facts.extraction.initialWaitingDays;
  if (initial.status !== 'NOT_FOUND' && initial.value !== null) {
    knownCount++;
    const days = initial.value;
    // 30 = fine; 60+ = deduct
    const deduction = Math.max(0, (days - 30) * 0.5);
    score = score.minus(new Decimal(deduction).toFixed(0));
    inputs['initialWaitingDays'] = { value: String(days), note: null };
  }

  if (knownCount === 0) return { score: null, inputs };
  return { score: Decimal.max(score, new Decimal('0')), inputs };
}

function scoreExclusions(facts: PolicyAnalysisFacts): {
  score: Decimal | null;
  inputs: Record<string, { value: string | null; note: string | null }>;
} {
  const inputs: Record<string, { value: string | null; note: string | null }> = {};
  const perm = facts.extraction.permanentExclusions;
  const spec = facts.extraction.specificExclusions;

  if (perm.status === 'NOT_FOUND' && spec.status === 'NOT_FOUND') {
    return { score: null, inputs };
  }

  const count =
    (perm.status !== 'NOT_FOUND' && perm.value ? perm.value.length : 0) +
    (spec.status !== 'NOT_FOUND' && spec.value ? spec.value.length : 0);

  // More exclusions = lower score. 0 = 100, 10 = 70, 20+ = 50
  const score = Math.max(50, 100 - count * 2.5);
  inputs['exclusionCount'] = { value: String(count), note: null };

  return { score: new Decimal(score), inputs };
}

function scoreBenefits(facts: PolicyAnalysisFacts): {
  score: Decimal | null;
  inputs: Record<string, { value: string | null; note: string | null }>;
} {
  const inputs: Record<string, { value: string | null; note: string | null }> = {};
  let score = new Decimal('50'); // base 50
  let knownCount = 0;

  // NCB
  const ncb = facts.extraction.ncbAvailable;
  if (ncb.status !== 'NOT_FOUND') {
    knownCount++;
    if (ncb.value) { score = score.plus(new Decimal('15')); inputs['ncb'] = { value: 'available', note: null }; }
    else { inputs['ncb'] = { value: 'not available', note: null }; }
  }

  // Restoration
  const restore = facts.extraction.restorationAvailable;
  if (restore.status !== 'NOT_FOUND') {
    knownCount++;
    if (restore.value) { score = score.plus(new Decimal('20')); inputs['restoration'] = { value: 'available', note: null }; }
    else { inputs['restoration'] = { value: 'not available', note: null }; }
  }

  // OPD
  const opd = facts.extraction.opdCovered;
  if (opd.status !== 'NOT_FOUND') {
    knownCount++;
    if (opd.value) { score = score.plus(new Decimal('10')); inputs['opd'] = { value: 'available', note: null }; }
  }

  // Health checkup
  const checkup = facts.extraction.healthCheckupCovered;
  if (checkup.status !== 'NOT_FOUND') {
    if (checkup.value) score = score.plus(new Decimal('5'));
    inputs['healthCheckup'] = { value: String(checkup.value), note: null };
  }

  if (knownCount === 0) return { score: null, inputs };
  return { score: Decimal.min(score, new Decimal('100')), inputs };
}

// ---------------------------------------------------------------------------
// Composite
// ---------------------------------------------------------------------------

export interface PolicyScoreResult {
  scoreSnapshot: PolicyScoreSnapshot;
  incomplete: boolean;
}

export function computePolicyScore(
  facts: PolicyAnalysisFacts,
  findings: PolicyFindingDTO[],
): PolicyScoreResult {
  const weights = DEFAULT_PILLAR_WEIGHTS;

  const pillarResults = {
    coverage_comprehensiveness: scoreCoverageComprehensiveness(facts),
    financial_restrictions: scoreFinancialRestrictions(facts),
    waiting_periods: scoreWaitingPeriods(facts),
    exclusions: scoreExclusions(facts),
    benefits: scoreBenefits(facts),
  };

  let weightedSum = new Decimal('0');
  let totalWeight = new Decimal('0');
  let unknownWeight = new Decimal('0');
  const pillars: PolicyPillarScore[] = [];

  for (const [key, result] of Object.entries(pillarResults) as Array<[PillarKey, typeof pillarResults[PillarKey]]>) {
    const weight = weights[key];
    if (result.score !== null) {
      weightedSum = weightedSum.plus(result.score.mul(weight));
      totalWeight = totalWeight.plus(weight);
    } else {
      unknownWeight = unknownWeight.plus(weight);
    }

    pillars.push({
      pillar: key,
      score: result.score?.toFixed(2) ?? null,
      appliedWeight: weight.toFixed(4),
      inputs: result.inputs,
    });
  }

  // Check for incomplete analysis
  const unknownFraction = unknownWeight.div(new Decimal('1'));
  const incomplete = unknownFraction.gt(INCOMPLETE_THRESHOLD) || totalWeight.isZero();

  if (incomplete) {
    return {
      incomplete: true,
      scoreSnapshot: {
        overall: null,
        pillars,
        ratingCategory: null,
        strongestAspects: [],
        weakestAspects: [],
        criticalIssues: findings
          .filter((f) => f.severity === 'CRITICAL')
          .map((f) => f.headline)
          .slice(0, 3),
        scoringVersion: SCORING_VERSION,
        incompleteAnalysis: true,
      },
    };
  }

  // Normalise weighted sum by total known weight
  const composite = weightedSum.div(totalWeight);

  // Assert bounds
  if (composite.lt(new Decimal('0')) || composite.gt(new Decimal('100'))) {
    throw new Error(
      `[policyScore] computed score ${composite.toFixed(2)} is outside [0, 100]. ` +
        'This is a bug in the pillar scorers.',
    );
  }

  const compositeFixed = composite.toFixed(2);

  // Rating category
  let ratingCategory: string;
  if (composite.gte(new Decimal('80'))) ratingCategory = 'Strong';
  else if (composite.gte(new Decimal('65'))) ratingCategory = 'Good';
  else if (composite.gte(new Decimal('45'))) ratingCategory = 'Needs Attention';
  else ratingCategory = 'Significant Limitations';

  // Strongest and weakest aspects
  const scoredPillars = pillars.filter((p) => p.score !== null);
  scoredPillars.sort((a, b) =>
    new Decimal(b.score!).minus(new Decimal(a.score!)).toNumber(),
  );
  const strongestAspects = scoredPillars.slice(0, 2).map((p) =>
    p.pillar.replace(/_/g, ' '),
  );
  const weakestAspects = scoredPillars.slice(-2).map((p) =>
    p.pillar.replace(/_/g, ' '),
  );

  const criticalIssues = findings
    .filter((f) => f.severity === 'CRITICAL')
    .map((f) => f.headline)
    .slice(0, 3);

  return {
    incomplete: false,
    scoreSnapshot: {
      overall: compositeFixed,
      pillars,
      ratingCategory,
      strongestAspects,
      weakestAspects,
      criticalIssues,
      scoringVersion: SCORING_VERSION,
      incompleteAnalysis: false,
    },
  };
}
