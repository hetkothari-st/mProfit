/**
 * Waiting periods vs documented continuous cover, and the regulatory caps.
 *
 * Continuity credit is only reported where the DOCUMENTS state a
 * continuous-cover start ("continuous coverage since", "date of first
 * enrolment", "portability credit from"). We never infer it, and every
 * finding says the credit counts only if the insurer has recognised the
 * earlier cover — we do not assume portability or migration was approved.
 *
 * Regulatory reference (IRDAI Master Circular on Health Insurance Business,
 * 29 May 2024): pre-existing-disease and specific-disease waiting periods
 * capped at 3 years; moratorium of 60 continuous months after which claims
 * cannot be contested except for fraud or permanent exclusions.
 */

import type { PolicyEvidence, PolicyFindingDTO } from '@everypaisa/shared';
import type { PolicyAnalysisFacts, PolicyRule } from '../types.js';
import { makePolicyFinding } from '../types.js';

const RULE_ID = 'policy.waiting.continuity';
const RULE_VERSION = '1.0.0';

const ISO = /^\d{4}-\d{2}-\d{2}/;

/** UTC midnight of a YYYY-MM-DD(…) string, or null. */
export function parseIsoDay(s: string | null | undefined): number | null {
  if (!s || !ISO.test(s)) return null;
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  const t = Date.UTC(y!, m! - 1, d!);
  return Number.isNaN(t) ? null : t;
}

export function wholeDaysBetween(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / 86_400_000);
}

/** Completed calendar months between two UTC-midnight timestamps. */
export function wholeMonthsBetween(fromMs: number, toMs: number): number {
  const a = new Date(fromMs);
  const b = new Date(toMs);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

type Field<T> = { value: T | null; confidence: number; sourceDocId: string | null; sourcePage: number | null; clauseHeading: string | null; status: string } | undefined;

const found = <T>(f: Field<T>): f is NonNullable<Field<T>> & { value: T } =>
  !!f && f.status !== 'NOT_FOUND' && f.value !== null && f.value !== undefined;

function ev(f: NonNullable<Field<unknown>>, text: string, fallbackHeading: string): PolicyEvidence {
  return { docId: f.sourceDocId ?? '', page: f.sourcePage ?? 1, clauseHeading: f.clauseHeading ?? fallbackHeading, extractedText: text };
}

export const waitingContinuityRule: PolicyRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  policyType: ['HEALTH'],
  category: 'WAITING_PERIOD',

  evaluate(facts: PolicyAnalysisFacts) {
    const x = facts.extraction;
    const out: PolicyFindingDTO[] = [];

    const waits = [
      { key: 'INITIAL', name: 'Initial waiting period', f: x.initialWaitingDays as Field<number> },
      { key: 'PED', name: 'Pre-existing disease waiting period', f: x.pedWaitingDays as Field<number> },
      { key: 'SPECIFIC', name: 'Specific disease waiting period', f: x.specificDiseaseWaitingDays as Field<number> },
    ].filter((w) => found(w.f) && (w.f!.value as number) > 0);
    if (waits.length === 0) return out;

    const asOfMs = parseIsoDay(facts.asOf)!;
    const startMs = found(x.policyStartDate as Field<string>) ? parseIsoDay((x.policyStartDate as Field<string>)!.value) : null;
    const capEffectiveMs = parseIsoDay(facts.constants.regulatoryCapEffectiveDate)!;

    // ---- Regulatory cap on PED / specific-disease waits ----
    for (const w of waits.filter((w) => w.key !== 'INITIAL')) {
      const days = w.f!.value as number;
      if (days <= facts.constants.regulatoryMaxWaitingDays) continue;
      const newPolicy = startMs !== null && startMs >= capEffectiveMs;
      out.push(
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: `${w.key}_WAIT_EXCEEDS_REGULATORY_CAP`,
          category: 'WAITING_PERIOD',
          severity: newPolicy ? 'WARNING' : 'NOTICE',
          confidence: String(w.f!.confidence),
          headline: `${w.name} of ${days} days is longer than the 3-year (${facts.constants.regulatoryMaxWaitingDays}-day) IRDAI limit`,
          evidence: [ev(w.f!, `${w.name}: ${days} days`, w.name)],
          whatWouldChangeThis: newPolicy
            ? 'IRDAI’s 2024 Master Circular caps this waiting period at 3 years for policies issued from 1 April 2024. ' +
              'Check the figure was extracted correctly; if it is right, raise it with the insurer.'
            : 'IRDAI’s 2024 Master Circular caps this waiting period at 3 years. Policies issued earlier may carry the older ' +
              'longer wait; ask the insurer whether the cap applies at your next renewal.',
        }),
      );
    }

    // ---- Continuity ----
    const since = x.continuousCoverSince as Field<string>;
    const sinceMs = found(since) ? parseIsoDay(since.value) : null;
    const ped = waits.find((w) => w.key === 'PED');

    if (sinceMs === null) {
      if (ped) {
        out.push(
          makePolicyFinding(facts, {
            ruleId: RULE_ID,
            ruleVersion: RULE_VERSION,
            code: 'CONTINUITY_NOT_DOCUMENTED',
            category: 'WAITING_PERIOD',
            severity: 'NOTICE',
            confidence: String(ped.f!.confidence),
            headline: 'No continuous-cover start date in your documents — waiting periods counted from this policy only',
            evidence: [ev(ped.f!, `${ped.name}: ${ped.f!.value} days`, ped.name)],
            whatWouldChangeThis:
              'If you held health cover earlier without a break (with this or another insurer), part of these waiting periods ' +
              'may already be served. Ask the insurer for written confirmation of the continuity or portability credit and upload it.',
          }),
        );
      }
      return out;
    }

    if (sinceMs > asOfMs) return out; // a future date is an extraction error, not a credit

    const elapsedDays = wholeDaysBetween(sinceMs, asOfMs);
    const elapsedMonths = wholeMonthsBetween(sinceMs, asOfMs);
    const sinceIso = since!.value!.slice(0, 10);
    const note = x.continuityCreditNote as Field<string | null>;
    const sinceEv = (text: string) => [
      ev(since!, `Continuous cover since ${sinceIso}${found(note) ? ` — "${String(note!.value).slice(0, 160)}"` : ''}`, 'Continuity of cover'),
      ...(text ? [ev(since!, text, 'Waiting period')] : []),
    ];
    const caveat =
      'This counts only if the insurer has recognised the earlier cover — confirm it in writing. ' +
      'A break in cover (beyond the grace period) can reset it.';

    for (const w of waits) {
      const days = w.f!.value as number;
      const remaining = Math.max(0, days - elapsedDays);
      out.push(
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: remaining === 0 ? `${w.key}_WAIT_SERVED` : `${w.key}_WAIT_REMAINING`,
          category: 'WAITING_PERIOD',
          severity: remaining === 0 ? 'INFO' : 'NOTICE',
          confidence: String(Math.min(since!.confidence, w.f!.confidence)),
          headline:
            remaining === 0
              ? `${w.name} (${days} days) appears served: ${elapsedMonths} months of continuous cover since ${sinceIso}`
              : `${w.name}: about ${remaining} of ${days} days remain (continuous cover since ${sinceIso})`,
          evidence: sinceEv(`${w.name}: ${days} days`),
          whatWouldChangeThis: caveat,
        }),
      );
    }

    if (elapsedMonths >= facts.constants.moratoriumMonths) {
      out.push(
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: 'MORATORIUM_PERIOD_REACHED',
          category: 'WAITING_PERIOD',
          severity: 'INFO',
          confidence: String(since!.confidence),
          headline: `${elapsedMonths} months of continuous cover — past the ${facts.constants.moratoriumMonths}-month moratorium`,
          evidence: sinceEv(''),
          whatWouldChangeThis:
            `Under IRDAI’s 2024 Master Circular, after ${facts.constants.moratoriumMonths} continuous months an insurer cannot contest ` +
            'a claim except for fraud or a permanent exclusion. Confirm the moratorium clause in your wording. ' + caveat,
        }),
      );
    }
    return out;
  },
};
