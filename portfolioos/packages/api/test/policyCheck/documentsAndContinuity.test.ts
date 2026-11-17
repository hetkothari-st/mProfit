/**
 * Cross-document conflict merge, continuity-of-cover rule, regulatory caps,
 * and the IRDAI Table 56 complaints parser.
 */

import { describe, it, expect } from 'vitest';
import type { PolicyConflictSource, PolicyFieldConflict } from '@everypaisa/shared';
import { mergeWithProvenance, type ChunkExtraction } from '../../src/services/policyCheck/fieldMerge.js';
import { waitingContinuityRule, wholeMonthsBetween, parseIsoDay } from '../../src/services/policyCheck/rules/waiting.continuity.js';
import { documentsConflictsRule } from '../../src/services/policyCheck/rules/documents.conflicts.js';
import { DEFAULT_POLICY_RULE_CONSTANTS, type PolicyAnalysisFacts } from '../../src/services/policyCheck/types.js';
import type { PolicyExtraction } from '../../src/services/policyCheck/extractionSchema.js';
import { buildMetricRecords, parseTable53, parseTable56, type Row } from '../../src/services/policyCheck/irdaiHandbookParse.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type F = { value: unknown; confidence: number; sourceDocId: string | null; sourcePage: number | null; clauseHeading: string | null; status: 'EXTRACTED' | 'USER_EDITED' | 'NOT_FOUND' };
const nf = (): F => ({ value: null, confidence: 0, sourceDocId: null, sourcePage: null, clauseHeading: null, status: 'NOT_FOUND' });
const ex = (value: unknown, doc = 'd1', page = 1, confidence = 0.9): F => ({ value, confidence, sourceDocId: doc, sourcePage: page, clauseHeading: 'Clause', status: 'EXTRACTED' });

const ALL_KEYS = [
  'insuredName', 'policyNumber', 'insurerName', 'planName', 'policyType', 'policyStartDate', 'policyEndDate',
  'sumInsured', 'premiumAmountInr', 'adultsCount', 'childrenCount', 'inPatientCovered', 'dayCareCovered',
  'preHospDays', 'postHospDays', 'ayushCovered', 'ambulanceCovered', 'ambulanceLimitInr', 'domiciliaryCovered',
  'maternityCovered', 'maternityLimitInr', 'copaymentPct', 'copaymentSeniorCitizenOnly', 'roomRentLimitType',
  'roomRentLimitInr', 'roomRentLimitPct', 'proportionateDeductionApplies', 'diseaseSubLimits', 'deductibleInr',
  'cumulativeDeductibleInr', 'initialWaitingDays', 'pedWaitingDays', 'specificDiseaseWaitingDays',
  'maternityWaitingDays', 'ncbAvailable', 'ncbIncrementPct', 'ncbMaxPct', 'ncbType', 'restorationAvailable',
  'restorationCount', 'restorationForSameIllness', 'restorationConditionsText', 'permanentExclusions',
  'specificExclusions', 'healthCheckupCovered', 'criticalIllnessCoverInr', 'opdCovered', 'opdLimitInr', 'otherBenefits',
];

function extraction(over: Record<string, F> = {}): PolicyExtraction {
  const o: Record<string, F> = {};
  for (const k of ALL_KEYS) o[k] = nf();
  return { ...o, ...over } as unknown as PolicyExtraction;
}

function facts(extr: PolicyExtraction, over: Partial<PolicyAnalysisFacts> = {}): PolicyAnalysisFacts {
  return {
    asOf: '2026-11-17T00:00:00.000Z',
    userId: 'u', policyId: 'p', checkId: 'c',
    constants: DEFAULT_POLICY_RULE_CONSTANTS,
    extraction: extr,
    insurer: null,
    ...over,
  };
}

const chunk = (docId: string, classification: ChunkExtraction['classification'], over: Record<string, F>): ChunkExtraction => ({
  docId, classification, extraction: extraction(over),
});

// ---------------------------------------------------------------------------
// merge
// ---------------------------------------------------------------------------

describe('mergeWithProvenance', () => {
  it('no conflicts when documents agree or only one states a value', () => {
    const { merged, conflicts } = mergeWithProvenance([
      chunk('w', 'POLICY_WORDING', { copaymentPct: ex('10', 'w', 5) }),
      chunk('s', 'POLICY_SCHEDULE', { copaymentPct: ex('10', 's', 1), sumInsured: ex('1000000', 's', 1) }),
    ]);
    expect(conflicts).toEqual([]);
    expect((merged.sumInsured as F).value).toBe('1000000');
  });

  it('endorsement overrides wording and the change is recorded', () => {
    const { merged, conflicts } = mergeWithProvenance([
      chunk('w', 'POLICY_WORDING', { copaymentPct: ex('20', 'w', 7, 0.95) }),
      chunk('e', 'ENDORSEMENT', { copaymentPct: ex('10', 'e', 1, 0.6) }),
    ]);
    expect((merged.copaymentPct as F).value).toBe('10'); // endorsement wins even with lower confidence
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ field: 'copaymentPct', status: 'RESOLVED_BY_PRECEDENCE' });
    expect(conflicts[0]!.chosen.classification).toBe('ENDORSEMENT');
    expect(conflicts[0]!.other).toMatchObject({ value: '20', page: 7 });
  });

  it('schedule beats wording', () => {
    const { merged, conflicts } = mergeWithProvenance([
      chunk('w', 'POLICY_WORDING', { roomRentLimitPct: ex('1', 'w') }),
      chunk('s', 'POLICY_SCHEDULE', { roomRentLimitPct: ex('2', 's') }),
    ]);
    expect((merged.roomRentLimitPct as F).value).toBe('2');
    expect(conflicts[0]!.status).toBe('RESOLVED_BY_PRECEDENCE');
  });

  it('two endorsements that disagree are UNRESOLVED (no dates to order them)', () => {
    const { merged, conflicts } = mergeWithProvenance([
      chunk('e1', 'ENDORSEMENT', { copaymentPct: ex('10', 'e1', 1, 0.7) }),
      chunk('e2', 'ENDORSEMENT', { copaymentPct: ex('15', 'e2', 1, 0.9) }),
    ]);
    expect((merged.copaymentPct as F).value).toBe('15'); // provisional: higher confidence
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.status).toBe('UNRESOLVED');
  });

  it('formatting differences are not conflicts', () => {
    const { conflicts } = mergeWithProvenance([
      chunk('w', 'POLICY_WORDING', { sumInsured: ex('10,00,000') }),
      chunk('s', 'POLICY_SCHEDULE', { sumInsured: ex('10,00,000 ') }),
    ]);
    expect(conflicts).toEqual([]);
  });

  it('naming variants of the insured / plan are not conflicts', () => {
    const { conflicts } = mergeWithProvenance([
      chunk('w', 'POLICY_WORDING', { planName: ex('Care Supreme') }),
      chunk('s', 'POLICY_SCHEDULE', { planName: ex('CARE SUPREME - Enhance') }),
    ]);
    expect(conflicts).toEqual([]);
  });

  it('unions exclusion lists across documents and records per-disease sub-limit changes', () => {
    const { merged, conflicts } = mergeWithProvenance([
      chunk('w', 'POLICY_WORDING', {
        permanentExclusions: ex(['Cosmetic surgery']),
        diseaseSubLimits: ex({ Cataract: '40000', Hernia: '50000' }),
      }),
      chunk('e', 'ENDORSEMENT', {
        permanentExclusions: ex(['Obesity treatment']),
        diseaseSubLimits: ex({ Cataract: '60000' }),
      }),
    ]);
    expect(((merged.permanentExclusions as F).value as string[]).sort()).toEqual(['Cosmetic surgery', 'Obesity treatment']);
    expect((merged.diseaseSubLimits as F).value).toEqual({ Cataract: '60000', Hernia: '50000' });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ field: 'diseaseSubLimits.Cataract', status: 'RESOLVED_BY_PRECEDENCE' });
  });
});

// ---------------------------------------------------------------------------
// conflicts rule
// ---------------------------------------------------------------------------

const src = (value: string, classification: PolicyConflictSource['classification'], page = 1): PolicyConflictSource => ({ value, docId: 'd', page, classification, clauseHeading: null });

describe('documentsConflictsRule', () => {
  it('UNRESOLVED → WARNING; RESOLVED → NOTICE; unique codes', () => {
    const conflicts: PolicyFieldConflict[] = [
      { field: 'copaymentPct', status: 'UNRESOLVED', chosen: src('15', 'ENDORSEMENT'), other: src('10', 'ENDORSEMENT'), reason: '' },
      { field: 'roomRentLimitPct', status: 'RESOLVED_BY_PRECEDENCE', chosen: src('2', 'POLICY_SCHEDULE'), other: src('1', 'POLICY_WORDING'), reason: '' },
      { field: 'roomRentLimitPct', status: 'RESOLVED_BY_PRECEDENCE', chosen: src('2', 'POLICY_SCHEDULE'), other: src('3', 'OTHER'), reason: '' },
    ];
    const out = documentsConflictsRule.evaluate(facts(extraction(), { conflicts }));
    expect(out.map((f) => f.severity)).toEqual(['WARNING', 'NOTICE', 'NOTICE']);
    expect(new Set(out.map((f) => f.code)).size).toBe(3);
    expect(out[0]!.evidence).toHaveLength(2);
    expect(out.every((f) => f.headline.length <= 120)).toBe(true);
  });
  it('no conflicts → no findings (and older facts without the field work)', () => {
    expect(documentsConflictsRule.evaluate(facts(extraction()))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// continuity + regulatory cap
// ---------------------------------------------------------------------------

describe('date helpers', () => {
  it('whole months are calendar-accurate', () => {
    const a = parseIsoDay('2021-11-17')!;
    expect(wholeMonthsBetween(a, parseIsoDay('2026-11-17')!)).toBe(60);
    expect(wholeMonthsBetween(a, parseIsoDay('2026-11-16')!)).toBe(59);
    expect(parseIsoDay('not a date')).toBeNull();
  });
});

describe('waitingContinuityRule', () => {
  const base = { policyStartDate: ex('2025-06-01'), pedWaitingDays: ex(1095, 'd1', 4), initialWaitingDays: ex(30, 'd1', 4) };
  const run = (over: Record<string, F>) => waitingContinuityRule.evaluate(facts(extraction({ ...base, ...over })));
  const codes = (fs: ReturnType<typeof run>) => fs.map((f) => f.code);

  it('no continuity date → NOTICE that waits count from this policy only; nothing is assumed served', () => {
    const out = run({});
    expect(codes(out)).toEqual(['CONTINUITY_NOT_DOCUMENTED']);
    expect(out[0]!.severity).toBe('NOTICE');
  });

  it('documented cover since 2024-01-01: initial served, PED partly remaining', () => {
    const out = run({ continuousCoverSince: ex('2024-01-01', 'd2', 1) });
    // elapsed to 2026-11-17 = 1051 days → PED 1095 → 44 days remain; initial 30 served.
    expect(codes(out)).toEqual(['INITIAL_WAIT_SERVED', 'PED_WAIT_REMAINING']);
    expect(out[1]!.headline).toContain('44 of 1095');
    expect(out.every((f) => /recognised the earlier cover/.test(f.whatWouldChangeThis))).toBe(true);
  });

  it('5+ continuous years: PED served and moratorium reached', () => {
    const out = run({ continuousCoverSince: ex('2021-01-01') });
    expect(codes(out)).toEqual(['INITIAL_WAIT_SERVED', 'PED_WAIT_SERVED', 'MORATORIUM_PERIOD_REACHED']);
    expect(out.every((f) => f.severity === 'INFO')).toBe(true);
  });

  it('a future continuity date is ignored as an extraction error', () => {
    expect(codes(run({ continuousCoverSince: ex('2030-01-01') }))).toEqual([]);
  });

  it('PED wait over 3 years: WARNING on a post-April-2024 policy, NOTICE on an older one', () => {
    const newer = run({ pedWaitingDays: ex(1460) });
    expect(newer.find((f) => f.code === 'PED_WAIT_EXCEEDS_REGULATORY_CAP')!.severity).toBe('WARNING');
    const older = run({ pedWaitingDays: ex(1460), policyStartDate: ex('2022-05-01') });
    expect(older.find((f) => f.code === 'PED_WAIT_EXCEEDS_REGULATORY_CAP')!.severity).toBe('NOTICE');
  });

  it('exactly 3 years is within the cap', () => {
    expect(codes(run({ pedWaitingDays: ex(1095) }))).not.toContain('PED_WAIT_EXCEEDS_REGULATORY_CAP');
  });

  it('no waiting periods found → nothing', () => {
    expect(waitingContinuityRule.evaluate(facts(extraction()))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Table 56 (complaints)
// ---------------------------------------------------------------------------

describe('parseTable56 + complaints in records', () => {
  // FY2023-24 block starts at col 39: [opening, reported, duplicates, actual, attended].
  const hdr1: Row = ['S.No.', 'Insurer', ...new Array(37).fill(null), '2023-24'];
  const row = (sno: number, name: string, block: number[]): Row => [sno, name, ...new Array(37).fill(0), ...block];
  const t56 = [hdr1, row(34, 'Niva Bupa Health Insurance Co. Ltd.', [0, 5308, 153, 5155, 5155])];

  it('uses actual complaints (duplicates removed) for FY2023-24', () => {
    const rows = parseTable56(t56, '2023-24');
    expect(rows).toEqual([{ name: 'Niva Bupa Health Insurance Co. Ltd.', reported: 5155, attended: 5155, closing: null, duplicatesExcluded: 153 }]);
  });

  it('refuses a layout it does not know', () => {
    expect(() => parseTable56(t56, '2019-20')).toThrow(/not supported/);
  });

  it('attaches complaints and a per-10,000-claims figure to the matching insurer only', () => {
    const t53hdr: Row = ['S.No.', 'Insurer', '2023-24', ...new Array(11).fill(null)];
    const t53rows: Row[] = [t53hdr, ['Stand-alone Health Insurers'], [34, 'Niva Bupa Health Insurance Co. Ltd.', 10354, 696333, 636375, 55185, 0, 15127, 0, 0, 0, 0, 0, 0]];
    const recs = buildMetricRecords(parseTable53(t53rows, '2023-24'), [], '2023-24', [
      ...parseTable56(t56, '2023-24'),
      { name: 'Unknown Insurer Ltd.', reported: 9, attended: 9, closing: null, duplicatesExcluded: null },
    ]);
    expect(recs).toHaveLength(1);
    expect(recs[0]!.complaints).toMatchObject({ reported: 5155, perTenThousandClaims: '72.9' }); // 5155 / (10354+696333) * 10000 = 72.94
  });
});
