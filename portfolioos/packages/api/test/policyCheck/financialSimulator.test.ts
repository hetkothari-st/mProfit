/**
 * Pure unit tests for the financial simulator.
 */

import { describe, it, expect } from 'vitest';
import { simulateFinancialOutcome } from '../../src/services/policyCheck/financialSimulator.service.js';
import type { FinancialSimulatorInput } from '@everypaisa/shared';
import type { PolicyExtraction } from '../../src/services/policyCheck/extractionSchema.js';

function notFound<T = string>() {
  return { value: null as T | null, confidence: 0, sourceDocId: null, sourcePage: null, clauseHeading: null, status: 'NOT_FOUND' as const };
}

function extracted<T>(value: T) {
  return { value, confidence: 0.9, sourceDocId: 'd', sourcePage: 1, clauseHeading: null, status: 'EXTRACTED' as const };
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
    ...overrides,
  };
  return base;
}

const baseInput: FinancialSimulatorInput = {
  totalBillInr: '1000000', // ₹10L
  roomRentPerDayInr: null,
  durationDays: null,
  copaymentPctOverride: null,
  roomRentLimitOverride: null,
};

describe('simulateFinancialOutcome', () => {
  it('5% copay on ₹10L = ₹50000 out-of-pocket copay', () => {
    const extraction = makeExtraction({ copaymentPct: extracted('5') });
    const result = simulateFinancialOutcome(baseInput, extraction);
    expect(parseFloat(result.copaymentInr)).toBeCloseTo(50000, 0);
  });

  it('10% copay on ₹10L = ₹100000 out-of-pocket copay', () => {
    const extraction = makeExtraction({ copaymentPct: extracted('10') });
    const result = simulateFinancialOutcome(baseInput, extraction);
    expect(parseFloat(result.copaymentInr)).toBeCloseTo(100000, 0);
  });

  it('zero copay → zero copayment amount', () => {
    const extraction = makeExtraction({ copaymentPct: extracted('0') });
    const result = simulateFinancialOutcome(baseInput, extraction);
    expect(parseFloat(result.copaymentInr)).toBe(0);
  });

  it('marks as partial estimate when copayment is unknown', () => {
    const extraction = makeExtraction(); // copaymentPct NOT_FOUND
    const result = simulateFinancialOutcome(baseInput, extraction);
    expect(result.isPartialEstimate).toBe(true);
    expect(result.missingInputs).toContain('copaymentPct (from policy)');
  });

  it('total bill = insurer payable + user contribution', () => {
    const extraction = makeExtraction({ copaymentPct: extracted('10') });
    const result = simulateFinancialOutcome(baseInput, extraction);
    const total = parseFloat(result.insurerPayableInr) + parseFloat(result.userContributionInr);
    expect(total).toBeCloseTo(parseFloat(baseInput.totalBillInr), 0);
  });

  it('room rent deduction is NOT computed when proportionateDeductionApplies is NOT_FOUND', () => {
    const extraction = makeExtraction({
      copaymentPct: extracted('0'),
      roomRentLimitInr: extracted('3000'),
      roomRentLimitType: extracted('SUB_LIMIT_FIXED'),
      // proportionateDeductionApplies is NOT_FOUND (default)
    });
    const result = simulateFinancialOutcome(
      { ...baseInput, roomRentPerDayInr: '8000', durationDays: 5 },
      extraction,
    );
    expect(parseFloat(result.roomRentDeductionInr)).toBe(0);
  });

  it('room rent deduction IS computed when proportionate deductions confirmed', () => {
    const extraction = makeExtraction({
      copaymentPct: extracted('0'),
      roomRentLimitInr: extracted('3000'),
      roomRentLimitType: extracted('SUB_LIMIT_FIXED'),
      proportionateDeductionApplies: extracted(true),
    });
    const result = simulateFinancialOutcome(
      { ...baseInput, totalBillInr: '100000', roomRentPerDayInr: '6000', durationDays: 5 },
      extraction,
    );
    expect(parseFloat(result.roomRentDeductionInr)).toBeGreaterThan(0);
  });

  it('partial estimate when room rent per day is not provided but proportionate confirmed', () => {
    const extraction = makeExtraction({
      copaymentPct: extracted('0'),
      roomRentLimitInr: extracted('3000'),
      proportionateDeductionApplies: extracted(true),
    });
    const result = simulateFinancialOutcome(
      { ...baseInput, roomRentPerDayInr: null, durationDays: null },
      extraction,
    );
    expect(result.isPartialEstimate).toBe(true);
    expect(result.missingInputs).toContain('roomRentPerDayInr');
  });

  it('all money values are decimal strings', () => {
    const extraction = makeExtraction({ copaymentPct: extracted('10') });
    const result = simulateFinancialOutcome(baseInput, extraction);
    for (const key of ['insurerPayableInr', 'copaymentInr', 'deductibleInr', 'roomRentDeductionInr', 'otherNonPayableInr', 'userContributionInr'] as const) {
      expect(typeof result[key]).toBe('string');
      expect(isNaN(parseFloat(result[key]))).toBe(false);
    }
  });
});
