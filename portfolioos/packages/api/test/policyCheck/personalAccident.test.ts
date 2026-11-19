/**
 * Personal accident policies: extraction schema, rules, score, the cover
 * calculator and the policy-type routing.
 */

import { describe, it, expect } from 'vitest';
import {
  PaExtractionSchema,
  PA_TOOL_JSON_SCHEMA,
  type PaExtraction,
} from '../../src/services/policyCheck/paExtractionSchema.js';
import { PA_POLICY_RULES } from '../../src/services/policyCheck/rules/registry.js';
import { evaluateRules } from '../../src/services/policyCheck/analysisEngine.service.js';
import { computePaScore } from '../../src/services/policyCheck/scoring/paScoreMath.js';
import { calculatePaCover } from '../../src/services/policyCheck/paCover.js';
import { asProductType, getExtractionSpec, insurerKindOf } from '../../src/services/policyCheck/extractionSpecs.js';
import { DEFAULT_PA_RULE_CONSTANTS, type PaAnalysisFacts } from '../../src/services/policyCheck/types.js';

type F = { value: unknown; confidence: number; sourceDocId: string | null; sourcePage: number | null; clauseHeading: string | null; status: 'EXTRACTED' | 'USER_EDITED' | 'NOT_FOUND' };
const nf = (): F => ({ value: null, confidence: 0, sourceDocId: null, sourcePage: null, clauseHeading: null, status: 'NOT_FOUND' });
const ex = (value: unknown, page = 1, confidence = 0.9): F => ({ value, confidence, sourceDocId: 'd1', sourcePage: page, clauseHeading: 'Clause', status: 'EXTRACTED' });

const KEYS = Object.keys(PaExtractionSchema.shape);
const AS_OF = '2026-11-18T00:00:00.000Z';

function pa(over: Record<string, F> = {}): PaExtraction {
  const o: Record<string, F> = {};
  for (const k of KEYS) o[k] = nf();
  return { ...o, ...over } as unknown as PaExtraction;
}

function facts(extr: PaExtraction): PaAnalysisFacts {
  return { asOf: AS_OF, userId: 'u', policyId: 'p', checkId: 'c', productType: 'PERSONAL_ACCIDENT', constants: DEFAULT_PA_RULE_CONSTANTS, extraction: extr, insurer: null };
}

const run = (over: Record<string, F>) => evaluateRules<PaAnalysisFacts>(facts(pa(over)), PA_POLICY_RULES).findings;
const codes = (fs: Array<{ code: string }>) => fs.map((f) => f.code);
const sev = (fs: Array<{ code: string; severity: string }>, code: string) => fs.find((f) => f.code === code)?.severity;

describe('personal accident extraction schema', () => {
  it('Zod schema and Anthropic JSON Schema cover the same fields', () => {
    const jsonKeys = Object.keys((PA_TOOL_JSON_SCHEMA as unknown as { properties: Record<string, unknown> }).properties).sort();
    expect([...KEYS].sort()).toEqual(jsonKeys);
  });
  it('an all-NOT_FOUND extraction is valid', () => {
    expect(PaExtractionSchema.safeParse(pa()).success).toBe(true);
  });
  it('does not extract occupation, health details or the nominee', () => {
    expect(KEYS.some((k) => /occupation|health|nominee|address/i.test(k))).toBe(false);
  });
});

describe('personal accident routing', () => {
  it('maps PERSONAL_ACCIDENT to itself and has a spec', () => {
    expect(asProductType('PERSONAL_ACCIDENT')).toBe('PERSONAL_ACCIDENT');
    expect(getExtractionSpec('PERSONAL_ACCIDENT').toolName).toBe('extract_personal_accident_policy_data');
  });
  it('has no insurer table for personal accident, and keeps the others', () => {
    expect(insurerKindOf('PERSONAL_ACCIDENT')).toBeNull();
    expect(insurerKindOf('HEALTH')).toBe('HEALTH');
    expect(insurerKindOf('TERM')).toBe('LIFE');
  });
  it('still rejects types without a check', () => {
    expect(asProductType('TRAVEL')).toBeNull();
  });
});

describe('personal accident rules', () => {
  it('flags an expired policy, reminds near expiry, and is quiet beyond', () => {
    expect(sev(run({ policyEndDate: ex('2026-10-01') }), 'POLICY_EXPIRED')).toBe('WARNING');
    expect(sev(run({ policyEndDate: ex('2026-12-10') }), 'RENEWAL_DUE')).toBe('NOTICE');
    expect(sev(run({ policyEndDate: ex('2027-06-01') }), 'POLICY_IN_FORCE')).toBe('INFO');
  });
  it('notes a family floater, and an individual cover', () => {
    expect(sev(run({ coverBasis: ex('FAMILY_FLOATER') }), 'FAMILY_FLOATER')).toBe('NOTICE');
    expect(sev(run({ coverBasis: ex('Family floater') }), 'FAMILY_FLOATER')).toBe('NOTICE');
    expect(sev(run({ coverBasis: ex('INDIVIDUAL') }), 'INDIVIDUAL_COVER')).toBe('INFO');
    expect(run({ coverBasis: ex('something else') })).toEqual([]);
  });
  it('flags India-only cover, and notes worldwide cover', () => {
    expect(sev(run({ coverTerritory: ex('INDIA_ONLY') }), 'INDIA_ONLY')).toBe('NOTICE');
    expect(sev(run({ coverTerritory: ex('Worldwide') }), 'WORLDWIDE_COVER')).toBe('INFO');
  });
  it('states the death benefit and flags disability that pays less than death', () => {
    const fs = run({ accidentalDeathInr: ex('5000000'), permanentTotalDisabilityInr: ex('2500000') });
    expect(sev(fs, 'DEATH_BENEFIT')).toBe('INFO');
    expect(sev(fs, 'DISABILITY_BELOW_DEATH')).toBe('NOTICE');
    const equal = run({ accidentalDeathInr: ex('5000000'), permanentTotalDisabilityInr: ex('5000000') });
    expect(codes(equal)).not.toContain('DISABILITY_BELOW_DEATH');
    expect(sev(equal, 'DISABILITY_BENEFIT')).toBe('INFO');
  });
  it('does not compare disability with death when death is unknown', () => {
    const fs = run({ permanentTotalDisabilityInr: ex('2500000') });
    expect(codes(fs)).toEqual(['DISABILITY_BENEFIT']);
  });
  it('handles partial disability', () => {
    expect(sev(run({ permanentPartialDisabilityCovered: ex(false) }), 'PARTIAL_DISABILITY_ABSENT')).toBe('NOTICE');
    expect(sev(run({ permanentPartialDisabilityCovered: ex(true) }), 'PARTIAL_DISABILITY')).toBe('INFO');
  });
  it('flags missing recovery pay and a short recovery period', () => {
    expect(sev(run({ temporaryDisabilityCovered: ex(false) }), 'TEMPORARY_DISABILITY_ABSENT')).toBe('NOTICE');
    expect(sev(run({ temporaryDisabilityCovered: ex(true), temporaryDisabilityWeeklyInr: ex('10000'), temporaryDisabilityMaxWeeks: ex(104) }), 'RECOVERY_BENEFIT')).toBe('INFO');
    const short = run({ temporaryDisabilityCovered: ex(true), temporaryDisabilityWeeklyInr: ex('10000'), temporaryDisabilityMaxWeeks: ex(20) });
    expect(sev(short, 'RECOVERY_BENEFIT_SHORT')).toBe('NOTICE');
    expect(short.find((f) => f.code === 'RECOVERY_BENEFIT_SHORT')?.headline).toMatch(/up to 20 weeks/);
  });
  it('handles accident medical expenses', () => {
    expect(sev(run({ medicalExpensesCovered: ex(false) }), 'ACCIDENT_MEDICAL_ABSENT')).toBe('NOTICE');
    expect(run({ medicalExpensesLimitInr: ex('100000') }).find((f) => f.code === 'ACCIDENT_MEDICAL')?.headline).toMatch(/1,00,000/);
  });
  it('lists extras that are present', () => {
    const f = run({ childEducationBenefit: ex(true), hospitalCashDailyInr: ex('1000'), loanEmiCover: ex(false) }).find((x) => x.code === 'PA_EXTRAS_INCLUDED');
    expect(f?.headline).toMatch(/2 extras/);
  });
  it('notes exclusions for hazardous activities and intoxication', () => {
    const fs = run({ exclusions: ex(['Adventure sports and mountaineering', 'Accidents under the influence of alcohol', 'War']) });
    expect(sev(fs, 'EXCLUSION_HAZARDOUS_ACTIVITY')).toBe('NOTICE');
    expect(sev(fs, 'EXCLUSION_INTOXICATION')).toBe('NOTICE');
  });
  it('an unknown field produces no finding', () => {
    expect(run({})).toEqual([]);
  });
  it('every finding states what would change it and cites evidence', () => {
    const fs = run({
      coverBasis: ex('FAMILY_FLOATER'), coverTerritory: ex('INDIA_ONLY'), policyEndDate: ex('2026-12-01'),
      accidentalDeathInr: ex('5000000'), permanentTotalDisabilityInr: ex('2500000'), permanentPartialDisabilityCovered: ex(false),
      temporaryDisabilityCovered: ex(false), medicalExpensesCovered: ex(false), exclusions: ex(['Adventure sports']),
    });
    expect(fs.length).toBeGreaterThan(6);
    for (const f of fs) {
      expect(f.whatWouldChangeThis.length).toBeGreaterThan(0);
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.headline.length).toBeLessThanOrEqual(120);
    }
  });
});

describe('personal accident score', () => {
  const good = {
    accidentalDeathInr: ex('5000000'), permanentTotalDisabilityInr: ex('5000000'), permanentPartialDisabilityCovered: ex(true),
    temporaryDisabilityCovered: ex(true), medicalExpensesCovered: ex(true), coverTerritory: ex('WORLDWIDE'), policyEndDate: ex('2027-06-01'),
    childEducationBenefit: ex(true), loanEmiCover: ex(true), ambulanceCover: ex(true), hospitalCashDailyInr: ex('1000'),
  };
  it('is deterministic and scores a full policy at 100', () => {
    const a = computePaScore(facts(pa(good)), []).scoreSnapshot.overall;
    expect(a).toBe(computePaScore(facts(pa(good)), []).scoreSnapshot.overall);
    expect(Number(a)).toBe(100);
  });
  it('scores a thin policy lower', () => {
    const thin = {
      accidentalDeathInr: ex('5000000'), permanentTotalDisabilityInr: ex('1000000'), permanentPartialDisabilityCovered: ex(false),
      temporaryDisabilityCovered: ex(false), medicalExpensesCovered: ex(false), coverTerritory: ex('INDIA_ONLY'), policyEndDate: ex('2026-10-01'),
    };
    expect(Number(computePaScore(facts(pa(thin)), []).scoreSnapshot.overall)).toBeLessThan(60);
  });
  it('payout parity reads disability against death', () => {
    const s = computePaScore(facts(pa({ accidentalDeathInr: ex('5000000'), permanentTotalDisabilityInr: ex('2500000') })), []).scoreSnapshot;
    expect(Number(s.pillars.find((p) => p.pillar === 'payout_parity')?.score)).toBe(50);
  });
  it('unknown pillars are dropped, not scored as zero', () => {
    const s = computePaScore(facts(pa({ coverTerritory: ex('WORLDWIDE') })), []).scoreSnapshot;
    expect(s.pillars.find((p) => p.pillar === 'extras')?.score).toBeNull();
    expect(s.pillars.find((p) => p.pillar === 'payout_parity')?.score).toBeNull();
  });
  it('an empty extraction is INCOMPLETE, not zero', () => {
    const r = computePaScore(facts(pa()), []);
    expect(r.incomplete).toBe(true);
    expect(r.scoreSnapshot.overall).toBeNull();
  });
});

describe('personal accident cover calculator', () => {
  const x = pa({
    accidentalDeathInr: ex('5000000'), permanentTotalDisabilityInr: ex('2500000'),
    temporaryDisabilityWeeklyInr: ex('10000'), temporaryDisabilityMaxWeeks: ex(52),
  });
  const input = (over: Record<string, unknown> = {}) => ({
    annualIncomeInr: '1200000' as never, yearsOfIncomeToReplace: 10, outstandingLoansInr: '2000000' as never,
    otherAccidentCoverInr: null, monthlyExpensesInr: '50000' as never, ...over,
  });

  it('sizes the need as income x years plus loans', () => {
    const o = calculatePaCover(input() as never, x);
    expect(o.incomeReplacementInr).toBe('12000000.0000');
    expect(o.totalNeedInr).toBe('14000000.0000');
  });
  it('shows the death and disability shortfalls', () => {
    const o = calculatePaCover(input() as never, x);
    expect(o.deathCoverInr).toBe('5000000.0000');
    expect(o.deathShortfallInr).toBe('9000000.0000');
    expect(o.disabilityShortfallInr).toBe('11500000.0000');
    expect(o.summary).toMatch(/short of the estimated need/);
  });
  it('counts other accident cover against the need', () => {
    const o = calculatePaCover(input({ otherAccidentCoverInr: '10000000' }) as never, x);
    expect(o.deathShortfallInr).toBe('0.0000');
    expect(o.summary).toMatch(/meets the estimated need/);
  });
  it('compares the recovery benefit with monthly expenses', () => {
    const o = calculatePaCover(input() as never, x);
    // 10,000 x 52 / 12 = 43,333; 43,333 / 50,000 = 86.67%
    expect(o.recoveryMonthlyBenefitInr).toBe('43333.0000');
    expect(o.recoveryExpensesCoveredPct).toBe('86.67');
    expect(o.recoveryMaxWeeks).toBe(52);
    expect(o.summary).toMatch(/87% of your monthly expenses/);
  });
  it('uses Indian digit grouping in the summary', () => {
    const o = calculatePaCover(input() as never, x);
    expect(o.summary).toMatch(/90,00,000/);
  });
  it('falls back to 10 years when the input is out of range', () => {
    const o = calculatePaCover(input({ yearsOfIncomeToReplace: 80 }) as never, x);
    expect(o.incomeReplacementInr).toBe('12000000.0000');
    expect(o.assumptions.join(' ')).toMatch(/using 10/);
  });
  it('lists missing inputs instead of inventing them', () => {
    const o = calculatePaCover({ annualIncomeInr: null, yearsOfIncomeToReplace: null, outstandingLoansInr: null, otherAccidentCoverInr: null, monthlyExpensesInr: null }, pa());
    expect(o.missingInputs).toContain('annual income');
    expect(o.deathShortfallInr).toBeNull();
    expect(o.summary).toMatch(/Enter your annual income/);
  });
  it('flags a sum insured missing from the documents', () => {
    const o = calculatePaCover(input() as never, pa());
    expect(o.missingInputs.join(' ')).toMatch(/accidental death sum insured/);
  });
});
