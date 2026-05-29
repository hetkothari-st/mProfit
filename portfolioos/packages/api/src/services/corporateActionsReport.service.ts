import { Decimal } from '@portfolioos/shared';
import type { CorporateActionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/**
 * Read model for the Corporate Actions page. Joins stored CorporateAction rows
 * to the user's holdings, classifies each by lifecycle status, computes the
 * quantity/cash impact, and rolls up summary + dividend-income trend.
 *
 * Status:
 *   APPLIED      — a CORPORATE_ACTION transaction already exists for this pair.
 *   UPCOMING     — ex-date is in the future.
 *   PENDING      — past ex-date, an auto-appliable type (SPLIT/BONUS/DIVIDEND)
 *                  not yet folded in (next job run will apply it).
 *   NEEDS_ACTION — past ex-date, a type we never auto-apply (MERGER/DEMERGER/
 *                  RIGHTS/BUYBACK) — requires the user's decision.
 */
export type CorporateActionStatus = 'APPLIED' | 'UPCOMING' | 'PENDING' | 'NEEDS_ACTION';

const APPLIABLE: ReadonlySet<CorporateActionType> = new Set<CorporateActionType>([
  'SPLIT', 'BONUS', 'DIVIDEND',
]);

export interface CorporateActionReportRow {
  caId: string;
  holdingId: string;
  stockId: string;
  stockSymbol: string | null;
  stockName: string | null;
  assetName: string | null;
  portfolioId: string;
  portfolioName: string;
  type: CorporateActionType;
  exDate: string; // ISO date
  ratio: string | null;
  amount: string | null;
  qtyHeld: string;
  qtyDelta: string | null; // SPLIT/BONUS share delta
  cashImpact: string | null; // DIVIDEND cash
  status: CorporateActionStatus;
  appliedTxId: string | null;
}

export interface CorporateActionReport {
  rows: CorporateActionReportRow[];
  summary: {
    total: number;
    applied: number;
    pending: number;
    upcoming: number;
    needsAction: number;
    dividendIncome: string; // sum of applied dividend cash
    byType: Array<{ type: CorporateActionType; count: number }>;
  };
  dividendByMonth: Array<{ month: string; amount: string }>;
}

export interface CorporateActionFilters {
  portfolioId?: string;
  type?: CorporateActionType;
  status?: CorporateActionStatus;
}

function classify(
  type: CorporateActionType,
  exDate: Date,
  applied: boolean,
  now: Date,
): CorporateActionStatus {
  if (applied) return 'APPLIED';
  if (exDate.getTime() > now.getTime()) return 'UPCOMING';
  return APPLIABLE.has(type) ? 'PENDING' : 'NEEDS_ACTION';
}

export async function getCorporateActionsReport(
  userId: string,
  filters: CorporateActionFilters = {},
  now: Date = new Date(),
): Promise<CorporateActionReport> {
  // Holdings (with a stock link) the user actually owns.
  const holdings = await prisma.holdingProjection.findMany({
    where: {
      stockId: { not: null },
      portfolio: { userId },
      ...(filters.portfolioId ? { portfolioId: filters.portfolioId } : {}),
    },
    include: { portfolio: { select: { id: true, name: true } } },
  });
  if (holdings.length === 0) {
    return {
      rows: [],
      summary: { total: 0, applied: 0, pending: 0, upcoming: 0, needsAction: 0, dividendIncome: '0', byType: [] },
      dividendByMonth: [],
    };
  }

  const stockIds = [...new Set(holdings.map((h) => h.stockId!).filter(Boolean))];
  const [actions, stocks] = await Promise.all([
    prisma.corporateAction.findMany({
      where: { stockId: { in: stockIds }, ...(filters.type ? { type: filters.type } : {}) },
      orderBy: { exDate: 'desc' },
    }),
    prisma.stockMaster.findMany({
      where: { id: { in: stockIds } },
      select: { id: true, symbol: true, name: true },
    }),
  ]);
  const stockById = new Map(stocks.map((s) => [s.id, s]));

  // All CORPORATE_ACTION transactions for these portfolios, keyed by sourceHash
  // so we can tell which (action, holding) pairs are already applied.
  const appliedTxs = await prisma.transaction.findMany({
    where: {
      portfolioId: { in: holdings.map((h) => h.portfolioId) },
      sourceAdapter: 'CORPORATE_ACTION',
    },
    select: { id: true, sourceHash: true, tradeDate: true, netAmount: true, transactionType: true },
  });
  const txByHash = new Map(appliedTxs.filter((t) => t.sourceHash).map((t) => [t.sourceHash!, t]));

  const rows: CorporateActionReportRow[] = [];
  for (const h of holdings) {
    const qty = new Decimal(h.quantity.toString());
    for (const ca of actions) {
      if (ca.stockId !== h.stockId) continue;
      const sourceHash = `ca:${ca.id}:${h.id}`;
      const appliedTx = txByHash.get(sourceHash) ?? null;
      const status = classify(ca.type, ca.exDate, !!appliedTx, now);
      if (filters.status && status !== filters.status) continue;

      const ratio = ca.ratio ? new Decimal(ca.ratio.toString()) : null;
      const amount = ca.amount ? new Decimal(ca.amount.toString()) : null;
      let qtyDelta: string | null = null;
      let cashImpact: string | null = null;
      if (ca.type === 'SPLIT' && ratio) qtyDelta = qty.times(ratio.minus(1)).toString();
      else if (ca.type === 'BONUS' && ratio) qtyDelta = qty.times(ratio).toString();
      else if (ca.type === 'DIVIDEND' && amount) cashImpact = amount.times(qty).toString();

      const stock = stockById.get(h.stockId!);
      rows.push({
        caId: ca.id,
        holdingId: h.id,
        stockId: h.stockId!,
        stockSymbol: stock?.symbol ?? null,
        stockName: stock?.name ?? null,
        assetName: h.assetName,
        portfolioId: h.portfolioId,
        portfolioName: h.portfolio.name,
        type: ca.type,
        exDate: ca.exDate.toISOString(),
        ratio: ca.ratio ? ca.ratio.toString() : null,
        amount: ca.amount ? ca.amount.toString() : null,
        qtyHeld: qty.toString(),
        qtyDelta,
        cashImpact,
        status,
        appliedTxId: appliedTx?.id ?? null,
      });
    }
  }

  // Summary
  const byTypeMap = new Map<CorporateActionType, number>();
  let applied = 0, pending = 0, upcoming = 0, needsAction = 0;
  let dividendIncome = new Decimal(0);
  const dividendMonth = new Map<string, Decimal>();
  for (const r of rows) {
    byTypeMap.set(r.type, (byTypeMap.get(r.type) ?? 0) + 1);
    if (r.status === 'APPLIED') applied++;
    else if (r.status === 'PENDING') pending++;
    else if (r.status === 'UPCOMING') upcoming++;
    else needsAction++;

    if (r.type === 'DIVIDEND' && r.status === 'APPLIED') {
      const tx = txByHash.get(`ca:${r.caId}:${r.holdingId}`);
      const cash = tx ? new Decimal(tx.netAmount.toString()) : (r.cashImpact ? new Decimal(r.cashImpact) : new Decimal(0));
      dividendIncome = dividendIncome.plus(cash);
      const month = (tx?.tradeDate ?? new Date(r.exDate)).toISOString().slice(0, 7);
      dividendMonth.set(month, (dividendMonth.get(month) ?? new Decimal(0)).plus(cash));
    }
  }

  return {
    rows,
    summary: {
      total: rows.length,
      applied,
      pending,
      upcoming,
      needsAction,
      dividendIncome: dividendIncome.toString(),
      byType: Array.from(byTypeMap.entries()).map(([type, count]) => ({ type, count })),
    },
    dividendByMonth: Array.from(dividendMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, amount]) => ({ month, amount: amount.toString() })),
  };
}
