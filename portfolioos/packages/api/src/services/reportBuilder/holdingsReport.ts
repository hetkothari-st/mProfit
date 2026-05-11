import { Decimal } from 'decimal.js';
import type { AssetClass } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { fmtNum, fmtDate, type ExportPayload, type ExportColumn } from '../export.service.js';
import type { BarDatum } from '../charts/pdfCharts.js';

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

// Friendly section title — what the user thinks of the page as
function sectionLabel(classes: AssetClass[] | undefined): string {
  if (!classes || classes.length === 0) return 'All Holdings';
  if (classes.length === 1) return labelClass(classes[0]!);
  // Common groupings:
  const set = new Set(classes);
  if (set.size === 2 && set.has('FUTURES' as AssetClass) && set.has('OPTIONS' as AssetClass)) return 'Futures & Options';
  if (set.size === 2 && set.has('FIXED_DEPOSIT' as AssetClass) && set.has('RECURRING_DEPOSIT' as AssetClass)) return 'Fixed & Recurring Deposits';
  if (set.has('PHYSICAL_GOLD' as AssetClass) || set.has('GOLD_BOND' as AssetClass) || set.has('GOLD_ETF' as AssetClass) || set.has('PHYSICAL_SILVER' as AssetClass)) return 'Gold & Silver';
  return classes.map(labelClass).join(' + ');
}

function filenameStem(classes: AssetClass[] | undefined): string {
  if (!classes || classes.length === 0) return 'portfolioos-all-holdings';
  if (classes.length === 1) return `portfolioos-${classes[0]!.toLowerCase().replace(/_/g, '-')}`;
  return `portfolioos-${classes.map(c => c.toLowerCase().replace(/_/g, '-')).join('_')}`;
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
  const section     = sectionLabel(classFilter);
  const fileStem    = filenameStem(classFilter);

  // ── Holdings ────────────────────────────────────────────────────────────────
  // For FUTURES/OPTIONS: HoldingProjection is empty (F&O isn't a traditional
  // holding). Pull live derivative positions from DerivativePosition instead.
  const isFoOnly = classFilter != null
    && classFilter.length > 0
    && classFilter.every(c => c === 'FUTURES' || c === 'OPTIONS');

  let holdings: Array<{
    portfolioId:  string;
    assetClass:   string;
    assetName:    string | null;
    isin:         string | null;
    quantity:     { toString(): string };
    avgCostPrice: { toString(): string };
    currentPrice: { toString(): string } | null;
    totalCost:    { toString(): string };
    currentValue: { toString(): string } | null;
  }> = [];

  if (isFoOnly) {
    const positions = await prisma.derivativePosition.findMany({
      where: {
        portfolioId: { in: resolvedIds },
        status: 'OPEN',
        ...(classFilter.length === 1 ? { instrumentType: classFilter[0] === 'FUTURES' ? 'FUTURES' : { in: ['CALL', 'PUT'] } } : {}),
      },
      orderBy: [{ expiryDate: 'asc' }, { underlying: 'asc' }],
    });
    holdings = positions.map(p => {
      const qty   = new Decimal(p.netQuantity.toString());
      const cost  = new Decimal(p.totalCost.toString());
      const price = p.mtmPrice ? new Decimal(p.mtmPrice.toString()) : null;
      const value = price ? qty.times(price).times(p.lotSize) : null;
      const optTag = p.instrumentType === 'FUTURES'
        ? 'FUT'
        : `${p.instrumentType === 'CALL' ? 'CE' : 'PE'} ${p.strikePrice?.toString() ?? ''}`;
      const expiry = p.expiryDate.toISOString().slice(0, 10);
      return {
        portfolioId:  p.portfolioId,
        assetClass:   p.instrumentType === 'FUTURES' ? 'FUTURES' : 'OPTIONS',
        assetName:    `${p.underlying} ${optTag} ${expiry}`,
        isin:         null,
        quantity:     { toString: () => qty.toString() },
        avgCostPrice: { toString: () => p.avgEntryPrice.toString() },
        currentPrice: price ? { toString: () => price.toString() } : null,
        totalCost:    { toString: () => cost.toString() },
        currentValue: value ? { toString: () => value.toString() } : null,
      };
    });
  } else {
    holdings = await prisma.holdingProjection.findMany({
      where: {
        portfolioId: { in: resolvedIds },
        ...(classFilter ? { assetClass: { in: classFilter } } : {}),
      },
      orderBy: [{ assetClass: 'asc' }, { assetName: 'asc' }],
    });
  }

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

  // Currency-prefixed money formatter for tables (PDF-safe — no ₹)
  const fmtRs   = (v: unknown) => v == null || v === '' ? '' : `Rs. ${fmtNum(v)}`;

  const holdingColumns: ExportColumn[] = [
    { key: 'portfolioName',  header: 'Portfolio',    width: 16 },
    { key: 'assetClass',     header: 'Class',        width: 12 },
    { key: 'assetName',      header: 'Name',         width: 32 },
    { key: 'isin',           header: 'ISIN',         width: 14 },
    { key: 'quantity',       header: 'Qty',          width: 10, formatter: v => fmtNum(v, 4) },
    { key: 'avgCostPrice',   header: 'Avg Cost',     width: 12, formatter: fmtRs },
    { key: 'currentPrice',   header: 'CMP',          width: 12, formatter: fmtRs },
    { key: 'totalCost',      header: 'Invested',     width: 14, formatter: fmtRs },
    { key: 'currentValue',   header: 'Value',        width: 14, formatter: fmtRs },
    { key: 'unrealisedPnL',  header: 'P&L',          width: 14, formatter: fmtRs },
    { key: 'pctReturn',      header: '% Rtn',        width: 8,  formatter: v => `${v}%` },
  ];

  const totalPnl = totalValue.minus(totalCost);

  // Top-10 holdings by current value — for bar chart
  const chartRows: BarDatum[] = holdingRows
    .map(r => ({ label: r.assetName, value: parseFloat(r.currentValue) }))
    .filter(r => isFinite(r.value) && r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const todayStr = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

  const holdingsPayload: ExportPayload = {
    title: `${section} Holdings Report`,
    subtitle: `${portfolioLabel}  ·  ${todayStr}`,
    filenameStem: fileStem,
    meta: {
      Portfolio: portfolioLabel,
      Section: section,
      Holdings: String(holdings.length),
    },
    columns: holdingColumns,
    rows: holdingRows,
    footer: {
      'Total Invested': `Rs. ${fmtNum(totalCost.toString())}`,
      'Current Value':  `Rs. ${fmtNum(totalValue.toString())}`,
      'Unrealised P&L': `${totalPnl.isNegative() ? '' : '+'}Rs. ${fmtNum(totalPnl.toString())}`,
      'Return %':       totalCost.isZero() ? '—' : `${totalPnl.dividedBy(totalCost).times(100).toFixed(2)}%`,
    },
    chartRows,
    chartTitle: `Top ${chartRows.length} holdings by current value`,
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
    { key: 'portfolioName',     header: 'Portfolio',   width: 16 },
    { key: 'tradeDate',         header: 'Date',        width: 12, formatter: fmtDate },
    { key: 'assetClass',        header: 'Class',       width: 12 },
    { key: 'assetName',         header: 'Asset',       width: 30 },
    { key: 'transactionType',   header: 'Type',        width: 12 },
    { key: 'quantity',          header: 'Qty',         width: 10, formatter: v => fmtNum(v, 4) },
    { key: 'price',             header: 'Price',       width: 12, formatter: fmtRs },
    { key: 'netAmount',         header: 'Net Amount',  width: 14, formatter: fmtRs },
    { key: 'broker',            header: 'Broker',      width: 14 },
    { key: 'narration',         header: 'Narration',   width: 24 },
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
    title: `${section} Transactions`,
    subtitle: `${portfolioLabel}  ·  ${todayStr}`,
    filenameStem: `${fileStem}-transactions`,
    meta: {
      Portfolio: portfolioLabel,
      Section: section,
      Transactions: String(txns.length),
    },
    columns: txnColumns,
    rows: txnRows,
  };

  return {
    holdingsPayload,
    transactionsPayload,
    summaryTitle: `${section} Report`,
    summaryMeta: {
      Portfolio: portfolioLabel,
      'Total Holdings': String(holdings.length),
      'Total Transactions': String(txns.length),
      'Invested': `Rs. ${fmtNum(totalCost.toString())}`,
      'Current Value': `Rs. ${fmtNum(totalValue.toString())}`,
      'Unrealised P&L': `Rs. ${fmtNum(totalValue.minus(totalCost).toString())}`,
    },
  };
}
