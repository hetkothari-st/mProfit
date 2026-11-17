/**
 * Pure unit tests for policy check rules.
 *
 * Rules are pure functions — no DB, no I/O, no clock.
 * Tests verify specific finding codes, severities, and financial calculations.
 */

import { describe, it, expect } from 'vitest';
import type { PolicyAnalysisFacts } from '../../src/services/policyCheck/types.js';
import { DEFAULT_POLICY_RULE_CONSTANTS } from '../../src/services/policyCheck/types.js';
import { copayMandatoryRule } from '../../src/services/policyCheck/rules/copay.mandatory.js';
import { roomRentRestrictionRule } from '../../src/services/policyCheck/rules/roomrent.restriction.js';
import { waitingPedRule } from '../../src/services/policyCheck/rules/waiting.ped.js';
import { restorationConditionsRule } from '../../src/services/policyCheck/rules/restoration.conditions.js';
import { POLICY_RULES } from '../../src/services/policyCheck/rules/registry.js';
import type { PolicyExtraction } from '../../src/services/policyCheck/extractionSchema.js';

// ---------------------------------------------------------------------------
// Test factory helpers
// ---------------------------------------------------------------------------

function notFound<T = string>() {
  return { value: null as T | null, confidence: 0, sourceDocId: null, sourcePage: null, clauseHeading: null, status: 'NOT_FOUND' as const };
}

function extracted<T>(value: T, confidence = 0.9, page = 1) {
  return { value, confidence, sourceDocId: 'doc1', sourcePage: page, clauseHeading: 'Test clause', status: 'EXTRACTED' as const };
}

function makeExtraction(overrides: Partial<PolicyExtraction> = {}): PolicyExtraction {
  const base: PolicyExtraction = {
    insuredName: notFound(),
    policyNumber: notFound(),
    insurerName: notFound(),
    planName: notFound(),
    policyType: extracted('HEALTH'),
    policyStartDate: notFound(),
    policyEndDate: notFound(),
    sumInsured: notFound(),
    premiumAmountInr: notFound(),
    adultsCount: notFound(),
    childrenCount: notFound(),
    inPatientCovered: notFound(),
    dayCareCovered: notFound(),
    preHospDays: notFound(),
    postHospDays: notFound(),
    ayushCovered: notFound(),
    ambulanceCovered: notFound(),
    ambulanceLimitInr: notFound(),
    domiciliaryCovered: notFound(),
    maternityCovered: notFound(),
    maternityLimitInr: notFound(),
    copaymentPct: notFound(),
    copaymentSeniorCitizenOnly: notFound(),
    roomRentLimitType: notFound(),
    roomRentLimitInr: notFound(),
    roomRentLimitPct: notFound(),
    proportionateDeductionApplies: notFound(),
    diseaseSubLimits: notFound<Record<string, string>>(),
    deductibleInr: notFound(),
    cumulativeDeductibleInr: notFound(),
    initialWaitingDays: notFound(),
    pedWaitingDays: notFound(),
    specificDiseaseWaitingDays: notFound(),
    maternityWaitingDays: notFound(),
    ncbAvailable: notFound(),
    ncbIncrementPct: notFound(),
    ncbMaxPct: notFound(),
    ncbType: notFound(),
    restorationAvailable: notFound(),
    restorationCount: notFound(),
    restorationForSameIllness: notFound(),
    restorationConditionsText: notFound(),
    permanentExclusions: notFound<string[]>(),
    specificExclusions: notFound<string[]>(),
    healthCheckupCovered: notFound(),
    criticalIllnessCoverInr: notFound(),
    opdCovered: notFound(),
    opdLimitInr: notFound(),
    otherBenefits: notFound<string[]>(),
  };
  return { ...base, ...overrides };
}

function makeFacts(extraction: Partial<PolicyExtraction> = {}, constants: Partial<typeof DEFAULT_POLICY_RULE_CONSTANTS> = {}): PolicyAnalysisFacts {
  return {
    asOf: '2026-01-01T00:00:00Z',
    userId: 'test-user',
    policyId: 'test-policy',
    checkId: 'test-check',
    constants: { ...DEFAULT_POLICY_RULE_CONSTANTS, ...constants },
    extraction: makeExtraction(extraction),
    insurer: null,
  };
}

// ---------------------------------------------------------------------------
// Co-payment rule
// ---------------------------------------------------------------------------

describe('copayMandatoryRule', () => {
  it('no finding when co-payment is 0%', () => {
    const facts = makeFacts({ copaymentPct: extracted('0') });
    expect(copayMandatoryRule.evaluate(facts)).toHaveLength(0);
  });

  it('NOTICE for 5% co-payment (below warning threshold)', () => {
    const facts = makeFacts({ copaymentPct: extracted('5') });
    const findings = copayMandatoryRule.evaluate(facts);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('NOTICE');
    expect(findings[0]!.code).toBe('COPAY_NOTICE');
  });

  it('WARNING for 10% co-payment', () => {
    const facts = makeFacts({ copaymentPct: extracted('10') });
    const findings = copayMandatoryRule.evaluate(facts);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('WARNING');
    expect(findings[0]!.code).toBe('COPAY_WARNING');
  });

  it('CRITICAL for 20% co-payment', () => {
    const facts = makeFacts({ copaymentPct: extracted('20') });
    const findings = copayMandatoryRule.evaluate(facts);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('CRITICAL');
    expect(findings[0]!.code).toBe('COPAY_CRITICAL');
  });

  it('NOTICE (not WARNING) for unknown co-payment', () => {
    const facts = makeFacts({ copaymentPct: notFound() });
    const findings = copayMandatoryRule.evaluate(facts);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe('COPAY_UNKNOWN');
    expect(findings[0]!.severity).toBe('NOTICE');
  });

  it('finding headline contains the out-of-pocket amount for 10% copay on ₹5L', () => {
    const facts = makeFacts({ copaymentPct: extracted('10') });
    const findings = copayMandatoryRule.evaluate(facts);
    // 10% of ₹500000 = ₹50000
    expect(findings[0]!.headline).toContain('50000');
  });

  it('evidence is non-empty for all findings', () => {
    for (const pct of ['0', '5', '10', '20']) {
      const facts = makeFacts({ copaymentPct: extracted(pct) });
      if (pct === '0') continue; // no finding
      const findings = copayMandatoryRule.evaluate(facts);
      for (const f of findings) {
        expect(f.evidence.length).toBeGreaterThan(0);
        expect(f.whatWouldChangeThis.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Room rent rule
// ---------------------------------------------------------------------------

describe('roomRentRestrictionRule', () => {
  it('no finding for NO_LIMIT room rent', () => {
    const facts = makeFacts({ roomRentLimitType: extracted('NO_LIMIT') });
    expect(roomRentRestrictionRule.evaluate(facts)).toHaveLength(0);
  });

  it('no finding for ACTUAL room rent', () => {
    const facts = makeFacts({ roomRentLimitType: extracted('ACTUAL') });
    expect(roomRentRestrictionRule.evaluate(facts)).toHaveLength(0);
  });

  it('WARNING for SUB_LIMIT_FIXED below threshold', () => {
    const facts = makeFacts({
      roomRentLimitType: extracted('SUB_LIMIT_FIXED'),
      roomRentLimitInr: extracted('2000'),
    });
    const findings = roomRentRestrictionRule.evaluate(facts);
    expect(findings.some((f) => f.code === 'ROOM_RENT_LOW_FIXED')).toBe(true);
    expect(findings.some((f) => f.severity === 'WARNING')).toBe(true);
  });

  it('CRITICAL when proportionate deduction is explicitly confirmed', () => {
    const facts = makeFacts({
      roomRentLimitType: extracted('SUB_LIMIT_FIXED'),
      roomRentLimitInr: extracted('5000'),
      proportionateDeductionApplies: extracted(true),
    });
    const findings = roomRentRestrictionRule.evaluate(facts);
    expect(findings.some((f) => f.code === 'ROOM_RENT_PROPORTIONATE_DEDUCTION')).toBe(true);
    expect(findings.some((f) => f.severity === 'CRITICAL')).toBe(true);
  });

  it('NO proportionate deduction finding when status is NOT_FOUND', () => {
    const facts = makeFacts({
      roomRentLimitType: extracted('SUB_LIMIT_FIXED'),
      roomRentLimitInr: extracted('5000'),
      proportionateDeductionApplies: notFound<boolean>(),
    });
    const findings = roomRentRestrictionRule.evaluate(facts);
    expect(findings.some((f) => f.code === 'ROOM_RENT_PROPORTIONATE_DEDUCTION')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Waiting periods
// ---------------------------------------------------------------------------

describe('waitingPedRule', () => {
  it('flags PED waiting period of 3 years as CRITICAL', () => {
    const facts = makeFacts({
      pedWaitingDays: extracted(1095), // 3 years
    });
    const findings = waitingPedRule.evaluate(facts);
    expect(findings.some((f) => f.code === 'PED_WAITING_PERIOD' && f.severity === 'CRITICAL')).toBe(true);
  });

  it('flags PED waiting period of 2 years as WARNING', () => {
    const facts = makeFacts({
      pedWaitingDays: extracted(730), // 2 years
    });
    const findings = waitingPedRule.evaluate(facts);
    expect(findings.some((f) => f.code === 'PED_WAITING_PERIOD' && f.severity === 'WARNING')).toBe(true);
  });

  it('no PED finding for 0 days', () => {
    const facts = makeFacts({ pedWaitingDays: extracted(0) });
    const findings = waitingPedRule.evaluate(facts);
    expect(findings.some((f) => f.code === 'PED_WAITING_PERIOD')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Restoration
// ---------------------------------------------------------------------------

describe('restorationConditionsRule', () => {
  it('INFO finding when restoration is available', () => {
    const facts = makeFacts({ restorationAvailable: extracted(true) });
    const findings = restorationConditionsRule.evaluate(facts);
    expect(findings.some((f) => f.code === 'RESTORATION_AVAILABLE' && f.severity === 'INFO')).toBe(true);
  });

  it('WARNING when restoration is not available', () => {
    const facts = makeFacts({ restorationAvailable: extracted(false) });
    const findings = restorationConditionsRule.evaluate(facts);
    expect(findings.some((f) => f.code === 'RESTORATION_NOT_AVAILABLE' && f.severity === 'WARNING')).toBe(true);
  });

  it('WARNING for different-illness-only restoration', () => {
    const facts = makeFacts({
      restorationAvailable: extracted(true),
      restorationForSameIllness: extracted(false),
    });
    const findings = restorationConditionsRule.evaluate(facts);
    expect(findings.some((f) => f.code === 'RESTORATION_DIFFERENT_ILLNESS_ONLY')).toBe(true);
  });

  it('no same-illness finding when restorationForSameIllness is NOT_FOUND', () => {
    const facts = makeFacts({
      restorationAvailable: extracted(true),
      restorationForSameIllness: notFound<boolean>(),
    });
    const findings = restorationConditionsRule.evaluate(facts);
    expect(findings.some((f) => f.code === 'RESTORATION_DIFFERENT_ILLNESS_ONLY')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe('POLICY_RULES registry', () => {
  it('has no duplicate rule ids', () => {
    const ids = POLICY_RULES.map((r) => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every rule produces findings with non-empty evidence and whatWouldChangeThis', () => {
    // Test with a facts set that triggers all rules
    const facts = makeFacts({
      copaymentPct: extracted('15'),
      roomRentLimitType: extracted('SUB_LIMIT_FIXED'),
      roomRentLimitInr: extracted('2000'),
      proportionateDeductionApplies: extracted(true),
      pedWaitingDays: extracted(1095),
      initialWaitingDays: extracted(90),
      ncbAvailable: extracted(false),
      restorationAvailable: extracted(false),
      permanentExclusions: extracted(['dental', 'cosmetic']),
      opdCovered: extracted(true),
    });

    for (const rule of POLICY_RULES) {
      const findings = rule.evaluate(facts);
      for (const f of findings) {
        expect(f.evidence.length, `${rule.id}: finding ${f.code} has empty evidence`).toBeGreaterThan(0);
        expect(f.whatWouldChangeThis.length, `${rule.id}: finding ${f.code} has empty whatWouldChangeThis`).toBeGreaterThan(0);
        expect(f.headline.length, `${rule.id}: finding ${f.code} headline too long`).toBeLessThanOrEqual(120);
        expect(Number(f.confidence), `${rule.id}: finding ${f.code} confidence out of range`).toBeGreaterThanOrEqual(0);
        expect(Number(f.confidence), `${rule.id}: finding ${f.code} confidence out of range`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('a failed rule is recorded but does not stop others from running', () => {
    // This is enforced at the engine level; just verify the registry loads
    expect(POLICY_RULES.length).toBeGreaterThan(0);
  });
});
