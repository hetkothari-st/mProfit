/**
 * `LTCG_FLIP_SOON` — you hold gains that become long-term within weeks.
 *
 * `05 §4`: "any STCG lot with `daysToLtcg <= 45` **and gain > 0**", severity
 * INFO.
 *
 * ---------------------------------------------------------------------------
 * Why the positive-gain condition is not optional
 * ---------------------------------------------------------------------------
 *
 * The flip only helps a lot that is *in profit*. Short-term equity gains are
 * taxed at 20% and long-term at 12.5% above the §112A allowance, so waiting
 * converts a higher rate into a lower one — but only on a gain.
 *
 * On a **loss** the flip is the opposite of a benefit and telling the user to
 * wait is actively harmful advice:
 *
 *   - a short-term capital loss can be set off against *both* short-term and
 *     long-term gains, while a long-term loss can only be set off against
 *     long-term gains. Waiting narrows what the loss can do;
 *   - there is no tax to save on a loss in the first place, so the "saving"
 *     that motivates the finding is zero.
 *
 * `05 §4` says "gain > 0" for exactly this reason, and a lot at precisely
 * break-even is excluded too — there is nothing to convert.
 *
 * ---------------------------------------------------------------------------
 * What this finding does NOT say
 * ---------------------------------------------------------------------------
 *
 * It is INFO, and it does not tell anyone to sell on the flip date. Whether to
 * realise a gain at all is a decision about the position; this rule only
 * observes that the tax treatment of part of it changes on a knowable date.
 * The §112A annual exemption is an aggregate across the whole portfolio and is
 * handled at portfolio level (`04 §5`), so no rupee tax saving is asserted
 * here — the per-lot figures cannot be netted against a headroom this rule
 * cannot see.
 */

import { Decimal } from 'decimal.js';
import { formatINR, serializeRatio, toDecimal } from '@portfolioos/shared';
import type { MfEvidence, MfFinding, MfLotDto } from '@portfolioos/shared';
import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.user.ltcg-approaching';
const RULE_VERSION = '1.0.0';

const ZERO = new Decimal(0);

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Pure civil-date arithmetic (Howard Hinnant), duplicated from
 * `user.exit-load-window.ts`.
 *
 * A rule module may not so much as name the `Date` constructor — a module that
 * can build one can read the clock, and a rule that reads the clock is not
 * replayable (`05 §3`, `05 §8.5`). Integer arithmetic on the ISO text cannot
 * know what day it is, which is the property the invariant is really asking for.
 */
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

/** STCG, flipping within the window, and actually in profit. */
function qualifies(lot: MfLotDto, windowDays: number): boolean {
  if (lot.gainType !== 'STCG') return false;
  // Null on an LTCG lot by construction, and null anywhere else means we could
  // not compute the flip date — either way there is no date to quote.
  if (lot.daysToLtcg === null) return false;
  if (lot.daysToLtcg > windowDays) return false;
  // See the header: a loss gets no benefit from the flip, and arguably loses
  // one. Break-even is excluded for the same reason.
  return toDecimal(lot.gain).greaterThan(ZERO);
}

export const userLtcgApproachingRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'USER',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (!schemeCode) return [];
    const held = facts.funds[schemeCode]?.held;
    if (!held || !Array.isArray(held.lots)) return [];

    const windowDays = facts.constants.ltcgFlipSoonDays;
    const flipping = held.lots.filter((lot) => qualifies(lot, windowDays));
    if (flipping.length === 0) return [];

    let gainTotal = ZERO;
    /** The last of these lots to flip — the date the finding actually clears. */
    let lastFlipDays = 0;
    for (const lot of flipping) {
      gainTotal = gainTotal.plus(toDecimal(lot.gain));
      if (lot.daysToLtcg! > lastFlipDays) lastFlipDays = lot.daysToLtcg!;
    }

    const clearsOn = addDaysIso(facts.asOf, lastFlipDays);
    if (clearsOn === null) return [];

    const evidence: MfEvidence[] = [
      {
        metric: 'lots.gain',
        label: `Unrealised gain on the ${flipping.length} lot(s) about to turn long-term`,
        value: serializeRatio(gainTotal),
        unit: 'inr',
      },
      {
        metric: 'lots.daysToLtcg',
        label: 'Days until the last of them crosses the long-term threshold',
        value: serializeRatio(lastFlipDays),
        unit: 'days',
      },
      {
        metric: 'constants.ltcgFlipSoonDays',
        label: 'How near the flip has to be before we mention it',
        value: serializeRatio(windowDays),
        unit: 'days',
      },
    ];

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: 'LTCG_FLIP_SOON',
        category: 'USER',
        severity: 'INFO',
        confidence: confidenceFor(),
        headline: `${formatINR(gainTotal.toFixed(2))} of gain turns long-term within ${lastFlipDays} days`,
        evidence,
        whatWouldChangeThis:
          `Clears on ${humanDate(clearsOn)}, when the last of these lots completes its holding period ` +
          `and its gain is taxed as long-term instead of short-term. Selling before then is not wrong — ` +
          'it simply keeps the short-term treatment.',
      }),
    ];
  },
};

export default userLtcgApproachingRule;
