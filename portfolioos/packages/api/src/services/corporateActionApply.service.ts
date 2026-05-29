import { Decimal } from '@portfolioos/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { recomputeForAsset } from './holdingsProjection.js';

/**
 * Turn stored CorporateAction rows into idempotent Transaction rows so the
 * weighted-average replay in holdingsProjection picks them up (SPLIT/BONUS are
 * already handled there). Idempotency: a deterministic sourceHash per
 * (corporateAction, holding) prevents the same split/bonus being applied twice
 * on re-runs.
 *
 * SPLIT    — ratio = new shares per old share (1:2 split → ratio 2). Post-split
 *            delta qty = qty × (ratio − 1); cost basis unchanged.
 * BONUS    — ratio = bonus shares per held share. Delta qty = qty × ratio at
 *            zero cost.
 * DIVIDEND — amount = cash per share. Booked as a DIVIDEND_PAYOUT inflow of
 *            amount × qtyHeld; does not change quantity or cost.
 *
 * MERGER / DEMERGER / RIGHTS / BUYBACK are intentionally NOT auto-applied:
 *   - RIGHTS / BUYBACK require a user election (subscribe / tender) — we cannot
 *     assume the user participated.
 *   - MERGER / DEMERGER need the *target* instrument + swap ratio, which the
 *     NSE feed does not reliably provide. Fabricating these would corrupt
 *     holdings, the exact failure §1 exists to prevent.
 * They should surface as action items for the user instead.
 *
 * Returns the number of corporate-action transactions created.
 */
export async function applyCorporateActionsForPortfolio(portfolioId: string): Promise<number> {
  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolioId, stockId: { not: null } },
  });

  let applied = 0;
  const touchedAssetKeys = new Set<string>();

  for (const h of holdings) {
    const actions = await prisma.corporateAction.findMany({
      where: { stockId: h.stockId!, exDate: { lte: new Date() } },
    });

    for (const ca of actions) {
      const sourceHash = `ca:${ca.id}:${h.id}`;
      const exists = await prisma.transaction.findFirst({ where: { sourceHash } });
      if (exists) continue;

      const qty = new Decimal(h.quantity.toString());
      const ratio = ca.ratio ? new Decimal(ca.ratio.toString()) : null;
      const amount = ca.amount ? new Decimal(ca.amount.toString()) : null;

      // ── Cash dividend: a DIVIDEND_PAYOUT inflow, no quantity/cost change ──
      if (ca.type === 'DIVIDEND') {
        if (!amount || amount.lessThanOrEqualTo(0)) continue;
        const cash = amount.times(qty);
        const data: Prisma.TransactionUncheckedCreateInput = {
          portfolioId: h.portfolioId,
          assetClass: h.assetClass,
          transactionType: 'DIVIDEND_PAYOUT',
          stockId: h.stockId,
          assetName: h.assetName,
          isin: h.isin,
          assetKey: h.assetKey,
          tradeDate: ca.exDate,
          quantity: qty.toString(), // shares the dividend was paid on
          price: amount.toString(), // per-share cash
          grossAmount: cash.toString(),
          netAmount: cash.toString(),
          sourceAdapter: 'CORPORATE_ACTION',
          sourceHash,
        };
        await prisma.transaction.create({ data });
        applied += 1; // no qty change → no projection replay needed
        continue;
      }

      // ── Quantity events: split / bonus ──
      let deltaQty: Decimal | null = null;
      let type: 'SPLIT' | 'BONUS' | null = null;

      if (ca.type === 'SPLIT' && ratio && ratio.greaterThan(0)) {
        deltaQty = qty.times(ratio.minus(1));
        type = 'SPLIT';
      } else if (ca.type === 'BONUS' && ratio && ratio.greaterThan(0)) {
        deltaQty = qty.times(ratio);
        type = 'BONUS';
      }
      // MERGER / DEMERGER / RIGHTS / BUYBACK → not auto-applied (see header).

      if (!type || !deltaQty || deltaQty.lessThanOrEqualTo(0)) continue;

      const data: Prisma.TransactionUncheckedCreateInput = {
        portfolioId: h.portfolioId,
        assetClass: h.assetClass,
        transactionType: type,
        stockId: h.stockId,
        assetName: h.assetName,
        isin: h.isin,
        assetKey: h.assetKey,
        tradeDate: ca.exDate,
        quantity: deltaQty.toString(),
        price: '0',
        grossAmount: '0',
        netAmount: '0',
        sourceAdapter: 'CORPORATE_ACTION',
        sourceHash,
      };
      await prisma.transaction.create({ data });
      touchedAssetKeys.add(h.assetKey);
      applied += 1;
    }
  }

  // Replay each affected holding once so the new SPLIT/BONUS rows fold into
  // quantity + avg cost.
  for (const assetKey of touchedAssetKeys) {
    await recomputeForAsset(portfolioId, assetKey);
  }

  return applied;
}
