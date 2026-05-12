/**
 * Statement-style Holdings report.
 *
 * One row per holding, grouped into asset-class subsections with subtotals,
 * followed by a portfolio-level grand total in the footer cards. Uses the
 * shared streamPdf/streamExcel renderer so PortfolioOS branding stays
 * consistent with the rest of the reports module.
 *
 * Industry-standard column ordering for an Indian portfolio statement:
 *   Asset · ISIN/Symbol · Qty · Avg Cost · Invested · Market Price ·
 *   Market Value · Unrealised P&L · % of Portfolio
 */

import { Decimal } from 'decimal.js';
import type { AssetClass } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { fmtNum, fmtDate, type ExportPayload, type ExportSection } from '../../export.service.js';

const ASSET_CLASS_LABELS: Record<string, string> = {
  EQUITY: 'Equity', MUTUAL_FUND: 'Mutual Funds', ETF: 'ETFs',
  FUTURES: 'Futures', OPTIONS: 'Options',
  BOND: 'Bonds', GOVT_BOND: 'Govt Bonds', CORPORATE_BOND: 'Corp Bonds',
  FIXED_DEPOSIT: 'Fixed Deposits', RECURRING_DEPOSIT: 'Recurring Deposits',
  NPS: 'NPS', PPF: 'PPF', EPF: 'EPF', PMS: 'PMS', AIF: 'AIF',
  REIT: 'REITs', INVIT: 'InvITs',
  GOLD_BOND: 'Sovereign Gold Bonds', GOLD_ETF: 'Gold ETFs',
  PHYSICAL_GOLD: 'Physical Gold', PHYSICAL_SILVER: 'Silver',
  ULIP: 'ULIP', INSURANCE: 'Insurance',
  REAL_ESTATE: 'Real Estate',
  CRYPTOCURRENCY: 'Cryptocurrency', ART_COLLECTIBLES: 'Art', CASH: 'Cash', OTHER: 'Other',
  NSC: 'NSC', KVP: 'KVP', SCSS: 'SCSS', SSY: 'SSY',
  POST_OFFICE_MIS: 'PO MIS', POST_OFFICE_RD: 'PO RD',
  POST_OFFICE_TD: 'PO TD', POST_OFFICE_SAVINGS: 'PO Savings',
  FOREIGN_EQUITY: 'Foreign Equity', FOREX_PAIR: 'FX Pair',
};

export interface HoldingsStatementParams {
  userId: string;
  portfolioIds: string[]; // empty = all portfolios
  asOf?: Date;
}

export async function buildHoldingsStatement(
  params: HoldingsStatementParams,
): Promise<ExportPayload> {
  const portfolios = await prisma.portfolio.findMany({
    where: {
      userId: params.userId,
      ...(params.portfolioIds.length > 0 ? { id: { in: params.portfolioIds } } : {}),
    },
    select: { id: true, name: true },
  });
  const portfolioIds = portfolios.map((p) => p.id);
  const portfolioName = new Map(portfolios.map((p) => [p.id, p.name] as const));

  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolioId: { in: portfolioIds } },
    orderBy: [{ portfolioId: 'asc' }, { assetClass: 'asc' }, { assetName: 'asc' }],
  });

  // Totals (used for percentage allocation + footer cards).
  let totalCost = new Decimal(0);
  let totalValue = new Decimal(0);
  for (const h of holdings) {
    totalCost = totalCost.plus(new Decimal(h.totalCost.toString()));
    if (h.currentValue) totalValue = totalValue.plus(new Decimal(h.currentValue.toString()));
  }
  const totalPnl = totalValue.minus(totalCost);

  const columns = [
    { key: 'asset', header: 'Asset', width: 22 },
    { key: 'isin', header: 'ISIN / Symbol', width: 12 },
    { key: 'portfolio', header: 'Portfolio', width: 12 },
    { key: 'quantity', header: 'Qty', width: 8 },
    { key: 'avgCost', header: 'Avg Cost', width: 10 },
    { key: 'invested', header: 'Invested', width: 12 },
    { key: 'price', header: 'Mkt Price', width: 10 },
    { key: 'marketValue', header: 'Market Value', width: 13 },
    { key: 'pnl', header: 'Unrealised P&L', width: 14 },
    { key: 'allocPct', header: '% of Portfolio', width: 11 },
  ];

  // Group by asset class for subsection rendering.
  const byClass = new Map<AssetClass, typeof holdings>();
  for (const h of holdings) {
    const arr = byClass.get(h.assetClass) ?? [];
    arr.push(h);
    byClass.set(h.assetClass, arr);
  }

  const additionalSections: ExportSection[] = [];
  const mainRows: Array<Record<string, unknown>> = [];

  // Single grand table (no subsections) keeps the layout dense and scannable.
  // Subtotals are surfaced as inline "Subtotal — <class>" rows so the eye can
  // pick out the grouping without losing the global sort.
  const classOrder = [...byClass.keys()].sort((a, b) =>
    (ASSET_CLASS_LABELS[a] ?? a).localeCompare(ASSET_CLASS_LABELS[b] ?? b),
  );
  for (const ac of classOrder) {
    const rows = byClass.get(ac)!;
    let sectionCost = new Decimal(0);
    let sectionValue = new Decimal(0);
    for (const h of rows) {
      const cost = new Decimal(h.totalCost.toString());
      const val = h.currentValue ? new Decimal(h.currentValue.toString()) : new Decimal(0);
      const pnl = val.minus(cost);
      sectionCost = sectionCost.plus(cost);
      sectionValue = sectionValue.plus(val);
      mainRows.push({
        asset: h.assetName ?? '—',
        isin: h.isin ?? '',
        portfolio: portfolioName.get(h.portfolioId) ?? '',
        quantity: fmtNum(new Decimal(h.quantity.toString()).toFixed(4)),
        avgCost: fmtNum(new Decimal(h.avgCostPrice.toString()).toFixed(4)),
        invested: fmtNum(cost.toFixed(2)),
        price: h.currentPrice ? fmtNum(new Decimal(h.currentPrice.toString()).toFixed(4)) : '—',
        marketValue: h.currentValue ? fmtNum(val.toFixed(2)) : '—',
        pnl: h.currentValue ? `${pnl.gte(0) ? '' : ''}${fmtNum(pnl.toFixed(2))}` : '—',
        allocPct: totalValue.gt(0) && h.currentValue
          ? `${val.div(totalValue).times(100).toFixed(2)}%`
          : '—',
      });
    }
    // Subtotal row for the class.
    mainRows.push({
      asset: `Subtotal — ${ASSET_CLASS_LABELS[ac] ?? ac}`,
      isin: '',
      portfolio: '',
      quantity: '',
      avgCost: '',
      invested: fmtNum(sectionCost.toFixed(2)),
      price: '',
      marketValue: fmtNum(sectionValue.toFixed(2)),
      pnl: fmtNum(sectionValue.minus(sectionCost).toFixed(2)),
      allocPct: totalValue.gt(0)
        ? `${sectionValue.div(totalValue).times(100).toFixed(2)}%`
        : '',
    });
  }

  const asOfLabel = fmtDate(params.asOf ?? new Date());
  const portfolioLabel = portfolios.length === 1
    ? portfolios[0]!.name
    : `${portfolios.length} portfolios`;

  return {
    title: 'Holdings Statement',
    subtitle: `As of ${asOfLabel}`,
    meta: {
      Portfolio: portfolioLabel,
      'As of': asOfLabel,
      'Total holdings': String(holdings.length),
      'Asset classes': String(byClass.size),
    },
    footer: {
      Invested: `₹${fmtNum(totalCost.toFixed(2))}`,
      'Current Value': `₹${fmtNum(totalValue.toFixed(2))}`,
      'Unrealised P&L': `${totalPnl.gte(0) ? '+' : ''}₹${fmtNum(totalPnl.toFixed(2))}`,
      'Return %': totalCost.gt(0)
        ? `${totalPnl.div(totalCost).times(100).toFixed(2)}%`
        : '—',
    },
    columns,
    rows: mainRows,
    mainSectionLabel: 'Portfolio Holdings — grouped by asset class',
    additionalSections,
    filenameStem: `portfolioos-holdings-statement-${asOfLabel.replace(/[\s,]+/g, '_')}`,
  };
}
