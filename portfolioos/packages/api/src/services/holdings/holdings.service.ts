/**
 * Compatibility shim over `holdingsProjection` (§3.1 + §5.1 task 4).
 *
 * Every call site that used to reach into the legacy `Holding` table for
 * writes — transaction CRUD, price-refresh jobs, importers — now routes
 * through these delegates, which in turn write to HoldingProjection. The
 * legacy `Holding` table is frozen (read-only, kept for one release per
 * §4.10 step 6) and will be dropped in a follow-up migration once parity
 * has held in the wild.
 *
 * New code should import from `holdingsProjection.js` directly — this file
 * exists so we didn't have to edit every controller/job in a single commit.
 */

import type { Transaction, AssetClass } from '@prisma/client';
import {
  recomputeForAsset,
  recomputeForPortfolio,
  recomputeForTransaction,
  refreshAllProjectionPrices,
  refreshPortfolioProjectionPrices,
} from './holdingsProjection.js';
import { computeAssetKey } from './assetKey.js';

interface LegacyHoldingKey {
  portfolioId: string;
  assetClass: AssetClass;
  stockId: string | null;
  fundId: string | null;
  isin: string | null;
  assetName?: string | null;
}

/** @deprecated — use `recomputeForAsset(portfolioId, assetKey)` directly. */
export async function recalculateHoldingForKey(key: LegacyHoldingKey): Promise<void> {
  const assetKey = computeAssetKey({
    stockId: key.stockId,
    fundId: key.fundId,
    isin: key.isin,
    assetName: key.assetName ?? null,
  });
  await recomputeForAsset(key.portfolioId, assetKey);
}

/** @deprecated — use `recomputeForPortfolio`. */
export async function recalculateHoldingsForPortfolio(portfolioId: string): Promise<void> {
  await recomputeForPortfolio(portfolioId);
}

/** @deprecated — use `recomputeForTransaction`. */
export async function recalculateHoldingForTransaction(tx: Transaction): Promise<void> {
  await recomputeForTransaction(tx);
}

/** @deprecated — use `refreshAllProjectionPrices`. */
export async function refreshAllHoldingPrices(): Promise<{ updated: number }> {
  return refreshAllProjectionPrices();
}

/** @deprecated — use `refreshPortfolioProjectionPrices`. */
export async function refreshPortfolioPrices(
  portfolioId: string,
): Promise<{ updated: number }> {
  return refreshPortfolioProjectionPrices(portfolioId);
}
