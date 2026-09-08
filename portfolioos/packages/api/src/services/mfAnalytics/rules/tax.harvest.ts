/**
 * `TAX_HARVEST_OPPORTUNITY` — this fund holds a loss large enough to be worth
 * realising, and selling it would not run into an exit load.
 *
 * `05 §4`: "`harvestableLossInr > MIN_HARVEST_INR` (₹5,000) **and not in
 * exit-load window**", severity NOTICE, "reuses advisor `TAX_HARVEST` math".
 *
 * ---------------------------------------------------------------------------
 * The exit-load condition is the interesting half
 * ---------------------------------------------------------------------------
 *
 * Harvesting is a *cost-benefit* action, not a free one. The benefit is the
 * tax the realised loss offsets; the cost is whatever the exit takes. A 1%
 * exit load on a position whose loss saves 12.5% of itself in tax can easily
 * exceed the saving — which is why `05 §4` conditions the finding on the
 * window rather than mentioning it as a caveat.
 *
 * So a lot with a **known, positive** exit load is excluded from the total,
 * not merely flagged. But a lot whose `exitLoadPct` is `null` is a third case:
 * null means "we do not know this scheme's exit load, not that it is zero"
 * (`MfLotDto`). Two wrong ways to handle it:
 *
 *   - treat null as zero, and quietly recommend harvesting into a load we
 *     never checked;
 *   - treat null as disqualifying, and suppress every harvest finding for
 *     every scheme whose load text we failed to parse — which is most of the
 *     unusual ones.
 *
 * The rule does neither. Unknown-load lots are counted, and their presence is
 * (a) stated in the evidence, (b) stated in the counterfactual, and (c) taken
 * off the confidence via `confidenceFor`'s weak-input ceiling. The user is
 * told the loss is real and that one input behind the recommendation is not on
 * file, which is the honest version of both alternatives.
 *
 * ---------------------------------------------------------------------------
 * Tax, and the slab that is not used
 * ---------------------------------------------------------------------------
 *
 * `CONTEXT.md §9.8`: tax figures use the **statutory capital-gains rate, never
 * the income slab** — getting this wrong overstates the benefit of every
 * harvest recommendation. This rule never computes a rate at all. It reports
 * the loss, which is rate-independent, and cites `MfLotDto.taxIfSoldTodayInr`
 * only as context — a figure `mfPortfolioAnalysis.service.ts` already computed
 * at the statutory rate.
 *
 * That field is `null` for short-term gains on a non-equity-oriented fund,
 * because those genuinely are taxed at slab and the slab genuinely is not on
 * file. Null there is a refusal to guess, and it is carried through as such:
 * the evidence row is omitted rather than defaulted to zero.
 */

import { Decimal } from 'decimal.js';
import { formatINR, serializeRatio, toDecimal } from '@portfolioos/shared';
import type { MfEvidence, MfFinding, MfLotDto } from '@portfolioos/shared';
import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.tax.harvest';
const RULE_VERSION = '1.0.0';

const ZERO = new Decimal(0);

/** Known and positive: the lot would actually be charged to exit today. */
function hasKnownExitLoad(lot: MfLotDto): boolean {
  if (lot.exitLoadPct === null) return false;
  return toDecimal(lot.exitLoadPct).greaterThan(ZERO);
}

export const taxHarvestRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'TAX',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (!schemeCode) return [];
    const held = facts.funds[schemeCode]?.held;
    if (!held || !Array.isArray(held.lots)) return [];

    let loss = ZERO;
    let harvestable = 0;
    let unknownLoad = 0;
    let blockedByLoad = 0;

    for (const lot of held.lots) {
      // Null = no loss on this lot. Never coerced to 0 and summed, because a
      // lot with no loss is not a lot with a zero loss for this purpose — it
      // simply is not a candidate.
      if (lot.harvestableLossInr === null) continue;
      const lotLoss = toDecimal(lot.harvestableLossInr);
      if (!lotLoss.greaterThan(ZERO)) continue;

      if (hasKnownExitLoad(lot)) {
        // Excluded from the total, per `05 §4`. Counted so the counterfactual
        // can say *why* the number is smaller than the user's own arithmetic.
        blockedByLoad += 1;
        continue;
      }

      if (lot.exitLoadPct === null) unknownLoad += 1;
      loss = loss.plus(lotLoss);
      harvestable += 1;
    }

    if (harvestable === 0) return [];

    const floor = toDecimal(facts.constants.minHarvestInr);
    if (!loss.greaterThan(floor)) return [];

    const evidence: MfEvidence[] = [
      {
        metric: 'lots.harvestableLossInr',
        label: `Realisable loss across ${harvestable} lot(s) outside any known exit-load window`,
        value: serializeRatio(loss),
        unit: 'inr',
      },
      {
        metric: 'constants.minHarvestInr',
        label: 'Loss below which a taxable event is not worth triggering',
        value: serializeRatio(floor),
        unit: 'inr',
      },
    ];

    if (blockedByLoad > 0) {
      evidence.push({
        metric: 'lots.blockedByExitLoad',
        label: 'Loss-making lots excluded because an exit load applies to them today',
        value: serializeRatio(blockedByLoad),
        unit: 'count',
      });
    }

    if (unknownLoad > 0) {
      evidence.push({
        metric: 'lots.exitLoadUnknown',
        label: 'Lots included whose exit load we do not have on file (not the same as no load)',
        value: serializeRatio(unknownLoad),
        unit: 'count',
      });
    }

    // Context only, and only where the statutory figure exists for every lot
    // we are counting. `taxIfSoldTodayInr` is null for non-equity STCG because
    // the slab is unknowable, and a partial sum would read as a total.
    const taxTotal = sumTaxIfKnown(held.lots);
    if (taxTotal !== null) {
      evidence.push({
        metric: 'lots.taxIfSoldTodayInr',
        label: 'Tax on the rest of this position if it were sold today, at the statutory rate',
        value: serializeRatio(taxTotal),
        unit: 'inr',
      });
    }

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: 'TAX_HARVEST_OPPORTUNITY',
        category: 'TAX',
        severity: 'NOTICE',
        // A structural fact about the user's lots, so the no-horizon band —
        // reduced by the weak-input ceiling when any counted lot's exit load
        // is unknown, because that is exactly the input `05 §4` conditions on.
        confidence: confidenceFor({ benchmarkAvailable: unknownLoad === 0 }),
        headline: `${formatINR(loss.toFixed(2))} of loss could be realised here to offset gains`,
        evidence,
        whatWouldChangeThis:
          `Stops applying once the realisable loss falls to ${formatINR(floor.toFixed(2))} or below — ` +
          'a smaller loss is not worth a taxable event — or once these units move inside an exit-load ' +
          'window' +
          (blockedByLoad > 0
            ? `. ${blockedByLoad} further loss-making lot(s) are already excluded on that basis`
            : '') +
          (unknownLoad > 0
            ? `. We do not have an exit load on file for ${unknownLoad} of the lots counted, so check the ` +
              'scheme information document before selling'
            : '') +
          '.',
      }),
    ];
  },
};

/**
 * Total statutory tax across lots, or null if any lot's figure is unknown.
 *
 * All-or-nothing on purpose: `MfLotDto.taxIfSoldTodayInr` is null precisely
 * where the slab decides the answer and the slab is not on file, so a partial
 * sum presented as a total would understate the bill by an unknown amount.
 */
function sumTaxIfKnown(lots: MfLotDto[]): Decimal | null {
  let total = ZERO;
  for (const lot of lots) {
    if (lot.taxIfSoldTodayInr === null) return null;
    total = total.plus(toDecimal(lot.taxIfSoldTodayInr));
  }
  return total;
}

export default taxHarvestRule;
