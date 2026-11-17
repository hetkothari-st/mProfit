/**
 * Term life policy score. Pure; weights are data.
 *
 * Six pillars. Each scores 0-100 from what the documents state; anything not
 * stated is dropped from the weight pool, never scored as zero.
 *
 *  cover_horizon         25%  how long the cover lasts (by age it ends)
 *  claim_protection      25%  suicide clause, grace period, nominee
 *  payout_structure      15%  how the benefit reaches the family
 *  riders_and_benefits   20%  critical illness, accidental death, waiver, terminal illness
 *  premium_structure     10%  return-of-premium and similar cost drag
 *  exclusions             5%  number of exclusions listed
 *
 * The score measures the POLICY'S terms, not whether the sum assured is enough
 * for you — that needs your income and liabilities (see the cover calculator).
 * Insurer claim statistics never feed this score.
 */

import { Decimal } from '@everypaisa/shared';
import type { PolicyFindingDTO } from '@everypaisa/shared';
import type { TermAnalysisFacts } from '../types.js';
import { coverEndAge } from '../rules/term.rules.js';
import { composeScore, type PillarResult } from './composeScore.js';

export const TERM_SCORING_VERSION = 'term_score_v1';

export const TERM_PILLAR_WEIGHTS = {
  cover_horizon: new Decimal('0.25'),
  claim_protection: new Decimal('0.25'),
  payout_structure: new Decimal('0.15'),
  riders_and_benefits: new Decimal('0.20'),
  premium_structure: new Decimal('0.10'),
  exclusions: new Decimal('0.05'),
} as const;

type Inputs = PillarResult['inputs'];
const d = (n: number) => new Decimal(n);
const has = (f: { status: string; value: unknown } | undefined) =>
  !!f && f.status !== 'NOT_FOUND' && f.value !== null && f.value !== undefined;

function horizon(facts: TermAnalysisFacts): PillarResult {
  const c = coverEndAge(facts.extraction);
  if (!c) return { score: null, inputs: { coverEndsAtAge: { value: null, note: 'NOT_FOUND' } } };
  // <60: 40, 60-64: 60, 65-69: 75, 70-74: 90, 75+: 100
  const s = c.age < 60 ? 40 : c.age < 65 ? 60 : c.age < 70 ? 75 : c.age < 75 ? 90 : 100;
  return { score: d(s), inputs: { coverEndsAtAge: { value: String(c.age), note: c.basis } } };
}

function claimProtection(facts: TermAnalysisFacts): PillarResult {
  const x = facts.extraction;
  const k = facts.constants;
  const inputs: Inputs = {};
  let score = d(100);
  let known = 0;

  if (has(x.suicideExclusionMonths)) {
    known++;
    const m = x.suicideExclusionMonths.value as number;
    inputs['suicideExclusionMonths'] = { value: String(m), note: null };
    if (m > k.standardSuicideMonths) score = score.minus(25);
  }
  if (has(x.gracePeriodDays)) {
    known++;
    const g = x.gracePeriodDays.value as number;
    inputs['gracePeriodDays'] = { value: String(g), note: null };
    if (g < k.minGraceMonthlyDays) score = score.minus(25);
    else if (g < k.minGraceDays) score = score.minus(10);
  }
  if (has(x.nomineePresent)) {
    known++;
    const n = x.nomineePresent.value === true;
    inputs['nomineePresent'] = { value: String(n), note: null };
    if (!n) score = score.minus(30);
  }
  if (known === 0) return { score: null, inputs };
  return { score: Decimal.max(score, d(0)), inputs };
}

function payout(facts: TermAnalysisFacts): PillarResult {
  const o = facts.extraction.deathBenefitOption;
  if (!has(o)) return { score: null, inputs: { deathBenefitOption: { value: null, note: 'NOT_FOUND' } } };
  const v = String(o.value).toUpperCase();
  const s = v === 'MONTHLY_INCOME' || v === 'DECREASING' ? 70 : 100;
  return { score: d(s), inputs: { deathBenefitOption: { value: v, note: null } } };
}

function riders(facts: TermAnalysisFacts): PillarResult {
  const x = facts.extraction;
  const inputs: Inputs = {};
  let score = d(60);
  let known = 0;
  const add = (label: string, f: { status: string; value: unknown } | undefined, pts: number) => {
    if (!has(f)) return;
    known++;
    const yes = f!.value === true;
    inputs[label] = { value: yes ? 'included' : 'not included', note: null };
    if (yes) score = score.plus(pts);
  };
  add('criticalIllnessCover', x.criticalIllnessCover, 15);
  add('accidentalDeathBenefit', x.accidentalDeathBenefit, 10);
  add('waiverOfPremium', x.waiverOfPremium, 10);
  add('terminalIllnessBenefit', x.terminalIllnessBenefit, 5);
  if (known === 0) return { score: null, inputs };
  return { score: Decimal.min(score, d(100)), inputs };
}

function premium(facts: TermAnalysisFacts): PillarResult {
  const r = facts.extraction.returnOfPremium;
  if (!has(r)) return { score: null, inputs: { returnOfPremium: { value: null, note: 'NOT_FOUND' } } };
  const rop = r.value === true;
  return { score: d(rop ? 70 : 100), inputs: { returnOfPremium: { value: String(rop), note: rop ? 'much higher premium' : null } } };
}

function exclusions(facts: TermAnalysisFacts): PillarResult {
  const e = facts.extraction.exclusions;
  if (!has(e)) return { score: null, inputs: {} };
  const n = (e.value as string[]).length;
  return { score: d(Math.max(50, 100 - n * 5)), inputs: { exclusionCount: { value: String(n), note: null } } };
}

export function computeTermScore(facts: TermAnalysisFacts, findings: PolicyFindingDTO[]) {
  return composeScore(
    {
      cover_horizon: horizon(facts),
      claim_protection: claimProtection(facts),
      payout_structure: payout(facts),
      riders_and_benefits: riders(facts),
      premium_structure: premium(facts),
      exclusions: exclusions(facts),
    },
    TERM_PILLAR_WEIGHTS,
    TERM_SCORING_VERSION,
    findings,
  );
}
