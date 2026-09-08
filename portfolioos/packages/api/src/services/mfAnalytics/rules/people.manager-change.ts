/**
 * `MANAGER_CHANGE` — the lead manager changed recently, so the track record
 * the rest of this page is built on is partly somebody else's work.
 *
 * `05 §4`: "lead manager changed within 12 months", severity NOTICE,
 * counterfactual "Track record before {date} belongs to the previous manager;
 * this finding clears after 12 months".
 *
 * This is the rule with the widest gap between what it *says* and what it
 * *implies*. It is NOT a claim that the fund got worse — a new manager may be
 * better — it is a claim that the evidence elsewhere on the page is weaker
 * than its horizon suggests, because a 10-year Sortino computed across a
 * manager change describes two different funds averaged together. That is why
 * it is a NOTICE and why the counterfactual talks about attribution rather
 * than about performance.
 *
 * Driven off `profile.currentManagers[].fromDate` rather than
 * `managerTenureYears`, for one reason: the counterfactual has to name a date,
 * and a date reconstructed by subtracting a rounded tenure from `asOf` would
 * be a date nothing in the database actually holds. `managerTenureYears` is
 * carried as corroborating evidence instead.
 */

import { serializeRatio } from '@portfolioos/shared';
import type { MfEvidence, MfFinding } from '@portfolioos/shared';
import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.people.manager-change';
const RULE_VERSION = '1.0.0';

/**
 * Whole calendar months from `from` to `to`, both leading `YYYY-MM-DD`.
 *
 * Written out here rather than imported because a rule may only import the
 * contract, calibration and pure maths (`test/invariants/mf-rules-pure.test.ts`),
 * and every date helper in `@portfolioos/shared` builds a `Date` — which is
 * fine for *them* but would make this module's intent harder to audit. Integer
 * arithmetic on the ISO text is exact, needs no timezone and cannot read the
 * clock by accident.
 *
 * Returns null on anything that is not a date — a rule never throws on facts
 * it does not recognise, it stays silent.
 */
function monthsBetweenIso(from: string, to: string): number | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(from);
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(to);
  if (!a || !b) return null;
  const ay = Number.parseInt(a[1]!, 10);
  const am = Number.parseInt(a[2]!, 10);
  const ad = Number.parseInt(a[3]!, 10);
  const by = Number.parseInt(b[1]!, 10);
  const bm = Number.parseInt(b[2]!, 10);
  const bd = Number.parseInt(b[3]!, 10);
  let months = (by - ay) * 12 + (bm - am);
  // A change on the 20th is not a full month old on the 5th of the next month.
  if (bd < ad) months -= 1;
  return months;
}

/** `2026-03-12` -> `12 Mar 2026`, without pulling in Intl or a Date. */
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function humanDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTH_NAMES[Number.parseInt(m[2]!, 10) - 1];
  if (!month) return iso;
  return `${Number.parseInt(m[3]!, 10)} ${month} ${m[1]}`;
}

/**
 * The date the current line-up took over.
 *
 * The *latest* `fromDate` across the listed managers, not the earliest: a
 * co-manager joining a long-tenured lead is exactly the event this finding
 * exists to disclose, and taking the earliest would hide it behind the
 * incumbent's tenure.
 */
function latestFromDate(managers: ReadonlyArray<{ fromDate: string }>): string | null {
  let latest: string | null = null;
  for (const m of managers) {
    if (!m || typeof m.fromDate !== 'string') continue;
    // ISO dates sort lexicographically, which is the whole point of the format.
    if (latest === null || m.fromDate > latest) latest = m.fromDate;
  }
  return latest;
}

export const peopleManagerChangeRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'PEOPLE',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (!schemeCode) return [];
    const fund = facts.funds[schemeCode];
    const profile = fund?.profile;
    if (!profile) return [];

    const managers = profile.currentManagers;
    if (!Array.isArray(managers) || managers.length === 0) return [];

    const changedOn = latestFromDate(managers);
    if (changedOn === null) return [];

    const months = monthsBetweenIso(changedOn, facts.asOf);
    // A negative value means the fact table has a manager starting after the
    // run date. That is a data problem, not a manager change; stay silent
    // rather than emit a finding whose counterfactual is in the future.
    if (months === null || months < 0) return [];

    const lookback = facts.constants.managerChangeLookbackMonths;
    if (months >= lookback) return [];

    const evidence: MfEvidence[] = [
      {
        metric: 'managerTenureMonths',
        label: 'Months since the current line-up took over',
        value: serializeRatio(months),
        unit: 'count',
      },
    ];

    if (profile.managerTenureYears !== null) {
      evidence.push({
        metric: 'managerTenureYears',
        label: 'Lead manager tenure',
        value: profile.managerTenureYears,
        unit: 'ratio',
      });
    }

    if (profile.managerChangesLast3y !== null) {
      evidence.push({
        metric: 'managerChangesLast3y',
        label: 'Manager changes in the last 3 years',
        value: serializeRatio(profile.managerChangesLast3y),
        unit: 'count',
      });
    }

    const when = humanDate(changedOn);

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: 'MANAGER_CHANGE',
        category: 'PEOPLE',
        severity: 'NOTICE',
        confidence: confidenceFor(),
        headline:
          months === 0
            ? `Fund manager changed this month (took over ${when})`
            : `Fund manager changed ${months} month${months === 1 ? '' : 's'} ago (took over ${when})`,
        evidence,
        whatWouldChangeThis:
          `Track record before ${when} belongs to the previous manager; this finding ` +
          `clears after ${lookback} months, once the current manager's own record covers the period we rate.`,
      }),
    ];
  },
};

export default peopleManagerChangeRule;
