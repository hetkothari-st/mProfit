/**
 * Turns per-pillar scores into the 0-100 composite, rating, strongest/weakest
 * aspects and the INCOMPLETE state. Shared by every product type.
 *
 *  - Unknown pillars drop out of the weight pool — NEVER scored as zero.
 *  - If more than 40% of the weight is unknown → INCOMPLETE_ANALYSIS (no score).
 *  - The composite is asserted to be in [0, 100] or this throws.
 *  - 80+ Strong, 65+ Good, 45+ Needs Attention, below that Significant Limitations.
 */

import { Decimal } from '@everypaisa/shared';
import type { PolicyFindingDTO, PolicyPillarScore, PolicyScoreSnapshot } from '@everypaisa/shared';

export interface PillarResult {
  score: Decimal | null;
  inputs: Record<string, { value: string | null; note: string | null }>;
}

const INCOMPLETE_THRESHOLD = new Decimal('0.40');

export function composeScore(
  pillarResults: Record<string, PillarResult>,
  weights: Record<string, Decimal>,
  scoringVersion: string,
  findings: PolicyFindingDTO[],
): { scoreSnapshot: PolicyScoreSnapshot; incomplete: boolean } {
  let weightedSum = new Decimal('0');
  let totalWeight = new Decimal('0');
  let unknownWeight = new Decimal('0');
  const pillars: PolicyPillarScore[] = [];

  for (const [key, result] of Object.entries(pillarResults)) {
    const weight = weights[key]!;
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

  const criticalIssues = findings
    .filter((f) => f.severity === 'CRITICAL')
    .map((f) => f.headline)
    .slice(0, 3);

  const incomplete = unknownWeight.gt(INCOMPLETE_THRESHOLD) || totalWeight.isZero();
  if (incomplete) {
    return {
      incomplete: true,
      scoreSnapshot: {
        overall: null,
        pillars,
        ratingCategory: null,
        strongestAspects: [],
        weakestAspects: [],
        criticalIssues,
        scoringVersion,
        incompleteAnalysis: true,
      },
    };
  }

  const composite = weightedSum.div(totalWeight);
  if (composite.lt(0) || composite.gt(100)) {
    throw new Error(`[policyScore] computed score ${composite.toFixed(2)} is outside [0, 100]. This is a bug in the pillar scorers.`);
  }

  const ratingCategory = composite.gte(80)
    ? 'Strong'
    : composite.gte(65)
      ? 'Good'
      : composite.gte(45)
        ? 'Needs Attention'
        : 'Significant Limitations';

  const scored = pillars.filter((p) => p.score !== null);
  scored.sort((a, b) => new Decimal(b.score!).minus(new Decimal(a.score!)).toNumber());

  return {
    incomplete: false,
    scoreSnapshot: {
      overall: composite.toFixed(2),
      pillars,
      ratingCategory,
      strongestAspects: scored.slice(0, 2).map((p) => p.pillar.replace(/_/g, ' ')),
      weakestAspects: scored.slice(-2).map((p) => p.pillar.replace(/_/g, ' ')),
      criticalIssues,
      scoringVersion,
      incompleteAnalysis: false,
    },
  };
}
