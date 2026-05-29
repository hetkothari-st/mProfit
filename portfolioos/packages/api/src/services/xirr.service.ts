import { Decimal, toDecimal } from '@portfolioos/shared';
import type { Transaction, TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { routePriceLookup } from '../priceFeeds/router.service.js';
import { spanDays, isXirrReliable } from './xirr.reliability.js';

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
    // Use the canonical projection value. holdingsProjection.ts already
    // applies the right valuation per asset class (FD/RD accrual,
    // NSC/KVP/SCSS compounding, foreign-currency conversion, live-price
    // qty*price for stocks/MFs/crypto). Falling back to `totalCost` means
    // non-priced assets still contribute their invested amount as the
    // terminal flow, so XIRR remains solvable for FD-heavy portfolios.
    // The old path (re-running routePriceLookup here) silently dropped
    // every FD/NSC/RD/insurance/real-estate holding and made XIRR null
    // for users whose portfolio is mostly non-tradable instruments.
    if (h.currentValue != null) {
      total = total.plus(toDecimal(h.currentValue));
      continue;
    }
    // Last-resort: try the legacy price lookup. If both fail we still
    // surface totalCost so an unpriced position doesn't vanish from the
    // terminal flow.
    const price = await routePriceLookup({
      assetClass: h.assetClass,
      stockId: h.stockId,
      fundId: h.fundId,
      isin: h.isin,
    });
    if (price) {
      total = total.plus(toDecimal(h.quantity).times(price));
    } else {
      total = total.plus(toDecimal(h.totalCost));
    }
  }
  return total;
}

export interface XirrResult {
  // XIRR itself is a dimensionless annualized-rate number (see §14.3).
  xirr: number | null;
  // Time-weighted return (Modified Dietz, annualized). Annualizes the
  // total-period return weighted by capital-at-work over time — less
  // sensitive to the timing of contributions than XIRR. We use Modified
  // Dietz because we lack daily NAV snapshots needed for the exact
  // sub-period chain-link variant. SEBI RIA disclosures permit MDR.
  twr: number | null;
  cashflowCount: number;
  // Invested capital and terminal value are money — emit as strings so
  // IEEE-754 can't re-enter here (§3.2). Consumers rehydrate via toDecimal.
  totalInvested: string;
  terminalValue: string;
  // Calendar days between earliest and latest cashflow. Annualization is
  // unstable below MIN_XIRR_DAYS — `reliable` lets the UI fall back to the
  // absolute return until enough history exists.
  spanDays: number;
  reliable: boolean;
}

/**
 * Modified Dietz Return — used as a TWR approximation when sub-period
 * NAVs aren't available. Returns the *annualized* return.
 *
 *   MDR = (endValue - beginValue - netCashflow) / (beginValue + Σ w_i · cf_i)
 *   w_i = (totalDays - daysFromStart_i) / totalDays
 *
 * For inception-to-date, beginValue = 0. `flows` should contain only
 * the intermediate cashflows (NOT the terminal valuation); pass the
 * terminal as `endValue` separately. Convention matches the rest of
 * this service: negative cf amount = money INTO the portfolio (buy /
 * contribution), positive = money OUT (sell / withdrawal).
 */
export function modifiedDietzAnnualized(
  flows: CashFlow[],
  endValue: Decimal,
  beginValue: Decimal = new Decimal(0),
): number | null {
  if (flows.length === 0) return null;
  const sorted = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const startMs = sorted[0]!.date.getTime();
  const endMs = sorted[sorted.length - 1]!.date.getTime();
  const totalDays = Math.max(1, (endMs - startMs) / 86_400_000);

  let netContrib = new Decimal(0);
  let weighted = new Decimal(0);
  for (const f of sorted) {
    // Sign flip: cf negative (buy) = positive contribution; positive (sell) = negative contribution.
    const contrib = f.amount.negated();
    netContrib = netContrib.plus(contrib);
    const daysFromStart = (f.date.getTime() - startMs) / 86_400_000;
    const weight = (totalDays - daysFromStart) / totalDays;
    weighted = weighted.plus(contrib.times(weight));
  }

  const denominator = beginValue.plus(weighted);
  if (denominator.isZero() || denominator.isNegative()) return null;
  const numerator = endValue.minus(beginValue).minus(netContrib);
  const mdr = numerator.dividedBy(denominator);

  // Annualize: (1 + MDR)^(365 / totalDays) - 1
  const periodYears = totalDays / 365.25;
  if (periodYears <= 0) return null;
  const base = mdr.plus(1);
  if (base.lessThanOrEqualTo(0)) return null;
  const annualized = new Decimal(Math.exp((Math.log(base.toNumber())) / periodYears)).minus(1);
  return annualized.toNumber();
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
  const flowsForTwr = [...flows];
  if (tv.greaterThan(0)) flows.push({ date: opts.to ?? new Date(), amount: tv });

  const span = spanDays(flows.map((f) => f.date));
  return {
    xirr: xirr(flows),
    twr: modifiedDietzAnnualized(flowsForTwr, tv),
    cashflowCount: flows.length,
    totalInvested: invested.toFixed(4),
    terminalValue: tv.toFixed(4),
    spanDays: span,
    reliable: isXirrReliable(span),
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
  const flowsForTwr = [...allFlows];
  if (tv.greaterThan(0)) allFlows.push({ date: new Date(), amount: tv });

  const span = spanDays(allFlows.map((f) => f.date));
  return {
    xirr: xirr(allFlows),
    twr: modifiedDietzAnnualized(flowsForTwr, tv),
    cashflowCount: allFlows.length,
    totalInvested: invested.toFixed(4),
    terminalValue: tv.toFixed(4),
    spanDays: span,
    reliable: isXirrReliable(span),
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
