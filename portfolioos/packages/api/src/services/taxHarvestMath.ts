import { Decimal } from 'decimal.js';

/**
 * Tax-loss-harvesting optimiser (informational — not advice). Given the
 * realised STCG/LTCG already booked this FY and the unrealised losses
 * available to harvest, computes how much tax could be offset under Indian
 * capital-gains set-off rules:
 *
 *   - Short-term capital loss (STCL) can offset BOTH STCG and LTCG.
 *   - Long-term capital loss (LTCL) can offset ONLY LTCG.
 *   - §112A LTCG carries an annual exemption (₹1.25L post-Jul-2024); only
 *     LTCG above it is taxed. Loss set-off happens BEFORE the exemption.
 *
 * Greedy-optimal: STCL is applied to STCG first (taxed at the higher rate, so
 * each rupee of offset saves more there), then spills to LTCG; LTCL then
 * offsets remaining LTCG. This minimises tax for a fixed pool of losses.
 *
 * Pure: callers pass rates + exemption (from ratesForFy). Amounts are Decimal.
 */
const ZERO = new Decimal(0);

export interface HarvestSavingsInput {
  realisedStcg: Decimal; // booked short-term gain this FY (can be negative → clamped)
  realisedLtcg: Decimal; // booked long-term gain this FY
  stcgLossAvailable: Decimal; // harvestable short-term unrealised loss (positive)
  ltcgLossAvailable: Decimal; // harvestable long-term unrealised loss (positive)
  stcgRate: number; // e.g. 0.20
  ltcgRate: number; // e.g. 0.125
  ltcgExemption: Decimal; // e.g. 125000
}

export interface HarvestSavings {
  taxBefore: string;
  taxAfter: string;
  taxSaved: string;
  applied: {
    stclVsStcg: string;
    stclVsLtcg: string;
    ltclVsLtcg: string;
  };
  lossUtilised: string;
  lossUnused: string;
}

function ltcgTax(grossLtcg: Decimal, exemption: Decimal, rate: number): Decimal {
  const taxable = Decimal.max(grossLtcg.minus(exemption), ZERO);
  return taxable.times(rate);
}

export function computeHarvestSavings(input: HarvestSavingsInput): HarvestSavings {
  const stcgRate = input.stcgRate;
  const ltcgRate = input.ltcgRate;
  const exemption = input.ltcgExemption;

  const gStcg0 = Decimal.max(input.realisedStcg, ZERO);
  const gLtcg0 = Decimal.max(input.realisedLtcg, ZERO);
  let stcl = Decimal.max(input.stcgLossAvailable, ZERO);
  let ltcl = Decimal.max(input.ltcgLossAvailable, ZERO);

  const taxBefore = gStcg0.times(stcgRate).plus(ltcgTax(gLtcg0, exemption, ltcgRate));

  let gStcg = gStcg0;
  let gLtcg = gLtcg0;

  // 1) STCL → STCG (saves the higher rate per rupee).
  const stclVsStcg = Decimal.min(stcl, gStcg);
  gStcg = gStcg.minus(stclVsStcg);
  stcl = stcl.minus(stclVsStcg);

  // 2) leftover STCL → LTCG.
  const stclVsLtcg = Decimal.min(stcl, gLtcg);
  gLtcg = gLtcg.minus(stclVsLtcg);
  stcl = stcl.minus(stclVsLtcg);

  // 3) LTCL → remaining LTCG.
  const ltclVsLtcg = Decimal.min(ltcl, gLtcg);
  gLtcg = gLtcg.minus(ltclVsLtcg);
  ltcl = ltcl.minus(ltclVsLtcg);

  const taxAfter = gStcg.times(stcgRate).plus(ltcgTax(gLtcg, exemption, ltcgRate));
  const taxSaved = Decimal.max(taxBefore.minus(taxAfter), ZERO);
  const lossUtilised = stclVsStcg.plus(stclVsLtcg).plus(ltclVsLtcg);
  const lossUnused = stcl.plus(ltcl);

  return {
    taxBefore: taxBefore.toFixed(2),
    taxAfter: taxAfter.toFixed(2),
    taxSaved: taxSaved.toFixed(2),
    applied: {
      stclVsStcg: stclVsStcg.toFixed(2),
      stclVsLtcg: stclVsLtcg.toFixed(2),
      ltclVsLtcg: ltclVsLtcg.toFixed(2),
    },
    lossUtilised: lossUtilised.toFixed(2),
    lossUnused: lossUnused.toFixed(2),
  };
}
