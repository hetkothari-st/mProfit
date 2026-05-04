/**
 * Valuation adapter chain.
 *
 * Runs adapters in priority order, collects all successful quotes, and
 * returns the median of `priceGood` as the consensus market price.
 *
 * Order:
 *   1. Cars24 (live HTTP scrape, public listings)
 *   2. DepreciationAdapter (deterministic IRDAI math, always succeeds if
 *      catalog has baseMsrp)
 *
 * If multiple non-deterministic adapters succeed, we use their median.
 * If only the deterministic adapter succeeds, the result is flagged
 * `isEstimated: true` and the UI shows a banner.
 */

import { Decimal } from 'decimal.js';
import { logger } from '../../lib/logger.js';
import { writeIngestionFailure } from '../../services/ingestionFailures.service.js';
import type {
  ValuationAdapter,
  ValuationFetchResult,
  ValuationQueryInput,
} from './types.js';
import { cars24Adapter } from './cars24.adapter.js';
import { carDekhoAdapter } from './cardekho.adapter.js';
import { carWaleAdapter } from './carwale.adapter.js';
import { depreciationAdapter } from './depreciation.adapter.js';

const DEFAULT_CHAIN: ValuationAdapter[] = [
  carDekhoAdapter,
  carWaleAdapter,
  cars24Adapter,
  depreciationAdapter,
];

function median(nums: Decimal[]): Decimal {
  const sorted = nums.slice().sort((a, b) => a.cmp(b));
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return sorted[mid - 1]!.plus(sorted[mid]!).div(2);
  return sorted[mid]!;
}

export interface ValuationChainOutcome {
  ok: boolean;
  priceGood?: Decimal;
  isEstimated: boolean;
  sources: string[];
  attempts: Array<{ adapter: string; ok: boolean; error?: string }>;
}

export interface RunValuationChainInput {
  userId: string;
  query: ValuationQueryInput;
  adapters?: ValuationAdapter[];
}

export async function runValuationChain(
  input: RunValuationChainInput,
): Promise<ValuationChainOutcome> {
  const chain = input.adapters ?? DEFAULT_CHAIN;
  const liveResults: ValuationFetchResult[] = [];
  let deterministicResult: ValuationFetchResult | null = null;
  const attempts: ValuationChainOutcome['attempts'] = [];

  for (const adapter of chain) {
    try {
      const result = await adapter.fetch(input.query);
      attempts.push({
        adapter: adapter.id,
        ok: result.ok,
        error: result.ok ? undefined : result.error,
      });
      if (result.ok) {
        if (adapter.isDeterministic) deterministicResult = result;
        else liveResults.push(result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ adapter: adapter.id, err: msg, query: input.query }, '[valuation.chain] adapter threw');
      attempts.push({ adapter: adapter.id, ok: false, error: msg });
    }
  }

  // Prefer median of live results (real market data).
  // liveResults already only contains ok:true entries; defensive filter for future safety.
  const okLive = liveResults.flatMap((r) => (r.ok ? [r] : []));
  if (okLive.length > 0) {
    const prices = okLive.map((r) => r.priceGood);
    const med = median(prices);
    return {
      ok: true,
      priceGood: med,
      isEstimated: false,
      sources: okLive.map((r) => r.sourceLabel),
      attempts,
    };
  }

  // Fall back to deterministic math
  if (deterministicResult && deterministicResult.ok) {
    return {
      ok: true,
      priceGood: deterministicResult.priceGood,
      isEstimated: true,
      sources: [deterministicResult.sourceLabel],
      attempts,
    };
  }

  // Total failure — record DLQ. UI shows empty state.
  await writeIngestionFailure({
    userId: input.userId,
    sourceAdapter: 'valuation.chain',
    adapterVersion: '1',
    sourceRef: `${input.query.make}|${input.query.model}|${input.query.year}|${input.query.trim}`,
    error: `All ${chain.length} valuation adapter(s) failed`,
    rawPayload: { attempts, query: input.query },
  });
  return { ok: false, isEstimated: false, sources: [], attempts };
}
