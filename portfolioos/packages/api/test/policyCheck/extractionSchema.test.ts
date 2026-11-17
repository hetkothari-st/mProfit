/**
 * Asserts that the Zod schema and Anthropic JSON Schema for policy extraction
 * cannot drift. Mirrors ingestion/schema.test.ts.
 *
 * Both schemas describe the same shape. A field added to one but not the
 * other is a silent failure: the LLM sends a field the validator ignores
 * (or the validator rejects a field the LLM was asked to produce).
 */

import { describe, it, expect } from 'vitest';
import { PolicyExtractionSchema, ANTHROPIC_TOOL_JSON_SCHEMA } from '../../src/services/policyCheck/extractionSchema.js';

describe('Policy extraction schema drift prevention', () => {
  it('Zod schema and Anthropic JSON Schema cover the same top-level fields', () => {
    const zodKeys = Object.keys(PolicyExtractionSchema.shape).sort();
    const jsonKeys = Object.keys(
      (ANTHROPIC_TOOL_JSON_SCHEMA as unknown as { properties: Record<string, unknown> }).properties,
    ).sort();

    expect(zodKeys).toEqual(jsonKeys);
  });

  it('every Anthropic property has the required sub-fields', () => {
    const props = (ANTHROPIC_TOOL_JSON_SCHEMA as unknown as { properties: Record<string, unknown> }).properties;
    for (const [key, schema] of Object.entries(props)) {
      const s = schema as Record<string, unknown>;
      expect(s, `${key} should have 'type'`).toHaveProperty('type');
      expect(s, `${key} should have 'properties'`).toHaveProperty('properties');
      const innerProps = s['properties'] as Record<string, unknown>;
      expect(Object.keys(innerProps)).toContain('value');
      expect(Object.keys(innerProps)).toContain('confidence');
      expect(Object.keys(innerProps)).toContain('status');
    }
  });

  it('Zod schema validates a minimal NOT_FOUND field correctly', () => {
    const minimalField = {
      value: null,
      confidence: 0.0,
      sourceDocId: null,
      sourcePage: null,
      clauseHeading: null,
      status: 'NOT_FOUND' as const,
    };

    const result = PolicyExtractionSchema.safeParse({
      insuredName: minimalField,
      policyNumber: minimalField,
      insurerName: minimalField,
      planName: minimalField,
      policyType: minimalField,
      policyStartDate: minimalField,
      policyEndDate: minimalField,
      sumInsured: minimalField,
      premiumAmountInr: minimalField,
      adultsCount: minimalField,
      childrenCount: minimalField,
      inPatientCovered: minimalField,
      dayCareCovered: minimalField,
      preHospDays: minimalField,
      postHospDays: minimalField,
      ayushCovered: minimalField,
      ambulanceCovered: minimalField,
      ambulanceLimitInr: minimalField,
      domiciliaryCovered: minimalField,
      maternityCovered: minimalField,
      maternityLimitInr: minimalField,
      copaymentPct: minimalField,
      copaymentSeniorCitizenOnly: minimalField,
      roomRentLimitType: minimalField,
      roomRentLimitInr: minimalField,
      roomRentLimitPct: minimalField,
      proportionateDeductionApplies: minimalField,
      diseaseSubLimits: { ...minimalField, value: null },
      deductibleInr: minimalField,
      cumulativeDeductibleInr: minimalField,
      initialWaitingDays: minimalField,
      pedWaitingDays: minimalField,
      specificDiseaseWaitingDays: minimalField,
      maternityWaitingDays: minimalField,
      ncbAvailable: minimalField,
      ncbIncrementPct: minimalField,
      ncbMaxPct: minimalField,
      ncbType: minimalField,
      restorationAvailable: minimalField,
      restorationCount: minimalField,
      restorationForSameIllness: minimalField,
      restorationConditionsText: minimalField,
      permanentExclusions: { ...minimalField, value: null },
      specificExclusions: { ...minimalField, value: null },
      healthCheckupCovered: minimalField,
      criticalIllnessCoverInr: minimalField,
      opdCovered: minimalField,
      opdLimitInr: minimalField,
      otherBenefits: { ...minimalField, value: null },
    });

    expect(result.success, result.success ? '' : JSON.stringify(result.error?.flatten())).toBe(true);
  });
});
