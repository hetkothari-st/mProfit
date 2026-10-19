/**
 * DepreciationAdapter — deterministic fallback that always succeeds.
 *
 * Computes a "good condition" market value from baseMsrp using the IRDAI
 * Indian motor depreciation schedule (year 1: 20%, year 2-3: 15%, year 4+:
 * 10%). Applies a kms penalty for high-mileage vehicles (above-average
 * usage = ~20K km/yr; deduct an additional 1% per 10K km over expected).
 *
 * Every other adapter relies on live scraping that can fail. This one
 * cannot — it requires only baseMsrp and year. UI shows "Estimated" banner
 * when this is the only adapter that contributed.
 */

import { Decimal } from 'decimal.js';
import type {
  ValuationAdapter,
  ValuationFetchResult,
  ValuationQueryInput,
} from './types.js';

const ID = 'valuation.depreciation.deterministic';
const VERSION = '1';

const YR_DEP: number[] = [0.20, 0.15, 0.15, 0.10, 0.10];
const YR_DEP_LATER = 0.10;
const FLOOR_PCT = 0.05;

function depreciate(msrp: Decimal, age: number): Decimal {
  if (age <= 0) return msrp.mul('0.95'); // brand-new on-road already lost ~5%
  const floor = msrp.mul(FLOOR_PCT);
  let val = msrp;
  for (let i = 0; i < age; i++) {
    const rate = YR_DEP[i] ?? YR_DEP_LATER;
    val = val.mul(new Decimal(1).minus(rate));
    if (val.lt(floor)) return floor;
  }
  return val;
}

export const depreciationAdapter: ValuationAdapter = {
  id: ID,
  version: VERSION,
  displayName: 'Depreciation formula (IRDAI schedule)',
  isDeterministic: true,

  async fetch(input: ValuationQueryInput): Promise<ValuationFetchResult> {
    if (!input.baseMsrp) {
      return {
        ok: false,
        error: 'No baseMsrp in catalog — cannot compute depreciation estimate',
      };
    }
    try {
      const msrp = new Decimal(input.baseMsrp);
      const currentYear = new Date().getFullYear();
      const age = Math.max(0, currentYear - input.year);

      let val = depreciate(msrp, age);

      // High-mileage penalty: expected 20K km/yr.
      const expectedKms = age * 20000;
      const overKms = Math.max(0, input.kms - expectedKms);
      if (overKms > 0) {
        const penaltyPct = Math.min(0.30, (overKms / 10000) * 0.01);
        val = val.mul(new Decimal(1).minus(penaltyPct));
      }

      // Floor: never below 5% of MSRP.
      const floor = msrp.mul(FLOOR_PCT);
      if (val.lt(floor)) val = floor;

      return {
        ok: true,
        priceGood: val,
        isEstimated: true,
        sourceLabel: `${ID}@${VERSION}`,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
