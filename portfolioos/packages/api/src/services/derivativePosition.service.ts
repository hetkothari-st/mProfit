import { Decimal } from 'decimal.js';
import type {
  DerivativeCloseReason,
  DerivativePositionStatus,
  FoInstrumentType,
  Prisma,
  Transaction,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { assetKeyFromTransaction } from './assetKey.js';
import { getLatestFoContractPrice } from '../priceFeeds/nseFoMaster.service.js';

/**
 * F&O position aggregate. Each (portfolio, assetKey) groups all transactions
 * for one futures/option contract. Unlike HoldingProjection (WAVG cost),
 * this keeps lot-by-lot history because:
 *   - tax recompute is FIFO-net, not WAVG
 *   - rollover detection needs lot dates
 *   - expiry close needs to know the open lots that survive past expiry
 *
 * Computed lazily — every Transaction write/edit/delete that touches an F&O
 * assetKey calls `recomputeForAsset`. Read paths in the F&O page query
 * `DerivativePosition` directly, never replay the FIFO themselves.
 */

interface OpenLot {
  qty: string;        // signed: +long / -short
  price: string;      // entry premium per contract
  tradeDate: string;  // YYYY-MM-DD
  txId: string;
  side: 'BUY' | 'SELL';
}

interface ReplayResult {
  netQuantity: Decimal;
  openLots: OpenLot[];
  totalCost: Decimal;
  avgEntryPrice: Decimal;
  realizedPnl: Decimal;
  underlying: string;
  instrumentType: FoInstrumentType;
  strikePrice: Decimal | null;
  expiryDate: Date;
  lotSize: number;
}

function instrumentTypeOf(tx: Transaction): FoInstrumentType {
  if (tx.assetClass === 'FUTURES') return 'FUTURES';
  return tx.optionType === 'PUT' ? 'PUT' : 'CALL';
}

function dec(v: Prisma.Decimal | string | number | null | undefined): Decimal {
  if (v === null || v === undefined) return new Decimal(0);
  return new Decimal(v.toString());
}

/**
 * FIFO-net replay over signed quantities. Long-then-short closes long; short-
 * then-long closes short. Realized P&L per close = (exit − entry) × qty
 * (signed appropriately). Net charges (brokerage, STT, etc.) are folded
 * into entry/exit price via the `netAmount` column upstream — replay never
 * sees raw charges.
 *
 * This is exactly the engine `foPnl.service` uses for tax — they share this
 * function so position math and tax math can never diverge.
 */
export function replayFoTransactions(txs: Transaction[]): ReplayResult | null {
  const sorted = [...txs].sort((a, b) => {
    const d = a.tradeDate.getTime() - b.tradeDate.getTime();
    if (d !== 0) return d;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  if (sorted.length === 0) return null;

  const head = sorted[0]!;
  const lots: OpenLot[] = [];
  let realized = new Decimal(0);

  for (const tx of sorted) {
    const qty = dec(tx.quantity);
    const px = qty.isZero() ? new Decimal(0) : dec(tx.netAmount).dividedBy(qty);
    const isBuy = tx.transactionType === 'BUY';
    const isSell = tx.transactionType === 'SELL';
    if (!isBuy && !isSell) continue; // expiry/exercise rows handled by lifecycle service
    const signedQty = isBuy ? qty : qty.negated();

    // Net signed sum of existing lots → are we closing or extending?
    const currentNet = lots.reduce((acc, l) => acc.plus(new Decimal(l.qty)), new Decimal(0));
    const sameDirection =
      (currentNet.isZero()) ||
      (currentNet.isPositive() && signedQty.isPositive()) ||
      (currentNet.isNegative() && signedQty.isNegative());

    if (sameDirection) {
      lots.push({
        qty: signedQty.toString(),
        price: px.toString(),
        tradeDate: tx.tradeDate.toISOString().slice(0, 10),
        txId: tx.id,
        side: isBuy ? 'BUY' : 'SELL',
      });
      continue;
    }

    // Closing flow: walk lots front-to-back, settling against |signedQty|.
    let remaining = signedQty.abs();
    while (remaining.greaterThan(0) && lots.length > 0) {
      const lot = lots[0]!;
      const lotQty = new Decimal(lot.qty);
      const lotAbs = lotQty.abs();
      const take = Decimal.min(lotAbs, remaining);
      const entry = new Decimal(lot.price);
      // Long lot closed by sell: PnL = (exit − entry) × take
      // Short lot closed by buy: PnL = (entry − exit) × take
      const pnl = lotQty.isPositive() ? px.minus(entry).times(take) : entry.minus(px).times(take);
      realized = realized.plus(pnl);
      const newLotQty = lotQty.isPositive() ? lotQty.minus(take) : lotQty.plus(take);
      if (newLotQty.isZero()) lots.shift();
      else lot.qty = newLotQty.toString();
      remaining = remaining.minus(take);
    }
    if (remaining.greaterThan(0)) {
      // Reversed direction — push leftover as a new lot in the new direction.
      lots.push({
        qty: (signedQty.isPositive() ? remaining : remaining.negated()).toString(),
        price: px.toString(),
        tradeDate: tx.tradeDate.toISOString().slice(0, 10),
        txId: tx.id,
        side: isBuy ? 'BUY' : 'SELL',
      });
    }
  }

  const netQuantity = lots.reduce((acc, l) => acc.plus(new Decimal(l.qty)), new Decimal(0));
  const totalCost = lots.reduce(
    (acc, l) => acc.plus(new Decimal(l.qty).abs().times(new Decimal(l.price))),
    new Decimal(0),
  );
  const totalAbsQty = lots.reduce((acc, l) => acc.plus(new Decimal(l.qty).abs()), new Decimal(0));
  const avgEntryPrice = totalAbsQty.isZero() ? new Decimal(0) : totalCost.dividedBy(totalAbsQty);

  return {
    netQuantity,
    openLots: lots,
    totalCost,
    avgEntryPrice,
    realizedPnl: realized,
    underlying: deriveUnderlying(head),
    instrumentType: instrumentTypeOf(head),
    strikePrice: head.strikePrice ? dec(head.strikePrice) : null,
    expiryDate: head.expiryDate ?? new Date(),
    lotSize: head.lotSize ?? 1,
  };
}

function deriveUnderlying(tx: Transaction): string {
  // `assetKey` shape for F&O rows is "fno:UNDERLYING:TYPE:STRIKE:EXPIRY".
  if (tx.assetKey?.startsWith('fno:')) {
    const parts = tx.assetKey.split(':');
    if (parts.length >= 2 && parts[1]) return parts[1];
  }
  return tx.assetName ?? 'UNKNOWN';
}

export async function recomputeDerivativePosition(
  portfolioId: string,
  assetKey: string,
): Promise<void> {
  const txs = await prisma.transaction.findMany({
    where: { portfolioId, assetKey },
    orderBy: { tradeDate: 'asc' },
  });

  if (txs.length === 0) {
    await prisma.derivativePosition.deleteMany({ where: { portfolioId, assetKey } });
    return;
  }

  const result = replayFoTransactions(txs);
  if (!result) {
    await prisma.derivativePosition.deleteMany({ where: { portfolioId, assetKey } });
    return;
  }

  const portfolio = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
    select: { userId: true },
  });
  if (!portfolio) return;

  // Latest mark — use FoContractPrice if available, else null.
  const ltp = await getLatestFoContractPrice(assetKey);
  const mtmPrice = ltp ? dec(ltp.closePrice) : null;
  let unrealizedPnl: Decimal | null = null;
  if (mtmPrice && !result.netQuantity.isZero()) {
    // unrealized = sum over open lots of (mark - entry) × qty (signed)
    unrealizedPnl = result.openLots.reduce((acc, l) => {
      const q = new Decimal(l.qty);
      const entry = new Decimal(l.price);
      return acc.plus(mtmPrice.minus(entry).times(q));
    }, new Decimal(0));
  }

  let status: DerivativePositionStatus = 'OPEN';
  let closeReason: DerivativeCloseReason | null = null;
  let closedAt: Date | null = null;
  if (result.netQuantity.isZero()) {
    status = 'CLOSED';
    closeReason = 'TRADED_OUT';
    closedAt = new Date();
  }

  await prisma.derivativePosition.upsert({
    where: { portfolioId_assetKey: { portfolioId, assetKey } },
    create: {
      portfolioId,
      userId: portfolio.userId,
      assetKey,
      underlying: result.underlying,
      instrumentType: result.instrumentType,
      strikePrice: result.strikePrice ? result.strikePrice.toString() : null,
      expiryDate: result.expiryDate,
      lotSize: result.lotSize,
      status,
      netQuantity: result.netQuantity.toString(),
      openLots: result.openLots as unknown as Prisma.InputJsonValue,
      avgEntryPrice: result.avgEntryPrice.toString(),
      totalCost: result.totalCost.toString(),
      realizedPnl: result.realizedPnl.toString(),
      unrealizedPnl: unrealizedPnl ? unrealizedPnl.toString() : null,
      mtmPrice: mtmPrice ? mtmPrice.toString() : null,
      closedAt,
      closeReason,
    },
    update: {
      underlying: result.underlying,
      instrumentType: result.instrumentType,
      strikePrice: result.strikePrice ? result.strikePrice.toString() : null,
      expiryDate: result.expiryDate,
      lotSize: result.lotSize,
      status,
      netQuantity: result.netQuantity.toString(),
      openLots: result.openLots as unknown as Prisma.InputJsonValue,
      avgEntryPrice: result.avgEntryPrice.toString(),
      totalCost: result.totalCost.toString(),
      realizedPnl: result.realizedPnl.toString(),
      unrealizedPnl: unrealizedPnl ? unrealizedPnl.toString() : null,
      mtmPrice: mtmPrice ? mtmPrice.toString() : null,
      closedAt,
      closeReason,
    },
  });
}

export async function recomputeDerivativePositionForTransaction(tx: Transaction): Promise<void> {
  if (tx.assetClass !== 'FUTURES' && tx.assetClass !== 'OPTIONS') return;
  const key = tx.assetKey ?? assetKeyFromTransaction(tx);
  try {
    await recomputeDerivativePosition(tx.portfolioId, key);
  } catch (err) {
    logger.error({ err, txId: tx.id, key }, '[fno] derivative-position recompute failed');
  }
}

export async function recomputeAllDerivativePositions(portfolioId: string): Promise<void> {
  const keys = await prisma.transaction.findMany({
    where: { portfolioId, assetClass: { in: ['FUTURES', 'OPTIONS'] } },
    select: { assetKey: true },
    distinct: ['assetKey'],
  });
  for (const { assetKey } of keys) {
    if (!assetKey) continue;
    await recomputeDerivativePosition(portfolioId, assetKey);
  }
}

export async function refreshAllDerivativePositionPrices(): Promise<{ updated: number }> {
  const positions = await prisma.derivativePosition.findMany({
    where: { status: 'OPEN' },
    select: { id: true, portfolioId: true, assetKey: true, openLots: true },
  });
  let updated = 0;
  for (const p of positions) {
    const ltp = await getLatestFoContractPrice(p.assetKey);
    if (!ltp) continue;
    const mtmPrice = dec(ltp.closePrice);
    const lots = p.openLots as unknown as OpenLot[];
    const unrealized = lots.reduce((acc, l) => {
      const q = new Decimal(l.qty);
      const entry = new Decimal(l.price);
      return acc.plus(mtmPrice.minus(entry).times(q));
    }, new Decimal(0));
    await prisma.derivativePosition.update({
      where: { id: p.id },
      data: {
        mtmPrice: mtmPrice.toString(),
        unrealizedPnl: unrealized.toString(),
        computedAt: new Date(),
      },
    });
    updated += 1;
  }
  return { updated };
}
