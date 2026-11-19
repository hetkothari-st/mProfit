/**
 * Home policy score. Pure; weights are data.
 *
 * Five pillars, each 0-100 from what the documents state. Anything not stated
 * is dropped from the weight pool, never scored as zero.
 *
 *  cover_scope   25%  building, contents, or both
 *  claim_basis   25%  how a claim is valued, and the deductible
 *  perils        25%  flood, earthquake, burglary, water damage
 *  validity      15%  is the policy in force, and for how long
 *  extras        10%  appliance breakdown, valuables, liability, accident, rent
 *
 * The score judges the policy's terms. It cannot say whether the sums insured
 * match your home's real cost: that needs numbers from you (see the cover
 * calculator).
 */

import { Decimal } from '@everypaisa/shared';
import type { PolicyFindingDTO } from '@everypaisa/shared';
import type { HomeAnalysisFacts } from '../types.js';
import { homeBasisOf, homeScopeOf } from '../rules/home.rules.js';
import { composeScore, type PillarResult } from './composeScore.js';

export const HOME_SCORING_VERSION = 'home_score_v1';

export const HOME_PILLAR_WEIGHTS = {
  cover_scope: new Decimal('0.25'),
  claim_basis: new Decimal('0.25'),
  perils: new Decimal('0.25'),
  validity: new Decimal('0.15'),
  extras: new Decimal('0.10'),
} as const;

type Inputs = PillarResult['inputs'];
const d = (n: number) => new Decimal(n);
const has = (f: { status: string; value: unknown } | undefined) =>
  !!f && f.status !== 'NOT_FOUND' && f.value !== null && f.value !== undefined;
const positive = (f: { status: string; value: unknown } | undefined) => has(f) && Number.isFinite(Number(f!.value)) && Number(f!.value) > 0;

function coverScope(facts: HomeAnalysisFacts): PillarResult {
  const s = homeScopeOf(facts);
  if (!s) return { score: null, inputs: { coverScope: { value: null, note: 'NOT_FOUND' } } };
  return { score: d(s === 'STRUCTURE_AND_CONTENTS' ? 100 : s === 'STRUCTURE_ONLY' ? 70 : 60), inputs: { coverScope: { value: s, note: null } } };
}

function claimBasis(facts: HomeAnalysisFacts): PillarResult {
  const inputs: Inputs = {};
  const basis = homeBasisOf(facts);
  const ded = facts.extraction.deductibleInr;
  let score: Decimal | null = null;
  if (basis) {
    inputs['valuationBasis'] = { value: basis, note: null };
    score = d(basis === 'REINSTATEMENT' ? 100 : basis === 'MARKET_VALUE' ? 55 : 35);
  }
  if (positive(ded)) {
    const n = Number(ded.value);
    inputs['deductibleInr'] = { value: String(n), note: null };
    score = (score ?? d(100)).minus(n > facts.constants.deductibleNoticeInr ? 15 : 0);
  }
  if (score === null) return { score: null, inputs };
  return { score: Decimal.max(score, d(0)), inputs };
}

/** points per peril; the score is 40 + 60 x (points earned / points known), so unknown perils do not count against the policy. */
function perils(facts: HomeAnalysisFacts): PillarResult {
  const x = facts.extraction;
  const scope = homeScopeOf(facts);
  const items: Array<[string, { status: string; value: unknown } | undefined, number]> = [
    ['floodCovered', x.floodCovered, 20],
    ['earthquakeCovered', x.earthquakeCovered, 15],
    // Burglary is about contents: it does not count against a building-only policy.
    ['burglaryCovered', scope === 'STRUCTURE_ONLY' ? undefined : x.burglaryCovered, 15],
    ['waterDamageCovered', x.waterDamageCovered, 10],
  ];
  const inputs: Inputs = {};
  let earned = 0;
  let available = 0;
  for (const [k, f, pts] of items) {
    if (!has(f)) continue;
    available += pts;
    const yes = f!.value === true;
    inputs[k] = { value: yes ? 'covered' : 'not covered', note: null };
    if (yes) earned += pts;
  }
  if (available === 0) return { score: null, inputs };
  return { score: d(40).plus(d(60).mul(earned).div(available)), inputs };
}

function validity(facts: HomeAnalysisFacts): PillarResult {
  const end = facts.extraction.policyEndDate;
  if (!has(end) || !/^\d{4}-\d{2}-\d{2}/.test(String(end.value))) return { score: null, inputs: {} };
  const days = Math.ceil((Date.parse(`${String(end.value).slice(0, 10)}T23:59:59Z`) - Date.parse(facts.asOf)) / 86_400_000);
  if (Number.isNaN(days)) return { score: null, inputs: {} };
  const s = days < 0 ? 20 : days <= facts.constants.renewalWindowDays ? 70 : 100;
  return { score: d(s), inputs: { daysToExpiry: { value: String(days), note: days < 0 ? 'expired' : null } } };
}

function extras(facts: HomeAnalysisFacts): PillarResult {
  const x = facts.extraction;
  const inputs: Inputs = {};
  let known = 0;
  let yes = 0;
  const bool = (k: string, f: { status: string; value: unknown } | undefined) => {
    if (!has(f)) return;
    known++;
    if (f!.value === true) {
      yes++;
      inputs[k] = { value: 'included', note: null };
    } else {
      inputs[k] = { value: 'not included', note: null };
    }
  };
  // An amount only ever proves presence: a missing one is "not found", not "absent".
  const amount = (k: string, f: { status: string; value: unknown } | undefined) => {
    if (!positive(f)) return;
    known++;
    yes++;
    inputs[k] = { value: String(Number(f!.value)), note: null };
  };
  bool('electronicsCovered', x.electronicsCovered);
  bool('valuablesCovered', x.valuablesCovered);
  amount('alternateAccommodationInr', x.alternateAccommodationInr);
  amount('publicLiabilityInr', x.publicLiabilityInr);
  amount('personalAccidentInr', x.personalAccidentInr);
  if (known === 0) return { score: null, inputs };
  return { score: d(40).plus(d(60).mul(yes).div(known)), inputs };
}

export function computeHomeScore(facts: HomeAnalysisFacts, findings: PolicyFindingDTO[]) {
  return composeScore(
    {
      cover_scope: coverScope(facts),
      claim_basis: claimBasis(facts),
      perils: perils(facts),
      validity: validity(facts),
      extras: extras(facts),
    },
    HOME_PILLAR_WEIGHTS,
    HOME_SCORING_VERSION,
    findings,
  );
}
