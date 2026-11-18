/**
 * Motor policies: extraction schema, rules, score, the IDV calculator and
 * the policy-type routing.
 */

import { describe, it, expect } from 'vitest';
import {
  MotorExtractionSchema,
  MOTOR_TOOL_JSON_SCHEMA,
  type MotorExtraction,
} from '../../src/services/policyCheck/motorExtractionSchema.js';
import { MOTOR_POLICY_RULES } from '../../src/services/policyCheck/rules/registry.js';
import { evaluateRules } from '../../src/services/policyCheck/analysisEngine.service.js';
import { computeMotorScore } from '../../src/services/policyCheck/scoring/motorScoreMath.js';
import { calculateMotorIdv, vehicleAgeYears } from '../../src/services/policyCheck/motorIdv.js';
import { asProductType, getExtractionSpec, insurerKindOf } from '../../src/services/policyCheck/extractionSpecs.js';
import { DEFAULT_MOTOR_RULE_CONSTANTS, type MotorAnalysisFacts } from '../../src/services/policyCheck/types.js';

type F = { value: unknown; confidence: number; sourceDocId: string | null; sourcePage: number | null; clauseHeading: string | null; status: 'EXTRACTED' | 'USER_EDITED' | 'NOT_FOUND' };
const nf = (): F => ({ value: null, confidence: 0, sourceDocId: null, sourcePage: null, clauseHeading: null, status: 'NOT_FOUND' });
const ex = (value: unknown, page = 1, confidence = 0.9): F => ({ value, confidence, sourceDocId: 'd1', sourcePage: page, clauseHeading: 'Clause', status: 'EXTRACTED' });

const KEYS = Object.keys(MotorExtractionSchema.shape);
const AS_OF = '2026-11-18T00:00:00.000Z';

function motor(over: Record<string, F> = {}): MotorExtraction {
  const o: Record<string, F> = {};
  for (const k of KEYS) o[k] = nf();
  return { ...o, ...over } as unknown as MotorExtraction;
}

function facts(extr: MotorExtraction): MotorAnalysisFacts {
  return { asOf: AS_OF, userId: 'u', policyId: 'p', checkId: 'c', productType: 'MOTOR', constants: DEFAULT_MOTOR_RULE_CONSTANTS, extraction: extr, insurer: null };
}

const run = (over: Record<string, F>) => evaluateRules<MotorAnalysisFacts>(facts(motor(over)), MOTOR_POLICY_RULES).findings;
const codes = (fs: Array<{ code: string }>) => fs.map((f) => f.code);
const sev = (fs: Array<{ code: string; severity: string }>, code: string) => fs.find((f) => f.code === code)?.severity;

describe('motor extraction schema', () => {
  it('Zod schema and Anthropic JSON Schema cover the same fields', () => {
    const jsonKeys = Object.keys((MOTOR_TOOL_JSON_SCHEMA as unknown as { properties: Record<string, unknown> }).properties).sort();
    expect([...KEYS].sort()).toEqual(jsonKeys);
  });
  it('an all-NOT_FOUND extraction is valid', () => {
    expect(MotorExtractionSchema.safeParse(motor()).success).toBe(true);
  });
  it('does not extract the registration number', () => {
    expect(KEYS.some((k) => /regist|chassis|engineNo/i.test(k))).toBe(false);
  });
});

describe('motor routing', () => {
  it('maps MOTOR to MOTOR and has a spec', () => {
    expect(asProductType('MOTOR')).toBe('MOTOR');
    expect(getExtractionSpec('MOTOR').toolName).toBe('extract_motor_policy_data');
  });
  it('has no insurer table for motor, and keeps the others', () => {
    expect(insurerKindOf('MOTOR')).toBeNull();
    expect(insurerKindOf('HEALTH')).toBe('HEALTH');
    expect(insurerKindOf('TERM')).toBe('LIFE');
    expect(insurerKindOf('SAVINGS')).toBe('LIFE');
  });
});

describe('motor rules', () => {
  it('flags an expired policy', () => {
    const fs = run({ policyEndDate: ex('2026-10-01') });
    expect(sev(fs, 'POLICY_EXPIRED')).toBe('WARNING');
  });
  it('reminds when expiry is within 30 days, and is quiet beyond', () => {
    expect(sev(run({ policyEndDate: ex('2026-12-10') }), 'RENEWAL_DUE')).toBe('NOTICE');
    expect(sev(run({ policyEndDate: ex('2027-06-01') }), 'POLICY_IN_FORCE')).toBe('INFO');
  });
  it('grades the cover type', () => {
    expect(sev(run({ policyKind: ex('THIRD_PARTY_ONLY') }), 'THIRD_PARTY_ONLY')).toBe('WARNING');
    expect(sev(run({ policyKind: ex('Third Party Liability Only') }), 'THIRD_PARTY_ONLY')).toBe('WARNING');
    expect(sev(run({ policyKind: ex('OWN_DAMAGE_ONLY') }), 'OWN_DAMAGE_ONLY')).toBe('NOTICE');
    expect(sev(run({ policyKind: ex('COMPREHENSIVE') }), 'COMPREHENSIVE')).toBe('INFO');
  });
  it('checks the owner-driver accident cover against the usual 15 lakh', () => {
    expect(sev(run({ ownerDriverPaInr: ex('100000') }), 'OWNER_PA_BELOW_USUAL')).toBe('NOTICE');
    expect(sev(run({ ownerDriverPaInr: ex('1500000') }), 'OWNER_PA_OK')).toBe('INFO');
  });
  it('flags missing zero-dep and engine protect on a young vehicle only', () => {
    const young = run({ policyKind: ex('COMPREHENSIVE'), manufacturingYear: ex(2024), policyStartDate: ex('2026-04-01'), zeroDepreciation: ex(false), engineProtect: ex(false) });
    expect(codes(young)).toContain('ZERO_DEP_ABSENT');
    expect(codes(young)).toContain('ENGINE_PROTECT_ABSENT');
    const old = run({ policyKind: ex('COMPREHENSIVE'), manufacturingYear: ex(2012), policyStartDate: ex('2026-04-01'), zeroDepreciation: ex(false), engineProtect: ex(false) });
    expect(codes(old)).not.toContain('ZERO_DEP_ABSENT');
  });
  it('add-on rules stay quiet for third-party only', () => {
    const fs = run({ policyKind: ex('THIRD_PARTY_ONLY'), zeroDepreciation: ex(false) });
    expect(codes(fs)).not.toContain('ZERO_DEP_ABSENT');
  });
  it('lists included add-ons', () => {
    const fs = run({ policyKind: ex('COMPREHENSIVE'), zeroDepreciation: ex(true), roadsideAssistance: ex(true) });
    const f = fs.find((x) => x.code === 'ADD_ONS_INCLUDED');
    expect(f?.headline).toMatch(/2 add-ons/);
  });
  it('warns when a large no-claim bonus is unprotected', () => {
    const fs = run({ ncbPercent: ex(50), ncbProtect: ex(false) });
    expect(sev(fs, 'NCB_EARNED')).toBe('INFO');
    expect(sev(fs, 'NCB_UNPROTECTED')).toBe('NOTICE');
    expect(codes(run({ ncbPercent: ex(20), ncbProtect: ex(false) }))).not.toContain('NCB_UNPROTECTED');
    expect(codes(run({ ncbPercent: ex(50), ncbProtect: ex(true) }))).not.toContain('NCB_UNPROTECTED');
  });
  it('flags a high voluntary deductible', () => {
    expect(sev(run({ voluntaryDeductibleInr: ex('15000') }), 'VOLUNTARY_DEDUCTIBLE_HIGH')).toBe('NOTICE');
    expect(sev(run({ voluntaryDeductibleInr: ex('2500') }), 'VOLUNTARY_DEDUCTIBLE')).toBe('INFO');
    expect(run({ voluntaryDeductibleInr: ex('0') })).toEqual([]);
  });
  it('notes a commercial-use exclusion', () => {
    expect(sev(run({ exclusions: ex(['Use for hire or reward', 'War']) }), 'EXCLUSION_COMMERCIAL_USE')).toBe('NOTICE');
  });
  it('an unknown field produces no finding', () => {
    expect(run({})).toEqual([]);
  });
  it('every finding states what would change it and cites evidence', () => {
    const fs = run({ policyKind: ex('COMPREHENSIVE'), policyEndDate: ex('2026-12-01'), ownerDriverPaInr: ex('100000'), ncbPercent: ex(50), ncbProtect: ex(false), voluntaryDeductibleInr: ex('10000') });
    expect(fs.length).toBeGreaterThan(3);
    for (const f of fs) {
      expect(f.whatWouldChangeThis.length).toBeGreaterThan(0);
      expect(f.evidence.length).toBeGreaterThan(0);
    }
  });
});

describe('motor score', () => {
  const good = {
    policyKind: ex('COMPREHENSIVE'), policyEndDate: ex('2027-06-01'), zeroDepreciation: ex(true), engineProtect: ex(true), consumablesCover: ex(true),
    ncbPercent: ex(50), ncbProtect: ex(true), ownerDriverPaInr: ex('1500000'),
  };
  it('is deterministic', () => {
    expect(computeMotorScore(facts(motor(good)), []).scoreSnapshot.overall).toBe(computeMotorScore(facts(motor(good)), []).scoreSnapshot.overall);
  });
  it('scores a strong policy above a thin one', () => {
    const thin = { policyKind: ex('THIRD_PARTY_ONLY'), policyEndDate: ex('2026-10-01'), ownerDriverPaInr: ex('100000') };
    expect(Number(computeMotorScore(facts(motor(good)), []).scoreSnapshot.overall)).toBeGreaterThan(
      Number(computeMotorScore(facts(motor(thin)), []).scoreSnapshot.overall),
    );
  });
  it('drops claim_value for third-party only', () => {
    const s = computeMotorScore(facts(motor({ policyKind: ex('THIRD_PARTY_ONLY'), policyEndDate: ex('2027-06-01'), ownerDriverPaInr: ex('1500000'), ncbPercent: ex(0) })), []).scoreSnapshot;
    expect(s.pillars.find((p) => p.pillar === 'claim_value')?.score).toBeNull();
  });
  it('an empty extraction is INCOMPLETE, not zero', () => {
    const r = computeMotorScore(facts(motor()), []);
    expect(r.incomplete).toBe(true);
    expect(r.scoreSnapshot.overall).toBeNull();
  });
});

describe('IDV calculator', () => {
  const x = motor({ idvInr: ex('600000'), manufacturingYear: ex(2023), policyStartDate: ex('2026-04-01') });

  it('computes vehicle age from the manufacture year and policy start', () => {
    expect(vehicleAgeYears(x, AS_OF)).toBe(3);
    expect(vehicleAgeYears(motor(), AS_OF)).toBeNull();
  });
  it('shows an IDV below market value as a shortfall', () => {
    const o = calculateMotorIdv({ currentMarketValueInr: '800000' as never, exShowroomPriceInr: null }, x, AS_OF);
    expect(o.gapInr).toBe('200000.0000');
    expect(o.gapPct).toBe('25.00');
    expect(o.summary).toMatch(/below/);
  });
  it('flags an IDV above market value', () => {
    const o = calculateMotorIdv({ currentMarketValueInr: '400000' as never, exShowroomPriceInr: null }, x, AS_OF);
    expect(o.gapPct).toBe('-50.00');
    expect(o.summary).toMatch(/above/);
  });
  it('accepts an IDV close to market value', () => {
    const o = calculateMotorIdv({ currentMarketValueInr: '620000' as never, exShowroomPriceInr: null }, x, AS_OF);
    expect(o.summary).toMatch(/reasonable match/);
  });
  it('applies the IRDAI schedule: 3 completed years = 40% off 1000000', () => {
    const o = calculateMotorIdv({ currentMarketValueInr: null, exShowroomPriceInr: '1000000' as never }, x, AS_OF);
    expect(o.scheduleIdvInr).toBe('600000.0000');
  });
  it('gives no schedule estimate beyond 5 years', () => {
    const old = motor({ idvInr: ex('100000'), manufacturingYear: ex(2015), policyStartDate: ex('2026-04-01') });
    const o = calculateMotorIdv({ currentMarketValueInr: null, exShowroomPriceInr: '1000000' as never }, old, AS_OF);
    expect(o.scheduleIdvInr).toBeNull();
    expect(o.assumptions.join(' ')).toMatch(/After 5 years/);
  });
  it('lists missing inputs instead of inventing them', () => {
    const o = calculateMotorIdv({ currentMarketValueInr: null, exShowroomPriceInr: null }, motor(), AS_OF);
    expect(o.missingInputs.length).toBeGreaterThan(0);
    expect(o.gapInr).toBeNull();
  });
});
