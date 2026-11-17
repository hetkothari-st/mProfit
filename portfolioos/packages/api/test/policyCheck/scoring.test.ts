/**
 * Pure unit tests for the policy health score calculator.
 */

import { describe, it, expect } from 'vitest';
import { computePolicyScore } from '../../src/services/policyCheck/scoring/policyScoreMath.js';
import type { PolicyAnalysisFacts } from '../../src/services/policyCheck/types.js';
import { DEFAULT_POLICY_RULE_CONSTANTS } from '../../src/services/policyCheck/types.js';
import type { PolicyFindingDTO } from '@everypaisa/shared';
import type { PolicyExtraction } from '../../src/services/policyCheck/extractionSchema.js';

function notFound<T = string>() {
  return { value: null as T | null, confidence: 0, sourceDocId: null, sourcePage: null, clauseHeading: null, status: 'NOT_FOUND' as const };
}

function extracted<T>(value: T, confidence = 0.9) {
  return { value, confidence, sourceDocId: 'doc1', sourcePage: 1, clauseHeading: 'clause', status: 'EXTRACTED' as const };
}

function makeExtraction(overrides: Partial<PolicyExtraction> = {}): PolicyExtraction {
  const base: PolicyExtraction = {
    insuredName: notFound(), policyNumber: notFound(), insurerName: notFound(),
    planName: notFound(), policyType: extracted('HEALTH'),
    policyStartDate: notFound(), policyEndDate: notFound(),
    sumInsured: notFound(), premiumAmountInr: notFound(),
    adultsCount: notFound(), childrenCount: notFound(),
    inPatientCovered: notFound(), dayCareCovered: notFound(),
    preHospDays: notFound(), postHospDays: notFound(),
    ayushCovered: notFound(), ambulanceCovered: notFound(),
    ambulanceLimitInr: notFound(), domiciliaryCovered: notFound(),
    maternityCovered: notFound(), maternityLimitInr: notFound(),
    copaymentPct: notFound(), copaymentSeniorCitizenOnly: notFound(),
    roomRentLimitType: notFound(), roomRentLimitInr: notFound(),
    roomRentLimitPct: notFound(), proportionateDeductionApplies: notFound(),
    diseaseSubLimits: notFound<Record<string, string>>(),
    deductibleInr: notFound(), cumulativeDeductibleInr: notFound(),
    initialWaitingDays: notFound(), pedWaitingDays: notFound(),
    specificDiseaseWaitingDays: notFound(), maternityWaitingDays: notFound(),
    ncbAvailable: notFound(), ncbIncrementPct: notFound(),
    ncbMaxPct: notFound(), ncbType: notFound(),
    restorationAvailable: notFound(), restorationCount: notFound(),
    restorationForSameIllness: notFound(), restorationConditionsText: notFound(),
    permanentExclusions: notFound<string[]>(), specificExclusions: notFound<string[]>(),
    healthCheckupCovered: notFound(), criticalIllnessCoverInr: notFound(),
    opdCovered: notFound(), opdLimitInr: notFound(),
    otherBenefits: notFound<string[]>(),
  };
  return { ...base, ...overrides };
}

function makeFacts(extraction: Partial<PolicyExtraction> = {}): PolicyAnalysisFacts {
  return {
    asOf: '2026-01-01T00:00:00Z',
    userId: 'u', policyId: 'p', checkId: 'c',
    constants: DEFAULT_POLICY_RULE_CONSTANTS,
    extraction: makeExtraction(extraction),
    insurer: null,
  };
}

const noFindings: PolicyFindingDTO[] = [];

describe('computePolicyScore', () => {
  it('scores a comprehensive policy higher than a restrictive one', () => {
    const goodFacts = makeFacts({
      inPatientCovered: extracted(true),
      dayCareCovered: extracted(true),
      preHospDays: extracted(60),
      postHospDays: extracted(180),
      copaymentPct: extracted('0'),
      roomRentLimitType: extracted('NO_LIMIT'),
      pedWaitingDays: extracted(365),
      ncbAvailable: extracted(true),
      restorationAvailable: extracted(true),
    });
    const badFacts = makeFacts({
      inPatientCovered: extracted(false),
      dayCareCovered: extracted(false),
      copaymentPct: extracted('20'),
      roomRentLimitType: extracted('SUB_LIMIT_FIXED'),
      roomRentLimitInr: extracted('1000'),
      proportionateDeductionApplies: extracted(true),
      pedWaitingDays: extracted(1460),
      ncbAvailable: extracted(false),
      restorationAvailable: extracted(false),
    });

    const good = computePolicyScore(goodFacts, noFindings);
    const bad = computePolicyScore(badFacts, noFindings);

    expect(good.scoreSnapshot.overall).not.toBeNull();
    expect(bad.scoreSnapshot.overall).not.toBeNull();
    expect(parseFloat(good.scoreSnapshot.overall!)).toBeGreaterThan(
      parseFloat(bad.scoreSnapshot.overall!),
    );
  });

  it('score is in [0, 100] when pillars produce valid values', () => {
    const facts = makeFacts({
      inPatientCovered: extracted(true),
      copaymentPct: extracted('10'),
      pedWaitingDays: extracted(730),
      restorationAvailable: extracted(true),
    });
    const result = computePolicyScore(facts, noFindings);
    if (result.scoreSnapshot.overall !== null) {
      const score = parseFloat(result.scoreSnapshot.overall);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('INCOMPLETE_ANALYSIS when all pillars are unknown', () => {
    const facts = makeFacts(); // all NOT_FOUND
    const result = computePolicyScore(facts, noFindings);
    expect(result.incomplete).toBe(true);
    expect(result.scoreSnapshot.overall).toBeNull();
    expect(result.scoreSnapshot.incompleteAnalysis).toBe(true);
  });

  it('identical facts produce identical scores', () => {
    const facts = makeFacts({
      copaymentPct: extracted('10'),
      pedWaitingDays: extracted(730),
      inPatientCovered: extracted(true),
      restorationAvailable: extracted(true),
    });
    const r1 = computePolicyScore(facts, noFindings);
    const r2 = computePolicyScore(facts, noFindings);
    expect(r1.scoreSnapshot.overall).toBe(r2.scoreSnapshot.overall);
  });

  it('10% copay reduces the financial_restrictions pillar score', () => {
    const noCoplay = makeFacts({ copaymentPct: extracted('0'), roomRentLimitType: extracted('NO_LIMIT') });
    const withCopay = makeFacts({ copaymentPct: extracted('10'), roomRentLimitType: extracted('NO_LIMIT') });

    const r1 = computePolicyScore(noCoplay, noFindings);
    const r2 = computePolicyScore(withCopay, noFindings);

    const p1 = r1.scoreSnapshot.pillars.find((p) => p.pillar === 'financial_restrictions');
    const p2 = r2.scoreSnapshot.pillars.find((p) => p.pillar === 'financial_restrictions');

    if (p1?.score && p2?.score) {
      expect(parseFloat(p1.score)).toBeGreaterThan(parseFloat(p2.score));
    }
  });

  it('provides rating category for a known score', () => {
    const facts = makeFacts({
      inPatientCovered: extracted(true),
      dayCareCovered: extracted(true),
      copaymentPct: extracted('0'),
      roomRentLimitType: extracted('NO_LIMIT'),
      pedWaitingDays: extracted(365),
      ncbAvailable: extracted(true),
      restorationAvailable: extracted(true),
    });
    const result = computePolicyScore(facts, noFindings);
    if (!result.incomplete) {
      expect(result.scoreSnapshot.ratingCategory).not.toBeNull();
      expect(['Strong', 'Good', 'Needs Attention', 'Significant Limitations']).toContain(
        result.scoreSnapshot.ratingCategory,
      );
    }
  });
});
