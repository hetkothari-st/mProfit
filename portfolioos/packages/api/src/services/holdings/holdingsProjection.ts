import { Decimal } from 'decimal.js';
import type { AssetClass, Prisma, Transaction, TransactionType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { routePriceQuote, type PriceQuote } from '../../priceFeeds/router.service.js';
import { getLatestFxRate } from '../../priceFeeds/fx.service.js';
import { compoundDeposit, depositPeriodsPerYear, istCalendarDate } from '@everypaisa/shared';
import { assetKeyFromTransaction } from './assetKey.js';
import { resolveMutualFundId, resolveStockMasterId } from './masterData.service.js';

const STOCK_ASSET_CLASSES: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'EQUITY',
  'ETF',
]);

/**
 * F&O lives in `DerivativePosition` — a separate aggregate. WAVG cost
 * across multiple option strikes makes no sense (each contract is a
 * distinct instrument). Equity-style holdings projection skips these
 * outright; the F&O page reads from `DerivativePosition`.
 */
// NSE gold ETF tickers commonly typed into a holding's name.
const GOLD_ETF_TICKER =
  /\b(GOLDBEES|GOLDIETF|AXISGOLD|HDFCGOLD|KOTAKGOLD|SETFGOLD|LICMFGOLD|QGOLDHALF|GOLDCASE|GOLD1|BSLGOLDETF|TATAGOLD|GOLDSHARE|IVZINGOLD|EGOLD|UTIGOLD|MOGOLD|GROWWGOLD|GOLDETF)\b/;

/** The NSE ticker inside a gold ETF holding's free-text name, if any. */
export function goldEtfTicker(name: string | null | undefined): string | null {
  return name?.toUpperCase().match(GOLD_ETF_TICKER)?.[1] ?? null;
}

const SKIP_PROJECTION: ReadonlySet<AssetClass> = new Set<AssetClass>(['FUTURES', 'OPTIONS']);

// Post Office schemes where interest accrues (not paid out) — we compute
// compounded current value from principal + stored interestRate.
const PO_COMPOUNDING_CLASSES: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'NSC', 'KVP', 'POST_OFFICE_TD', 'SSY', 'POST_OFFICE_RD',
]);

// Schemes within PO_COMPOUNDING_CLASSES that use quarterly compounding (not annual).
const PO_QUARTERLY_CLASSES: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'POST_OFFICE_TD', 'POST_OFFICE_RD',
]);

// Post Office schemes where interest is paid out — principal stays constant,
// currentValue = totalCost.
const PO_PAYOUT_CLASSES: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'SCSS', 'POST_OFFICE_MIS', 'POST_OFFICE_SAVINGS',
]);

// Compounding periods per year keyed by Transaction.interestFrequency. AT_MATURITY
// behaves like a single end-of-term compound for accrual-display purposes.

/**
 * Accrual runs to the start of today's Indian calendar date, not "now". With
 * a millisecond clock every recompute produced a slightly different value, so
 * the dashboard, portfolio page and reports (computed moments apart) showed
 * figures a few paise apart for the same deposit.
 */
function accrualValuationDay(): Date {
  return new Date(`${istCalendarDate(new Date())}T00:00:00Z`);
}

/** Principal still open in each deposit row, keyed by its transaction id. */
function remainingPrincipalByDeposit(txs: Transaction[]): Map<string, Decimal> {
  const out = new Map<string, Decimal>();
  for (const lot of replayLots(txs).lots) {
    out.set(lot.txId, (out.get(lot.txId) ?? new Decimal(0)).plus(lot.qty.times(lot.costPerUnit)));
  }
  return out;
}

/**
 * FDs and similar bank-deposit assets: compound each DEPOSIT row independently
 * using its own interestRate + interestFrequency. Falls back to null (caller
 * uses totalCost) when no rates are recorded so the column never shows blank
 * for legacy entries.
 */
export function computeFdAccruedValue(txs: Transaction[]): Decimal | null {
  const today = accrualValuationDay();
  const deposits = txs.filter(
    (t) =>
      ['DEPOSIT', 'BUY', 'OPENING_BALANCE'].includes(t.transactionType) &&
      t.interestRate != null,
  );
  if (deposits.length === 0) return null;
  const remaining = remainingPrincipalByDeposit(txs);

  let total = new Decimal(0);
  for (const dep of deposits) {
    // What is still in this deposit after withdrawals / maturities, not
    // what went in: a drawn-down FD must not keep accruing on the full sum.
    const principal = remaining.get(dep.id) ?? new Decimal(0);
    if (principal.lte(0)) continue;
    const annualRate = new Decimal(dep.interestRate!.toString()).div(100);
    const valuationDate =
      dep.maturityDate && dep.maturityDate < today ? dep.maturityDate : today;
    // Shared with the deposit card and detail page so the three agree.
    total = total.plus(
      compoundDeposit({
        principal,
        annualRate,
        start: dep.tradeDate,
        valuation: valuationDate,
        periodsPerYear: depositPeriodsPerYear(dep.interestFrequency),
      }),
    );
  }
  return total.isZero() ? null : total.toDP(4);
}

/**
 * For PO compounding schemes: sum principal × (1 + r/100)^years for each
 * DEPOSIT/BUY that carries an interestRate. Caps at maturityDate if passed.
 * Returns null if no interest rates are recorded (will show invested only).
 */
export function computePoAccruedValue(txs: Transaction[], assetClass: AssetClass): Decimal | null {
  const today = accrualValuationDay();
  const deposits = txs.filter(
    (t) =>
      ['DEPOSIT', 'BUY', 'OPENING_BALANCE'].includes(t.transactionType) &&
      t.interestRate != null,
  );
  if (deposits.length === 0) return null;
  const remaining = remainingPrincipalByDeposit(txs);

  // Quarterly-compounding schemes: P × (1 + r/4)^(4t)
  // Annual-compounding schemes: P × (1 + r)^t
  const periodsPerYear = PO_QUARTERLY_CLASSES.has(assetClass) ? 4 : 1;

  let total = new Decimal(0);
  for (const dep of deposits) {
    // What is still in this deposit after withdrawals / maturities, not
    // what went in: a drawn-down FD must not keep accruing on the full sum.
    const principal = remaining.get(dep.id) ?? new Decimal(0);
    if (principal.lte(0)) continue;
    const annualRate = new Decimal(dep.interestRate!.toString()).div(100);
    const valuationDate = dep.maturityDate && dep.maturityDate < today
      ? dep.maturityDate
      : today;
    const yearsElapsed = new Decimal(
      (valuationDate.getTime() - dep.tradeDate.getTime()) /
      (365.25 * 24 * 60 * 60 * 1000),
    ).toDP(6);
    if (yearsElapsed.lte(0)) {
      total = total.plus(principal);
      continue;
    }
    const periodRate = annualRate.div(periodsPerYear);
    const periods = yearsElapsed.times(periodsPerYear);
    const factor = new Decimal(1).plus(periodRate).pow(periods);
    total = total.plus(principal.times(factor));
  }
  return total.isZero() ? null : total.toDP(4);
}

/**
 * If a projection / transaction landed with no master-data link but carries
 * an ISIN or exact name we can match against StockMaster / MutualFundMaster,
 * resolve it and return the patched ids. Used by the recompute + refresh
 * paths so price lookups stop returning null on legacy rows that were
 * entered without using the asset picker.
 */
async function resolveMasterIds(meta: {
  assetClass: AssetClass;
  stockId: string | null;
  fundId: string | null;
  isin: string | null;
  assetName: string | null;
}): Promise<{ stockId: string | null; fundId: string | null }> {
  if (STOCK_ASSET_CLASSES.has(meta.assetClass) && !meta.stockId) {
    const resolved = await resolveStockMasterId({
      isin: meta.isin,
      symbol: meta.assetName,
      assetName: meta.assetName,
    });
    return { stockId: resolved, fundId: meta.fundId };
  }
  if (meta.assetClass === 'GOLD_ETF' && !meta.stockId) {
    // Gold ETFs are listed securities (priced from StockPrice like any ETF).
    // The Gold form takes a free-text name, so pull an NSE ticker out of it
    // when one is there ("Nippon GOLDBEES" → GOLDBEES), else try it whole.
    const ticker = goldEtfTicker(meta.assetName) ?? meta.assetName;
    const resolved = await resolveStockMasterId({
      isin: meta.isin,
      symbol: ticker,
      assetName: meta.assetName,
    });
    return { stockId: resolved, fundId: meta.fundId };
  }
  if (meta.assetClass === 'MUTUAL_FUND' && !meta.fundId) {
    const resolved = await resolveMutualFundId({
      isin: meta.isin,
      schemeName: meta.assetName,
    });
    return { stockId: meta.stockId, fundId: resolved };
  }
  return { stockId: meta.stockId, fundId: meta.fundId };
}

/**
 * HoldingProjection is the source of truth for portfolio state (§3.1). It is
 * computed from Transaction (and, in the future, CorporateAction) — never
 * mutated directly from outside this file. Every caller that wants to change
 * a portfolio's holdings must edit the underlying Transaction, then call
 * `recomputeForAsset` — this is what prevents the class of silent-drift bugs
 * listed under BUG-002.
 */

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
  'DEPOSIT',
]);

const SELL_TYPES = new Set<TransactionType>([
  'SELL',
  'SWITCH_OUT',
  'MERGER_OUT',
  'DEMERGER_OUT',
  'REDEMPTION',
  'MATURITY',
  'WITHDRAWAL',
]);

export interface ProjectionAggregate {
  quantity: Decimal;
  totalCost: Decimal;
  avgCostPrice: Decimal;
  realisedPnL: Decimal;
  sourceTxCount: number;
}

/**
 * Replay a set of transactions, first-in-first-out, and return the ending
 * holding state.
 *
 * FIFO, not weighted average, because the lot-based reports (M2M, the script
 * ledger, closing balance) and the books all sell the oldest lots — under a
 * weighted average the same holding shows a different cost here than there,
 * and a partial exit makes them drift apart with nothing to explain the gap.
 *
 * Cost is what was paid, every charge included. The capital-gains engine
 * carries a second, lower figure for the same lots because sec 48 disallows
 * STT; that one belongs to the tax reports and nowhere else.
 */
/**
 * Units held going into `exDate` — what a corporate action on that date
 * applies to. Trades on the ex-date itself don't qualify (they settle after the
 * record date), and the action's own booked row is on the ex-date so it's
 * excluded too.
 */
export function quantityHeldBefore(txs: Transaction[], exDate: Date): Decimal {
  return replayTransactions(txs.filter((t) => t.tradeDate.getTime() < exDate.getTime())).quantity;
}

/**
 * Replay order: trade date, then entry order. The tie-break matters — two
 * purchases on the same day at different prices leave a different FIFO cost
 * depending on which is consumed first, and without it that order was
 * whatever the database happened to return, so two reads of the same
 * transactions could disagree (and the nightly integrity check flagged the
 * difference as drift).
 */
export function compareReplayOrder(a: Transaction, b: Transaction): number {
  return (
    a.tradeDate.getTime() - b.tradeDate.getTime() ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * Classes whose entries are amounts, not units: the forms store each deposit
 * (an FD, one RD installment, a PPF/NPS/EPF contribution, a Post Office
 * deposit) as quantity 1 at price = amount. A unit-wise FIFO would make a
 * ₹10,000 withdrawal remove a whole ₹5,00,000 FD "unit", and an RD maturity
 * remove one installment and leave the RD open. So withdrawals on these
 * classes come out of principal by amount, and a maturity closes the deposit.
 */
const AMOUNT_BASED_CLASSES: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'FIXED_DEPOSIT', 'RECURRING_DEPOSIT', 'NPS', 'PPF', 'EPF',
  'NSC', 'KVP', 'SCSS', 'SSY',
  'POST_OFFICE_MIS', 'POST_OFFICE_RD', 'POST_OFFICE_TD', 'POST_OFFICE_SAVINGS',
]);

/**
 * Installment schemes: every DEPOSIT row is one installment of the same
 * account, so its maturity pays out — and closes — all of them.
 */
const INSTALLMENT_CLASSES: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'RECURRING_DEPOSIT', 'POST_OFFICE_RD',
]);

/** One open FIFO lot, tagged with the transaction that opened it. */
export interface OpenLot {
  txId: string;
  qty: Decimal;
  costPerUnit: Decimal;
}

/**
 * The FIFO replay itself: the open lots left at the end plus realised P&L.
 * `replayTransactions` sums the lots; the deposit accrual reads them per
 * deposit so a partly withdrawn FD accrues only on what is still in it.
 */
export function replayLots(txs: Transaction[]): {
  lots: OpenLot[];
  realisedPnL: Decimal;
  sourceTxCount: number;
} {
  const lots: OpenLot[] = [];
  let realisedPnL = new Decimal(0);
  const openQuantity = () => lots.reduce((s, l) => s.plus(l.qty), new Decimal(0));

  const sorted = [...txs].sort(compareReplayOrder);

  // Opening row of each lot, for the maturity dates an FD maturity matches on.
  const byId = new Map(sorted.map((t) => [t.id, t]));

  for (const tx of sorted) {
    const qty = new Decimal(tx.quantity.toString());
    // INR-equivalent net for cost basis: foreign-currency trades carry
    // `inrEquivalent` frozen at trade time (Rule 115). When set, prefer it
    // so totalCost ends up in INR even though netAmount is in native ccy.
    // Falls back to netAmount × fxRateAtTrade when explicit equiv missing,
    // and finally to raw netAmount (INR trades have currency=null, so
    // netAmount IS already in INR).
    const txAny = tx as Transaction & {
      currency?: string | null;
      fxRateAtTrade?: { toString(): string } | null;
      inrEquivalent?: { toString(): string } | null;
    };
    const rawNet = new Decimal(tx.netAmount.toString());
    const isForeign = txAny.currency && txAny.currency !== 'INR';
    const net = isForeign
      ? txAny.inrEquivalent
        ? new Decimal(txAny.inrEquivalent.toString())
        : txAny.fxRateAtTrade
          ? rawNet.times(new Decimal(txAny.fxRateAtTrade.toString()))
          : rawNet
      : rawNet;

    if (BUY_TYPES.has(tx.transactionType)) {
      // Bonus shares land at zero cost — units go up, cost stays.
      const costPerUnit = tx.transactionType === 'BONUS' || qty.isZero() ? new Decimal(0) : net.dividedBy(qty);
      lots.push({ txId: tx.id, qty, costPerUnit });
    } else if (SELL_TYPES.has(tx.transactionType) && AMOUNT_BASED_CLASSES.has(tx.assetClass)) {
      realisedPnL = realisedPnL.plus(takeByAmount(lots, tx, net, byId));
    } else if (SELL_TYPES.has(tx.transactionType)) {
      // Oldest lots first, as the capital-gains engine and the books do.
      let remaining = Decimal.min(qty, openQuantity());
      while (remaining.greaterThan(0) && lots.length > 0) {
        const lot = lots[0]!;
        const take = Decimal.min(lot.qty, remaining);
        const costSold = lot.costPerUnit.times(take);
        // Proceeds for the units this lot covers, pro rata to the sale.
        realisedPnL = realisedPnL.plus(net.times(take).dividedBy(qty).minus(costSold));
        lot.qty = lot.qty.minus(take);
        remaining = remaining.minus(take);
        if (lot.qty.lessThanOrEqualTo(0)) lots.shift();
      }
    } else if (tx.transactionType === 'SPLIT') {
      // SPLIT rows carry the extra units (e.g. +10 on a 1:2 split of 10):
      // spread them over the open lots, so each keeps its total cost.
      const open = openQuantity();
      if (open.greaterThan(0)) {
        const factor = open.plus(qty).dividedBy(open);
        for (const lot of lots) {
          lot.qty = lot.qty.times(factor);
          lot.costPerUnit = lot.costPerUnit.dividedBy(factor);
        }
      }
    }
  }

  return { lots, realisedPnL, sourceTxCount: sorted.length };
}

/**
 * A withdrawal / maturity on an amount-based class (see AMOUNT_BASED_CLASSES).
 * Mutates `lots`; returns the realised P&L.
 *
 * - MATURITY on an RD closes every installment; on anything else it closes
 *   the deposits whose own maturity date has arrived, or — when none carries
 *   one — the whole holding. The payout over their principal is interest.
 * - Anything else (WITHDRAWAL, REDEMPTION, SELL) takes its amount out of
 *   principal, oldest deposit first. A lot partly drawn keeps the same cost
 *   per unit and fewer units, so quantity stays proportional to principal.
 *   Drawing more than the principal closes it all; the excess is interest.
 */
function takeByAmount(
  lots: OpenLot[],
  tx: Transaction,
  net: Decimal,
  byId: Map<string, Transaction>,
): Decimal {
  const lotCost = (l: OpenLot) => l.qty.times(l.costPerUnit);

  if (tx.transactionType === 'MATURITY') {
    let closing = lots;
    if (!INSTALLMENT_CLASSES.has(tx.assetClass)) {
      const due = lots.filter((l) => {
        const m = byId.get(l.txId)?.maturityDate;
        return m != null && m.getTime() <= tx.tradeDate.getTime();
      });
      if (due.length > 0) closing = due;
    }
    const cost = closing.reduce((s, l) => s.plus(lotCost(l)), new Decimal(0));
    const closed = new Set(closing);
    const keep = lots.filter((l) => !closed.has(l));
    lots.splice(0, lots.length, ...keep);
    return net.minus(cost);
  }

  let remaining = net;
  while (remaining.greaterThan(0) && lots.length > 0) {
    const lot = lots[0]!;
    const cost = lotCost(lot);
    if (cost.lessThanOrEqualTo(remaining) || lot.costPerUnit.isZero()) {
      remaining = remaining.minus(cost);
      lots.shift();
    } else {
      lot.qty = lot.qty.minus(remaining.dividedBy(lot.costPerUnit));
      remaining = new Decimal(0);
    }
  }
  // Whatever the principal could not cover was interest paid out.
  return remaining;
}

export function replayTransactions(txs: Transaction[]): ProjectionAggregate {
  const { lots, realisedPnL, sourceTxCount } = replayLots(txs);
  const quantity = lots.reduce((s, l) => s.plus(l.qty), new Decimal(0));
  const totalCost = lots.reduce((s, l) => s.plus(l.qty.times(l.costPerUnit)), new Decimal(0));

  return {
    quantity,
    totalCost,
    avgCostPrice: quantity.isZero() ? new Decimal(0) : totalCost.dividedBy(quantity),
    realisedPnL,
    sourceTxCount,
  };
}

export interface ExpectedProjection extends ProjectionAggregate {
  assetClass: AssetClass;
}

/**
 * What `recomputeForAsset` would leave in HoldingProjection for one
 * portfolio's transactions, keyed by assetKey: one entry per asset still
 * held, none for F&O (separate model) or for assets sold down to zero.
 *
 * Quantity and cost only — prices are not a function of the transactions.
 * The integrity check compares this with the stored rows, so it must follow
 * the same rules as `recomputeForAsset`: same grouping key, the class of the
 * earliest transaction, the same replay.
 */
export function expectedProjections(txs: Transaction[]): Map<string, ExpectedProjection> {
  const groups = new Map<string, Transaction[]>();
  for (const tx of txs) {
    const key = tx.assetKey ?? assetKeyFromTransaction(tx);
    const list = groups.get(key);
    if (list) list.push(tx);
    else groups.set(key, [tx]);
  }
  const out = new Map<string, ExpectedProjection>();
  for (const [key, group] of groups) {
    const first = [...group].sort(compareReplayOrder)[0]!;
    if (SKIP_PROJECTION.has(first.assetClass)) continue;
    const agg = replayTransactions(group);
    if (agg.quantity.isZero() || agg.quantity.isNegative()) continue;
    out.set(key, { ...agg, assetClass: first.assetClass });
  }
  return out;
}

interface AssetScope {
  portfolioId: string;
  assetKey: string;
}

/**
 * Look up the "representative" metadata for an (portfolioId, assetKey) group
 * from its transactions: assetClass / stockId / fundId / isin / assetName.
 * These fields need to move with the projection row so that API responses
 * can render the name and the price router can tell a stock from a bond.
 */
async function loadAssetMetadata(scope: AssetScope): Promise<{
  txs: Transaction[];
  assetClass: AssetClass | null;
  stockId: string | null;
  fundId: string | null;
  isin: string | null;
  assetName: string | null;
}> {
  const txs = await prisma.transaction.findMany({
    where: { portfolioId: scope.portfolioId, assetKey: scope.assetKey },
    orderBy: { tradeDate: 'asc' },
  });
  const first = txs[0] ?? null;
  return {
    txs,
    assetClass: first?.assetClass ?? null,
    stockId: first?.stockId ?? null,
    fundId: first?.fundId ?? null,
    isin: first?.isin ?? null,
    assetName: first?.assetName ?? null,
  };
}

async function currentPriceFor(opts: {
  assetClass: AssetClass;
  stockId: string | null;
  fundId: string | null;
  isin: string | null;
  assetName: string | null;
}): Promise<PriceQuote | null> {
  return routePriceQuote({
    assetClass: opts.assetClass,
    stockId: opts.stockId,
    fundId: opts.fundId,
    isin: opts.isin,
    assetName: opts.assetName,
  });
}

/**
 * Recompute the HoldingProjection row for a single asset. Upserts on
 * (portfolioId, assetKey). If the ending quantity is zero, the row is
 * deleted — that way empty holdings don't clutter dashboard lists.
 */
export async function recomputeForAsset(
  portfolioId: string,
  assetKey: string,
): Promise<void> {
  const assetClass = await recomputeProjectionRow(portfolioId, assetKey);
  if (assetClass !== null && MF_ANALYSIS_ASSET_CLASSES.has(assetClass)) {
    await notifyMfHoldingsChanged(portfolioId);
  }
}

/**
 * Asset classes the MF analysis engine reads. Mirrors `MF_ASSET_CLASSES` in
 * `mfPortfolioAnalysis.service.ts`; kept local so every holdings recompute
 * does not pull the analytics module graph in at load time.
 */
const MF_ANALYSIS_ASSET_CLASSES: ReadonlySet<AssetClass> = new Set<AssetClass>(['MUTUAL_FUND', 'ETF']);

/**
 * `01 §5(a)`: tell the MF analysis job this user's MF holdings changed.
 *
 * Only queues — the job debounces and coalesces, so an import that rewrites
 * forty holdings produces one analysis run, after the import has finished.
 * A failure here is logged and swallowed on purpose: the projection row is
 * already written, and a missed analysis is re-triggered by the next change
 * or the user's refresh, whereas failing the recompute would fail the import.
 */
async function notifyMfHoldingsChanged(portfolioId: string): Promise<void> {
  try {
    const portfolio = await prisma.portfolio.findUnique({
      where: { id: portfolioId },
      select: { userId: true },
    });
    if (!portfolio?.userId) return;
    // Lazy: the job imports the analysis engine, which reads holdings.
    const { onMfHoldingsChanged } = await import('../../jobs/mfAnalysisJob.js');
    onMfHoldingsChanged(portfolio.userId);
  } catch (err) {
    logger.error({ err, portfolioId }, '[holdings] could not queue MF analysis after recompute');
  }
}

/**
 * Rewrite (or remove) one projection row. Returns the asset class the row
 * had — before removal, when it was removed — or `null` when there was no
 * row on either side, so the caller can tell which downstream consumers care.
 */
async function recomputeProjectionRow(
  portfolioId: string,
  assetKey: string,
): Promise<AssetClass | null> {
  const meta = await loadAssetMetadata({ portfolioId, assetKey });

  if (meta.txs.length === 0 || !meta.assetClass) {
    // Every transaction for this asset is gone, so the class has to come
    // from the row being deleted.
    const prior = await prisma.holdingProjection.findUnique({
      where: { portfolioId_assetKey: { portfolioId, assetKey } },
      select: { assetClass: true },
    });
    await prisma.holdingProjection.deleteMany({
      where: { portfolioId, assetKey },
    });
    return prior?.assetClass ?? null;
  }

  // F&O — delegate to the derivative-position aggregate (separate model).
  // Removing any HoldingProjection row that may exist as a stale legacy
  // artefact is harmless here.
  if (SKIP_PROJECTION.has(meta.assetClass)) {
    await prisma.holdingProjection.deleteMany({ where: { portfolioId, assetKey } });
    const { recomputeDerivativePosition } = await import('../fo/derivativePosition.service.js');
    await recomputeDerivativePosition(portfolioId, assetKey);
    return meta.assetClass;
  }

  const agg = replayTransactions(meta.txs);

  if (agg.quantity.isZero() || agg.quantity.isNegative()) {
    await prisma.holdingProjection.deleteMany({
      where: { portfolioId, assetKey },
    });
    return meta.assetClass;
  }

  const resolved = await resolveMasterIds({
    assetClass: meta.assetClass,
    stockId: meta.stockId,
    fundId: meta.fundId,
    isin: meta.isin,
    assetName: meta.assetName,
  });

  let price: Decimal | null = null;
  let priceAsOf: Date | null = null;
  let currentValue: Decimal | null = null;

  if (PO_COMPOUNDING_CLASSES.has(meta.assetClass)) {
    // Compute accrued value from stored interest rates; no market price feed.
    currentValue = computePoAccruedValue(meta.txs, meta.assetClass);
  } else if (PO_PAYOUT_CLASSES.has(meta.assetClass)) {
    // Interest paid out — principal unchanged; show invested as current value.
    currentValue = agg.totalCost;
  } else if (meta.assetClass === 'FIXED_DEPOSIT' || meta.assetClass === 'RECURRING_DEPOSIT') {
    // FDs / RDs: accrue each deposit (or RD installment) at its own rate +
    // frequency. RD installments are individual DEPOSIT rows; the same
    // per-row compounding produces the correct maturity projection.
    currentValue = computeFdAccruedValue(meta.txs) ?? agg.totalCost;
  } else {
    const quote = await currentPriceFor({
      assetClass: meta.assetClass,
      stockId: resolved.stockId,
      fundId: resolved.fundId,
      isin: meta.isin,
      assetName: meta.assetName,
    });
    price = quote?.price ?? null;
    priceAsOf = quote?.asOf ?? null;
    currentValue = price ? agg.quantity.times(price) : null;

    // Foreign-currency native-price → INR conversion.
    //
    // FOREIGN_EQUITY: Yahoo returns the price in the listed exchange's native
    // currency (USD for NASDAQ/NYSE, GBP for LSE, etc). totalCost is already
    // in INR (we used inrEquivalent above), so currentValue needs the same
    // INR treatment for consistent unrealisedPnL. Native currency comes from
    // the latest transaction's `currency` field (frozen per-trade).
    //
    // FOREX_PAIR with 6-letter isin (e.g. "EURUSD"): price = USD per EUR.
    // qty × price = USD value; multiply by USD→INR to surface as INR.
    // 3-letter isin (e.g. "USD"): price already = USD→INR, no extra step.
    if (currentValue && currentValue.greaterThan(0)) {
      if (meta.assetClass === 'FOREIGN_EQUITY') {
        const latest = meta.txs[meta.txs.length - 1] as Transaction & { currency?: string | null };
        const ccy = latest?.currency;
        if (ccy && ccy !== 'INR') {
          const fx = await getLatestFxRate(ccy, 'INR');
          if (fx && fx.greaterThan(0)) currentValue = currentValue.times(fx);
        }
      } else if (meta.assetClass === 'FOREX_PAIR') {
        const code = (meta.isin ?? '').toUpperCase();
        if (code.length === 6) {
          const quote = code.slice(3, 6);
          if (quote !== 'INR') {
            const fx = await getLatestFxRate(quote, 'INR');
            if (fx && fx.greaterThan(0)) currentValue = currentValue.times(fx);
          }
        }
      }
    }
  }

  const unrealisedPnL = currentValue ? currentValue.minus(agg.totalCost) : null;

  const data: Prisma.HoldingProjectionUncheckedCreateInput = {
    portfolioId,
    assetKey,
    assetClass: meta.assetClass,
    stockId: resolved.stockId,
    fundId: resolved.fundId,
    assetName: meta.assetName,
    isin: meta.isin,
    quantity: agg.quantity.toString(),
    avgCostPrice: agg.avgCostPrice.toString(),
    totalCost: agg.totalCost.toString(),
    currentPrice: price ? price.toString() : null,
    currentValue: currentValue ? currentValue.toString() : null,
    unrealisedPnL: unrealisedPnL ? unrealisedPnL.toString() : null,
    realisedPnL: agg.realisedPnL.toString(),
    // Written on every recompute, not only on the price refresh: an edit that
    // re-prices a holding must not leave the previous quote's date behind.
    priceAsOf,
    sourceTxCount: agg.sourceTxCount,
    computedAt: new Date(),
  };

  await prisma.holdingProjection.upsert({
    where: { portfolioId_assetKey: { portfolioId, assetKey } },
    update: {
      assetClass: data.assetClass,
      stockId: data.stockId,
      fundId: data.fundId,
      assetName: data.assetName,
      isin: data.isin,
      quantity: data.quantity,
      avgCostPrice: data.avgCostPrice,
      totalCost: data.totalCost,
      currentPrice: data.currentPrice,
      currentValue: data.currentValue,
      unrealisedPnL: data.unrealisedPnL,
      realisedPnL: data.realisedPnL,
      priceAsOf: data.priceAsOf,
      sourceTxCount: data.sourceTxCount,
      computedAt: data.computedAt,
    },
    create: data,
  });
  return meta.assetClass;
}

export async function recomputeForTransaction(tx: Transaction): Promise<void> {
  const key = tx.assetKey ?? assetKeyFromTransaction(tx);
  await recomputeForAsset(tx.portfolioId, key);
}

export async function recomputeForPortfolio(portfolioId: string): Promise<void> {
  const keys = await prisma.transaction.findMany({
    where: { portfolioId },
    select: { assetKey: true },
    distinct: ['assetKey'],
  });
  for (const { assetKey } of keys) {
    if (!assetKey) continue;
    await recomputeForAsset(portfolioId, assetKey);
  }
}

/**
 * One-shot replay across every portfolio. Used for the §4.10 step 5 parity
 * check after the phase 4.5 migration and for any future "blow away, rebuild"
 * operation. Safe to re-run — each asset's row is upserted.
 */
export async function recomputeAllPortfolios(): Promise<{
  portfolios: number;
  assets: number;
}> {
  const portfolios = await prisma.portfolio.findMany({ select: { id: true } });
  let assets = 0;
  for (const p of portfolios) {
    const keys = await prisma.transaction.findMany({
      where: { portfolioId: p.id },
      select: { assetKey: true },
      distinct: ['assetKey'],
    });
    for (const { assetKey } of keys) {
      if (!assetKey) continue;
      await recomputeForAsset(p.id, assetKey);
      assets += 1;
    }
  }
  return { portfolios: portfolios.length, assets };
}

/**
 * Refresh market prices on an existing projection row without replaying FIFO.
 * The scheduler calls this a few times a day — the hot path must not re-sum
 * thousands of transactions just to update a single currentValue.
 */
async function refreshPricesForRows(rows: Array<{
  id: string;
  assetClass: AssetClass;
  stockId: string | null;
  fundId: string | null;
  isin: string | null;
  assetName: string | null;
  quantity: Prisma.Decimal;
  totalCost: Prisma.Decimal;
}>): Promise<number> {
  let updated = 0;
  for (const row of rows) {
    // Legacy rows may have null stockId/fundId — try to re-link via
    // ISIN/name before asking the price router. If we succeed, stamp the
    // resolved id back onto the projection so future refreshes skip the
    // lookup and the /holdings endpoint can join to StockMaster for the
    // symbol display on the Stocks page.
    const resolved = await resolveMasterIds({
      assetClass: row.assetClass,
      stockId: row.stockId,
      fundId: row.fundId,
      isin: row.isin,
      assetName: row.assetName,
    });
    const quote = await currentPriceFor({
      assetClass: row.assetClass,
      stockId: resolved.stockId,
      fundId: resolved.fundId,
      isin: row.isin,
      assetName: row.assetName,
    });
    const price = quote?.price ?? null;
    const patch: Prisma.HoldingProjectionUpdateInput = { computedAt: new Date() };
    let didPatch = false;
    if (resolved.stockId !== row.stockId) {
      patch.stockId = resolved.stockId;
      didPatch = true;
    }
    if (resolved.fundId !== row.fundId) {
      patch.fundId = resolved.fundId;
      didPatch = true;
    }
    if (price) {
      const qty = new Decimal(row.quantity.toString());
      const totalCost = new Decimal(row.totalCost.toString());
      const currentValue = qty.times(price);
      const pnl = currentValue.minus(totalCost);
      patch.currentPrice = price.toString();
      patch.currentValue = currentValue.toString();
      patch.unrealisedPnL = pnl.toString();
      // The date the price is FOR (trading day / NAV date), so a feed that
      // stopped updating shows up as stale instead of being re-stamped fresh
      // on every refresh.
      patch.priceAsOf = quote!.asOf;
      didPatch = true;
    }
    if (!didPatch) continue;
    await prisma.holdingProjection.update({ where: { id: row.id }, data: patch });
    if (price) updated += 1;
  }
  return updated;
}

// Asset classes whose currentValue is computed from interest accrual rather
// than from a market-price feed. The price-refresh loop ignores them; we
// recompute their projections directly so existing rows pick up new accrual
// logic (e.g. the FD branch added later) without requiring the user to edit
// every holding by hand.
const ACCRUAL_RECOMPUTE_CLASSES: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'FIXED_DEPOSIT', 'RECURRING_DEPOSIT', 'NSC', 'KVP', 'POST_OFFICE_TD', 'SSY', 'POST_OFFICE_RD',
]);

async function recomputeAccrualProjections(
  where: Prisma.HoldingProjectionWhereInput,
): Promise<number> {
  const rows = await prisma.holdingProjection.findMany({
    where: {
      ...where,
      assetClass: { in: Array.from(ACCRUAL_RECOMPUTE_CLASSES) },
    },
    select: { portfolioId: true, assetKey: true },
  });
  for (const r of rows) {
    await recomputeForAsset(r.portfolioId, r.assetKey);
  }
  return rows.length;
}

export async function refreshAllProjectionPrices(): Promise<{ updated: number }> {
  const rows = await prisma.holdingProjection.findMany({
    select: {
      id: true,
      assetClass: true,
      stockId: true,
      fundId: true,
      isin: true,
      assetName: true,
      quantity: true,
      totalCost: true,
    },
  });
  const priced = await refreshPricesForRows(rows);
  const accrued = await recomputeAccrualProjections({});
  return { updated: priced + accrued };
}

export async function refreshPortfolioProjectionPrices(
  portfolioId: string,
): Promise<{ updated: number }> {
  const rows = await prisma.holdingProjection.findMany({
    where: { portfolioId },
    select: {
      id: true,
      assetClass: true,
      stockId: true,
      fundId: true,
      isin: true,
      assetName: true,
      quantity: true,
      totalCost: true,
    },
  });
  const priced = await refreshPricesForRows(rows);
  const accrued = await recomputeAccrualProjections({ portfolioId });
  return { updated: priced + accrued };
}

/**
 * A user's "Refresh prices": re-price that user's own holdings from market
 * data already loaded by the scheduled feeds. Deliberately no outbound fetch
 * and nothing outside the user's portfolios — the old button re-priced every
 * user's holdings and hit Yahoo for every held symbol on every click.
 */
export async function refreshUserProjectionPrices(userId: string): Promise<{ updated: number }> {
  const portfolios = await prisma.portfolio.findMany({ where: { userId }, select: { id: true } });
  let updated = 0;
  for (const p of portfolios) {
    updated += (await refreshPortfolioProjectionPrices(p.id)).updated;
  }
  return { updated };
}
