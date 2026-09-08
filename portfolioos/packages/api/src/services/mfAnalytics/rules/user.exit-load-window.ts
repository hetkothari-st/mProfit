/**
 * `EXIT_LOAD_ACTIVE` — some of your units would be charged an exit load if you
 * sold today.
 *
 * `05 §4`: "any lot inside exit-load window", severity INFO, counterfactual
 * "Clears on {date}". No threshold constant exists and none should: this is a
 * pure predicate over the scheme's published load ladder, not a judgement
 * call (see the note at the foot of `mfAnalytics.constants.ts`).
 *
 * ---------------------------------------------------------------------------
 * `exitLoadPct === null` means UNKNOWN, and unknown is not zero
 * ---------------------------------------------------------------------------
 *
 * `MfLotDto.exitLoadPct`'s doc comment is explicit: "Null means we do not know
 * this scheme's exit load, not that it is zero." Treating a null as 0% would
 * make this rule silently certify "no exit load applies" for every scheme
 * whose load text we failed to parse — the most expensive possible way to be
 * wrong, because the user acts on it by selling. So a null lot is skipped: it
 * neither fires the finding nor contributes to the total.
 *
 * The same reasoning applies to `meta.exitLoadRules`. A finding whose whole
 * counterfactual is a date cannot be built without the ladder that produces
 * that date, and reconstructing one from a per-lot percentage would be a
 * guess. If the ladder is absent the rule stays silent.
 *
 * ---------------------------------------------------------------------------
 * One finding per fund, dated by the LAST lot to clear
 * ---------------------------------------------------------------------------
 *
 * `makeFinding` derives a deterministic id from (rule, scheme, code), so one
 * finding per lot would collide on that key. The lots are aggregated instead,
 * and the date quoted is the one on which the *last* affected lot leaves its
 * window — the date on which the finding actually disappears, which is what
 * "Clears on {date}" has to mean if it is to be checkable against the next
 * run.
 */

import { Decimal } from 'decimal.js';
import { formatINR, serializeRatio, toDecimal } from '@portfolioos/shared';
import type { MfEvidence, MfExitLoadRule, MfFinding, MfLotDto } from '@portfolioos/shared';
import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.user.exit-load-window';
const RULE_VERSION = '1.0.0';

const ZERO = new Decimal(0);

// ---------------------------------------------------------------------------
// Pure civil-date arithmetic
// ---------------------------------------------------------------------------

/**
 * `days`-from-civil and its inverse (Howard Hinnant's algorithm), on integers.
 *
 * Written out here rather than imported for two reasons. A rule may only
 * import the contract, calibration and pure maths
 * (`test/invariants/mf-rules-pure.test.ts`), and — more to the point — the
 * purity suite forbids a rule from even naming the `Date` constructor, because
 * a module that can build one can read the clock and stops being replayable
 * (`05 §8.5`). Integer
 * arithmetic on the ISO text has neither problem: it is exact, timezone-free
 * and provably cannot know what day it is.
 *
 * Duplicated in `user.ltcg-approaching.ts`, which needs the same shift for a
 * different reason. Two ~20-line copies is the price of the import allow-list
 * and is cheaper than widening it.
 */
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(z0: number): { y: number; m: number; d: number } {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: m <= 2 ? y + 1 : y, m, d };
}

/** `YYYY-MM-DD` (or a longer ISO string) shifted by whole days. Null if unparsable. */
function addDaysIso(iso: string, days: number): string | null {
  const p = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!p) return null;
  const shifted = civilFromDays(
    daysFromCivil(
      Number.parseInt(p[1]!, 10),
      Number.parseInt(p[2]!, 10),
      Number.parseInt(p[3]!, 10),
    ) + days,
  );
  return `${String(shifted.y).padStart(4, '0')}-${String(shifted.m).padStart(2, '0')}-${String(shifted.d).padStart(2, '0')}`;
}

function humanDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTH_NAMES[Number.parseInt(m[2]!, 10) - 1];
  if (!month) return iso;
  return `${Number.parseInt(m[3]!, 10)} ${month} ${m[1]}`;
}

// ---------------------------------------------------------------------------

/** The longest window in the scheme's ladder — the day the last band expires. */
function maxLadderDays(rules: MfExitLoadRule[]): number | null {
  let max: number | null = null;
  for (const rule of rules) {
    if (!rule || typeof rule.daysUpTo !== 'number' || !Number.isFinite(rule.daysUpTo)) continue;
    if (max === null || rule.daysUpTo > max) max = rule.daysUpTo;
  }
  return max;
}

/** True when this lot would actually be charged something today. */
function isCharged(lot: MfLotDto): boolean {
  // Null = unknown. Skipped, never read as "free". See the header.
  if (lot.exitLoadPct === null) return false;
  return toDecimal(lot.exitLoadPct).greaterThan(ZERO);
}

export const userExitLoadWindowRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'USER',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (!schemeCode) return [];
    const fund = facts.funds[schemeCode];
    const held = fund?.held;
    if (!fund || !held) return [];

    const ladder = fund.meta.exitLoadRules;
    if (!Array.isArray(ladder) || ladder.length === 0) return [];
    const ladderDays = maxLadderDays(ladder);
    if (ladderDays === null) return [];

    const charged = (held.lots ?? []).filter(isCharged);
    if (charged.length === 0) return [];

    let totalInr = ZERO;
    let knownInrCount = 0;
    /** The latest date on which any charged lot leaves its window. */
    let clearsOn: string | null = null;

    for (const lot of charged) {
      if (lot.exitLoadInr !== null) {
        totalInr = totalInr.plus(toDecimal(lot.exitLoadInr));
        knownInrCount += 1;
      }
      // The lot is free the day *after* the last band's `daysUpTo` — the
      // ladder is inclusive (`holdingDays <= daysUpTo` charges).
      const lotClears = addDaysIso(lot.purchaseDate, ladderDays + 1);
      if (lotClears !== null && (clearsOn === null || lotClears > clearsOn)) clearsOn = lotClears;
    }

    if (clearsOn === null) return [];

    const evidence: MfEvidence[] = [
      {
        metric: 'lots.exitLoadInr',
        label:
          knownInrCount === charged.length
            ? 'Exit load payable if the whole position were sold today'
            : `Exit load payable on the ${knownInrCount} of ${charged.length} affected lots we can price`,
        value: serializeRatio(totalInr),
        unit: 'inr',
      },
      {
        metric: 'lots.inExitLoadWindow',
        label: `Lots inside the exit-load window (of ${held.lots.length} held)`,
        value: serializeRatio(charged.length),
        unit: 'count',
      },
      {
        metric: 'meta.exitLoadMaxDays',
        label: 'Longest band in this scheme’s exit-load ladder',
        value: serializeRatio(ladderDays),
        unit: 'days',
      },
    ];

    const when = humanDate(clearsOn);

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: 'EXIT_LOAD_ACTIVE',
        category: 'USER',
        severity: 'INFO',
        confidence: confidenceFor(),
        headline:
          knownInrCount > 0
            ? `${formatINR(totalInr.toFixed(2))} exit load on ${charged.length} of ${held.lots.length} lots if sold today`
            : `${charged.length} of ${held.lots.length} lots are still inside this scheme’s exit-load window`,
        evidence,
        whatWouldChangeThis:
          `Clears on ${when}, when the last of these lots passes the ${ladderDays}-day exit-load ` +
          'window. Selling before then costs the load above; selling after costs nothing.',
      }),
    ];
  },
};

export default userExitLoadWindowRule;
