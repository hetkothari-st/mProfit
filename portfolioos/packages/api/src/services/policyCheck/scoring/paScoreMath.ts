/**
 * Personal accident policy score. Pure; weights are data.
 *
 * Five pillars, each 0-100 from what the documents state. Anything not stated
 * is dropped from the weight pool, never scored as zero.
 *
 *  cover_breadth     35%  death and total disability, plus partial disability,
 *                         recovery pay and accident medical expenses
 *  payout_parity     15%  permanent total disability pays as much as death
 *  territory         15%  worldwide or India only
 *  validity          15%  is the policy in force, and for how long
 *  extras            20%  child education, loan EMI, ambulance, hospital cash
 *
 * The score judges the policy's terms. It cannot say whether the sums match
 * your income and loans: that needs numbers from you (see the cover calculator).
 */

import { Decimal } from '@everypaisa/shared';
import type { PolicyFindingDTO } from '@everypaisa/shared';
import type { PaAnalysisFacts } from '../types.js';
import { paTerritoryOf } from '../rules/pa.rules.js';
import { composeScore, type PillarResult } from './composeScore.js';

export const PA_SCORING_VERSION = 'pa_score_v1';

export const PA_PILLAR_WEIGHTS = {
  cover_breadth: new Decimal('0.35'),
  payout_parity: new Decimal('0.15'),
  territory: new Decimal('0.15'),
  validity: new Decimal('0.15'),
  extras: new Decimal('0.20'),
} as const;

type Inputs = PillarResult['inputs'];
type Fld = { status: string; value: unknown } | undefined;
const d = (n: number) => new Decimal(n);
const has = (f: Fld) => !!f && f.status !== 'NOT_FOUND' && f.value !== null && f.value !== undefined;
const positive = (f: Fld) => has(f) && Number.isFinite(Number(f!.value)) && Number(f!.value) > 0;

/** Score = 40 + 60 x (items present / items known). Booleans can be known-absent; amounts only prove presence. */
function share(items: Array<{ key: string; kind: 'bool' | 'amount'; f: Fld }>): PillarResult {
  const inputs: Inputs = {};
  let known = 0;
  let yes = 0;
  for (const { key, kind, f } of items) {
    if (kind === 'bool') {
      if (!has(f)) continue;
      known++;
      const on = f!.value === true;
      if (on) yes++;
      inputs[key] = { value: on ? 'included' : 'not included', note: null };
    } else {
      if (!positive(f)) continue;
      known++;
      yes++;
      inputs[key] = { value: String(Number(f!.value)), note: null };
    }
  }
  if (known === 0) return { score: null, inputs };
  return { score: d(40).plus(d(60).mul(yes).div(known)), inputs };
}

function coverBreadth(facts: PaAnalysisFacts): PillarResult {
  const x = facts.extraction;
  return share([
    { key: 'accidentalDeathInr', kind: 'amount', f: x.accidentalDeathInr },
    { key: 'permanentTotalDisabilityInr', kind: 'amount', f: x.permanentTotalDisabilityInr },
    { key: 'permanentPartialDisabilityCovered', kind: 'bool', f: x.permanentPartialDisabilityCovered },
    { key: 'temporaryDisabilityCovered', kind: 'bool', f: x.temporaryDisabilityCovered },
    { key: 'medicalExpensesCovered', kind: 'bool', f: x.medicalExpensesCovered },
  ]);
}

function payoutParity(facts: PaAnalysisFacts): PillarResult {
  const { accidentalDeathInr: death, permanentTotalDisabilityInr: ptd } = facts.extraction;
  if (!positive(death) || !positive(ptd)) return { score: null, inputs: {} };
  const ratio = new Decimal(String(ptd.value)).div(new Decimal(String(death.value))).mul(100);
  return {
    score: Decimal.min(ratio, d(100)),
    inputs: { disabilityAsPercentOfDeath: { value: ratio.toDecimalPlaces(0).toFixed(0), note: null } },
  };
}

function territory(facts: PaAnalysisFacts): PillarResult {
  const t = paTerritoryOf(facts);
  if (!t) return { score: null, inputs: {} };
  return { score: d(t === 'WORLDWIDE' ? 100 : 60), inputs: { coverTerritory: { value: t, note: null } } };
}

function validity(facts: PaAnalysisFacts): PillarResult {
  const end = facts.extraction.policyEndDate;
  if (!has(end) || !/^\d{4}-\d{2}-\d{2}/.test(String(end!.value))) return { score: null, inputs: {} };
  const days = Math.ceil((Date.parse(`${String(end!.value).slice(0, 10)}T23:59:59Z`) - Date.parse(facts.asOf)) / 86_400_000);
  if (Number.isNaN(days)) return { score: null, inputs: {} };
  const s = days < 0 ? 20 : days <= facts.constants.renewalWindowDays ? 70 : 100;
  return { score: d(s), inputs: { daysToExpiry: { value: String(days), note: days < 0 ? 'expired' : null } } };
}

function extras(facts: PaAnalysisFacts): PillarResult {
  const x = facts.extraction;
  return share([
    { key: 'childEducationBenefit', kind: 'bool', f: x.childEducationBenefit },
    { key: 'loanEmiCover', kind: 'bool', f: x.loanEmiCover },
    { key: 'ambulanceCover', kind: 'bool', f: x.ambulanceCover },
    { key: 'hospitalCashDailyInr', kind: 'amount', f: x.hospitalCashDailyInr },
  ]);
}

export function computePaScore(facts: PaAnalysisFacts, findings: PolicyFindingDTO[]) {
  return composeScore(
    {
      cover_breadth: coverBreadth(facts),
      payout_parity: payoutParity(facts),
      territory: territory(facts),
      validity: validity(facts),
      extras: extras(facts),
    },
    PA_PILLAR_WEIGHTS,
    PA_SCORING_VERSION,
    findings,
  );
}
