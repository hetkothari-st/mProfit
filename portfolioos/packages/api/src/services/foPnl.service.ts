import { Decimal } from 'decimal.js';
import type { Transaction } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { financialYearOf } from './capitalGains.service.js';
import { replayFoTransactions } from './derivativePosition.service.js';

/**
 * F&O P&L per Indian Income Tax Act §43(5):
 *   - Intraday equity = SPECULATIVE business income
 *   - F&O (futures + options on indexes/stocks) = NON-SPECULATIVE business income
 *
 * NOT capital gains. NOT FIFO-matched against equity holdings. The CG engine
 * (`capitalGains.service`) skips F&O outright; this service is the only path
 * for F&O tax math.
 *
 * ICAI turnover (Guidance Note on Tax Audit, 2014, revised 2022):
 *   - Futures: sum of |daily MTM realized| per trade
 *   - Options:
 *       Pre-2022 guidance: sum of |sell premium| + |realized P&L|
 *       Post-2022: sum of |realized P&L| only (we use this — current ICAI line)
 * Section 44AB tax-audit threshold: turnover > ₹10 Cr (₹3 Cr if 95%+ digital).
 */

export interface FoPnlRow {
  portfolioId: string;
  assetKey: string;
  underlying: string;
  instrumentType: string; // FUTURES | CALL | PUT
  strikePrice: string | null;
  expiryDate: string; // YYYY-MM-DD
  side: 'INTRADAY' | 'POSITIONAL';
  taxBucket: 'SPECULATIVE' | 'NON_SPECULATIVE';
  realizedPnl: string;
  turnover: string;
  closedTradeCount: number;
  financialYear: string;
  // For tax-audit applicability + ITR-3 disclosures.
  totalGrossProfit: string;
  totalGrossLoss: string;
}

export interface FoPnlResult {
  rows: FoPnlRow[];
  summaryByFy: Record<
    string,
    {
      speculativePnl: string;
      nonSpeculativePnl: string;
      totalPnl: string;
      turnover: string;
      grossProfit: string;
      grossLoss: string;
      tradeCount: number;
    }
  >;
}

/**
 * Per-asset trade-by-trade close events. Each element is a single FIFO
 * close: (entry lot → exit transaction → realized P&L). We replay the
 * entire history; intraday is detected by entry & exit having the same
 * tradeDate.
 */
interface FoCloseEvent {
  underlying: string;
  instrumentType: string;
  strikePrice: string | null;
  expiryDate: string;
  entryDate: string;
  exitDate: string;
  qty: string;
  realizedPnl: string;
  isIntraday: boolean;
  fy: string;
}

function dec(v: unknown): Decimal {
  if (v === null || v === undefined) return new Decimal(0);
  if (v instanceof Decimal) return v;
  return new Decimal(String(v));
}

function buildCloseEvents(txs: Transaction[]): FoCloseEvent[] {
  if (txs.length === 0) return [];
  const sorted = [...txs].sort((a, b) => {
    const d = a.tradeDate.getTime() - b.tradeDate.getTime();
    if (d !== 0) return d;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  interface Lot {
    qty: Decimal; // signed
    price: Decimal;
    tradeDate: Date;
  }
  const lots: Lot[] = [];
  const events: FoCloseEvent[] = [];
  const head = sorted[0]!;
  const underlying =
    head.assetKey?.startsWith('fno:') ? head.assetKey.split(':')[1]! : head.assetName ?? 'UNKNOWN';
  const instrumentType =
    head.assetClass === 'FUTURES'
      ? 'FUTURES'
      : head.optionType === 'PUT'
        ? 'PUT'
        : 'CALL';
  const expiryDate = head.expiryDate ? head.expiryDate.toISOString().slice(0, 10) : '';

  for (const tx of sorted) {
    const isBuy = tx.transactionType === 'BUY';
    const isSell = tx.transactionType === 'SELL';
    if (!isBuy && !isSell) continue;
    const qty = dec(tx.quantity);
    const px = qty.isZero() ? new Decimal(0) : dec(tx.netAmount).dividedBy(qty);
    const signedQty = isBuy ? qty : qty.negated();

    const currentNet = lots.reduce((acc, l) => acc.plus(l.qty), new Decimal(0));
    const sameDirection =
      currentNet.isZero() ||
      (currentNet.isPositive() && signedQty.isPositive()) ||
      (currentNet.isNegative() && signedQty.isNegative());

    if (sameDirection) {
      lots.push({ qty: signedQty, price: px, tradeDate: tx.tradeDate });
      continue;
    }

    let remaining = signedQty.abs();
    while (remaining.greaterThan(0) && lots.length > 0) {
      const lot = lots[0]!;
      const lotAbs = lot.qty.abs();
      const take = Decimal.min(lotAbs, remaining);
      const pnl = lot.qty.isPositive()
        ? px.minus(lot.price).times(take)
        : lot.price.minus(px).times(take);
      const entryDate = lot.tradeDate.toISOString().slice(0, 10);
      const exitDate = tx.tradeDate.toISOString().slice(0, 10);
      events.push({
        underlying,
        instrumentType,
        strikePrice: head.strikePrice ? head.strikePrice.toString() : null,
        expiryDate,
        entryDate,
        exitDate,
        qty: take.toString(),
        realizedPnl: pnl.toString(),
        isIntraday: entryDate === exitDate,
        fy: financialYearOf(tx.tradeDate),
      });

      lot.qty = lot.qty.isPositive() ? lot.qty.minus(take) : lot.qty.plus(take);
      if (lot.qty.isZero()) lots.shift();
      remaining = remaining.minus(take);
    }
    if (remaining.greaterThan(0)) {
      lots.push({
        qty: signedQty.isPositive() ? remaining : remaining.negated(),
        price: px,
        tradeDate: tx.tradeDate,
      });
    }
  }
  return events;
}

function groupByAssetKey(txs: Transaction[]): Map<string, Transaction[]> {
  const m = new Map<string, Transaction[]>();
  for (const tx of txs) {
    if (tx.assetClass !== 'FUTURES' && tx.assetClass !== 'OPTIONS') continue;
    const key = tx.assetKey ?? '';
    if (!key) continue;
    const arr = m.get(key);
    if (arr) arr.push(tx);
    else m.set(key, [tx]);
  }
  return m;
}

export function computeFoPnl(txs: Transaction[]): FoPnlResult {
  const groups = groupByAssetKey(txs);
  const rows: FoPnlRow[] = [];

  for (const [assetKey, list] of groups.entries()) {
    const events = buildCloseEvents(list);
    if (events.length === 0) continue;

    // Bucket by (fy, intraday/positional).
    const byFy = new Map<string, { intraday: FoCloseEvent[]; positional: FoCloseEvent[] }>();
    for (const e of events) {
      const fy = e.fy;
      let bucket = byFy.get(fy);
      if (!bucket) {
        bucket = { intraday: [], positional: [] };
        byFy.set(fy, bucket);
      }
      if (e.isIntraday) bucket.intraday.push(e);
      else bucket.positional.push(e);
    }

    const head = list[0]!;
    const portfolioId = head.portfolioId;
    const underlying = head.assetKey?.startsWith('fno:')
      ? head.assetKey.split(':')[1]!
      : head.assetName ?? 'UNKNOWN';
    const instrumentType =
      head.assetClass === 'FUTURES' ? 'FUTURES' : head.optionType === 'PUT' ? 'PUT' : 'CALL';
    const expiryDate = head.expiryDate ? head.expiryDate.toISOString().slice(0, 10) : '';

    for (const [fy, bucket] of byFy.entries()) {
      const mkRow = (
        side: 'INTRADAY' | 'POSITIONAL',
        evs: FoCloseEvent[],
      ): FoPnlRow | null => {
        if (evs.length === 0) return null;
        const realized = evs.reduce((acc, e) => acc.plus(new Decimal(e.realizedPnl)), new Decimal(0));
        // Turnover (post-2022 ICAI): sum of |realized P&L|.
        const turnover = evs.reduce(
          (acc, e) => acc.plus(new Decimal(e.realizedPnl).abs()),
          new Decimal(0),
        );
        const profit = evs
          .filter((e) => new Decimal(e.realizedPnl).isPositive())
          .reduce((acc, e) => acc.plus(new Decimal(e.realizedPnl)), new Decimal(0));
        const loss = evs
          .filter((e) => new Decimal(e.realizedPnl).isNegative())
          .reduce((acc, e) => acc.plus(new Decimal(e.realizedPnl).abs()), new Decimal(0));
        return {
          portfolioId,
          assetKey,
          underlying,
          instrumentType,
          strikePrice: head.strikePrice ? head.strikePrice.toString() : null,
          expiryDate,
          side,
          // Intraday F&O is still NON_SPECULATIVE per §43(5)(d) — only equity
          // intraday is speculative. F&O futures/options never become
          // speculative regardless of holding period.
          taxBucket: 'NON_SPECULATIVE',
          realizedPnl: realized.toString(),
          turnover: turnover.toString(),
          closedTradeCount: evs.length,
          financialYear: fy,
          totalGrossProfit: profit.toString(),
          totalGrossLoss: loss.toString(),
        };
      };

      const intra = mkRow('INTRADAY', bucket.intraday);
      const pos = mkRow('POSITIONAL', bucket.positional);
      if (intra) rows.push(intra);
      if (pos) rows.push(pos);
    }
  }

  // Summary
  const summaryByFy: FoPnlResult['summaryByFy'] = {};
  for (const r of rows) {
    if (!summaryByFy[r.financialYear]) {
      summaryByFy[r.financialYear] = {
        speculativePnl: '0',
        nonSpeculativePnl: '0',
        totalPnl: '0',
        turnover: '0',
        grossProfit: '0',
        grossLoss: '0',
        tradeCount: 0,
      };
    }
    const s = summaryByFy[r.financialYear]!;
    s.nonSpeculativePnl = new Decimal(s.nonSpeculativePnl).plus(r.realizedPnl).toString();
    s.totalPnl = new Decimal(s.totalPnl).plus(r.realizedPnl).toString();
    s.turnover = new Decimal(s.turnover).plus(r.turnover).toString();
    s.grossProfit = new Decimal(s.grossProfit).plus(r.totalGrossProfit).toString();
    s.grossLoss = new Decimal(s.grossLoss).plus(r.totalGrossLoss).toString();
    s.tradeCount += r.closedTradeCount;
  }

  return { rows, summaryByFy };
}

export async function computePortfolioFoPnl(portfolioId: string): Promise<FoPnlResult> {
  const txs = await prisma.transaction.findMany({
    where: { portfolioId, assetClass: { in: ['FUTURES', 'OPTIONS'] } },
    orderBy: { tradeDate: 'asc' },
  });
  return computeFoPnl(txs);
}

export async function computeUserFoPnl(userId: string): Promise<FoPnlResult> {
  const txs = await prisma.transaction.findMany({
    where: { portfolio: { userId }, assetClass: { in: ['FUTURES', 'OPTIONS'] } },
    orderBy: { tradeDate: 'asc' },
  });
  return computeFoPnl(txs);
}

/**
 * Helper for tests + unit verification: replays through the same engine
 * `derivativePosition.service` uses but returns the trade-by-trade events.
 */
export function replayForFoPnl(txs: Transaction[]): FoCloseEvent[] {
  return buildCloseEvents(txs);
}

export { replayFoTransactions };
