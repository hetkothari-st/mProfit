/**
 * Motor policy score. Pure; weights are data.
 *
 * Five pillars, each 0-100 from what the documents state. Anything not stated
 * is dropped from the weight pool, never scored as zero.
 *
 *  cover_type            25%  comprehensive / own-damage only / third-party only
 *  claim_value           25%  add-ons that decide how much a repair claim pays
 *  validity              20%  is the policy in force, and for how long
 *  ncb_and_deductibles   15%  protection of the no-claim bonus, deductibles
 *  personal_accident     15%  owner-driver accident cover
 *
 * The score judges the policy's terms. It cannot say whether the IDV matches
 * your vehicle's value: that needs a number from you (see the IDV calculator).
 */

import { Decimal } from '@everypaisa/shared';
import type { PolicyFindingDTO } from '@everypaisa/shared';
import type { MotorAnalysisFacts } from '../types.js';
import { composeScore, type PillarResult } from './composeScore.js';

export const MOTOR_SCORING_VERSION = 'motor_score_v1';

export const MOTOR_PILLAR_WEIGHTS = {
  cover_type: new Decimal('0.25'),
  claim_value: new Decimal('0.25'),
  validity: new Decimal('0.20'),
  ncb_and_deductibles: new Decimal('0.15'),
  personal_accident: new Decimal('0.15'),
} as const;

type Inputs = PillarResult['inputs'];
const d = (n: number) => new Decimal(n);
const has = (f: { status: string; value: unknown } | undefined) =>
  !!f && f.status !== 'NOT_FOUND' && f.value !== null && f.value !== undefined;

function kind(facts: MotorAnalysisFacts): 'COMPREHENSIVE' | 'OWN_DAMAGE_ONLY' | 'THIRD_PARTY_ONLY' | null {
  const f = facts.extraction.policyKind;
  if (!has(f)) return null;
  const v = String(f.value).toUpperCase().replace(/[\s-]+/g, '_');
  if (/THIRD/.test(v)) return 'THIRD_PARTY_ONLY';
  if (/OWN_?DAMAGE|STANDALONE|OD_ONLY/.test(v)) return 'OWN_DAMAGE_ONLY';
  if (/COMPREHENSIVE|PACKAGE/.test(v)) return 'COMPREHENSIVE';
  return null;
}

function coverType(facts: MotorAnalysisFacts): PillarResult {
  const k = kind(facts);
  if (!k) return { score: null, inputs: { policyKind: { value: null, note: 'NOT_FOUND' } } };
  const s = k === 'COMPREHENSIVE' ? 100 : k === 'OWN_DAMAGE_ONLY' ? 60 : 25;
  return { score: d(s), inputs: { policyKind: { value: k, note: null } } };
}

function claimValue(facts: MotorAnalysisFacts): PillarResult {
  if (kind(facts) === 'THIRD_PARTY_ONLY') return { score: null, inputs: { policyKind: { value: 'THIRD_PARTY_ONLY', note: 'no own-damage claims' } } };
  const x = facts.extraction;
  const inputs: Inputs = {};
  let score = d(50);
  let known = 0;
  const add = (label: string, f: { status: string; value: unknown } | undefined, pts: number) => {
    if (!has(f)) return;
    known++;
    const yes = f!.value === true;
    inputs[label] = { value: yes ? 'included' : 'not included', note: null };
    if (yes) score = score.plus(pts);
  };
  add('zeroDepreciation', x.zeroDepreciation, 25);
  add('engineProtect', x.engineProtect, 10);
  add('consumablesCover', x.consumablesCover, 10);
  add('returnToInvoice', x.returnToInvoice, 5);
  if (known === 0) return { score: null, inputs };
  return { score: Decimal.min(score, d(100)), inputs };
}

function validity(facts: MotorAnalysisFacts): PillarResult {
  const end = facts.extraction.policyEndDate;
  if (!has(end) || !/^\d{4}-\d{2}-\d{2}/.test(String(end.value))) return { score: null, inputs: {} };
  const days = Math.ceil((Date.parse(`${String(end.value).slice(0, 10)}T23:59:59Z`) - Date.parse(facts.asOf)) / 86_400_000);
  if (Number.isNaN(days)) return { score: null, inputs: {} };
  const s = days < 0 ? 20 : days <= facts.constants.renewalWindowDays ? 70 : 100;
  return { score: d(s), inputs: { daysToExpiry: { value: String(days), note: days < 0 ? 'expired' : null } } };
}

function ncbAndDeductibles(facts: MotorAnalysisFacts): PillarResult {
  const x = facts.extraction;
  const k = facts.constants;
  const inputs: Inputs = {};
  let score = d(100);
  let known = 0;
  if (has(x.ncbPercent)) {
    known++;
    const n = x.ncbPercent.value as number;
    inputs['ncbPercent'] = { value: String(n), note: null };
    if (n >= k.ncbProtectFromPercent && has(x.ncbProtect) && x.ncbProtect.value === false) score = score.minus(15);
  }
  if (has(x.voluntaryDeductibleInr)) {
    known++;
    const v = Number(x.voluntaryDeductibleInr.value);
    if (Number.isFinite(v) && v > 0) {
      inputs['voluntaryDeductibleInr'] = { value: String(v), note: null };
      score = score.minus(v > k.voluntaryDeductibleNoticeInr ? 25 : 10);
    }
  }
  if (known === 0) return { score: null, inputs };
  return { score: Decimal.max(score, d(0)), inputs };
}

function personalAccident(facts: MotorAnalysisFacts): PillarResult {
  const f = facts.extraction.ownerDriverPaInr;
  if (!has(f)) return { score: null, inputs: {} };
  const n = Number(f.value);
  if (!Number.isFinite(n)) return { score: null, inputs: {} };
  return {
    score: d(n >= facts.constants.usualOwnerDriverPaInr ? 100 : 60),
    inputs: { ownerDriverPaInr: { value: String(n), note: null } },
  };
}

export function computeMotorScore(facts: MotorAnalysisFacts, findings: PolicyFindingDTO[]) {
  return composeScore(
    {
      cover_type: coverType(facts),
      claim_value: claimValue(facts),
      validity: validity(facts),
      ncb_and_deductibles: ncbAndDeductibles(facts),
      personal_accident: personalAccident(facts),
    },
    MOTOR_PILLAR_WEIGHTS,
    MOTOR_SCORING_VERSION,
    findings,
  );
}
