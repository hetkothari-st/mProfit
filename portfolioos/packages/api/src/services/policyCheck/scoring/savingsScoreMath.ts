/**
 * Savings-plan score (endowment, money-back, whole life, ULIP). Pure; weights
 * are data.
 *
 * Five pillars, each 0-100 from what the documents state. Anything not stated
 * is dropped from the weight pool, never scored as zero.
 *
 *  returns             30%  traditional plans: guaranteed annual return
 *                           (a ULIP's return depends on its funds, so it is
 *                           not scored here and drops from the pool)
 *  protection          20%  life cover as a multiple of the annual premium
 *  liquidity_and_exit  20%  how soon, and how easily, you can get money out
 *  charges             15%  ULIP fund management and allocation charges
 *                           (not applicable to traditional plans)
 *  claim_protection    15%  suicide clause, grace period, nominee
 *
 * The return bands are display heuristics, not regulatory figures. The score
 * judges the policy's terms, not whether the plan suits your goals. Insurer
 * claim statistics never feed it.
 */

import { Decimal } from '@everypaisa/shared';
import type { PolicyFindingDTO } from '@everypaisa/shared';
import type { SavingsAnalysisFacts } from '../types.js';
import { guaranteedReturn } from '../savingsReturn.js';
import { composeScore, type PillarResult } from './composeScore.js';

export const SAVINGS_SCORING_VERSION = 'savings_score_v1';

export const SAVINGS_PILLAR_WEIGHTS = {
  returns: new Decimal('0.30'),
  protection: new Decimal('0.20'),
  liquidity_and_exit: new Decimal('0.20'),
  charges: new Decimal('0.15'),
  claim_protection: new Decimal('0.15'),
} as const;

type Inputs = PillarResult['inputs'];
const d = (n: number) => new Decimal(n);
const has = (f: { status: string; value: unknown } | undefined) =>
  !!f && f.status !== 'NOT_FOUND' && f.value !== null && f.value !== undefined;

function numOf(f: { status: string; value: unknown } | undefined): Decimal | null {
  if (!has(f)) return null;
  try {
    const x = new Decimal(String(f!.value).replace('%', '').trim());
    return x.isFinite() && x.gte(0) ? x : null;
  } catch {
    return null;
  }
}

function returns(facts: SavingsAnalysisFacts): PillarResult {
  if (facts.planKind === 'ULIP') {
    return { score: null, inputs: { guaranteedReturn: { value: null, note: 'Depends on the funds you pick; not scored' } } };
  }
  const r = guaranteedReturn(facts.extraction);
  if (r === null) return { score: null, inputs: { guaranteedReturn: { value: null, note: 'No guaranteed maturity amount stated' } } };
  const p = r * 100;
  const s = p < 3 ? 20 : p < 4 ? 40 : p < 5 ? 55 : p < 6 ? 70 : p < 7 ? 85 : 100;
  return { score: d(s), inputs: { guaranteedReturnPct: { value: p.toFixed(2), note: 'guaranteed amounts only' } } };
}

function protection(facts: SavingsAnalysisFacts): PillarResult {
  const sa = numOf(facts.extraction.sumAssured);
  const prem = numOf(facts.extraction.premiumAmountInr);
  if (!sa || !prem || prem.isZero()) return { score: null, inputs: {} };
  const ratio = sa.div(prem);
  const s = ratio.gte(10) ? 100 : ratio.gte(7) ? 70 : ratio.gte(5) ? 50 : 30;
  return { score: d(s), inputs: { coverMultiple: { value: ratio.toDecimalPlaces(1).toString(), note: 'sum assured / annual premium' } } };
}

function liquidity(facts: SavingsAnalysisFacts): PillarResult {
  const x = facts.extraction;
  const inputs: Inputs = {};
  if (facts.planKind === 'ULIP') {
    const lock = numOf(x.lockInYears);
    if (!lock) return { score: null, inputs };
    inputs['lockInYears'] = { value: lock.toString(), note: null };
    return { score: d(lock.lte(5) ? 80 : 65), inputs };
  }
  const yr = numOf(x.guaranteedSurrenderFromYear);
  const loan = has(x.loanAvailable) ? x.loanAvailable.value === true : null;
  if (!yr && loan === null) return { score: null, inputs };
  let s = 80;
  if (yr) {
    inputs['guaranteedSurrenderFromYear'] = { value: yr.toString(), note: null };
    s = yr.lte(2) ? 100 : yr.lte(3) ? 85 : 55;
  }
  if (loan === true) {
    inputs['loanAvailable'] = { value: 'yes', note: null };
    s = Math.min(100, s + 10);
  }
  return { score: d(s), inputs };
}

function charges(facts: SavingsAnalysisFacts): PillarResult {
  if (facts.planKind !== 'ULIP') return { score: null, inputs: {} };
  const x = facts.extraction;
  const inputs: Inputs = {};
  let score = d(100);
  let known = 0;
  const fmc = numOf(x.fundManagementChargePct);
  if (fmc) {
    known++;
    inputs['fundManagementChargePct'] = { value: fmc.toString(), note: null };
    if (fmc.gt(facts.constants.ulipFmcCapPct)) score = score.minus(45);
    else if (fmc.gt(1)) score = score.minus(15);
  }
  const alloc = numOf(x.premiumAllocationChargePct);
  if (alloc) {
    known++;
    inputs['premiumAllocationChargePct'] = { value: alloc.toString(), note: null };
    if (alloc.gt(facts.constants.allocationWarnPct)) score = score.minus(35);
    else if (alloc.gt(3)) score = score.minus(15);
  }
  if (known === 0) return { score: null, inputs };
  return { score: Decimal.max(score, d(0)), inputs };
}

function claimProtection(facts: SavingsAnalysisFacts): PillarResult {
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

export function computeSavingsScore(facts: SavingsAnalysisFacts, findings: PolicyFindingDTO[]) {
  return composeScore(
    {
      returns: returns(facts),
      protection: protection(facts),
      liquidity_and_exit: liquidity(facts),
      charges: charges(facts),
      claim_protection: claimProtection(facts),
    },
    SAVINGS_PILLAR_WEIGHTS,
    SAVINGS_SCORING_VERSION,
    findings,
  );
}
