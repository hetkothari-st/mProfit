/**
 * Home policies: extraction schema, rules, score, the cover calculator and
 * the policy-type routing.
 */

import { describe, it, expect } from 'vitest';
import {
  HomeExtractionSchema,
  HOME_TOOL_JSON_SCHEMA,
  type HomeExtraction,
} from '../../src/services/policyCheck/homeExtractionSchema.js';
import { HOME_POLICY_RULES } from '../../src/services/policyCheck/rules/registry.js';
import { evaluateRules } from '../../src/services/policyCheck/analysisEngine.service.js';
import { computeHomeScore } from '../../src/services/policyCheck/scoring/homeScoreMath.js';
import { calculateHomeCover, EXAMPLE_LOSS_INR } from '../../src/services/policyCheck/homeCover.js';
import { asProductType, getExtractionSpec, insurerKindOf } from '../../src/services/policyCheck/extractionSpecs.js';
import { DEFAULT_HOME_RULE_CONSTANTS, type HomeAnalysisFacts } from '../../src/services/policyCheck/types.js';

type F = { value: unknown; confidence: number; sourceDocId: string | null; sourcePage: number | null; clauseHeading: string | null; status: 'EXTRACTED' | 'USER_EDITED' | 'NOT_FOUND' };
const nf = (): F => ({ value: null, confidence: 0, sourceDocId: null, sourcePage: null, clauseHeading: null, status: 'NOT_FOUND' });
const ex = (value: unknown, page = 1, confidence = 0.9): F => ({ value, confidence, sourceDocId: 'd1', sourcePage: page, clauseHeading: 'Clause', status: 'EXTRACTED' });

const KEYS = Object.keys(HomeExtractionSchema.shape);
const AS_OF = '2026-11-18T00:00:00.000Z';

function home(over: Record<string, F> = {}): HomeExtraction {
  const o: Record<string, F> = {};
  for (const k of KEYS) o[k] = nf();
  return { ...o, ...over } as unknown as HomeExtraction;
}

function facts(extr: HomeExtraction): HomeAnalysisFacts {
  return { asOf: AS_OF, userId: 'u', policyId: 'p', checkId: 'c', productType: 'HOME', constants: DEFAULT_HOME_RULE_CONSTANTS, extraction: extr, insurer: null };
}

const run = (over: Record<string, F>) => evaluateRules<HomeAnalysisFacts>(facts(home(over)), HOME_POLICY_RULES).findings;
const codes = (fs: Array<{ code: string }>) => fs.map((f) => f.code);
const sev = (fs: Array<{ code: string; severity: string }>, code: string) => fs.find((f) => f.code === code)?.severity;

describe('home extraction schema', () => {
  it('Zod schema and Anthropic JSON Schema cover the same fields', () => {
    const jsonKeys = Object.keys((HOME_TOOL_JSON_SCHEMA as unknown as { properties: Record<string, unknown> }).properties).sort();
    expect([...KEYS].sort()).toEqual(jsonKeys);
  });
  it('an all-NOT_FOUND extraction is valid', () => {
    expect(HomeExtractionSchema.safeParse(home()).success).toBe(true);
  });
  it('does not extract the property address', () => {
    expect(KEYS.some((k) => /address|pincode|location/i.test(k))).toBe(false);
  });
});

describe('home routing', () => {
  it('maps HOME to HOME and has a spec', () => {
    expect(asProductType('HOME')).toBe('HOME');
    expect(getExtractionSpec('HOME').toolName).toBe('extract_home_policy_data');
  });
  it('has no insurer table for home, and keeps the others', () => {
    expect(insurerKindOf('HOME')).toBeNull();
    expect(insurerKindOf('MOTOR')).toBeNull();
    expect(insurerKindOf('HEALTH')).toBe('HEALTH');
    expect(insurerKindOf('TERM')).toBe('LIFE');
  });
  it('still rejects types without a check', () => {
    expect(asProductType('TRAVEL')).toBeNull();
  });
});

describe('home rules', () => {
  it('flags an expired policy, reminds near expiry, and is quiet beyond', () => {
    expect(sev(run({ policyEndDate: ex('2026-10-01') }), 'POLICY_EXPIRED')).toBe('WARNING');
    expect(sev(run({ policyEndDate: ex('2026-12-10') }), 'RENEWAL_DUE')).toBe('NOTICE');
    expect(sev(run({ policyEndDate: ex('2027-06-01') }), 'POLICY_IN_FORCE')).toBe('INFO');
  });
  it('grades what is covered', () => {
    expect(sev(run({ coverScope: ex('STRUCTURE_ONLY') }), 'STRUCTURE_ONLY')).toBe('NOTICE');
    expect(sev(run({ coverScope: ex('Building only') }), 'STRUCTURE_ONLY')).toBe('NOTICE');
    expect(sev(run({ coverScope: ex('CONTENTS_ONLY') }), 'CONTENTS_ONLY')).toBe('NOTICE');
    expect(sev(run({ coverScope: ex('STRUCTURE_AND_CONTENTS') }), 'STRUCTURE_AND_CONTENTS')).toBe('INFO');
    expect(sev(run({ coverScope: ex('Building and household contents') }), 'STRUCTURE_AND_CONTENTS')).toBe('INFO');
    expect(run({ coverScope: ex('something else') })).toEqual([]);
  });
  it('flags a depreciated or market-value claim basis, not a reinstatement one', () => {
    expect(sev(run({ valuationBasis: ex('DEPRECIATED') }), 'VALUATION_DEPRECIATED')).toBe('NOTICE');
    expect(sev(run({ valuationBasis: ex('Market value less depreciation') }), 'VALUATION_DEPRECIATED')).toBe('NOTICE');
    expect(sev(run({ valuationBasis: ex('MARKET_VALUE') }), 'VALUATION_MARKET_VALUE')).toBe('NOTICE');
    expect(sev(run({ valuationBasis: ex('REINSTATEMENT') }), 'VALUATION_REINSTATEMENT')).toBe('INFO');
    expect(sev(run({ valuationBasis: ex('New for old replacement') }), 'VALUATION_REINSTATEMENT')).toBe('INFO');
  });
  it('notes the under-insurance clause only when it applies', () => {
    expect(sev(run({ averageClause: ex(true) }), 'AVERAGE_CLAUSE')).toBe('NOTICE');
    expect(codes(run({ averageClause: ex(false) }))).not.toContain('AVERAGE_CLAUSE');
  });
  it('flags missing natural-peril cover and lists what is covered', () => {
    const fs = run({ floodCovered: ex(false), earthquakeCovered: ex(false), burglaryCovered: ex(true) });
    expect(sev(fs, 'NATURAL_PERIL_GAP')).toBe('NOTICE');
    expect(fs.find((f) => f.code === 'NATURAL_PERIL_GAP')?.headline).toMatch(/flood and storm and earthquake/);
    expect(sev(fs, 'PERILS_COVERED')).toBe('INFO');
  });
  it('does not flag burglary on a building-only policy', () => {
    expect(codes(run({ coverScope: ex('STRUCTURE_ONLY'), burglaryCovered: ex(false) }))).not.toContain('BURGLARY_NOT_COVERED');
    expect(sev(run({ coverScope: ex('STRUCTURE_AND_CONTENTS'), burglaryCovered: ex(false) }), 'BURGLARY_NOT_COVERED')).toBe('NOTICE');
  });
  it('flags water damage that is not covered', () => {
    expect(sev(run({ waterDamageCovered: ex(false) }), 'WATER_DAMAGE_NOT_COVERED')).toBe('NOTICE');
  });
  it('handles jewellery and valuables', () => {
    expect(sev(run({ valuablesCovered: ex(false) }), 'VALUABLES_NOT_COVERED')).toBe('NOTICE');
    expect(run({ valuablesLimitInr: ex('200000') }).find((f) => f.code === 'VALUABLES_LIMIT')?.headline).toMatch(/2,00,000/);
  });
  it('lists extras that are present', () => {
    const f = run({ publicLiabilityInr: ex('500000'), electronicsCovered: ex(true) }).find((x) => x.code === 'EXTRAS_INCLUDED');
    expect(f?.headline).toMatch(/2 extras/);
  });
  it('flags a high deductible', () => {
    expect(sev(run({ deductibleInr: ex('50000') }), 'DEDUCTIBLE_HIGH')).toBe('NOTICE');
    expect(sev(run({ deductibleInr: ex('5000') }), 'DEDUCTIBLE')).toBe('INFO');
    expect(run({ deductibleInr: ex('0') })).toEqual([]);
  });
  it('notes exclusions for an empty home and for business use', () => {
    const fs = run({ exclusions: ex(['Loss while the property is unoccupied for more than 30 days', 'Use for commercial purposes', 'War']) });
    expect(sev(fs, 'EXCLUSION_UNOCCUPIED')).toBe('NOTICE');
    expect(sev(fs, 'EXCLUSION_BUSINESS_USE')).toBe('NOTICE');
  });
  it('an unknown field produces no finding', () => {
    expect(run({})).toEqual([]);
  });
  it('every finding states what would change it and cites evidence', () => {
    const fs = run({
      coverScope: ex('STRUCTURE_ONLY'), policyEndDate: ex('2026-12-01'), valuationBasis: ex('DEPRECIATED'), averageClause: ex(true),
      floodCovered: ex(false), waterDamageCovered: ex(false), deductibleInr: ex('50000'), valuablesCovered: ex(false),
    });
    expect(fs.length).toBeGreaterThan(5);
    for (const f of fs) {
      expect(f.whatWouldChangeThis.length).toBeGreaterThan(0);
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.headline.length).toBeLessThanOrEqual(120);
    }
  });
});

describe('home score', () => {
  const good = {
    coverScope: ex('STRUCTURE_AND_CONTENTS'), valuationBasis: ex('REINSTATEMENT'), policyEndDate: ex('2027-06-01'),
    floodCovered: ex(true), earthquakeCovered: ex(true), burglaryCovered: ex(true), waterDamageCovered: ex(true),
    electronicsCovered: ex(true), valuablesCovered: ex(true), publicLiabilityInr: ex('500000'),
  };
  it('is deterministic', () => {
    expect(computeHomeScore(facts(home(good)), []).scoreSnapshot.overall).toBe(computeHomeScore(facts(home(good)), []).scoreSnapshot.overall);
  });
  it('scores a strong policy at 100 and above a thin one', () => {
    const thin = {
      coverScope: ex('STRUCTURE_ONLY'), valuationBasis: ex('DEPRECIATED'), policyEndDate: ex('2026-10-01'),
      floodCovered: ex(false), earthquakeCovered: ex(false), waterDamageCovered: ex(false),
    };
    const strong = Number(computeHomeScore(facts(home(good)), []).scoreSnapshot.overall);
    expect(strong).toBe(100);
    expect(strong).toBeGreaterThan(Number(computeHomeScore(facts(home(thin)), []).scoreSnapshot.overall));
  });
  it('perils unknown are dropped, not scored as zero', () => {
    const s = computeHomeScore(facts(home({ coverScope: ex('STRUCTURE_AND_CONTENTS') })), []).scoreSnapshot;
    expect(s.pillars.find((p) => p.pillar === 'perils')?.score).toBeNull();
  });
  it('burglary does not count against a building-only policy', () => {
    const only = computeHomeScore(facts(home({ coverScope: ex('STRUCTURE_ONLY'), floodCovered: ex(true), burglaryCovered: ex(false) })), []).scoreSnapshot;
    expect(Number(only.pillars.find((p) => p.pillar === 'perils')?.score)).toBe(100);
  });
  it('an empty extraction is INCOMPLETE, not zero', () => {
    const r = computeHomeScore(facts(home()), []);
    expect(r.incomplete).toBe(true);
    expect(r.scoreSnapshot.overall).toBeNull();
  });
});

describe('home cover calculator', () => {
  const x = home({ sumInsuredStructureInr: ex('4000000'), sumInsuredContentsInr: ex('500000'), averageClause: ex(true) });
  const input = (over: Partial<{ a: number | null; c: string | null; v: string | null }> = {}) => ({
    builtUpAreaSqft: over.a === undefined ? 1500 : over.a,
    rebuildCostPerSqftInr: (over.c === undefined ? '3000' : over.c) as never,
    contentsReplacementValueInr: (over.v === undefined ? '1000000' : over.v) as never,
  });

  it('compares the building sum insured with the rebuild cost, not the market price', () => {
    const o = calculateHomeCover(input(), x);
    expect(o.rebuildCostInr).toBe('4500000.0000');
    expect(o.structureShortfallInr).toBe('500000.0000');
    expect(o.structureCoveredPct).toBe('88.89');
    expect(o.assumptions.join(' ')).toMatch(/land is not insured/i);
  });
  it('compares the contents sum insured with the replacement value', () => {
    const o = calculateHomeCover(input(), x);
    expect(o.contentsShortfallInr).toBe('500000.0000');
    expect(o.contentsCoveredPct).toBe('50.00');
  });
  it('shows a worked example on the least-covered item with the proportional cut', () => {
    const o = calculateHomeCover(input(), x);
    expect(o.exampleLossInr).toBe(`${EXAMPLE_LOSS_INR}.0000`);
    // contents are the least covered: 50% of a 10,00,000 loss = 5,00,000, capped at the 5,00,000 sum insured
    expect(o.exampleClaimInr).toBe('500000.0000');
    expect(o.summary).toMatch(/proportional cut/);
  });
  it('scales the example by how under-insured the building is', () => {
    const small = home({ sumInsuredStructureInr: ex('100000'), averageClause: ex(true) });
    const o = calculateHomeCover(input({ v: null }), small);
    // 100000 / 4500000 = 2.22%; 2.22% of 10 lakh = 22,222, below the sum insured
    expect(Number(o.exampleClaimInr)).toBeCloseTo(22222, 0);
  });
  it('never pays more than the sum insured in the example', () => {
    // building insured for 5,00,000 against a 6,00,000 rebuild cost: 83.3% of 10 lakh = 8,33,333, capped at 5,00,000
    const o = calculateHomeCover(input({ a: 1000, c: '600', v: null }), home({ sumInsuredStructureInr: ex('500000'), averageClause: ex(true) }));
    expect(o.structureCoveredPct).toBe('83.33');
    expect(o.exampleClaimInr).toBe('500000.0000');
  });
  it('shows no proportional cut when the policy has no average clause', () => {
    const o = calculateHomeCover(input(), home({ sumInsuredStructureInr: ex('4000000'), sumInsuredContentsInr: ex('500000'), averageClause: ex(false) }));
    expect(o.averageClause).toBe('DOES_NOT_APPLY');
    expect(o.exampleClaimInr).toBeNull();
    expect(o.summary).toMatch(/no average clause/);
  });
  it('says the clause is unknown when the wording was not found', () => {
    const o = calculateHomeCover(input(), home({ sumInsuredStructureInr: ex('4000000') }));
    expect(o.averageClause).toBe('UNKNOWN');
    expect(o.assumptions.join(' ')).toMatch(/not found/);
  });
  it('calls a close match reasonable and over-insurance what it is', () => {
    const close = calculateHomeCover(input({ c: '2700', v: null }), home({ sumInsuredStructureInr: ex('4000000') }));
    expect(close.summary).toMatch(/reasonable match/);
    const over = calculateHomeCover(input({ c: '1500', v: null }), home({ sumInsuredStructureInr: ex('4000000') }));
    expect(over.summary).toMatch(/pay premium on the extra/);
  });
  it('lists missing inputs instead of inventing them', () => {
    const o = calculateHomeCover({ builtUpAreaSqft: null, rebuildCostPerSqftInr: null, contentsReplacementValueInr: null }, home());
    expect(o.missingInputs.length).toBeGreaterThan(1);
    expect(o.structureCoveredPct).toBeNull();
    expect(o.summary).toMatch(/Enter your built-up area/);
  });
  it('flags a missing sum insured in the documents', () => {
    const o = calculateHomeCover(input(), home());
    expect(o.missingInputs.join(' ')).toMatch(/building sum insured/);
  });
});
