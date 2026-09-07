/**
 * `AMC_REGULATORY_ACTION` — a regulator has acted against this scheme's AMC
 * inside the lookback window.
 *
 * `05 §4`: "qualitative fact within 3 years", severity WARNING. It is one of
 * the two CRITICAL-eligible inputs in `05 §5` row 2, which is why the `code`
 * string below has to be exactly `AMC_REGULATORY_ACTION`: the verdict table
 * matches on it by value, and a typo here does not fail a test, it silently
 * removes the only route by which a regulatory action can escalate a fund to
 * `SWITCH_CANDIDATE`.
 *
 * The fact itself comes from `MfSchemeQualitativeFact` (`01 §2`) — admin
 * curated, because no feed publishes "SEBI barred this AMC from taking new
 * inflows" in a machine-readable form. `mfFacts.builder.ts` has already
 * filtered `facts.funds[code].qualitative` to the facts *in force* at `asOf`
 * (validFrom <= asOf < validTo); this rule adds the second, independent test
 * that `05 §4` asks for — that the action is *recent*, not merely still on the
 * books. A 2011 action left open with a null `validTo` is in force and is not
 * news.
 *
 * At most one finding per fund. `makeFinding` derives a deterministic id from
 * `(ruleId, schemeCode, code)`, so two findings from one rule for one scheme
 * would collide on that key; the most recent action is reported and the count
 * of the others is carried as evidence.
 */

import { serializeRatio } from '@portfolioos/shared';
import type { MfEvidence, MfFinding, MfQualitativeFactDto } from '@portfolioos/shared';
import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.people.amc-action';
const RULE_VERSION = '1.0.0';

/**
 * The `factType` the admin console writes for a regulatory action, verbatim
 * from `01 §2`'s schema comment (`AMC_REGULATORY_ACTION | STRATEGY_CAPACITY_CAP | …`).
 *
 * Deliberately identical to the finding code. They are two different things —
 * one is an input row's discriminator, the other is a finding's stable
 * identifier — and it is worth noting that their equality is a coincidence of
 * naming, not a contract, so that renaming one does not silently rename both.
 */
const FACT_TYPE = 'AMC_REGULATORY_ACTION';

/** Whole calendar months between two leading `YYYY-MM-DD` values. Pure. */
function monthsBetweenIso(from: string, to: string): number | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(from);
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(to);
  if (!a || !b) return null;
  const ad = Number.parseInt(a[3]!, 10);
  const bd = Number.parseInt(b[3]!, 10);
  let months =
    (Number.parseInt(b[1]!, 10) - Number.parseInt(a[1]!, 10)) * 12 +
    (Number.parseInt(b[2]!, 10) - Number.parseInt(a[2]!, 10));
  if (bd < ad) months -= 1;
  return months;
}

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

/** Keep an AMC name from pushing a templated headline past the 120-char cap. */
function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export const peopleAmcActionRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'PEOPLE',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (!schemeCode) return [];
    const fund = facts.funds[schemeCode];
    if (!fund) return [];

    const qualitative = fund.qualitative;
    if (!Array.isArray(qualitative) || qualitative.length === 0) return [];

    const lookbackMonths = facts.constants.amcRegulatoryActionLookbackYears * 12;

    const recent: Array<{ fact: MfQualitativeFactDto; months: number }> = [];
    for (const fact of qualitative) {
      if (!fact || fact.factType !== FACT_TYPE) continue;
      if (typeof fact.validFrom !== 'string') continue;
      const months = monthsBetweenIso(fact.validFrom, facts.asOf);
      // A future-dated action is a data-entry error, not news. Silence beats
      // a finding whose "recorded on" date has not happened yet.
      if (months === null || months < 0) continue;
      if (months > lookbackMonths) continue;
      recent.push({ fact, months });
    }

    if (recent.length === 0) return [];

    // Most recent first — the freshest action is the one worth naming.
    recent.sort((x, y) => x.months - y.months);
    const newest = recent[0]!;
    const when = humanDate(newest.fact.validFrom);

    const evidence: MfEvidence[] = [
      {
        metric: 'qualitative.AMC_REGULATORY_ACTION',
        label: `Months since the action was recorded (source: ${clip(newest.fact.source ?? 'admin entry', 60)})`,
        value: serializeRatio(newest.months),
        unit: 'count',
      },
      {
        metric: 'qualitative.AMC_REGULATORY_ACTION.count',
        label: `Regulatory actions on file within ${facts.constants.amcRegulatoryActionLookbackYears} years`,
        value: serializeRatio(recent.length),
        unit: 'count',
      },
    ];

    const amc = clip(fund.meta.amcName, 40);

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: 'AMC_REGULATORY_ACTION',
        category: 'PEOPLE',
        severity: 'WARNING',
        confidence: confidenceFor(),
        headline:
          recent.length === 1
            ? `Regulatory action recorded against ${amc} on ${when}`
            : `${recent.length} regulatory actions recorded against ${amc}, latest ${when}`,
        evidence,
        whatWouldChangeThis:
          `Clears once the action recorded on ${when} is more than ` +
          `${facts.constants.amcRegulatoryActionLookbackYears} years old and no newer action has been recorded ` +
          'against the AMC.',
      }),
    ];
  },
};

export default peopleAmcActionRule;
