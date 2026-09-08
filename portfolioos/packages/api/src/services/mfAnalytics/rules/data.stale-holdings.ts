/**
 * `STALE_HOLDINGS_DATA` — the portfolio disclosure everything structural on
 * this page is derived from is older than we are comfortable asserting from.
 *
 * `05 §4`: "latest snapshot > 60 days old", severity INFO.
 *
 * This is a finding about *us*, not about the fund, and that is why it exists.
 * Concentration, sector weights, credit quality, duration, look-through — every
 * one of them is computed from a single monthly disclosure that AMCs publish
 * with a lag of roughly forty days (`06 §6`). A user reading "top 10 holdings
 * are 62% of the book" has no way to know whether that describes today or last
 * quarter unless we tell them. INFO severity, because a stale snapshot is
 * normal and only becomes misleading if it is presented as current.
 *
 * `snapshotAsOf === null` is a *different* state — no disclosure at all — and
 * is deliberately silent here. `MfLookThrough.fundsWithoutHoldings` already
 * carries that case to the UI, and a finding claiming a null snapshot is "N
 * days stale" would have to invent N.
 */

import { daysBetween, serializeRatio } from '@portfolioos/shared';
import type { MfEvidence, MfFinding } from '@portfolioos/shared';
import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.data.stale-holdings';
const RULE_VERSION = '1.0.0';

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

export const dataStaleHoldingsRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'DATA',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (!schemeCode) return [];
    const profile = facts.funds[schemeCode]?.profile;
    if (!profile) return [];

    const snapshotAsOf = profile.snapshotAsOf;
    if (snapshotAsOf === null) return [];

    // `daysBetween` is a pure function of two strings — it builds no clock and
    // reads no environment, so it is safe inside a rule. Time comes from
    // `facts.asOf`, never from the wall clock (`05 §3`).
    const ageDays = daysBetween(snapshotAsOf, facts.asOf);
    // A disclosure dated after the run instant is a data problem, not
    // staleness. Silence beats a finding reporting a negative age.
    if (!Number.isFinite(ageDays) || ageDays < 0) return [];

    const threshold = facts.constants.staleHoldingsDays;
    if (ageDays <= threshold) return [];

    const evidence: MfEvidence[] = [
      {
        metric: 'profile.snapshotAsOf',
        label: `Age of the latest portfolio disclosure (dated ${humanDate(snapshotAsOf)})`,
        value: serializeRatio(ageDays),
        unit: 'days',
      },
      {
        metric: 'constants.staleHoldingsDays',
        label: 'Age at which we start flagging a disclosure as stale',
        value: serializeRatio(threshold),
        unit: 'days',
      },
    ];

    if (profile.numHoldings !== null) {
      evidence.push({
        metric: 'profile.numHoldings',
        label: 'Securities in that disclosure',
        value: serializeRatio(profile.numHoldings),
        unit: 'count',
      });
    }

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: 'STALE_HOLDINGS_DATA',
        category: 'DATA',
        severity: 'INFO',
        confidence: confidenceFor(),
        headline: `Holdings shown are from ${humanDate(snapshotAsOf)}, ${ageDays} days old`,
        evidence,
        whatWouldChangeThis:
          `Clears when the AMC publishes a portfolio disclosure less than ${threshold} days old; the ` +
          `latest we have is dated ${humanDate(snapshotAsOf)}. Every structural figure on this fund — ` +
          'concentration, sector and credit weights, duration - is measured from it.',
      }),
    ];
  },
};

export default dataStaleHoldingsRule;
