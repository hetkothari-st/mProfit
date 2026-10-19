/**
 * Valuation adapter framework.
 *
 * Each adapter takes a normalised query (make/model/year/trim/kms) and
 * returns either a price quote or an explicit failure. The chain runs
 * adapters in priority order, collects all `ok: true` results, and takes
 * the median to dampen single-source noise. If zero adapters succeed, the
 * deterministic `DepreciationAdapter` always returns a math-based result
 * tagged `isEstimated: true`.
 */

import { Decimal } from 'decimal.js';

export interface ValuationQueryInput {
  category?: string;
  make: string;
  model: string;
  year: number;
  trim: string;
  kms: number;
  txnType: 'BUY' | 'SELL';
  partyType: 'INDIVIDUAL' | 'DEALER';
  /** Manufacturer suggested retail price (ex-showroom). Optional — adapters
   *  that need MSRP for depreciation math will use it; scrapers ignore. */
  baseMsrp?: Decimal | string | null;
}

export type ValuationFetchResult =
  | {
      ok: true;
      /** Median "good" condition price. Other buckets/projections are derived. */
      priceGood: Decimal;
      /** Whether this came from a deterministic formula vs. a live source. */
      isEstimated: boolean;
      /** Adapter id + version for lineage. */
      sourceLabel: string;
    }
  | { ok: false; error: string; retryable?: boolean };

export interface ValuationAdapter {
  id: string;
  version: string;
  displayName: string;
  /** True if adapter is pure math (no network). Always-on fallback. */
  isDeterministic: boolean;
  fetch(input: ValuationQueryInput): Promise<ValuationFetchResult>;
}
