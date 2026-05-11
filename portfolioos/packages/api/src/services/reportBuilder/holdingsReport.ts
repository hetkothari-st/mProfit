import { Decimal } from 'decimal.js';
import type { AssetClass } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { fmtNum, fmtDate, type ExportPayload, type ExportColumn } from '../export.service.js';

const ASSET_CLASS_LABELS: Record<string, string> = {
  EQUITY: 'Equity', MUTUAL_FUND: 'Mutual Fund', ETF: 'ETF',
  FUTURES: 'Futures', OPTIONS: 'Options',
  BOND: 'Bond', GOVT_BOND: 'Govt Bond', CORPORATE_BOND: 'Corp Bond',
  FIXED_DEPOSIT: 'Fixed Deposit', RECURRING_DEPOSIT: 'Recurring Deposit',
  NPS: 'NPS', PPF: 'PPF', EPF: 'EPF', PMS: 'PMS', AIF: 'AIF',
  REIT: 'REIT', INVIT: 'InvIT',
  GOLD_BOND: 'Gold Bond', GOLD_ETF: 'Gold ETF',
  PHYSICAL_GOLD: 'Physical Gold', PHYSICAL_SILVER: 'Silver',
  ULIP: 'ULIP', INSURANCE: 'Insurance',
  REAL_ESTATE: 'Real Estate',
  CRYPTOCURRENCY: 'Crypto', ART_COLLECTIBLES: 'Art', CASH: 'Cash', OTHER: 'Other',
  NSC: 'NSC', KVP: 'KVP', SCSS: 'SCSS', SSY: 'SSY',
  POST_OFFICE_MIS: 'PO MIS', POST_OFFICE_RD: 'PO RD',
  POST_OFFICE_TD: 'PO TD', POST_OFFICE_SAVINGS: 'PO Savings',
  FOREIGN_EQUITY: 'Foreign Equity', FOREX_PAIR: 'FX Pair',
};

function labelClass(ac: string): string {
  return ASSET_CLASS_LABELS[ac] ?? ac;
}

// ─── Holdings sheet payload ──────────────────────────────────────────────────

export interface HoldingsExportParams {
  userId: string;
  portfolioIds: string[];    // empty = all portfolios owned by user
  assetClasses?: AssetClass[]; // empty = all
}

export async function buildHoldingsExport(params: HoldingsExportParams): Promise<{
  holdingsPayload: ExportPayload;
  transactionsPayload: ExportPayload;
  summaryTitle: string;
  summaryMeta: Record<string, string>;
}> {
  const { userId, portfolioIds, assetClasses } = params;

  // Resolve portfolio IDs for this user
  const allPortfolios = await prisma.portfolio.findMany({ where: { userId } });
  const resolvedIds = portfolioIds.length > 0
    ? allPortfolios.filter(p => portfolioIds.includes(p.id)).map(p => p.id)
    : allPortfolios.map(p => p.id);

  const portfolioNameMap = Object.fromEntries(allPortfolios.map(p => [p.id, p.name]));
  const portfolioLabel = resolvedIds.length === 1
    ? (portfolioNameMap[resolvedIds[0]!] ?? 'Portfolio')
    : resolvedIds.length === allPortfolios.length
      ? 'All Portfolios'
      : resolvedIds.map(id => portfolioNameMap[id] ?? id).join(', ');

  const classFilter = assetClasses && assetClasses.length > 0 ? assetClasses : undefined;
  const classLabel  = classFilter ? classFilter.map(labelClass).join(', ') : 'All Asset Classes';

  // ── Holdings ────────────────────────────────────────────────────────────────
  const holdings = await prisma.holdingProjection.findMany({
    where: {
      portfolioId: { in: resolvedIds },
      ...(classFilter ? { assetClass: { in: classFilter } } : {}),
    },
    orderBy: [{ assetClass: 'asc' }, { assetName: 'asc' }],
  });

  let totalCost  = new Decimal(0);
  let totalValue = new Decimal(0);

  const holdingRows = holdings.map(h => {
    const cost  = new Decimal(h.totalCost.toString());
    const value = h.currentValue ? new Decimal(h.currentValue.toString()) : cost;
    const pnl   = value.minus(cost);
    const pct   = cost.isZero() ? '0.00' : pnl.dividedBy(cost).times(100).toFixed(2);
    totalCost  = totalCost.plus(cost);
    totalValue = totalValue.plus(value);
    return {
      portfolioName: portfolioNameMap[h.portfolioId] ?? h.portfolioId,
      assetClass:    labelClass(h.assetClass),
      assetName:     h.assetName ?? h.isin ?? '—',
      isin:          h.isin ?? '',
      quantity:      h.quantity.toString(),
      avgCostPrice:  h.avgCostPrice.toString(),
      currentPrice:  h.currentPrice?.toString() ?? '',
      totalCost:     cost.toString(),
      currentValue:  value.toString(),
      unrealisedPnL: pnl.toString(),
      pctReturn:     pct,
    };
  });

  const holdingColumns: ExportColumn[] = [
    { key: 'portfolioName',  header: 'Portfolio',    width: 18 },
    { key: 'assetClass',     header: 'Asset Class',  width: 14 },
    { key: 'assetName',      header: 'Name',         width: 32 },
    { key: 'isin',           header: 'ISIN',         width: 14 },
    { key: 'quantity',       header: 'Qty',          width: 10, formatter: v => fmtNum(v, 4) },
    { key: 'avgCostPrice',   header: 'Avg Cost',     width: 12, formatter: v => fmtNum(v) },
    { key: 'currentPrice',   header: 'CMP',          width: 12, formatter: v => fmtNum(v) },
    { key: 'totalCost',      header: 'Invested ₹',   width: 14, formatter: v => fmtNum(v) },
    { key: 'currentValue',   header: 'Value ₹',      width: 14, formatter: v => fmtNum(v) },
    { key: 'unrealisedPnL',  header: 'P&L ₹',        width: 14, formatter: v => fmtNum(v) },
    { key: 'pctReturn',      header: '% Rtn',        width: 8,  formatter: v => `${v}%` },
  ];

  const totalPnl = totalValue.minus(totalCost);

  const holdingsPayload: ExportPayload = {
    title: `Holdings — ${classLabel}`,
    meta: {
      Portfolio: portfolioLabel,
      'Asset Class': classLabel,
      'Generated On': new Date().toISOString().slice(0, 10),
    },
    columns: holdingColumns,
    rows: holdingRows,
    footer: {
      'Total Invested': `₹${fmtNum(totalCost.toString())}`,
      'Total Value':    `₹${fmtNum(totalValue.toString())}`,
      'Unrealised P&L': `₹${fmtNum(totalPnl.toString())}`,
    },
  };

  // ── Transactions ─────────────────────────────────────────────────────────────
  const txns = await prisma.transaction.findMany({
    where: {
      portfolioId: { in: resolvedIds },
      ...(classFilter ? { assetClass: { in: classFilter } } : {}),
    },
    orderBy: { tradeDate: 'desc' },
    take: 2000,
  });

  const txnColumns: ExportColumn[] = [
    { key: 'portfolioName',     header: 'Portfolio',   width: 18 },
    { key: 'tradeDate',         header: 'Date',        width: 12, formatter: fmtDate },
    { key: 'assetClass',        header: 'Class',       width: 14 },
    { key: 'assetName',         header: 'Asset',       width: 32 },
    { key: 'transactionType',   header: 'Type',        width: 14 },
    { key: 'quantity',          header: 'Qty',         width: 10, formatter: v => fmtNum(v, 4) },
    { key: 'price',             header: 'Price ₹',     width: 12, formatter: v => fmtNum(v) },
    { key: 'netAmount',         header: 'Net Amt ₹',   width: 14, formatter: v => fmtNum(v) },
    { key: 'broker',            header: 'Broker',      width: 16 },
    { key: 'narration',         header: 'Narration',   width: 28 },
  ];

  const txnRows = txns.map(t => ({
    portfolioName:   portfolioNameMap[t.portfolioId] ?? t.portfolioId,
    tradeDate:       t.tradeDate,
    assetClass:      labelClass(t.assetClass),
    assetName:       t.assetName ?? t.isin ?? '—',
    transactionType: t.transactionType,
    quantity:        t.quantity.toString(),
    price:           t.price?.toString() ?? '',
    netAmount:       t.netAmount.toString(),
    broker:          t.broker ?? '',
    narration:       t.narration ?? '',
  }));

  const transactionsPayload: ExportPayload = {
    title: `Transactions — ${classLabel}`,
    meta: {
      Portfolio: portfolioLabel,
      'Asset Class': classLabel,
      'Generated On': new Date().toISOString().slice(0, 10),
    },
    columns: txnColumns,
    rows: txnRows,
  };

  return {
    holdingsPayload,
    transactionsPayload,
    summaryTitle: `${classLabel} Report`,
    summaryMeta: {
      Portfolio: portfolioLabel,
      'Total Holdings': String(holdings.length),
      'Total Transactions': String(txns.length),
      'Invested': `₹${fmtNum(totalCost.toString())}`,
      'Current Value': `₹${fmtNum(totalValue.toString())}`,
      'Unrealised P&L': `₹${fmtNum(totalValue.minus(totalCost).toString())}`,
    },
  };
}
