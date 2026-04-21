import { Decimal } from 'decimal.js';
import type { AssetClass, Prisma, Transaction, TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { routePriceLookup } from '../priceFeeds/router.service.js';

const BUY_TYPES = new Set<TransactionType>([
  'BUY',
  'SWITCH_IN',
  'SIP',
  'BONUS',
  'MERGER_IN',
  'DEMERGER_IN',
  'RIGHTS_ISSUE',
  'DIVIDEND_REINVEST',
  'OPENING_BALANCE',
]);

const SELL_TYPES = new Set<TransactionType>([
  'SELL',
  'SWITCH_OUT',
  'MERGER_OUT',
  'DEMERGER_OUT',
  'REDEMPTION',
  'MATURITY',
]);

interface HoldingKey {
  portfolioId: string;
  assetClass: AssetClass;
  stockId: string | null;
  fundId: string | null;
  isin: string | null;
}

function keyOf(tx: Transaction): HoldingKey {
  return {
    portfolioId: tx.portfolioId,
    assetClass: tx.assetClass,
    stockId: tx.stockId ?? null,
    fundId: tx.fundId ?? null,
    isin: tx.isin ?? null,
  };
}

function keyId(k: HoldingKey): string {
  return `${k.portfolioId}|${k.assetClass}|${k.stockId ?? ''}|${k.fundId ?? ''}|${k.isin ?? ''}`;
}

export interface HoldingAggregate {
  quantity: Decimal;
  totalCost: Decimal;
  avgCostPrice: Decimal;
}

export function aggregateTransactions(txs: Transaction[]): HoldingAggregate {
  let quantity = new Decimal(0);
  let totalCost = new Decimal(0);

  const sorted = [...txs].sort((a, b) => a.tradeDate.getTime() - b.tradeDate.getTime());

  for (const tx of sorted) {
    const qty = new Decimal(tx.quantity.toString());
    const net = new Decimal(tx.netAmount.toString());

    if (BUY_TYPES.has(tx.transactionType)) {
      if (tx.transactionType === 'BONUS' || tx.transactionType === 'SPLIT') {
        quantity = quantity.plus(qty);
      } else {
        quantity = quantity.plus(qty);
        totalCost = totalCost.plus(net);
      }
    } else if (SELL_TYPES.has(tx.transactionType)) {
      if (quantity.isZero()) continue;
      const sellQty = Decimal.min(qty, quantity);
      const avgCost = totalCost.dividedBy(quantity);
      const costSold = avgCost.times(sellQty);
      quantity = quantity.minus(sellQty);
      totalCost = totalCost.minus(costSold);
      if (quantity.isZero() || quantity.isNegative()) {
        quantity = new Decimal(0);
        totalCost = new Decimal(0);
      }
    } else if (tx.transactionType === 'SPLIT') {
      quantity = quantity.plus(qty);
    }
  }

  const avgCostPrice = quantity.isZero() ? new Decimal(0) : totalCost.dividedBy(quantity);
  return { quantity, totalCost, avgCostPrice };
}

async function getCurrentPrice(key: HoldingKey): Promise<Decimal | null> {
  return routePriceLookup({
    assetClass: key.assetClass,
    stockId: key.stockId,
    fundId: key.fundId,
  });
}

export async function recalculateHoldingForKey(key: HoldingKey): Promise<void> {
  const txs = await prisma.transaction.findMany({
    where: {
      portfolioId: key.portfolioId,
      assetClass: key.assetClass,
      stockId: key.stockId,
      fundId: key.fundId,
      isin: key.isin,
    },
    orderBy: { tradeDate: 'asc' },
  });

  const agg = aggregateTransactions(txs);
  const existing = await prisma.holding.findFirst({
    where: {
      portfolioId: key.portfolioId,
      assetClass: key.assetClass,
      stockId: key.stockId,
      fundId: key.fundId,
      isin: key.isin,
    },
  });

  if (agg.quantity.isZero() || agg.quantity.isNegative()) {
    if (existing) {
      await prisma.holding.delete({ where: { id: existing.id } });
    }
    return;
  }

  const currentPrice = await getCurrentPrice(key);
  const currentValue = currentPrice ? agg.quantity.times(currentPrice) : null;
  const unrealisedPnL = currentValue ? currentValue.minus(agg.totalCost) : null;

  const firstTx = txs[0];
  const assetName = firstTx?.assetName ?? null;

  const data: Prisma.HoldingUncheckedCreateInput | Prisma.HoldingUncheckedUpdateInput = {
    portfolioId: key.portfolioId,
    assetClass: key.assetClass,
    stockId: key.stockId,
    fundId: key.fundId,
    isin: key.isin,
    assetName,
    quantity: agg.quantity.toString(),
    avgCostPrice: agg.avgCostPrice.toString(),
    totalCost: agg.totalCost.toString(),
    currentPrice: currentPrice ? currentPrice.toString() : null,
    currentValue: currentValue ? currentValue.toString() : null,
    unrealisedPnL: unrealisedPnL ? unrealisedPnL.toString() : null,
  };

  if (existing) {
    await prisma.holding.update({ where: { id: existing.id }, data: data as Prisma.HoldingUncheckedUpdateInput });
  } else {
    await prisma.holding.create({ data: data as Prisma.HoldingUncheckedCreateInput });
  }
}

export async function recalculateHoldingsForPortfolio(portfolioId: string): Promise<void> {
  const txs = await prisma.transaction.findMany({
    where: { portfolioId },
    select: {
      portfolioId: true,
      assetClass: true,
      stockId: true,
      fundId: true,
      isin: true,
    },
    distinct: ['assetClass', 'stockId', 'fundId', 'isin'],
  });

  const seen = new Set<string>();
  for (const t of txs) {
    const key: HoldingKey = {
      portfolioId: t.portfolioId,
      assetClass: t.assetClass,
      stockId: t.stockId,
      fundId: t.fundId,
      isin: t.isin,
    };
    const id = keyId(key);
    if (seen.has(id)) continue;
    seen.add(id);
    await recalculateHoldingForKey(key);
  }
}

export async function recalculateHoldingForTransaction(tx: Transaction): Promise<void> {
  await recalculateHoldingForKey(keyOf(tx));
}

export async function refreshAllHoldingPrices(): Promise<{ updated: number }> {
  const holdings = await prisma.holding.findMany();
  let updated = 0;
  for (const h of holdings) {
    const key: HoldingKey = {
      portfolioId: h.portfolioId,
      assetClass: h.assetClass,
      stockId: h.stockId,
      fundId: h.fundId,
      isin: h.isin,
    };
    const currentPrice = await getCurrentPrice(key);
    if (!currentPrice) continue;
    const qty = new Decimal(h.quantity.toString());
    const totalCost = new Decimal(h.totalCost.toString());
    const currentValue = qty.times(currentPrice);
    const pnl = currentValue.minus(totalCost);
    await prisma.holding.update({
      where: { id: h.id },
      data: {
        currentPrice: currentPrice.toString(),
        currentValue: currentValue.toString(),
        unrealisedPnL: pnl.toString(),
      },
    });
    updated++;
  }
  return { updated };
}

export async function refreshPortfolioPrices(portfolioId: string): Promise<{ updated: number }> {
  const holdings = await prisma.holding.findMany({ where: { portfolioId } });
  let updated = 0;
  for (const h of holdings) {
    const key: HoldingKey = {
      portfolioId: h.portfolioId,
      assetClass: h.assetClass,
      stockId: h.stockId,
      fundId: h.fundId,
      isin: h.isin,
    };
    const currentPrice = await getCurrentPrice(key);
    if (!currentPrice) continue;
    const qty = new Decimal(h.quantity.toString());
    const totalCost = new Decimal(h.totalCost.toString());
    const currentValue = qty.times(currentPrice);
    const pnl = currentValue.minus(totalCost);
    await prisma.holding.update({
      where: { id: h.id },
      data: {
        currentPrice: currentPrice.toString(),
        currentValue: currentValue.toString(),
        unrealisedPnL: pnl.toString(),
      },
    });
    updated++;
  }
  return { updated };
}
