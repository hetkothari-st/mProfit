/**
 * Savings plans (endowment / whole life / ULIP): extraction schema, rules,
 * score, the keep-or-exit calculator and the policy-type routing.
 */

import { describe, it, expect } from 'vitest';
import {
  SavingsExtractionSchema,
  SAVINGS_TOOL_JSON_SCHEMA,
  type SavingsExtraction,
} from '../../src/services/policyCheck/savingsExtractionSchema.js';
import { SAVINGS_POLICY_RULES } from '../../src/services/policyCheck/rules/registry.js';
import { evaluateRules } from '../../src/services/policyCheck/analysisEngine.service.js';
import { computeSavingsScore } from '../../src/services/policyCheck/scoring/savingsScoreMath.js';
import { calculateSavingsReturn, guaranteedReturn } from '../../src/services/policyCheck/savingsReturn.js';
import { asProductType, getExtractionSpec, insurerKindOf } from '../../src/services/policyCheck/extractionSpecs.js';
import { DEFAULT_SAVINGS_RULE_CONSTANTS, type SavingsAnalysisFacts } from '../../src/services/policyCheck/types.js';

type F = { value: unknown; confidence: number; sourceDocId: string | null; sourcePage: number | null; clauseHeading: string | null; status: 'EXTRACTED' | 'USER_EDITED' | 'NOT_FOUND' };
const nf = (): F => ({ value: null, confidence: 0, sourceDocId: null, sourcePage: null, clauseHeading: null, status: 'NOT_FOUND' });
const ex = (value: unknown, page = 1, confidence = 0.9): F => ({ value, confidence, sourceDocId: 'd1', sourcePage: page, clauseHeading: 'Clause', status: 'EXTRACTED' });

const KEYS = Object.keys(SavingsExtractionSchema.shape);

function savings(over: Record<string, F> = {}): SavingsExtraction {
  const o: Record<string, F> = {};
  for (const k of KEYS) o[k] = nf();
  return { ...o, ...over } as unknown as SavingsExtraction;
}

function facts(extr: SavingsExtraction, planKind: 'ULIP' | 'TRADITIONAL' = 'TRADITIONAL'): SavingsAnalysisFacts {
  return {
    asOf: '2026-11-18T00:00:00.000Z',
    userId: 'u', policyId: 'p', checkId: 'c', productType: 'SAVINGS', planKind,
    constants: DEFAULT_SAVINGS_RULE_CONSTANTS, extraction: extr, insurer: null,
  };
}

const run = (over: Record<string, F>, kind: 'ULIP' | 'TRADITIONAL' = 'TRADITIONAL') =>
  evaluateRules<SavingsAnalysisFacts>(facts(savings(over), kind), SAVINGS_POLICY_RULES).findings;
const codes = (fs: Array<{ code: string }>) => fs.map((f) => f.code);
const sev = (fs: Array<{ code: string; severity: string }>, code: string) => fs.find((f) => f.code === code)?.severity;

// A 20-year endowment: ₹50,000 a year for 15 years, ₹10 lakh cover.
const ENDOW: Record<string, F> = {
  sumAssured: ex('1000000'), premiumAmountInr: ex('50000'), policyTermYears: ex(20), premiumPayingTermYears: ex(15),
};

describe('savings extraction schema', () => {
  it('Zod schema and Anthropic JSON Schema cover the same fields', () => {
    const jsonKeys = Object.keys((SAVINGS_TOOL_JSON_SCHEMA as unknown as { properties: Record<string, unknown> }).properties).sort();
    expect([...KEYS].sort()).toEqual(jsonKeys);
  });
  it('an all-NOT_FOUND extraction is valid', () => {
    expect(SavingsExtractionSchema.safeParse(savings()).success).toBe(true);
  });
});

describe('policy-type routing', () => {
  it('maps endowment, whole life and ULIP to SAVINGS', () => {
    expect(asProductType('ENDOWMENT')).toBe('SAVINGS');
    expect(asProductType('WHOLE_LIFE')).toBe('SAVINGS');
    expect(asProductType('ULIP')).toBe('SAVINGS');
    expect(asProductType('TERM')).toBe('TERM');
    expect(asProductType('HEALTH')).toBe('HEALTH');
    expect(asProductType('TRAVEL')).toBeNull();
  });
  it('uses the life insurer table for savings plans', () => {
    expect(insurerKindOf('SAVINGS')).toBe('LIFE');
    expect(insurerKindOf('TERM')).toBe('LIFE');
    expect(insurerKindOf('HEALTH')).toBe('HEALTH');
  });
  it('has a spec with the savings tool', () => {
    expect(getExtractionSpec('SAVINGS').toolName).toBe('extract_savings_policy_data');
  });
});

describe('guaranteed return', () => {
  it('is null without a guaranteed maturity amount', () => {
    expect(guaranteedReturn(savings(ENDOW))).toBeNull();
  });
  it('matches a hand-checked case: 100 a year for 1 year, 110 back after 1 year = 10%', () => {
    const r = guaranteedReturn(
      savings({ premiumAmountInr: ex('100'), policyTermYears: ex(1), premiumPayingTermYears: ex(1), maturityBenefitGuaranteedInr: ex('110') }),
    );
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.1, 4);
  });
  it('gives a low return for a typical endowment (750000 premiums, 1100000 maturity)', () => {
    const r = guaranteedReturn(savings({ ...ENDOW, maturityBenefitGuaranteedInr: ex('1100000') }));
    expect(r! * 100).toBeGreaterThan(2);
    expect(r! * 100).toBeLessThan(4.5);
  });
});

describe('savings rules', () => {
  it('flags a low guaranteed return', () => {
    const fs = run({ ...ENDOW, maturityBenefitGuaranteedInr: ex('1000000') });
    expect(codes(fs)).toContain('LOW_GUARANTEED_RETURN');
    expect(sev(fs, 'LOW_GUARANTEED_RETURN')).toBe('WARNING');
  });
  it('passes a healthy guaranteed return', () => {
    const fs = run({ ...ENDOW, maturityBenefitGuaranteedInr: ex('2000000') });
    expect(sev(fs, 'GUARANTEED_RETURN_OK')).toBe('INFO');
  });
  it('produces no return finding when the maturity amount is not guaranteed', () => {
    const fs = run({ ...ENDOW });
    expect(codes(fs).filter((c) => /GUARANTEED_RETURN/.test(c))).toEqual([]);
  });
  it('notes that a bonus-driven plan has no guaranteed maturity', () => {
    const fs = run({ ...ENDOW, participating: ex(true) });
    expect(codes(fs)).toContain('MATURITY_DEPENDS_ON_BONUS');
  });
  it('flags cover below 10x the annual premium', () => {
    const fs = run({ sumAssured: ex('400000'), premiumAmountInr: ex('50000') });
    expect(sev(fs, 'LOW_COVER_MULTIPLE')).toBe('WARNING');
  });
  it('accepts cover at 10x', () => {
    expect(sev(run({ sumAssured: ex('500000'), premiumAmountInr: ex('50000') }), 'COVER_MULTIPLE_OK')).toBe('INFO');
  });
  it('notes a late guaranteed surrender value', () => {
    expect(sev(run({ guaranteedSurrenderFromYear: ex(5) }), 'LATE_SURRENDER_VALUE')).toBe('NOTICE');
    expect(sev(run({ guaranteedSurrenderFromYear: ex(2) }), 'SURRENDER_VALUE_EARLY_ENOUGH')).toBe('INFO');
  });
  it('ULIP: flags a fund charge above the 1.35% cap, accepts one within it', () => {
    expect(sev(run({ fundManagementChargePct: ex('1.8') }, 'ULIP'), 'FMC_ABOVE_CAP')).toBe('WARNING');
    expect(sev(run({ fundManagementChargePct: ex('1.25') }, 'ULIP'), 'FMC_WITHIN_CAP')).toBe('INFO');
  });
  it('ULIP: grades the allocation charge', () => {
    expect(sev(run({ premiumAllocationChargePct: ex('7') }, 'ULIP'), 'ALLOCATION_CHARGE_HIGH')).toBe('WARNING');
    expect(sev(run({ premiumAllocationChargePct: ex('4') }, 'ULIP'), 'ALLOCATION_CHARGE_NOTABLE')).toBe('NOTICE');
    expect(sev(run({ premiumAllocationChargePct: ex('2') }, 'ULIP'), 'ALLOCATION_CHARGE_LOW')).toBe('INFO');
  });
  it('ULIP charge rules do not fire for a traditional plan', () => {
    const fs = run({ fundManagementChargePct: ex('2'), premiumAllocationChargePct: ex('9') }, 'TRADITIONAL');
    expect(codes(fs).filter((c) => /FMC|ALLOCATION/.test(c))).toEqual([]);
  });
  it('ULIP: notes a death benefit that is the higher of cover or fund', () => {
    expect(sev(run({ ulipDeathBenefitBasis: ex('HIGHER_OF') }, 'ULIP'), 'ULIP_DEATH_BENEFIT_HIGHER_OF')).toBe('NOTICE');
    expect(sev(run({ ulipDeathBenefitBasis: ex('SUM_ASSURED_PLUS_FUND') }, 'ULIP'), 'ULIP_DEATH_BENEFIT_PLUS_FUND')).toBe('INFO');
  });
  it('flags missing nominee and a long suicide exclusion', () => {
    const fs = run({ nomineePresent: ex(false), suicideExclusionMonths: ex(24) });
    expect(sev(fs, 'NO_NOMINEE')).toBe('WARNING');
    expect(sev(fs, 'SUICIDE_EXCLUSION_LONG')).toBe('WARNING');
  });
  it('an unknown field produces no finding (unknown is not absent)', () => {
    expect(run({})).toEqual([]);
  });
  it('every finding states what would change it and cites evidence', () => {
    const fs = run({ ...ENDOW, maturityBenefitGuaranteedInr: ex('1000000'), nomineePresent: ex(true), guaranteedSurrenderFromYear: ex(4) });
    expect(fs.length).toBeGreaterThan(0);
    for (const f of fs) {
      expect(f.whatWouldChangeThis.length).toBeGreaterThan(0);
      expect(f.evidence.length).toBeGreaterThan(0);
    }
  });
});

describe('savings score', () => {
  const good = {
    ...ENDOW, sumAssured: ex('1000000'), maturityBenefitGuaranteedInr: ex('2200000'), guaranteedSurrenderFromYear: ex(2),
    loanAvailable: ex(true), suicideExclusionMonths: ex(12), gracePeriodDays: ex(30), nomineePresent: ex(true),
  };
  it('is deterministic', () => {
    const a = computeSavingsScore(facts(savings(good)), []);
    const b = computeSavingsScore(facts(savings(good)), []);
    expect(a.scoreSnapshot.overall).toBe(b.scoreSnapshot.overall);
  });
  it('scores a strong traditional plan higher than a weak one', () => {
    const weak = { ...good, maturityBenefitGuaranteedInr: ex('900000'), sumAssured: ex('300000'), guaranteedSurrenderFromYear: ex(5), nomineePresent: ex(false) };
    expect(Number(computeSavingsScore(facts(savings(good)), []).scoreSnapshot.overall)).toBeGreaterThan(
      Number(computeSavingsScore(facts(savings(weak)), []).scoreSnapshot.overall),
    );
  });
  it('drops the charges pillar for a traditional plan and the returns pillar for a ULIP', () => {
    const trad = computeSavingsScore(facts(savings(good), 'TRADITIONAL'), []).scoreSnapshot;
    expect(trad.pillars.find((p) => p.pillar === 'charges')?.score).toBeNull();
    const ulip = computeSavingsScore(
      facts(savings({ sumAssured: ex('1000000'), premiumAmountInr: ex('100000'), lockInYears: ex(5), fundManagementChargePct: ex('1.2'), premiumAllocationChargePct: ex('2'), gracePeriodDays: ex(30), nomineePresent: ex(true) }), 'ULIP'),
      [],
    ).scoreSnapshot;
    expect(ulip.pillars.find((p) => p.pillar === 'returns')?.score).toBeNull();
    expect(ulip.overall).not.toBeNull();
  });
  it('a high-charge ULIP scores below a low-charge one', () => {
    const base = { sumAssured: ex('1000000'), premiumAmountInr: ex('100000'), lockInYears: ex(5), gracePeriodDays: ex(30), nomineePresent: ex(true) };
    const cheap = computeSavingsScore(facts(savings({ ...base, fundManagementChargePct: ex('1.0'), premiumAllocationChargePct: ex('2') }), 'ULIP'), []);
    const dear = computeSavingsScore(facts(savings({ ...base, fundManagementChargePct: ex('1.9'), premiumAllocationChargePct: ex('8') }), 'ULIP'), []);
    expect(Number(cheap.scoreSnapshot.overall)).toBeGreaterThan(Number(dear.scoreSnapshot.overall));
  });
  it('an empty extraction is INCOMPLETE, not zero', () => {
    const r = computeSavingsScore(facts(savings()), []);
    expect(r.incomplete).toBe(true);
    expect(r.scoreSnapshot.overall).toBeNull();
  });
});

describe('savings calculator', () => {
  const x = savings({ ...ENDOW, maturityBenefitGuaranteedInr: ex('1100000') });
  const input = { yearsPaid: 5, surrenderValueNowInr: '150000' as never, fundValueNowInr: null, benchmarkRatePct: null };

  it('reports totals and the guaranteed return', () => {
    const o = calculateSavingsReturn(input, x, 'TRADITIONAL');
    expect(o.totalPremiumsInr).toBe('750000.0000');
    expect(o.guaranteedMaturityInr).toBe('1100000.0000');
    expect(Number(o.guaranteedReturnPct)).toBeGreaterThan(2);
    expect(Number(o.guaranteedReturnPct)).toBeLessThan(4.5);
  });
  it('shows the loss on exiting early: paid 250000, surrender 150000', () => {
    const o = calculateSavingsReturn(input, x, 'TRADITIONAL');
    expect(o.premiumsPaidSoFarInr).toBe('250000.0000');
    expect(o.exitValueNowInr).toBe('150000.0000');
    expect(o.gainOrLossOnExitInr).toBe('-100000.0000');
    expect(Number(o.returnIfExitNowPct)).toBeLessThan(0);
  });
  it('computes the return on staying in', () => {
    const o = calculateSavingsReturn(input, x, 'TRADITIONAL');
    expect(o.returnOnStayingPct).not.toBeNull();
    // Leaving 150000 in plus 10 more premiums of 50000 to receive 1100000 in 15 years is a strongly positive return.
    expect(Number(o.returnOnStayingPct)).toBeGreaterThan(0);
  });
  it('benchmark value at maturity is larger than total premiums at a positive rate', () => {
    const o = calculateSavingsReturn(input, x, 'TRADITIONAL');
    expect(Number(o.benchmarkValueAtMaturityInr)).toBeGreaterThan(Number(o.totalPremiumsInr));
  });
  it('ULIP uses the fund value, not a surrender value', () => {
    const o = calculateSavingsReturn(
      { yearsPaid: 5, surrenderValueNowInr: '1' as never, fundValueNowInr: '300000' as never, benchmarkRatePct: null },
      savings({ sumAssured: ex('1000000'), premiumAmountInr: ex('50000'), policyTermYears: ex(15), premiumPayingTermYears: ex(10) }),
      'ULIP',
    );
    expect(o.exitValueNowInr).toBe('300000.0000');
    expect(o.returnOnStayingPct).toBeNull(); // no guaranteed maturity for a ULIP
  });
  it('lists missing inputs instead of inventing them', () => {
    const o = calculateSavingsReturn({ yearsPaid: null, surrenderValueNowInr: null, fundValueNowInr: null, benchmarkRatePct: null }, x, 'TRADITIONAL');
    expect(o.missingInputs.length).toBeGreaterThan(0);
    expect(o.returnIfExitNowPct).toBeNull();
    expect(o.exitValueNowInr).toBeNull();
  });
  it('rejects an out-of-range comparison rate and says so', () => {
    const o = calculateSavingsReturn({ ...input, benchmarkRatePct: 90 }, x, 'TRADITIONAL');
    expect(o.assumptions.join(' ')).toMatch(/between 0% and 20%/);
  });
});
