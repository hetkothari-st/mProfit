import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../lib/errors.js';
import { ratesForDate } from './tax.service.js';
import { slabRateForUser } from './taxComputation.js';
import { computeOpenLots, lotTaxStatus, loadFundCategoryMap } from './capitalGains.service.js';
import { simulateSale, type SaleLot } from './whatIfMath.js';

/**
 * What-if sale simulator (3c). Given a holding and a hypothetical sell
 * quantity/price, computes the realised gain, tax term + estimate, cash
 * realised, and the resulting allocation / net-worth deltas. Read-only and
 * informational — it reports outcomes, never recommends acting.
 */

export interface WhatIfInput {
  holdingId: string;
  sellQty: number | string;
  sellPrice?: number | string | null;
}

export async function simulateWhatIf(userId: string, input: WhatIfInput) {
  const holding = await prisma.holdingProjection.findUnique({
    where: { id: input.holdingId },
    include: { portfolio: { select: { id: true, userId: true } } },
  });
  if (!holding) throw new NotFoundError('Holding not found');
  if (holding.portfolio.userId !== userId) throw new ForbiddenError();

  const qtyHeld = new Decimal(holding.quantity.toString());
  const sellQty = new Decimal(input.sellQty);
  if (sellQty.lessThanOrEqualTo(0)) throw new BadRequestError('Sell quantity must be positive');
  if (sellQty.greaterThan(qtyHeld)) throw new BadRequestError('Sell quantity exceeds holding');

  const avgCost = new Decimal(holding.avgCostPrice.toString());
  const currentPrice = holding.currentPrice
    ? new Decimal(holding.currentPrice.toString())
    : holding.currentValue && qtyHeld.greaterThan(0)
      ? new Decimal(holding.currentValue.toString()).dividedBy(qtyHeld)
      : avgCost;
  const sellPrice = input.sellPrice != null ? new Decimal(input.sellPrice) : currentPrice;

  // Real FIFO lots for this asset — the same replay the capital-gains engine
  // runs, so the simulated gain matches the gain a real sale would book.
  // Loads the whole portfolio's history rather than this assetKey's, because
  // merger and demerger legs carry cost across assets.
  const now = new Date();
  const txs = await prisma.transaction.findMany({
    where: { portfolioId: holding.portfolioId },
    orderBy: { tradeDate: 'asc' },
  });
  const fundCategoryMap = await loadFundCategoryMap(txs);
  const position = computeOpenLots(txs, fundCategoryMap).find(
    (p) => p.portfolioId === holding.portfolioId && p.assetKey === holding.assetKey,
  );

  // A holdings-only import has no transactions to replay: one lot of unknown
  // date, counted as short-term — the same fallback the harvest report uses.
  const lots: SaleLot[] = position
    ? position.lots.map((l) => ({
        buyDate: l.buyDate,
        quantity: l.quantity,
        costPerUnit: l.costPerUnit,
        longTerm: lotTaxStatus(position, l.buyDate, now, fundCategoryMap).longTerm,
      }))
    : [{ buyDate: now, quantity: qtyHeld, costPerUnit: avgCost, longTerm: false }];

  const equityOriented = lotTaxStatus(
    position ?? { assetClass: holding.assetClass, fundId: holding.fundId },
    now,
    now,
    fundCategoryMap,
  ).equityOriented;

  // Holding period from the oldest lot still held.
  const oldestBuyDate = lots.reduce<Date | null>(
    (d, l) => (d == null || l.buyDate < d ? l.buyDate : d),
    null,
  );
  const holdingPeriodDays = oldestBuyDate
    ? Math.floor((now.getTime() - oldestBuyDate.getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  const rates = ratesForDate(now);
  // Non-equity short-term gains are slab-rated. Use the user's recorded slab
  // where there is one, and flag the stand-in where there isn't, rather than
  // reporting no tax at all.
  const slab = await slabRateForUser(userId);
  const sim = simulateSale({
    assetClass: holding.assetClass,
    equityOriented,
    lots,
    sellQty,
    sellPrice,
    rates: {
      stcgEquityPct: rates.stcgEquityPct,
      ltcgEquityPct: rates.ltcgEquityPct,
      ltcgOtherPct: rates.ltcgOtherNonIndexedPct,
      slabPct: slab.slabPct,
      slabIsEstimate: slab.isEstimate,
    },
  });

  // Deltas
  const remainingQty = qtyHeld.minus(sellQty);
  const remainingValue = remainingQty.times(currentPrice);
  const proceeds = new Decimal(sim.proceeds);
  const estTax = new Decimal(sim.estTax);
  const netCashAfterTax = proceeds.minus(estTax);

  // Concentration: this holding's share of the user's total portfolio value,
  // before vs after the hypothetical sale.
  const allProjections = await prisma.holdingProjection.findMany({
    where: { portfolio: { userId } },
    select: { currentValue: true, totalCost: true },
  });
  const totalValue = allProjections.reduce((s, p) => {
    const v = p.currentValue ? new Decimal(p.currentValue.toString()) : new Decimal(p.totalCost.toString());
    return s.plus(v);
  }, new Decimal(0));
  const holdingValueNow = holding.currentValue
    ? new Decimal(holding.currentValue.toString())
    : qtyHeld.times(currentPrice);
  const concentrationBeforePct = totalValue.greaterThan(0)
    ? holdingValueNow.dividedBy(totalValue).times(100).toNumber()
    : 0;
  // After: holding shrinks to remainingValue; total shrinks by the sold value
  // (cash proceeds leave the tracked-portfolio total in this view).
  const totalAfter = totalValue.minus(holdingValueNow).plus(remainingValue);
  const concentrationAfterPct = totalAfter.greaterThan(0)
    ? remainingValue.dividedBy(totalAfter).times(100).toNumber()
    : 0;

  return {
    holding: {
      id: holding.id,
      assetName: holding.assetName,
      assetClass: holding.assetClass,
      quantityHeld: qtyHeld.toString(),
      avgCost: avgCost.toFixed(2),
      currentPrice: currentPrice.toFixed(2),
    },
    input: { sellQty: sellQty.toString(), sellPrice: sellPrice.toFixed(2) },
    sale: sim,
    deltas: {
      proceeds: proceeds.toFixed(2),
      estTax: estTax.toFixed(2),
      netCashAfterTax: netCashAfterTax.toFixed(2),
      remainingQty: remainingQty.toString(),
      remainingValue: remainingValue.toFixed(2),
      concentrationBeforePct,
      concentrationAfterPct,
      holdingPeriodDays,
    },
    disclaimer:
      'Hypothetical, informational only — not advice. Matched against your oldest units first (FIFO), the way a real sale books. LTCG figures are approximate (the ₹1.25L exemption applies at the aggregate FY level); non-equity short-term gains are taxed at your income-tax slab rate. Charges (brokerage, STT, stamp duty) are excluded. Consult a tax professional.',
  };
}
