/**
 * Term life: extraction schema, rules, score, cover calculator, life insurer
 * data parsing — plus the regression for health rules being skipped.
 */

import { describe, it, expect } from 'vitest';
import { TermExtractionSchema, TERM_TOOL_JSON_SCHEMA, type TermExtraction } from '../../src/services/policyCheck/termExtractionSchema.js';
import { TERM_POLICY_RULES, POLICY_RULES } from '../../src/services/policyCheck/rules/registry.js';
import { evaluateRules, evaluatePolicyRules } from '../../src/services/policyCheck/analysisEngine.service.js';
import { computeTermScore } from '../../src/services/policyCheck/scoring/termScoreMath.js';
import { calculateTermAdequacy } from '../../src/services/policyCheck/termAdequacy.js';
import { DEFAULT_POLICY_RULE_CONSTANTS, DEFAULT_TERM_RULE_CONSTANTS, type PolicyAnalysisFacts, type TermAnalysisFacts } from '../../src/services/policyCheck/types.js';
import { mergeWithProvenance } from '../../src/services/policyCheck/fieldMerge.js';
import { buildLifeRecords, parseTable15 } from '../../src/services/policyCheck/irdaiLifeParse.js';
import { matchInsurerRow } from '../../src/services/policyCheck/insurerMetrics.service.js';
import { getExtractionSpec, asProductType } from '../../src/services/policyCheck/extractionSpecs.js';
import type { Row } from '../../src/services/policyCheck/irdaiHandbookParse.js';
import type { TermAdequacyInput } from '@everypaisa/shared';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type F = { value: unknown; confidence: number; sourceDocId: string | null; sourcePage: number | null; clauseHeading: string | null; status: 'EXTRACTED' | 'USER_EDITED' | 'NOT_FOUND' };
const nf = (): F => ({ value: null, confidence: 0, sourceDocId: null, sourcePage: null, clauseHeading: null, status: 'NOT_FOUND' });
const ex = (value: unknown, page = 1, confidence = 0.9): F => ({ value, confidence, sourceDocId: 'd1', sourcePage: page, clauseHeading: 'Clause', status: 'EXTRACTED' });

const TERM_KEYS = Object.keys(TermExtractionSchema.shape);

function term(over: Record<string, F> = {}): TermExtraction {
  const o: Record<string, F> = {};
  for (const k of TERM_KEYS) o[k] = nf();
  return { ...o, ...over } as unknown as TermExtraction;
}

function facts(extr: TermExtraction, over: Partial<TermAnalysisFacts> = {}): TermAnalysisFacts {
  return {
    asOf: '2026-11-17T00:00:00.000Z',
    userId: 'u', policyId: 'p', checkId: 'c', productType: 'TERM',
    constants: DEFAULT_TERM_RULE_CONSTANTS, extraction: extr, insurer: null,
    ...over,
  };
}

const run = (over: Record<string, F>, extra: Partial<TermAnalysisFacts> = {}) =>
  evaluateRules<TermAnalysisFacts>(facts(term(over), extra), TERM_POLICY_RULES).findings;
const codes = (fs: Array<{ code: string }>) => fs.map((f) => f.code);
const sev = (fs: Array<{ code: string; severity: string }>, code: string) => fs.find((f) => f.code === code)?.severity;

// ---------------------------------------------------------------------------
// schema
// ---------------------------------------------------------------------------

describe('term extraction schema', () => {
  it('Zod schema and Anthropic JSON Schema cover the same fields', () => {
    const jsonKeys = Object.keys((TERM_TOOL_JSON_SCHEMA as unknown as { properties: Record<string, unknown> }).properties).sort();
    expect(TERM_KEYS.sort()).toEqual(jsonKeys);
  });
  it('an all-NOT_FOUND extraction is valid', () => {
    expect(TermExtractionSchema.safeParse(term()).success).toBe(true);
  });
  it('product type comes from the policy record and picks the right spec', () => {
    expect(asProductType('TERM')).toBe('TERM');
    expect(asProductType('HEALTH')).toBe('HEALTH');
    expect(asProductType('MOTOR')).toBeNull();
    expect(getExtractionSpec('TERM').toolName).toBe('extract_term_policy_data');
    expect(getExtractionSpec('HEALTH').toolName).toBe('extract_policy_data');
  });
});

// ---------------------------------------------------------------------------
// rules
// ---------------------------------------------------------------------------

describe('term rules', () => {
  it('cover horizon: computed from entry age + term; short cover is a warning', () => {
    expect(sev(run({ ageAtEntry: ex(30), policyTermYears: ex(25) }), 'COVER_ENDS_EARLY')).toBe('WARNING'); // 55
    expect(sev(run({ ageAtEntry: ex(30), policyTermYears: ex(35) }), 'COVER_ENDS_BEFORE_70')).toBe('NOTICE'); // 65
    expect(sev(run({ ageAtEntry: ex(30), policyTermYears: ex(45) }), 'COVER_TO_AGE_OK')).toBe('INFO'); // 75
  });
  it('a stated end age wins over the computed one', () => {
    const f = run({ ageAtEntry: ex(30), policyTermYears: ex(25), coverEndsAtAge: ex(85) });
    expect(codes(f)).toContain('COVER_TO_AGE_OK');
    expect(f.find((x) => x.code === 'COVER_TO_AGE_OK')!.headline).toContain('as stated');
  });
  it('unknown fields produce no findings', () => {
    expect(run({})).toEqual([]);
  });

  it('suicide clause: 24 months warns, 12 is standard', () => {
    expect(sev(run({ suicideExclusionMonths: ex(24) }), 'SUICIDE_EXCLUSION_LONG')).toBe('WARNING');
    expect(sev(run({ suicideExclusionMonths: ex(12) }), 'SUICIDE_EXCLUSION_STANDARD')).toBe('INFO');
  });
  it('grace period is judged against the premium frequency', () => {
    expect(codes(run({ gracePeriodDays: ex(15), premiumFrequency: ex('ANNUAL') }))).toContain('GRACE_PERIOD_SHORT');
    expect(codes(run({ gracePeriodDays: ex(15), premiumFrequency: ex('MONTHLY') }))).toContain('GRACE_PERIOD_OK');
    expect(codes(run({ gracePeriodDays: ex(30), premiumFrequency: ex('ANNUAL') }))).toContain('GRACE_PERIOD_OK');
  });
  it('contestability window (Section 45): inside 3 years notices, after informs', () => {
    expect(sev(run({ policyStartDate: ex('2025-06-01') }), 'WITHIN_CONTESTABILITY_WINDOW')).toBe('NOTICE');
    expect(sev(run({ policyStartDate: ex('2021-01-01') }), 'PAST_CONTESTABILITY_WINDOW')).toBe('INFO');
    expect(run({ policyStartDate: ex('2030-01-01') })).toEqual([]); // a future date is an extraction error
  });

  it('payout structure', () => {
    expect(sev(run({ deathBenefitOption: ex('MONTHLY_INCOME') }), 'PAYOUT_INCOME_ONLY')).toBe('NOTICE');
    expect(sev(run({ deathBenefitOption: ex('LUMP_SUM') }), 'PAYOUT_LUMP_SUM')).toBe('INFO');
  });
  it('riders: absent is a notice only when the document says so', () => {
    expect(sev(run({ criticalIllnessCover: ex(false) }), 'CRITICAL_ILLNESS_ABSENT')).toBe('NOTICE');
    expect(sev(run({ criticalIllnessCover: ex(true) }), 'CRITICAL_ILLNESS_INCLUDED')).toBe('INFO');
    expect(run({ criticalIllnessCover: nf() })).toEqual([]);
  });
  it('return of premium is flagged; premium ending before cover is informational', () => {
    expect(sev(run({ returnOfPremium: ex(true) }), 'RETURN_OF_PREMIUM')).toBe('NOTICE');
    expect(sev(run({ premiumPayingTermYears: ex(10), policyTermYears: ex(30) }), 'PREMIUM_ENDS_BEFORE_COVER')).toBe('INFO');
  });
  it('no nominee is a warning', () => {
    expect(sev(run({ nomineePresent: ex(false) }), 'NO_NOMINEE')).toBe('WARNING');
    expect(sev(run({ nomineePresent: ex(true) }), 'NOMINEE_RECORDED')).toBe('INFO');
  });
  it('exclusions: hazardous and intoxication wording is called out', () => {
    const f = run({ exclusions: ex(['Suicide within 12 months', 'Aviation other than as a fare-paying passenger', 'Death under the influence of alcohol']) });
    expect(codes(f)).toEqual(expect.arrayContaining(['TERM_EXCLUSIONS_LISTED', 'EXCLUSION_HAZARDOUS_ACTIVITIES', 'EXCLUSION_INTOXICATION']));
  });
  it('every finding has evidence and a counterfactual (the invariants hold for a full policy)', () => {
    const f = run({
      ageAtEntry: ex(30), policyTermYears: ex(25), suicideExclusionMonths: ex(24), gracePeriodDays: ex(10),
      premiumFrequency: ex('ANNUAL'), policyStartDate: ex('2025-06-01'), deathBenefitOption: ex('DECREASING'),
      criticalIllnessCover: ex(false), returnOfPremium: ex(true), nomineePresent: ex(false), exclusions: ex(['Aviation']),
    });
    expect(f.length).toBeGreaterThan(8);
    expect(f.every((x) => x.evidence.length > 0 && x.whatWouldChangeThis.length > 0 && x.headline.length <= 120)).toBe(true);
    expect(new Set(f.map((x) => x.id)).size).toBe(f.length);
  });
  it('cross-document conflicts are reported for term policies too', () => {
    const f = run({}, { conflicts: [{ field: 'sumAssured', status: 'UNRESOLVED', reason: '', chosen: { value: '10000000', docId: 'a', page: 1, classification: 'POLICY_SCHEDULE', clauseHeading: null }, other: { value: '5000000', docId: 'b', page: 2, classification: 'POLICY_SCHEDULE', clauseHeading: null } }] });
    expect(sev(f, 'CONFLICT_SUMASSURED')).toBe('WARNING');
  });
});

// ---------------------------------------------------------------------------
// regression: health rules were skipped when the extracted "policy type" was not "HEALTH"
// ---------------------------------------------------------------------------

describe('health rules are not skipped by the extracted policy type', () => {
  it('a FAMILY_FLOATER extraction still runs the co-payment rule', () => {
    const base: Record<string, F> = {};
    // Build a health extraction with only what this test needs; everything else NOT_FOUND.
    const keys = ['insuredName', 'policyNumber', 'insurerName', 'planName', 'policyType', 'policyStartDate', 'policyEndDate', 'sumInsured', 'premiumAmountInr', 'adultsCount', 'childrenCount', 'inPatientCovered', 'dayCareCovered', 'preHospDays', 'postHospDays', 'ayushCovered', 'ambulanceCovered', 'ambulanceLimitInr', 'domiciliaryCovered', 'maternityCovered', 'maternityLimitInr', 'copaymentPct', 'copaymentSeniorCitizenOnly', 'roomRentLimitType', 'roomRentLimitInr', 'roomRentLimitPct', 'proportionateDeductionApplies', 'diseaseSubLimits', 'deductibleInr', 'cumulativeDeductibleInr', 'initialWaitingDays', 'pedWaitingDays', 'specificDiseaseWaitingDays', 'maternityWaitingDays', 'ncbAvailable', 'ncbIncrementPct', 'ncbMaxPct', 'ncbType', 'restorationAvailable', 'restorationCount', 'restorationForSameIllness', 'restorationConditionsText', 'permanentExclusions', 'specificExclusions', 'healthCheckupCovered', 'criticalIllnessCoverInr', 'opdCovered', 'opdLimitInr', 'otherBenefits'];
    for (const k of keys) base[k] = nf();
    base['policyType'] = ex('FAMILY_FLOATER');
    base['copaymentPct'] = ex('20');
    const h: PolicyAnalysisFacts = {
      asOf: '2026-11-17T00:00:00.000Z', userId: 'u', policyId: 'p', checkId: 'c',
      constants: DEFAULT_POLICY_RULE_CONSTANTS, insurer: null,
      extraction: base as unknown as PolicyAnalysisFacts['extraction'],
    };
    const r = evaluatePolicyRules(h, POLICY_RULES);
    expect(r.findings.length).toBeGreaterThan(0);
    expect(r.ruleVersionsSnapshot.every((x) => x.ran)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// score
// ---------------------------------------------------------------------------

describe('term score', () => {
  const good = term({
    ageAtEntry: ex(30), policyTermYears: ex(45), suicideExclusionMonths: ex(12), gracePeriodDays: ex(30),
    nomineePresent: ex(true), deathBenefitOption: ex('LUMP_SUM'), criticalIllnessCover: ex(true),
    accidentalDeathBenefit: ex(true), waiverOfPremium: ex(true), terminalIllnessBenefit: ex(true),
    returnOfPremium: ex(false), exclusions: ex(['Suicide']),
  });
  it('a strong policy scores high and is deterministic', () => {
    const a = computeTermScore(facts(good), []);
    const b = computeTermScore(facts(good), []);
    expect(a.incomplete).toBe(false);
    expect(Number(a.scoreSnapshot.overall)).toBeGreaterThanOrEqual(80);
    expect(a.scoreSnapshot.overall).toBe(b.scoreSnapshot.overall);
    expect(a.scoreSnapshot.scoringVersion).toBe('term_score_v1');
  });
  it('weaker terms score lower', () => {
    const weak = term({
      ageAtEntry: ex(35), policyTermYears: ex(20), suicideExclusionMonths: ex(36), gracePeriodDays: ex(7),
      nomineePresent: ex(false), deathBenefitOption: ex('MONTHLY_INCOME'), criticalIllnessCover: ex(false),
      returnOfPremium: ex(true), exclusions: ex(new Array(12).fill('x')),
    });
    expect(Number(computeTermScore(facts(weak), []).scoreSnapshot.overall)).toBeLessThan(
      Number(computeTermScore(facts(good), []).scoreSnapshot.overall) - 25,
    );
  });
  it('too little data is INCOMPLETE, not zero', () => {
    const r = computeTermScore(facts(term({ nomineePresent: ex(true) })), []);
    expect(r.incomplete).toBe(true);
    expect(r.scoreSnapshot.overall).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cover adequacy
// ---------------------------------------------------------------------------

describe('calculateTermAdequacy', () => {
  const base: TermAdequacyInput = {
    annualIncomeInr: '1200000' as never, yearsOfIncomeToReplace: 15,
    outstandingLoansInr: '5000000' as never, liquidAssetsInr: '2000000' as never, otherLifeCoverInr: null,
  };
  it('need = income × years + loans − assets; shortfall against this cover', () => {
    const r = calculateTermAdequacy(base, '10000000');
    expect(r.incomeReplacementInr).toBe('18000000.0000'); // 12L × 15
    expect(r.totalNeedInr).toBe('21000000.0000'); // + 50L − 20L
    expect(r.totalCoverInr).toBe('10000000.0000');
    expect(r.shortfallInr).toBe('11000000.0000');
    expect(r.missingInputs.join(' ')).toContain('otherLifeCoverInr');
  });
  it('no shortfall when cover exceeds need', () => {
    const r = calculateTermAdequacy({ ...base, otherLifeCoverInr: '20000000' as never }, '10000000');
    expect(r.shortfallInr).toBe('0.0000');
    expect(r.summary).toContain('meet');
  });
  it('requires income; clamps silly year counts; flags a missing sum assured', () => {
    expect(() => calculateTermAdequacy({ ...base, annualIncomeInr: '' as never }, '1')).toThrow(/annualIncomeInr/);
    const r = calculateTermAdequacy({ ...base, yearsOfIncomeToReplace: 99 }, null);
    expect(r.assumptions[0]).toContain('using 15');
    expect(r.missingInputs.join(' ')).toContain('sum assured');
  });
});

// ---------------------------------------------------------------------------
// merge with term keys
// ---------------------------------------------------------------------------

describe('merge for term extractions', () => {
  it('endorsement overrides the schedule and exclusion lists are unioned', () => {
    const { merged, conflicts } = mergeWithProvenance([
      { docId: 's', classification: 'POLICY_SCHEDULE', extraction: term({ sumAssured: ex('10000000'), exclusions: ex(['Suicide']) }) },
      { docId: 'e', classification: 'ENDORSEMENT', extraction: term({ sumAssured: ex('15000000'), exclusions: ex(['Aviation']) }) },
    ]);
    expect((merged.sumAssured as F).value).toBe('15000000');
    expect(((merged.exclusions as F).value as string[]).sort()).toEqual(['Aviation', 'Suicide']);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ field: 'sumAssured', status: 'RESOLVED_BY_PRECEDENCE' });
  });
});

// ---------------------------------------------------------------------------
// IRDAI Table 15 (life insurers)
// ---------------------------------------------------------------------------

describe('IRDAI Table 15 → life insurer metrics', () => {
  // 2021-22 block starts at col 2. Real LIC figures from the Handbook 2024-25.
  const hdr: Row = ['S.No.', 'Insurer', '2021-22', ...new Array(19).fill(null), '2022-23'];
  const row: Row = ['1', 'LIC ', 1725, 292.42, 1365379, 29293.46, 1367104, 29585.88, 1349865, 28408.38, 8713, 347.19, 3619, 8.5, 2625, 461.66];
  it('computes IRDAI’s own ratios by number and by amount', () => {
    const [rec] = buildLifeRecords(parseTable15([hdr, row], '2021-22'), '2021-22');
    expect(rec!.insurerName).toBe('LIC');
    expect(rec!.segment).toBe('LIFE');
    expect(rec!.claimSettlementRatio).toBe('98.74'); // 1349865 / 1367104; IRDAI prints 0.98739
    expect(rec!.claimSettlementRatioByAmount).toBe('96.02'); // 28408.38 / 29585.88; IRDAI prints 0.96020
    expect(rec!.claimsTotal).toBe(1367104);
    expect(rec!.claimsRepudiated).toBe(8713 + 3619);
    expect(rec!.claimsPaidInr).toBe('284083800000.00'); // ₹28,408.38 crore
  });
  it('life insurer name matching', () => {
    const rows = [{ insurerName: 'LIC' }, { insurerName: 'HDFC Life' }, { insurerName: 'Max Life' }, { insurerName: 'ICICI Prudential Life' }];
    expect(matchInsurerRow(rows, 'Life Insurance Corporation of India')?.insurerName).toBe('LIC');
    expect(matchInsurerRow(rows, 'HDFC Life Insurance Company Limited')?.insurerName).toBe('HDFC Life');
    expect(matchInsurerRow(rows, 'ICICI Prudential Life Insurance')?.insurerName).toBe('ICICI Prudential Life');
    expect(matchInsurerRow(rows, 'Some Other Life')).toBeNull();
  });
});
