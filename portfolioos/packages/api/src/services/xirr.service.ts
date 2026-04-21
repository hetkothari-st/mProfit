import { Decimal, toDecimal } from '@portfolioos/shared';
import type { Transaction, TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { routePriceLookup } from '../priceFeeds/router.service.js';

/**
 * Internal cashflow representation. Amounts are Decimal to avoid IEEE-754
 * accumulation drift across thousands of transactions (BUG-005, BUG-009).
 * The Newton-Raphson XIRR solver itself still operates on JS numbers — that
 * is fundamental to transcendental rate-search and its error is bounded by
 * the iteration tolerance, not the input magnitude.
 */
export interface CashFlow {
  date: Date;
  amount: Decimal; // negative = outflow (buy), positive = inflow (sell/dividend/terminal)
}

const OUTFLOW_TYPES = new Set<TransactionType>([
  'BUY',
  'SIP',
  'SWITCH_IN',
  'RIGHTS_ISSUE',
  'DIVIDEND_REINVEST',
  'DEPOSIT',
  'OPENING_BALANCE',
]);

const INFLOW_TYPES = new Set<TransactionType>([
  'SELL',
  'SWITCH_OUT',
  'REDEMPTION',
  'MATURITY',
  'DIVIDEND_PAYOUT',
  'INTEREST_RECEIVED',
  'WITHDRAWAL',
]);

function yearFraction(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (365.0 * 24 * 60 * 60 * 1000);
}

function npv(rate: number, flows: CashFlow[], t0: Date): number {
  let total = 0;
  for (const cf of flows) {
    // Rate search is a float operation by nature; cast cashflow amount once
    // at the boundary. The accumulator error matters less than the solver
    // tolerance (1e-7), so we don't need Decimal here.
    total += cf.amount.toNumber() / Math.pow(1 + rate, yearFraction(t0, cf.date));
  }
  return total;
}

function npvDerivative(rate: number, flows: CashFlow[], t0: Date): number {
  let total = 0;
  for (const cf of flows) {
    const t = yearFraction(t0, cf.date);
    total -= (t * cf.amount.toNumber()) / Math.pow(1 + rate, t + 1);
  }
  return total;
}

/**
 * Newton-Raphson XIRR. Returns annualized return as a decimal (0.12 = 12%).
 * Returns null if it fails to converge or inputs are degenerate.
 */
export function xirr(flows: CashFlow[], guess = 0.1): number | null {
  if (flows.length < 2) return null;
  // Require at least one positive and one negative flow
  const hasPos = flows.some((f) => f.amount.greaterThan(0));
  const hasNeg = flows.some((f) => f.amount.lessThan(0));
  if (!hasPos || !hasNeg) return null;

  const sorted = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const t0 = sorted[0]!.date;

  let rate = guess;
  for (let i = 0; i < 100; i++) {
    const f = npv(rate, sorted, t0);
    const d = npvDerivative(rate, sorted, t0);
    if (!isFinite(f) || !isFinite(d) || d === 0) break;
    const next = rate - f / d;
    if (!isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-7) return next;
    // Clamp to prevent runaway
    rate = Math.max(-0.9999, Math.min(next, 10));
  }

  // Fallback: bisection between -0.99 and 10
  let low = -0.99;
  let high = 10;
  let fLow = npv(low, sorted, t0);
  let fHigh = npv(high, sorted, t0);
  if (isFinite(fLow) && isFinite(fHigh) && fLow * fHigh < 0) {
    for (let i = 0; i < 200; i++) {
      const mid = (low + high) / 2;
      const fMid = npv(mid, sorted, t0);
      if (!isFinite(fMid)) break;
      if (Math.abs(fMid) < 1e-6) return mid;
      if (fMid * fLow < 0) {
        high = mid;
        fHigh = fMid;
      } else {
        low = mid;
        fLow = fMid;
      }
    }
    return (low + high) / 2;
  }
  return null;
}

interface PortfolioCashflowOptions {
  from?: Date;
  to?: Date;
  assetClass?: string;
  stockId?: string;
  fundId?: string;
}

function txToCashflow(tx: Transaction): CashFlow | null {
  const net = toDecimal(tx.netAmount);
  if (OUTFLOW_TYPES.has(tx.transactionType)) {
    // BONUS / demerger-in have cost 0 but we want qty impact only → skip
    if (net.isZero()) return null;
    return { date: tx.tradeDate, amount: net.negated() };
  }
  if (INFLOW_TYPES.has(tx.transactionType)) {
    if (net.isZero()) return null;
    return { date: tx.tradeDate, amount: net };
  }
  return null;
}

async function terminalValue(portfolioId: string, filter: {
  assetClass?: string;
  stockId?: string;
  fundId?: string;
}): Promise<Decimal> {
  const where: Record<string, unknown> = { portfolioId };
  if (filter.assetClass) where.assetClass = filter.assetClass;
  if (filter.stockId) where.stockId = filter.stockId;
  if (filter.fundId) where.fundId = filter.fundId;
  const holdings = await prisma.holdingProjection.findMany({ where });
  let total = new Decimal(0);
  for (const h of holdings) {
    let price: Decimal | null = null;
    if (h.currentPrice) {
      price = toDecimal(h.currentPrice);
    } else {
      price = await routePriceLookup({
        assetClass: h.assetClass,
        stockId: h.stockId,
        fundId: h.fundId,
      });
    }
    if (!price) continue;
    const qty = toDecimal(h.quantity);
    total = total.plus(qty.times(price));
  }
  return total;
}

export interface XirrResult {
  // XIRR itself is a dimensionless annualized-rate number (see §14.3).
  xirr: number | null;
  cashflowCount: number;
  // Invested capital and terminal value are money — emit as strings so
  // IEEE-754 can't re-enter here (§3.2). Consumers rehydrate via toDecimal.
  totalInvested: string;
  terminalValue: string;
}

export async function computePortfolioXirr(
  portfolioId: string,
  opts: PortfolioCashflowOptions = {},
): Promise<XirrResult> {
  const where: Record<string, unknown> = { portfolioId };
  if (opts.from || opts.to) {
    where.tradeDate = {};
    if (opts.from) (where.tradeDate as Record<string, unknown>).gte = opts.from;
    if (opts.to) (where.tradeDate as Record<string, unknown>).lte = opts.to;
  }
  if (opts.assetClass) where.assetClass = opts.assetClass;
  if (opts.stockId) where.stockId = opts.stockId;
  if (opts.fundId) where.fundId = opts.fundId;

  const txs = await prisma.transaction.findMany({
    where,
    orderBy: { tradeDate: 'asc' },
  });

  const flows: CashFlow[] = [];
  let invested = new Decimal(0);
  for (const tx of txs) {
    const cf = txToCashflow(tx);
    if (!cf) continue;
    flows.push(cf);
    if (cf.amount.isNegative()) invested = invested.plus(cf.amount.negated());
  }

  const tv = await terminalValue(portfolioId, {
    assetClass: opts.assetClass,
    stockId: opts.stockId,
    fundId: opts.fundId,
  });
  if (tv.greaterThan(0)) flows.push({ date: opts.to ?? new Date(), amount: tv });

  return {
    xirr: xirr(flows),
    cashflowCount: flows.length,
    totalInvested: invested.toFixed(4),
    terminalValue: tv.toFixed(4),
  };
}

export async function computeUserXirr(userId: string): Promise<XirrResult> {
  const portfolios = await prisma.portfolio.findMany({ where: { userId }, select: { id: true } });
  const allFlows: CashFlow[] = [];
  let invested = new Decimal(0);
  let tv = new Decimal(0);

  for (const p of portfolios) {
    const txs = await prisma.transaction.findMany({
      where: { portfolioId: p.id },
      orderBy: { tradeDate: 'asc' },
    });
    for (const tx of txs) {
      const cf = txToCashflow(tx);
      if (!cf) continue;
      allFlows.push(cf);
      if (cf.amount.isNegative()) invested = invested.plus(cf.amount.negated());
    }
    tv = tv.plus(await terminalValue(p.id, {}));
  }
  if (tv.greaterThan(0)) allFlows.push({ date: new Date(), amount: tv });

  return {
    xirr: xirr(allFlows),
    cashflowCount: allFlows.length,
    totalInvested: invested.toFixed(4),
    terminalValue: tv.toFixed(4),
  };
}

export async function computeRollingXirr(
  portfolioId: string,
  years: 1 | 3 | 5,
): Promise<XirrResult> {
  const to = new Date();
  const from = new Date(to);
  from.setUTCFullYear(from.getUTCFullYear() - years);
  return computePortfolioXirr(portfolioId, { from, to });
}
