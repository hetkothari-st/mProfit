import { Decimal, toDecimal } from '@everypaisa/shared';
import type { AssetClass, Prisma, Transaction } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { routePriceLookup } from '../priceFeeds/router.service.js';
import { spanDays, isXirrReliable } from './xirr.reliability.js';
import { assetKeyFromTransaction } from './assetKey.js';
import { cashDirection } from './cashDirection.js';
import { transactionInrNet } from './investmentIncome.service.js';
import { holdingsAsOf, isCurrent } from './holdingsAsOf.service.js';
import { replayForFoPnl } from './foPnl.service.js';

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

// Cash direction per transaction type comes from the shared map: a reinvested
// dividend, bonus, split or merger moves units, not money, so it adds no flow
// (its units are already in the terminal value). F&O counts by its P&L.
const FO_CLASSES = new Set<string>(['FUTURES', 'OPTIONS']);

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

/**
 * A trade's cash flow in INR: money invested negative, money received positive.
 * F&O contracts are not counted at notional value — see `foPnlFlows`.
 */
function txToCashflow(tx: Transaction): CashFlow | null {
  if (FO_CLASSES.has(tx.assetClass)) return null;
  const direction = cashDirection(tx.transactionType);
  if (direction === 'NONE') return null;
  const net = transactionInrNet(tx);
  if (net.isZero()) return null;
  return { date: tx.tradeDate, amount: direction === 'OUT' ? net.negated() : net };
}

/**
 * F&O enters returns through its profit and loss, not contract value: each
 * closed trade's realised P&L is a flow on its exit date.
 */
function foPnlFlows(txs: Transaction[], from: Date | null, to: Date): CashFlow[] {
  const books = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (!FO_CLASSES.has(t.assetClass) || !t.assetKey) continue;
    const k = `${t.portfolioId}|${t.assetKey}`;
    const list = books.get(k);
    if (list) list.push(t);
    else books.set(k, [t]);
  }
  const flows: CashFlow[] = [];
  for (const list of books.values()) {
    for (const e of replayForFoPnl(list)) {
      const date = new Date(e.exitDate);
      if ((from && date < from) || date > to) continue;
      const pnl = new Decimal(e.realizedPnl);
      if (!pnl.isZero()) flows.push({ date, amount: pnl });
    }
  }
  return flows;
}

const DAY_MS = 86_400_000;
const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const endOfUtcDay = (d: Date) => new Date(startOfUtcDay(d).getTime() + DAY_MS - 1);

// Price feeds quote these in their own currency; the projection converts them.
const FOREIGN_PRICED = new Set<string>(['FOREIGN_EQUITY', 'FOREX_PAIR']);

interface XirrScope {
  portfolioWhere: Prisma.PortfolioWhereInput;
  filter: { assetClass?: AssetClass; stockId?: string; fundId?: string };
  /** F&O P&L belongs to whole-portfolio returns, not a class/stock/fund slice. */
  includeFo: boolean;
}

/**
 * Value of the holdings in scope at the end of `asOf` (today = the live
 * projection), in INR. Unpriced holdings count at cost so they don't vanish.
 * Open F&O positions add their unrealised P&L when valued as of today.
 */
async function valueAt(scope: XirrScope, asOf: Date): Promise<Decimal> {
  const holdings = await holdingsAsOf(scope.portfolioWhere, asOf, scope.filter);
  const current = isCurrent(asOf);
  let total = new Decimal(0);
  for (const h of holdings) {
    if (h.currentValue != null) {
      total = total.plus(toDecimal(h.currentValue));
      continue;
    }
    // Live projection not yet priced: try the price feeds (INR-quoted classes
    // only), else carry at cost.
    const price =
      current && !FOREIGN_PRICED.has(h.assetClass)
        ? await routePriceLookup({ assetClass: h.assetClass, stockId: h.stockId, fundId: h.fundId, isin: h.isin })
        : null;
    total = total.plus(price ? toDecimal(h.quantity).times(price) : toDecimal(h.totalCost));
  }
  if (current && scope.includeFo) {
    const open = await prisma.derivativePosition.findMany({
      where: { portfolio: scope.portfolioWhere, status: 'OPEN' },
      select: { unrealizedPnl: true },
    });
    for (const p of open) if (p.unrealizedPnl != null) total = total.plus(toDecimal(p.unrealizedPnl));
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
  // Money is emitted as strings so IEEE-754 can't re-enter here (§3.2).
  /** Money put in: purchases and deposits (plus the opening value for a window). */
  totalInvested: string;
  /** Money taken out: sale, maturity and withdrawal proceeds, dividends, interest, F&O profit. */
  totalReceived: string;
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
 * The period runs from `startDate` (default: first flow) to `endDate`, the
 * valuation date (default: last flow). `flows` are the intermediate cash
 * flows only — the terminal valuation is `endValue`. Negative cf = money into
 * the portfolio, positive = money out. A period too short to annualise
 * meaningfully returns null.
 */
export function modifiedDietzAnnualized(
  flows: CashFlow[],
  endValue: Decimal,
  beginValue: Decimal = new Decimal(0),
  period: { startDate?: Date; endDate?: Date } = {},
): number | null {
  if (flows.length === 0 && beginValue.isZero()) return null;
  const sorted = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const startMs = (period.startDate ?? sorted[0]?.date)?.getTime();
  const endMs = (period.endDate ?? sorted[sorted.length - 1]?.date)?.getTime();
  if (startMs == null || endMs == null) return null;
  const totalDays = (endMs - startMs) / DAY_MS;
  if (!isXirrReliable(Math.round(totalDays))) return null;

  let netContrib = new Decimal(0);
  let weighted = new Decimal(0);
  for (const f of sorted) {
    // Sign flip: cf negative (buy) = positive contribution; positive (sell) = negative contribution.
    const contrib = f.amount.negated();
    netContrib = netContrib.plus(contrib);
    const daysFromStart = (f.date.getTime() - startMs) / DAY_MS;
    const weight = (totalDays - daysFromStart) / totalDays;
    weighted = weighted.plus(contrib.times(weight));
  }

  const denominator = beginValue.plus(weighted);
  if (denominator.isZero() || denominator.isNegative()) return null;
  const numerator = endValue.minus(beginValue).minus(netContrib);
  const mdr = numerator.dividedBy(denominator);

  // Annualize: (1 + MDR)^(365.25 / totalDays) - 1
  const periodYears = totalDays / 365.25;
  const base = mdr.plus(1);
  if (base.lessThanOrEqualTo(0)) return null;
  const annualized = new Decimal(Math.exp(Math.log(base.toNumber()) / periodYears)).minus(1);
  return annualized.toNumber();
}

/**
 * Returns over a scope. Inception-to-date without `from`; with `from`, the
 * holdings' value at the start of the window enters as money invested on that
 * day, so a window measures what the portfolio earned inside it.
 */
async function computeScopedXirr(
  scope: XirrScope,
  opts: { from?: Date; to?: Date } = {},
): Promise<XirrResult> {
  const asOf = opts.to ?? new Date();
  const windowStart = opts.from ? startOfUtcDay(opts.from) : null;
  const txs = await prisma.transaction.findMany({
    where: {
      portfolio: scope.portfolioWhere,
      ...scope.filter,
      tradeDate: { ...(windowStart ? { gte: windowStart } : {}), lte: endOfUtcDay(asOf) },
    },
    orderBy: { tradeDate: 'asc' },
  });

  const flows: CashFlow[] = txs.map(txToCashflow).filter((f): f is CashFlow => f !== null);
  if (scope.includeFo) {
    // Replay needs each contract's full history, even trades before the window.
    const foTxs = await prisma.transaction.findMany({
      where: {
        portfolio: scope.portfolioWhere,
        assetClass: { in: ['FUTURES', 'OPTIONS'] },
        tradeDate: { lte: endOfUtcDay(asOf) },
      },
      orderBy: { tradeDate: 'asc' },
    });
    flows.push(...foPnlFlows(foTxs, windowStart, endOfUtcDay(asOf)));
  }

  const opening = windowStart ? await valueAt(scope, new Date(windowStart.getTime() - DAY_MS)) : new Decimal(0);
  const tv = await valueAt(scope, asOf);

  const intermediate = [...flows];
  if (opening.greaterThan(0)) flows.unshift({ date: windowStart!, amount: opening.negated() });
  const invested = flows.filter((f) => f.amount.isNegative()).reduce((acc, f) => acc.minus(f.amount), new Decimal(0));
  const received = flows.filter((f) => f.amount.greaterThan(0)).reduce((acc, f) => acc.plus(f.amount), new Decimal(0));
  if (tv.greaterThan(0)) flows.push({ date: asOf, amount: tv });

  const span = spanDays(flows.map((f) => f.date));
  return {
    xirr: xirr(flows),
    twr: modifiedDietzAnnualized(intermediate, tv, opening, {
      startDate: windowStart ?? undefined,
      endDate: asOf,
    }),
    cashflowCount: flows.length,
    totalInvested: invested.toFixed(4),
    totalReceived: received.toFixed(4),
    terminalValue: tv.toFixed(4),
    spanDays: span,
    reliable: isXirrReliable(span),
  };
}

export async function computePortfolioXirr(
  portfolioId: string,
  opts: PortfolioCashflowOptions = {},
): Promise<XirrResult> {
  const filter = {
    ...(opts.assetClass ? { assetClass: opts.assetClass as AssetClass } : {}),
    ...(opts.stockId ? { stockId: opts.stockId } : {}),
    ...(opts.fundId ? { fundId: opts.fundId } : {}),
  };
  return computeScopedXirr(
    { portfolioWhere: { id: portfolioId }, filter, includeFo: Object.keys(filter).length === 0 },
    { from: opts.from, to: opts.to },
  );
}

/**
 * Per-holding XIRR fan-out. Deliberately takes an already-fetched
 * transaction list and a map of already-known terminal (current) values
 * instead of querying per assetKey — a naive `computePortfolioXirr` call
 * per holding would issue one `transaction.findMany` + one
 * `holdingProjection.findMany` per row, turning a holdings-list request
 * into 2N round-trips. Callers fetch the portfolio's transactions once
 * (already have the HoldingProjection rows for currentValue/totalCost from
 * building the holdings list itself) and this function does the grouping +
 * solving in memory, so the whole holdings list costs exactly one extra
 * query regardless of holding count.
 *
 * Grouping key mirrors HoldingProjection.assetKey: prefer the transaction's
 * own `assetKey` (set at write time for rows created after the Phase 4.5
 * backfill), falling back to `assetKeyFromTransaction` for legacy rows where
 * it's still null — the same precedence used to build the projection, so a
 * transaction lands in the same bucket as its holding.
 */
export function computeHoldingXirrs(
  transactions: Transaction[],
  terminalValues: Map<string, Decimal>,
  asOfDate: Date = new Date(),
): Map<string, XirrResult> {
  const byAssetKey = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const key = t.assetKey ?? assetKeyFromTransaction(t);
    if (!byAssetKey.has(key)) byAssetKey.set(key, []);
    byAssetKey.get(key)!.push(t);
  }

  const results = new Map<string, XirrResult>();
  for (const [key, txs] of byAssetKey) {
    const flows = txs.map(txToCashflow).filter((f): f is CashFlow => f !== null);
    const invested = flows.filter((f) => f.amount.isNegative()).reduce((acc, f) => acc.minus(f.amount), new Decimal(0));
    const received = flows.filter((f) => f.amount.greaterThan(0)).reduce((acc, f) => acc.plus(f.amount), new Decimal(0));

    const tv = terminalValues.get(key) ?? new Decimal(0);
    const intermediate = [...flows];
    if (tv.greaterThan(0)) flows.push({ date: asOfDate, amount: tv });

    const span = spanDays(flows.map((f) => f.date));
    results.set(key, {
      xirr: xirr(flows),
      twr: modifiedDietzAnnualized(intermediate, tv, new Decimal(0), { endDate: asOfDate }),
      cashflowCount: flows.length,
      totalInvested: invested.toFixed(4),
      totalReceived: received.toFixed(4),
      terminalValue: tv.toFixed(4),
      spanDays: span,
      reliable: isXirrReliable(span),
    });
  }
  return results;
}

/** All of a user's portfolios as one pool of cash flows. */
export async function computeUserXirr(
  userId: string,
  opts: { from?: Date; to?: Date } = {},
): Promise<XirrResult> {
  return computeScopedXirr({ portfolioWhere: { userId }, filter: {}, includeFo: true }, opts);
}

function rollingWindow(years: number): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to);
  from.setUTCFullYear(from.getUTCFullYear() - years);
  return { from, to };
}

export async function computeRollingXirr(portfolioId: string, years: 1 | 3 | 5): Promise<XirrResult> {
  return computePortfolioXirr(portfolioId, rollingWindow(years));
}

/** Rolling-window XIRR over all of a user's portfolios, solved on the pooled flows. */
export async function computeUserRollingXirr(userId: string, years: 1 | 3 | 5): Promise<XirrResult> {
  return computeUserXirr(userId, rollingWindow(years));
}

/** Rolling-window XIRR pooled over a set of portfolios. */
export async function computePortfoliosRollingXirr(portfolioIds: string[], years: 1 | 3 | 5): Promise<XirrResult> {
  return computeScopedXirr(
    { portfolioWhere: { id: { in: portfolioIds } }, filter: {}, includeFo: true },
    rollingWindow(years),
  );
}
