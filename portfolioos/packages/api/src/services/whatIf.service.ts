import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../lib/errors.js';
import { ratesForDate } from './tax.service.js';
import { simulateSale } from './whatIfMath.js';

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

  // Holding period from the oldest acquiring transaction for this asset.
  const oldest = await prisma.transaction.findFirst({
    where: {
      portfolioId: holding.portfolioId,
      assetKey: holding.assetKey,
      transactionType: { in: ['BUY', 'SIP', 'OPENING_BALANCE', 'BONUS', 'MERGER_IN', 'DEMERGER_IN', 'RIGHTS_ISSUE', 'DIVIDEND_REINVEST', 'SWITCH_IN'] },
    },
    orderBy: { tradeDate: 'asc' },
    select: { tradeDate: true },
  });
  const holdingPeriodDays = oldest
    ? Math.floor((Date.now() - oldest.tradeDate.getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  const rates = ratesForDate(new Date());
  const sim = simulateSale({
    assetClass: holding.assetClass,
    avgCost,
    sellQty,
    sellPrice,
    holdingPeriodDays,
    rates: {
      stcgEquityPct: rates.stcgEquityPct,
      ltcgEquityPct: rates.ltcgEquityPct,
      ltcgOtherPct: rates.ltcgOtherNonIndexedPct,
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
      'Hypothetical, informational only — not advice. LTCG figures are approximate (the ₹1.25L exemption applies at the aggregate FY level); non-equity short-term gains are taxed at slab. Consult a tax professional.',
  };
}
