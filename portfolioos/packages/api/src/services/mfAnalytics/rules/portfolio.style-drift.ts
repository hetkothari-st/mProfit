/**
 * `STYLE_DRIFT` (`05 §4`, fund scope, row 10).
 *
 * ---------------------------------------------------------------------------
 * THE BAND IS REGULATION, NOT CALIBRATION
 * ---------------------------------------------------------------------------
 * The mandated market-cap floors come from `SEBI_SUBCATEGORY_MAP.capBand` in
 * `sebiCategories.ts` — a Large Cap Fund must hold >= 80% large caps, a Multi
 * Cap >= 25% in each of the three buckets, and so on. Those numbers are SEBI
 * circular SEBI/HO/IMD/DF3/CIR/P/2017/114, and `mfAnalytics.constants.ts` says
 * in as many words that they must NOT be overridable by a test fixture. The
 * only tunable part of this rule is the month count, which is
 * `styleDriftMonthsOutsideBand` over `styleDriftLookbackMonths`.
 *
 * Sub-categories with no cap-bucket floor never fire, and that is correct, not
 * an omission:
 *   - **Flexi Cap** has only `minEquityPct` — going anywhere across the cap
 *     spectrum is the mandate.
 *   - **Dynamic Bond**, **Balanced Advantage** and the rest carry no
 *     `capBand` at all; duration or equity share is the manager's active call
 *     and belongs to `DURATION_MISMATCH` / `ALLOCATION_DRIFT`, not here.
 *
 * ---------------------------------------------------------------------------
 * WHAT `05 §4` ASKS FOR AND WHAT THE FACTS CAN SUPPORT
 * ---------------------------------------------------------------------------
 * The doc's trigger is "outside the SEBI band for >= 3 of the last 12 months".
 * `MfCurrentProfile` carries no month-by-month history: `styleDrift` is a
 * SINGLE ratio, defined by `02 §7` as the *worst* deviation from the mandated
 * band across the last 12 snapshots, and `marketCapSplit` is the latest
 * snapshot alone. There is no count of breaching months anywhere in the facts,
 * and deriving one from a maximum is not possible.
 *
 * Rather than invent the count, this rule fires on the two things that ARE
 * observable, and the counterfactual still holds the fund to the doc's
 * standard:
 *
 *   1. the **latest disclosed** `marketCapSplit` is below a mandated floor —
 *      a live, checkable breach, not an inference; and
 *   2. `styleDrift > 0` — the fund was outside its band at some point across
 *      the `styleDriftLookbackMonths` window, so the breach is not an artefact
 *      of one snapshot's classification.
 *
 * This is narrower than the doc in one direction (a fund that breached in
 * months 1-3 and is compliant today does not fire) and wider in another (a
 * fund breaching only in the latest month can fire). Both are visible to the
 * reader through the evidence rows. When a per-month breach series exists in
 * the facts, replace term 2 with the real count and bump `version`.
 *
 * PRACTICAL NOTE: `mfMetrics.service.ts` currently sets `styleDrift` to null
 * for every fund with reason `no_data`, so this rule is **silent in
 * production today**. That is the honest state — `ruleVersionsSnapshot`
 * records that it ran and emitted nothing — and it is preferable to firing on
 * a band we never actually measured against.
 */

import {
  SEBI_SUBCATEGORY_MAP,
  serializeRatio,
  specFor,
  toDecimal,
  type MfEvidence,
  type MfFinding,
  type Pct,
  type SebiSubCategory,
} from '@portfolioos/shared';
import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.portfolio.style-drift';
const RULE_VERSION = '1.0.0';
const CODE = 'STYLE_DRIFT';

interface BucketBreach {
  label: string;
  actual: Pct;
  floorPct: number;
  /** Percentage points by which the fund sits below its mandated floor. */
  deficitPp: string;
}

function isMappedSubCategory(value: string): value is SebiSubCategory {
  return Object.prototype.hasOwnProperty.call(SEBI_SUBCATEGORY_MAP, value);
}

export const portfolioStyleDriftRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'PORTFOLIO',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (schemeCode === undefined) return [];
    const fund = facts.funds[schemeCode];
    if (fund === undefined) return [];

    const sub = fund.meta.sebiSubCategory;
    // An unmapped sub-category has no mandate we can name, so there is no band
    // to be outside of.
    if (!isMappedSubCategory(sub)) return [];

    const capBand = specFor(sub).capBand;
    if (capBand === undefined) return [];

    const profile = fund.profile;
    if (profile === null || profile.status === 'QUARANTINED') return [];

    const split = profile.marketCapSplit;
    const splitStatus = profile.fieldStatus['marketCapSplit'];
    if (split === null || (splitStatus !== undefined && splitStatus !== 'OK')) return [];

    // Term 2 (see the header): the lookback window must corroborate the
    // breach. Null styleDrift means we never measured against a band at all.
    const drift = profile.styleDrift;
    const driftStatus = profile.fieldStatus['styleDrift'];
    if (drift === null || (driftStatus !== undefined && driftStatus !== 'OK')) return [];
    if (!toDecimal(drift).greaterThan(0)) return [];

    // Only floors are checked, deliberately. `02 §7`'s own drift definition is
    // one-sided by band edge: a large-cap fund mandated at >= 80% large is not
    // drifting when it holds 95%. Holding MORE of the bucket you were told to
    // hold is compliance, not deviation.
    const mandated: Array<{ label: string; floor: number | undefined; actual: Pct | null }> = [
      { label: 'Large-cap', floor: capBand.minLargePct, actual: split.large },
      { label: 'Mid-cap', floor: capBand.minMidPct, actual: split.mid },
      { label: 'Small-cap', floor: capBand.minSmallPct, actual: split.small },
    ];

    let worst: BucketBreach | null = null;
    for (const bucket of mandated) {
      if (bucket.floor === undefined) continue;
      // A bucket the disclosure could not classify is unknown, not zero —
      // treating it as zero would manufacture a 100pp breach.
      if (bucket.actual === null) continue;
      const deficit = toDecimal(bucket.floor).minus(toDecimal(bucket.actual));
      if (!deficit.greaterThan(0)) continue;
      if (worst !== null && !deficit.greaterThan(toDecimal(worst.deficitPp))) continue;
      worst = {
        label: bucket.label,
        actual: bucket.actual,
        floorPct: bucket.floor,
        deficitPp: deficit.toString(),
      };
    }
    if (worst === null) return [];

    const actualDec = toDecimal(worst.actual);
    const floorDec = toDecimal(worst.floorPct);

    const evidence: MfEvidence[] = [
      {
        metric: `marketCapSplit.${worst.label.toLowerCase()}`,
        label: `${worst.label} exposure against the mandated floor`,
        value: serializeRatio(actualDec),
        categoryMedian: null,
        unit: 'pct',
      },
      {
        metric: 'styleDrift',
        label: `Worst breach of the mandated band in the last ${facts.constants.styleDriftLookbackMonths} months`,
        value: drift,
        unit: 'pct',
      },
    ];

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: CODE,
        category: 'PORTFOLIO',
        severity: 'WARNING',
        confidence: confidenceFor(),
        headline:
          `${worst.label} exposure ${actualDec.toFixed(1)}% is below the ` +
          `${floorDec.toFixed(0)}% SEBI floor for this mandate`,
        evidence,
        whatWouldChangeThis:
          `Would clear after ${facts.constants.styleDriftMonthsOutsideBand} consecutive months ` +
          `with ${worst.label.toLowerCase()} exposure at or above the mandated ` +
          `${floorDec.toFixed(0)}% (currently ${actualDec.toFixed(1)}%).`,
      }),
    ];
  },
};
