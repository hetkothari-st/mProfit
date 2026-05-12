/**
 * Comprehensive dashboard PDF.
 *
 * Uses dashboard.service.getDashboardNetWorth() as the canonical source of
 * truth so the report's net worth + allocation match the app exactly.
 *
 * Structure (with PDF bookmarks for navigation):
 *  1. Cover                       — branding, headline metrics
 *  2. Net Worth Composition       — financial + real estate + vehicles, table
 *  3. Asset Allocation            — donut + breakdown table
 *  4. Portfolio Value History     — monthly line chart
 *  5. Holdings by Asset Class     — nested section per class with
 *                                   sub-bookmarks (Equity → Mutual Fund → ...)
 *                                   Each class section: holdings + transactions
 *  6. F&O Open Positions          — DerivativePosition (only if any)
 *  7. F&O Realised P&L            — closed trades by FY + tax bucket
 *  8. Capital Gains               — STCG/LTCG/Intraday rows
 *  9. Income Received             — DIVIDEND/INTEREST/MATURITY transactions
 * 10. Real Estate                 — properties + tenancies + receipts
 * 11. Vehicles                    — vehicles + pending challans + expiries
 * 12. Insurance                   — policies + upcoming renewals
 * 13. Liabilities                 — loans + credit cards
 * 14. Recent Transactions         — last 200 across all classes
 */

import { Decimal } from 'decimal.js';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { prisma } from '../../lib/prisma.js';
import { fmtNum, fmtDate } from '../export.service.js';
import { computePortfolioXirr } from '../xirr.service.js';
import { computePortfolioCapitalGains } from '../capitalGains.service.js';
import { computePortfolioFoPnl } from '../foPnl.service.js';
import { getDashboardNetWorth } from '../dashboard.service.js';
import {
  drawPieChart,
  drawHorizontalBarChart,
  drawLineChart,
  BRAND,
  PIE_COLORS,
  pdfSafe,
  type PieSlice,
  type BarDatum,
  type LineDatum,
} from '../charts/pdfCharts.js';

export type DashboardScope = 'single' | 'all';

export interface DashboardReportParams {
  userId: string;
  portfolioId?: string;
  scope: DashboardScope;
}

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

function lbl(ac: string): string { return ASSET_CLASS_LABELS[ac] ?? ac; }
function d(v: { toString(): string } | null | undefined): Decimal {
  return v == null ? new Decimal(0) : new Decimal(v.toString());
}

// ─── Helpers (font-metric truncation, layout) ─────────────────────────────────

function truncToFit(doc: InstanceType<typeof PDFDocument>, text: string, maxWidth: number): string {
  if (!text) return '';
  if (doc.widthOfString(text) <= maxWidth) return text;
  const ellW = doc.widthOfString('...');
  if (ellW > maxWidth) return '';
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (doc.widthOfString(text.slice(0, mid)) + ellW <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + '...';
}

// ──────────────────────────────────────────────────────────────────────────────
// PDF
// ──────────────────────────────────────────────────────────────────────────────

export async function streamDashboardPdf(res: Response, params: DashboardReportParams): Promise<void> {
  await validateScope(params);

  const portfolioIdFilter = params.scope === 'single' ? params.portfolioId : undefined;
  const nw = await getDashboardNetWorth(params.userId, portfolioIdFilter);

  const portfolios = await prisma.portfolio.findMany({ where: { userId: params.userId } });
  const resolvedIds = portfolioIdFilter ? [portfolioIdFilter] : portfolios.map(p => p.id);
  const portfolioNameMap = Object.fromEntries(portfolios.map(p => [p.id, p.name]));
  const portfolioLabel = portfolioIdFilter
    ? (portfolioNameMap[portfolioIdFilter] ?? 'Portfolio')
    : 'All Portfolios';
  const todayStr = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

  // ─── Holdings grouped by asset class (live data) ────────────────────────────
  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolioId: { in: resolvedIds } },
    include: { portfolio: true },
    orderBy: [{ assetClass: 'asc' }, { assetName: 'asc' }],
  });

  const holdingsByClass = new Map<string, typeof holdings>();
  for (const h of holdings) {
    const arr = holdingsByClass.get(h.assetClass) ?? [];
    arr.push(h);
    holdingsByClass.set(h.assetClass, arr);
  }

  // ─── F&O open positions ─────────────────────────────────────────────────────
  const foPositions = await prisma.derivativePosition.findMany({
    where: { portfolioId: { in: resolvedIds }, status: 'OPEN' },
    include: { portfolio: true },
    orderBy: [{ expiryDate: 'asc' }, { underlying: 'asc' }],
  });

  let foTotalCost = new Decimal(0);
  let foTotalValue = new Decimal(0);
  for (const p of foPositions) {
    foTotalCost = foTotalCost.plus(d(p.totalCost));
    if (p.mtmPrice) {
      foTotalValue = foTotalValue.plus(d(p.netQuantity).times(d(p.mtmPrice)).times(p.lotSize));
    } else {
      foTotalValue = foTotalValue.plus(d(p.totalCost));
    }
  }

  // ─── F&O realised P&L ───────────────────────────────────────────────────────
  let foRealisedRows: Array<Record<string, unknown>> = [];
  let foRealisedTotal = new Decimal(0);
  let foTurnoverTotal = new Decimal(0);
  const foFySummary = new Map<string, { spec: Decimal; nonSpec: Decimal; total: Decimal; turnover: Decimal; trades: number }>();
  for (const pid of resolvedIds) {
    try {
      const fo = await computePortfolioFoPnl(pid);
      fo.rows.forEach(r => {
        foRealisedRows.push({ portfolioName: portfolioNameMap[pid] ?? pid, ...r });
        const pnl = new Decimal(r.realizedPnl);
        foRealisedTotal = foRealisedTotal.plus(pnl);
        foTurnoverTotal = foTurnoverTotal.plus(new Decimal(r.turnover));
        const e = foFySummary.get(r.financialYear) ?? { spec: new Decimal(0), nonSpec: new Decimal(0), total: new Decimal(0), turnover: new Decimal(0), trades: 0 };
        if (r.taxBucket === 'SPECULATIVE') e.spec = e.spec.plus(pnl);
        else e.nonSpec = e.nonSpec.plus(pnl);
        e.total = e.total.plus(pnl);
        e.turnover = e.turnover.plus(new Decimal(r.turnover));
        e.trades += r.closedTradeCount;
        foFySummary.set(r.financialYear, e);
      });
    } catch { /* portfolio may have no F&O */ }
  }

  // ─── Capital gains ──────────────────────────────────────────────────────────
  const cgRows: Array<Record<string, unknown>> = [];
  const cgByFy = new Map<string, { intraday: Decimal; stcg: Decimal; ltcg: Decimal; total: Decimal }>();
  for (const pid of resolvedIds) {
    try {
      const { rows, summaryByFy } = await computePortfolioCapitalGains(pid);
      rows.forEach(r => cgRows.push({
        portfolioName: portfolioNameMap[pid] ?? pid,
        assetName:     r.assetName ?? r.isin ?? '—',
        buyDate:       r.buyDate,
        sellDate:      r.sellDate,
        quantity:      r.quantity.toString(),
        buyAmount:     r.buyAmount.toString(),
        sellAmount:    r.sellAmount.toString(),
        type:          r.capitalGainType,
        gainLoss:      r.gainLoss.toString(),
        taxableGain:   r.taxableGain.toString(),
        financialYear: r.financialYear,
      }));
      for (const [fy, v] of Object.entries(summaryByFy)) {
        const e = cgByFy.get(fy) ?? { intraday: new Decimal(0), stcg: new Decimal(0), ltcg: new Decimal(0), total: new Decimal(0) };
        e.intraday = e.intraday.plus(d(v.intraday.toString()));
        e.stcg     = e.stcg.plus(d(v.stcg.toString()));
        e.ltcg     = e.ltcg.plus(d(v.ltcg.toString()));
        e.total    = e.total.plus(e.intraday).plus(e.stcg).plus(e.ltcg);
        cgByFy.set(fy, e);
      }
    } catch { /* ok */ }
  }

  // ─── Recent transactions (last 200) ─────────────────────────────────────────
  const recentTxns = await prisma.transaction.findMany({
    where: { portfolioId: { in: resolvedIds } },
    orderBy: { tradeDate: 'desc' },
    take: 200,
  });

  // ─── Income transactions ────────────────────────────────────────────────────
  const incomeTxns = await prisma.transaction.findMany({
    where: {
      portfolioId: { in: resolvedIds },
      transactionType: { in: ['DIVIDEND_PAYOUT', 'INTEREST_RECEIVED', 'MATURITY'] },
    },
    orderBy: { tradeDate: 'desc' },
  });

  // ─── XIRR ───────────────────────────────────────────────────────────────────
  let xirrPct: string | null = null;
  if (resolvedIds.length > 0) {
    try {
      const x = await computePortfolioXirr(resolvedIds[0]!);
      if (x.xirr != null) xirrPct = `${(x.xirr * 100).toFixed(2)}%`;
    } catch { /* ok */ }
  }

  // ─── Historical line (monthly cost basis) ───────────────────────────────────
  const allTxns = await prisma.transaction.findMany({
    where: { portfolioId: { in: resolvedIds } },
    orderBy: { tradeDate: 'asc' },
    select: { tradeDate: true, netAmount: true, transactionType: true },
  });
  const historicalLine = buildHistoricalLine(allTxns);

  // ─── Auxiliary entity data ──────────────────────────────────────────────────
  const realEstateList = await prisma.rentalProperty.findMany({
    where: { userId: params.userId },
    include: {
      tenancies: { where: { isActive: true }, take: 1, orderBy: { startDate: 'desc' } },
    },
  });
  const vehicles = await prisma.vehicle.findMany({
    where: { userId: params.userId },
    include: { challans: { where: { status: 'PENDING' } } },
  });
  const insurancePolicies = await prisma.insurancePolicy.findMany({
    where: { userId: params.userId, status: 'ACTIVE' },
    orderBy: { nextPremiumDue: 'asc' },
  });
  const loans = await prisma.loan.findMany({
    where: { userId: params.userId, status: 'ACTIVE' },
  });
  const creditCards = await prisma.creditCard.findMany({
    where: { userId: params.userId },
    orderBy: { createdAt: 'desc' },
  });

  // ─── Build pie data: financial classes + F&O + Real Estate + Vehicles ───────
  // Use the canonical allocationBreakdown from nw, then add F&O if missing.
  const pieData: PieSlice[] = [...nw.allocationBreakdown]
    .filter(a => a.numericValue > 0)
    .map((a, i) => ({
      label: a.label,
      value: a.numericValue,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  if (foTotalValue.greaterThan(0)) {
    pieData.push({ label: 'F&O', value: foTotalValue.toNumber(), color: PIE_COLORS[pieData.length % PIE_COLORS.length] });
  }
  pieData.sort((a, b) => b.value - a.value);

  // ─── Now render PDF ─────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="portfolioos-dashboard-report.pdf"');

  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'portrait', bufferPages: true });
  doc.pipe(res);

  const ML    = 40;
  const W     = doc.page.width - 80;
  const pageH = doc.page.height;
  const BOT   = pageH - 40;

  const outline = doc.outline;
  const rootBookmark = outline.addItem('Portfolio Report');

  function renderHeader(): void {
    doc.rect(0, 0, doc.page.width, 56).fill(BRAND.ink);
    doc.font('Helvetica-Bold').fontSize(16).fillColor(BRAND.white)
       .text('PortfolioOS', ML, 14, { lineBreak: false });
    doc.font('Helvetica').fontSize(9.5).fillColor('#94AECB')
       .text('Comprehensive Portfolio Report', ML, 36, { lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor('#94AECB')
       .text(pdfSafe(`${portfolioLabel}  ·  ${todayStr}`), ML, 24, { width: W, align: 'right', lineBreak: false });
  }

  function ensureSpace(cy: number, needed: number): number {
    if (cy + needed > BOT) {
      doc.addPage();
      renderHeader();
      return 72;
    }
    return cy;
  }

  function sectionBand(label: string, cy: number, parent?: PDFKit.PDFOutline): { cy: number; bookmark: PDFKit.PDFOutline } {
    const newCy = ensureSpace(cy, 36);
    const H = 20;
    // Light blue band + accent left bar + ink text. Lighter than the cover
    // header so a stack of sections doesn't read as a wall of navy.
    doc.rect(ML, newCy, W, H).fill(BRAND.headerBg);
    doc.rect(ML, newCy, 3, H).fill(BRAND.accent);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND.ink)
       .text(truncToFit(doc, pdfSafe(label), W - 18), ML + 10, newCy + 6, { width: W - 18, lineBreak: false });
    const bookmark = (parent ?? rootBookmark).addItem(label);
    return { cy: newCy + H + 6, bookmark };
  }

  // ─── COVER ────────────────────────────────────────────────────────────────
  renderHeader();
  let cy = 80;

  // Headline metric cards
  const headlineCards = [
    { label: 'NET WORTH',         value: `Rs. ${fmtNum(nw.totalNetWorth)}`, neg: false },
    { label: 'INVESTMENTS VALUE', value: `Rs. ${fmtNum(nw.portfolio.currentValue)}`, neg: false },
    { label: 'INVESTED',          value: `Rs. ${fmtNum(nw.portfolio.totalInvested)}`, neg: false },
    { label: 'UNREALISED P&L',    value: `Rs. ${fmtNum(nw.portfolio.unrealisedPnL)}`, neg: nw.portfolio.unrealisedPnL.startsWith('-') },
  ];
  cy = drawMetricCards(doc, ML, W, cy, headlineCards);

  const secondaryCards = [
    { label: 'XIRR',              value: xirrPct ?? '—', neg: false },
    { label: 'F&O REALISED P&L',  value: `Rs. ${fmtNum(foRealisedTotal.toString())}`, neg: foRealisedTotal.isNegative() },
    { label: 'REAL ESTATE',       value: `Rs. ${fmtNum(nw.realEstate.totalValue)}`, neg: false },
    { label: 'LIABILITIES',       value: `Rs. ${fmtNum(nw.totalLiabilities)}`, neg: false },
  ];
  cy = drawMetricCards(doc, ML, W, cy, secondaryCards);
  cy += 8;

  // Asset allocation pie chart
  cy = ensureSpace(cy, 220);
  const allocSec = sectionBand('Asset Allocation', cy);
  cy = allocSec.cy;
  cy = drawPieChart(doc, pieData, { x: ML, y: cy, width: W, height: 200 });
  cy += 12;

  // Allocation breakdown table
  cy = ensureSpace(cy, 50);
  const allocTableSec = sectionBand('Net Worth Composition', cy, allocSec.bookmark);
  cy = allocTableSec.cy;
  const allocRows = [
    ...nw.allocationBreakdown.map(a => ({
      label: a.label,
      value: a.value,
      percent: a.percent.toFixed(1),
      category: a.category,
    })),
    ...(foTotalValue.greaterThan(0) ? [{
      label: 'F&O Open Positions',
      value: foTotalValue.toString(),
      percent: ((foTotalValue.toNumber() / (parseFloat(nw.totalNetWorth) + foTotalValue.toNumber())) * 100).toFixed(1),
      category: 'F&O',
    }] : []),
  ];
  cy = drawTable(doc, cy, ML, W, BOT, ensureSpace, [
    { key: 'label',   header: 'Asset / Category', width: 200, align: 'left' },
    { key: 'category',header: 'Category',         width: 80,  align: 'left' },
    { key: 'value',   header: 'Value (Rs.)',      width: 110, align: 'right', money: true },
    { key: 'percent', header: '% of Net Worth',   width: 70,  align: 'right' },
  ], allocRows);

  // Historical portfolio value
  if (historicalLine.length >= 2) {
    cy = ensureSpace(cy, 200);
    const histSec = sectionBand('Portfolio Value — Monthly (Cost Basis)', cy);
    cy = histSec.cy;
    cy = drawLineChart(doc, historicalLine, { x: ML, y: cy, width: W, height: 160 });
    cy += 10;
  }

  // Capital gains by FY bar chart
  if (cgByFy.size > 0) {
    const cgBars: BarDatum[] = Array.from(cgByFy.entries())
      .sort(([a], [b]) => a > b ? 1 : -1)
      .map(([fy, v]) => ({ label: fy, value: v.stcg.plus(v.ltcg).toNumber() }));
    cy = ensureSpace(cy, cgBars.length * 22 + 50);
    const cgChartSec = sectionBand('Capital Gains by Financial Year', cy);
    cy = cgChartSec.cy;
    cy = drawHorizontalBarChart(doc, cgBars, { x: ML, y: cy, width: W, height: cgBars.length * 22 + 10 });
    cy += 10;
  }

  // ─── HOLDINGS BY ASSET CLASS — nested sections with sub-bookmarks ──────────
  if (holdingsByClass.size > 0) {
    doc.addPage();
    renderHeader();
    cy = 72;
    const classesSec = sectionBand('Holdings by Asset Class', cy);
    cy = classesSec.cy;

    const sortedClasses = Array.from(holdingsByClass.entries()).sort(([a], [b]) => lbl(a).localeCompare(lbl(b)));
    for (const [cls, classHoldings] of sortedClasses) {
      cy = ensureSpace(cy, 50);
      const className = lbl(cls);
      const classSec = sectionBand(`${className}  (${classHoldings.length})`, cy, classesSec.bookmark);
      cy = classSec.cy;

      const classRows = classHoldings.map(h => {
        const cost = d(h.totalCost);
        const val = h.currentValue ? d(h.currentValue) : cost;
        const pnl = val.minus(cost);
        const pct = cost.isZero() ? '0.00' : pnl.dividedBy(cost).times(100).toFixed(2);
        return {
          portfolioName: portfolioNameMap[h.portfolioId] ?? '',
          assetName: h.assetName ?? h.isin ?? '—',
          quantity: h.quantity.toString(),
          avgCost: h.avgCostPrice.toString(),
          invested: cost.toString(),
          value: val.toString(),
          pnl: pnl.toString(),
          pct: pct,
        };
      });

      cy = drawTable(doc, cy, ML, W, BOT, ensureSpace, [
        { key: 'portfolioName', header: 'Portfolio', width: 80,  align: 'left' },
        { key: 'assetName',     header: 'Asset',     width: 140, align: 'left' },
        { key: 'quantity',      header: 'Qty',       width: 60,  align: 'right' },
        { key: 'avgCost',       header: 'Avg (Rs.)', width: 70,  align: 'right', money: true },
        { key: 'invested',      header: 'Invested (Rs.)', width: 80, align: 'right', money: true },
        { key: 'value',         header: 'Value (Rs.)',    width: 80, align: 'right', money: true },
        { key: 'pnl',           header: 'P&L (Rs.)',      width: 70, align: 'right', money: true, signed: true },
        { key: 'pct',           header: '%',              width: 40, align: 'right' },
      ], classRows);

      // Recent transactions for this class
      const classTxns = recentTxns.filter(t => t.assetClass === cls).slice(0, 25);
      if (classTxns.length > 0) {
        cy = ensureSpace(cy, 60);
        const txnSec = sectionBand(`${className} — Recent Transactions (last ${classTxns.length})`, cy, classSec.bookmark);
        cy = txnSec.cy;
        const txnRows = classTxns.map(t => ({
          date: t.tradeDate,
          asset: t.assetName ?? t.isin ?? '—',
          type: t.transactionType,
          qty: t.quantity.toString(),
          price: t.price?.toString() ?? '',
          netAmount: t.netAmount.toString(),
          broker: t.broker ?? '',
        }));
        cy = drawTable(doc, cy, ML, W, BOT, ensureSpace, [
          { key: 'date',      header: 'Date',           width: 60,  align: 'left', dateField: true },
          { key: 'asset',     header: 'Asset',          width: 140, align: 'left' },
          { key: 'type',      header: 'Type',           width: 80,  align: 'left' },
          { key: 'qty',       header: 'Qty',            width: 60,  align: 'right' },
          { key: 'price',     header: 'Price (Rs.)',    width: 70,  align: 'right', money: true },
          { key: 'netAmount', header: 'Net Amt (Rs.)',  width: 90,  align: 'right', money: true },
          { key: 'broker',    header: 'Broker',         width: 80,  align: 'left' },
        ], txnRows);
      }
    }
  }

  // ─── F&O OPEN POSITIONS ─────────────────────────────────────────────────────
  if (foPositions.length > 0) {
    cy = ensureSpace(cy, 50);
    const foOpenSec = sectionBand(`F&O Open Positions (${foPositions.length})`, cy);
    cy = foOpenSec.cy;
    const foOpenRows = foPositions.map(p => {
      const tag = p.instrumentType === 'FUTURES' ? 'FUT' : `${p.instrumentType === 'CALL' ? 'CE' : 'PE'} ${p.strikePrice?.toString() ?? ''}`;
      const qty = d(p.netQuantity);
      const cost = d(p.totalCost);
      const val = p.mtmPrice ? qty.times(d(p.mtmPrice)).times(p.lotSize) : cost;
      return {
        portfolioName: portfolioNameMap[p.portfolioId] ?? '',
        instrument: `${p.underlying} ${tag}`,
        expiry: p.expiryDate.toISOString().slice(0, 10),
        qty: qty.toString(),
        lotSize: String(p.lotSize),
        avgEntry: p.avgEntryPrice.toString(),
        mtm: p.mtmPrice?.toString() ?? '',
        invested: cost.toString(),
        value: val.toString(),
        unrealizedPnl: p.unrealizedPnl?.toString() ?? '0',
      };
    });
    cy = drawTable(doc, cy, ML, W, BOT, ensureSpace, [
      { key: 'portfolioName', header: 'Portfolio',     width: 70,  align: 'left' },
      { key: 'instrument',    header: 'Instrument',    width: 110, align: 'left' },
      { key: 'expiry',        header: 'Expiry',        width: 65,  align: 'left' },
      { key: 'qty',           header: 'Qty',           width: 50,  align: 'right' },
      { key: 'lotSize',       header: 'Lot',           width: 35,  align: 'right' },
      { key: 'avgEntry',      header: 'Avg (Rs.)',     width: 60,  align: 'right', money: true },
      { key: 'mtm',           header: 'MTM (Rs.)',     width: 60,  align: 'right', money: true },
      { key: 'invested',      header: 'Invested (Rs.)',width: 80,  align: 'right', money: true },
      { key: 'value',         header: 'Value (Rs.)',   width: 80,  align: 'right', money: true },
      { key: 'unrealizedPnl', header: 'UnRl P&L (Rs.)',width: 80,  align: 'right', money: true, signed: true },
    ], foOpenRows);
  }

  // ─── F&O REALISED P&L (per instrument by FY) ────────────────────────────────
  if (foRealisedRows.length > 0) {
    cy = ensureSpace(cy, 50);
    const foSec = sectionBand('F&O Realised P&L (closed trades by instrument × FY)', cy);
    cy = foSec.cy;
    cy = drawTable(doc, cy, ML, W, BOT, ensureSpace, [
      { key: 'portfolioName',    header: 'Portfolio',    width: 70,  align: 'left' },
      { key: 'financialYear',    header: 'FY',           width: 40,  align: 'left' },
      { key: 'underlying',       header: 'Underlying',   width: 70,  align: 'left' },
      { key: 'instrumentType',   header: 'Type',         width: 45,  align: 'left' },
      { key: 'strikePrice',      header: 'Strike',       width: 50,  align: 'right' },
      { key: 'expiryDate',       header: 'Expiry',       width: 65,  align: 'left' },
      { key: 'taxBucket',        header: 'Tax Bucket',   width: 80,  align: 'left' },
      { key: 'closedTradeCount', header: 'Trades',       width: 40,  align: 'right' },
      { key: 'turnover',         header: 'Turnover (Rs.)', width: 80, align: 'right', money: true },
      { key: 'realizedPnl',      header: 'Realised (Rs.)', width: 80, align: 'right', money: true, signed: true },
    ], foRealisedRows);
  }

  // ─── F&O TAX SUMMARY ────────────────────────────────────────────────────────
  if (foFySummary.size > 0) {
    cy = ensureSpace(cy, 60);
    const foTaxSec = sectionBand('F&O Tax Summary (§43(5) — speculative vs non-speculative)', cy);
    cy = foTaxSec.cy;
    const taxRows = Array.from(foFySummary.entries())
      .sort(([a], [b]) => a > b ? -1 : 1)
      .map(([fy, v]) => ({
        fy,
        trades:         v.trades,
        turnover:       v.turnover.toString(),
        speculative:    v.spec.toString(),
        nonSpeculative: v.nonSpec.toString(),
        total:          v.total.toString(),
      }));
    cy = drawTable(doc, cy, ML, W, BOT, ensureSpace, [
      { key: 'fy',             header: 'FY',                       width: 60,  align: 'left' },
      { key: 'trades',         header: 'Closed Trades',            width: 80,  align: 'right' },
      { key: 'turnover',       header: 'Turnover ICAI (Rs.)',      width: 110, align: 'right', money: true },
      { key: 'speculative',    header: 'Speculative P&L (Rs.)',    width: 120, align: 'right', money: true, signed: true },
      { key: 'nonSpeculative', header: 'Non-Spec. P&L (Rs.)',      width: 110, align: 'right', money: true, signed: true },
      { key: 'total',          header: 'Total Realised (Rs.)',     width: 110, align: 'right', money: true, signed: true },
    ], taxRows);
  }

  // ─── CAPITAL GAINS ──────────────────────────────────────────────────────────
  if (cgRows.length > 0) {
    cy = ensureSpace(cy, 50);
    const cgSec = sectionBand(`Realised Capital Gains (${cgRows.length} matched trades)`, cy);
    cy = cgSec.cy;
    cy = drawTable(doc, cy, ML, W, BOT, ensureSpace, [
      { key: 'portfolioName', header: 'Portfolio',  width: 65, align: 'left' },
      { key: 'financialYear', header: 'FY',         width: 45, align: 'left' },
      { key: 'type',          header: 'Type',       width: 60, align: 'left' },
      { key: 'assetName',     header: 'Asset',      width: 110, align: 'left' },
      { key: 'buyDate',       header: 'Buy',        width: 60, align: 'left', dateField: true },
      { key: 'sellDate',      header: 'Sell',       width: 60, align: 'left', dateField: true },
      { key: 'buyAmount',     header: 'Cost (Rs.)', width: 70, align: 'right', money: true },
      { key: 'sellAmount',    header: 'Proceeds (Rs.)', width: 80, align: 'right', money: true },
      { key: 'gainLoss',      header: 'Gain/Loss (Rs.)',width: 80, align: 'right', money: true, signed: true },
    ], cgRows);
  }

  // ─── INCOME RECEIVED ────────────────────────────────────────────────────────
  if (incomeTxns.length > 0) {
    cy = ensureSpace(cy, 50);
    const incSec = sectionBand(`Income Received (${incomeTxns.length} entries)`, cy);
    cy = incSec.cy;
    const incRows = incomeTxns.map(t => ({
      portfolioName: portfolioNameMap[t.portfolioId] ?? '',
      tradeDate:     t.tradeDate,
      type:          t.transactionType,
      assetName:     t.assetName ?? t.isin ?? '—',
      amount:        t.netAmount.toString(),
      narration:     t.narration ?? '',
    }));
    cy = drawTable(doc, cy, ML, W, BOT, ensureSpace, [
      { key: 'portfolioName', header: 'Portfolio', width: 70,  align: 'left' },
      { key: 'tradeDate',     header: 'Date',      width: 60,  align: 'left', dateField: true },
      { key: 'type',          header: 'Type',      width: 90,  align: 'left' },
      { key: 'assetName',     header: 'Asset',     width: 140, align: 'left' },
      { key: 'amount',        header: 'Amount (Rs.)', width: 90, align: 'right', money: true, signed: true },
      { key: 'narration',     header: 'Narration', width: 110, align: 'left' },
    ], incRows);
  }

  // ─── REAL ESTATE ────────────────────────────────────────────────────────────
  if (realEstateList.length > 0) {
    cy = ensureSpace(cy, 50);
    const reSec = sectionBand(`Real Estate (${realEstateList.length} properties)`, cy);
    cy = reSec.cy;
    const reRows = realEstateList.map(p => {
      const t = p.tenancies[0];
      return {
        name: p.name,
        type: p.propertyType,
        address: p.address ?? '',
        purchase: p.purchasePrice?.toString() ?? '',
        currentValue: p.currentValue?.toString() ?? '',
        tenant: t?.tenantName ?? '—',
        rent: t?.monthlyRent.toString() ?? '',
        active: p.isActive ? 'Yes' : 'No',
      };
    });
    cy = drawTable(doc, cy, ML, W, BOT, ensureSpace, [
      { key: 'name',         header: 'Property',          width: 110, align: 'left' },
      { key: 'type',         header: 'Type',              width: 70,  align: 'left' },
      { key: 'address',      header: 'Address',           width: 130, align: 'left' },
      { key: 'purchase',     header: 'Purchase (Rs.)',    width: 80,  align: 'right', money: true },
      { key: 'currentValue', header: 'Current (Rs.)',     width: 80,  align: 'right', money: true },
      { key: 'tenant',       header: 'Tenant',            width: 90,  align: 'left' },
      { key: 'rent',         header: 'Rent (Rs./mo)',     width: 80,  align: 'right', money: true },
      { key: 'active',       header: 'Active',            width: 40,  align: 'center' },
    ], reRows);
  }

  // ─── VEHICLES ───────────────────────────────────────────────────────────────
  if (vehicles.length > 0) {
    cy = ensureSpace(cy, 50);
    const vSec = sectionBand(`Vehicles (${vehicles.length})`, cy);
    cy = vSec.cy;
    const vRows = vehicles.map(v => ({
      reg:     v.registrationNo.length > 4 ? `XXXX${v.registrationNo.slice(-4)}` : v.registrationNo,
      make:    v.make ?? '',
      model:   v.model ?? '',
      year:    String(v.manufacturingYear ?? ''),
      owner:   v.ownerName ?? '',
      purchase:v.purchasePrice?.toString() ?? '',
      current: v.currentValue?.toString() ?? '',
      insExp:  v.insuranceExpiry?.toISOString().slice(0, 10) ?? '',
      pucExp:  v.pucExpiry?.toISOString().slice(0, 10) ?? '',
      challans:String(v.challans.length),
    }));
    cy = drawTable(doc, cy, ML, W, BOT, ensureSpace, [
      { key: 'reg',      header: 'Reg No',       width: 70,  align: 'left' },
      { key: 'make',     header: 'Make',         width: 70,  align: 'left' },
      { key: 'model',    header: 'Model',        width: 80,  align: 'left' },
      { key: 'year',     header: 'Year',         width: 40,  align: 'right' },
      { key: 'owner',    header: 'Owner',        width: 90,  align: 'left' },
      { key: 'purchase', header: 'Purchase (Rs.)', width: 80, align: 'right', money: true },
      { key: 'current',  header: 'Value (Rs.)',  width: 80,  align: 'right', money: true },
      { key: 'insExp',   header: 'Ins. Expiry',  width: 70,  align: 'left' },
      { key: 'pucExp',   header: 'PUC Expiry',   width: 70,  align: 'left' },
      { key: 'challans', header: 'Open Challans',width: 70,  align: 'right' },
    ], vRows);
  }

  // ─── INSURANCE ──────────────────────────────────────────────────────────────
  if (insurancePolicies.length > 0) {
    cy = ensureSpace(cy, 50);
    const insSec = sectionBand(`Insurance Policies (${insurancePolicies.length})`, cy);
    cy = insSec.cy;
    const insRows = insurancePolicies.map(p => ({
      insurer:  p.insurer,
      type:     p.type,
      plan:     p.planName ?? '',
      holder:   p.policyHolder,
      sa:       p.sumAssured.toString(),
      premium:  p.premiumAmount.toString(),
      freq:     p.premiumFrequency,
      nextDue:  p.nextPremiumDue?.toISOString().slice(0, 10) ?? '',
      status:   p.status,
    }));
    cy = drawTable(doc, cy, ML, W, BOT, ensureSpace, [
      { key: 'insurer', header: 'Insurer',          width: 90,  align: 'left' },
      { key: 'type',    header: 'Type',             width: 60,  align: 'left' },
      { key: 'plan',    header: 'Plan',             width: 100, align: 'left' },
      { key: 'holder',  header: 'Holder',           width: 100, align: 'left' },
      { key: 'sa',      header: 'Sum Assured (Rs.)',width: 100, align: 'right', money: true },
      { key: 'premium', header: 'Premium (Rs.)',    width: 80,  align: 'right', money: true },
      { key: 'freq',    header: 'Frequency',        width: 60,  align: 'left' },
      { key: 'nextDue', header: 'Next Due',         width: 70,  align: 'left' },
      { key: 'status',  header: 'Status',           width: 60,  align: 'left' },
    ], insRows);
  }

  // ─── LIABILITIES ────────────────────────────────────────────────────────────
  if (loans.length > 0 || creditCards.length > 0) {
    cy = ensureSpace(cy, 50);
    const liabSec = sectionBand('Liabilities Summary', cy);
    cy = liabSec.cy;
    cy = drawMetricCards(doc, ML, W, cy, [
      { label: 'TOTAL OUTSTANDING',   value: `Rs. ${fmtNum(nw.liabilities.totalOutstanding)}`, neg: false },
      { label: 'MONTHLY EMI TOTAL',   value: `Rs. ${fmtNum(nw.liabilities.monthlyEmiTotal)}`, neg: false },
      { label: 'ACTIVE LOANS',        value: String(nw.liabilities.loanCount), neg: false },
      { label: 'CC OUTSTANDING',      value: `Rs. ${fmtNum(nw.liabilities.totalCreditCardOutstanding)}`, neg: false },
    ]);

    if (loans.length > 0) {
      cy = ensureSpace(cy, 40);
      const loanSec = sectionBand(`Active Loans (${loans.length})`, cy, liabSec.bookmark);
      cy = loanSec.cy;
      const loanRows = loans.map(l => ({
        lender:     l.lenderName,
        type:       l.loanType,
        borrower:   l.borrowerName,
        principal:  l.principalAmount.toString(),
        rate:       l.interestRate.toString(),
        tenure:     String(l.tenureMonths),
        emi:        l.emiAmount.toString(),
      }));
      cy = drawTable(doc, cy, ML, W, BOT, ensureSpace, [
        { key: 'lender',    header: 'Lender',          width: 120, align: 'left' },
        { key: 'type',      header: 'Type',            width: 70,  align: 'left' },
        { key: 'borrower',  header: 'Borrower',        width: 110, align: 'left' },
        { key: 'principal', header: 'Principal (Rs.)', width: 100, align: 'right', money: true },
        { key: 'rate',      header: 'Rate %',          width: 60,  align: 'right' },
        { key: 'tenure',    header: 'Tenure (mo)',     width: 70,  align: 'right' },
        { key: 'emi',       header: 'EMI (Rs.)',       width: 80,  align: 'right', money: true },
      ], loanRows);
    }

    if (creditCards.length > 0) {
      cy = ensureSpace(cy, 40);
      const ccSec = sectionBand(`Credit Cards (${creditCards.length})`, cy, liabSec.bookmark);
      cy = ccSec.cy;
      const ccRows = creditCards.map(c => ({
        name:    c.cardName,
        bank:    c.issuerBank,
        last4:   c.last4 ?? '',
        network: c.network ?? '',
        limit:   c.creditLimit?.toString() ?? '',
        status:  c.status,
      }));
      cy = drawTable(doc, cy, ML, W, BOT, ensureSpace, [
        { key: 'name',    header: 'Card',           width: 130, align: 'left' },
        { key: 'bank',    header: 'Issuer Bank',    width: 100, align: 'left' },
        { key: 'last4',   header: 'Last 4',         width: 50,  align: 'center' },
        { key: 'network', header: 'Network',        width: 60,  align: 'left' },
        { key: 'limit',   header: 'Limit (Rs.)',    width: 100, align: 'right', money: true },
        { key: 'status',  header: 'Status',         width: 60,  align: 'center' },
      ], ccRows);
    }
  }

  // ─── RECENT TRANSACTIONS (master log, last 200) ─────────────────────────────
  if (recentTxns.length > 0) {
    cy = ensureSpace(cy, 50);
    const txnSec = sectionBand(`Recent Transactions (last ${recentTxns.length})`, cy);
    cy = txnSec.cy;
    const txnRows = recentTxns.map(t => ({
      portfolio: portfolioNameMap[t.portfolioId] ?? '',
      date:      t.tradeDate,
      class:     lbl(t.assetClass),
      asset:     t.assetName ?? t.isin ?? '—',
      type:      t.transactionType,
      qty:       t.quantity.toString(),
      price:     t.price?.toString() ?? '',
      netAmount: t.netAmount.toString(),
      broker:    t.broker ?? '',
    }));
    cy = drawTable(doc, cy, ML, W, BOT, ensureSpace, [
      { key: 'portfolio', header: 'Portfolio',     width: 65, align: 'left' },
      { key: 'date',      header: 'Date',          width: 55, align: 'left', dateField: true },
      { key: 'class',     header: 'Class',         width: 65, align: 'left' },
      { key: 'asset',     header: 'Asset',         width: 130, align: 'left' },
      { key: 'type',      header: 'Type',          width: 70, align: 'left' },
      { key: 'qty',       header: 'Qty',           width: 55, align: 'right' },
      { key: 'price',     header: 'Price (Rs.)',   width: 65, align: 'right', money: true },
      { key: 'netAmount', header: 'Net (Rs.)',     width: 85, align: 'right', money: true },
      { key: 'broker',    header: 'Broker',        width: 65, align: 'left' },
    ], txnRows);
  }

  // ─── Page numbers ───────────────────────────────────────────────────────────
  // CRITICAL: must NOT pass `width` here. PDFKit's `text` routes any call with
  // a width option through LineWrapper.wrap(), whose very first check is
  // `if (doc.y > maxY) nextSection()` (pdfkit.js:3041). Our footer y is
  // `pageH - 22 = 820`, which is below maxY (= pageH - bottomMargin = 802),
  // so the wrapper synthesises a continueOnNewPage() and an extra blank page
  // is appended for every iteration. `lineBreak: false` does not help here.
  // Strip `width` + `align` and centre the string manually via widthOfString.
  const range = doc.bufferedPageRange();
  doc.font('Helvetica').fontSize(7);
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const txt = pdfSafe(`PortfolioOS  ·  Comprehensive Report  ·  Page ${i + 1} of ${range.count}`);
    const tw  = doc.widthOfString(txt);
    const tx  = ML + (W - tw) / 2;
    doc.fillColor(BRAND.muted).text(txt, tx, pageH - 22, { lineBreak: false });
  }
  doc.flushPages();
  doc.end();
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

interface CardSpec { label: string; value: string; neg: boolean }

function drawMetricCards(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  width: number,
  cy: number,
  cards: CardSpec[],
): number {
  const gap = 6;
  const cardW = (width - gap * (cards.length - 1)) / cards.length;
  const cardH = 44;
  cards.forEach((c, i) => {
    const cx = x + i * (cardW + gap);
    doc.rect(cx, cy, cardW, cardH).fill(BRAND.headerBg);
    doc.rect(cx, cy, 3, cardH).fill(BRAND.accent);
    doc.font('Helvetica').fontSize(7).fillColor(BRAND.muted)
       .text(c.label, cx + 9, cy + 7, { width: cardW - 12, characterSpacing: 0.4, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(12).fillColor(c.neg ? BRAND.negative : BRAND.ink);
    const fitted = truncToFit(doc, pdfSafe(c.value), cardW - 16);
    doc.text(fitted, cx + 9, cy + 22, { width: cardW - 12, lineBreak: false });
  });
  return cy + cardH + 10;
}

interface ColDef {
  key: string;
  header: string;
  width: number;
  align: 'left' | 'right' | 'center';
  money?: boolean;
  signed?: boolean;
  dateField?: boolean;
}

function drawTable(
  doc: InstanceType<typeof PDFDocument>,
  startY: number,
  ML: number,
  W: number,
  BOT: number,
  ensureSpace: (cy: number, needed: number) => number,
  cols: ColDef[],
  rows: Record<string, unknown>[],
): number {
  const totalColW = cols.reduce((s, c) => s + c.width, 0);
  const scale     = W / totalColW;
  const scaled    = cols.map(c => ({ ...c, width: c.width * scale }));
  const ROW_H     = 15;
  let cy = startY;

  function drawHead(y: number): void {
    // Soft slate — visually distinct from the section band above and the
    // alternating row tint below, but never as heavy as a navy bar.
    doc.rect(ML, y, W, ROW_H).fill('#DDE3EC');
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.ink);
    let x = ML;
    for (const col of scaled) {
      const w = col.width - 6;
      doc.text(truncToFit(doc, pdfSafe(col.header), w), x + 3, y + 4, {
        width: w, lineBreak: false, align: col.align,
      });
      x += col.width;
    }
  }

  drawHead(cy);
  cy += ROW_H;

  if (rows.length === 0) {
    doc.rect(ML, cy, W, 28).fill(BRAND.rowAlt);
    doc.font('Helvetica').fontSize(8).fillColor(BRAND.muted)
       .text('No records.', ML, cy + 9, { width: W, align: 'center', lineBreak: false });
    return cy + 36;
  }

  for (let i = 0; i < rows.length; i++) {
    cy = ensureSpace(cy, ROW_H);
    if (cy === 72) { drawHead(cy); cy += ROW_H; } // page just broken

    if (i % 2 === 1) doc.rect(ML, cy, W, ROW_H).fill(BRAND.rowAlt);
    let x = ML;
    doc.font('Helvetica').fontSize(7.5);
    for (const col of scaled) {
      const raw = rows[i]![col.key];
      let display: string;
      if (col.dateField) {
        display = pdfSafe(fmtDate(raw));
      } else if (col.money) {
        display = raw == null || raw === '' ? '' : fmtNum(raw);
      } else {
        display = pdfSafe(raw == null ? '' : String(raw));
      }
      const isNeg = (col.signed || col.money) && String(raw).startsWith('-');
      doc.fillColor(isNeg ? BRAND.negative : BRAND.ink);
      const w = col.width - 6;
      doc.text(truncToFit(doc, display, w), x + 3, cy + 4, {
        width: w, lineBreak: false, align: col.align,
      });
      x += col.width;
    }
    cy += ROW_H;
  }
  return cy + 8;
}

function buildHistoricalLine(
  txns: { tradeDate: Date; netAmount: { toString(): string }; transactionType: string }[],
): LineDatum[] {
  if (txns.length < 2) return [];
  const BUY_TYPES = new Set(['BUY', 'SIP', 'SWITCH_IN', 'DEPOSIT', 'OPENING_BALANCE', 'BONUS', 'DIVIDEND_REINVEST']);
  const SELL_TYPES = new Set(['SELL', 'REDEMPTION', 'SWITCH_OUT', 'MATURITY', 'WITHDRAWAL']);
  const byMonth = new Map<string, Decimal>();
  let running = new Decimal(0);
  for (const t of txns) {
    const key = t.tradeDate.toISOString().slice(0, 7);
    const amt = d(t.netAmount).abs();
    if (BUY_TYPES.has(t.transactionType))  running = running.plus(amt);
    if (SELL_TYPES.has(t.transactionType)) running = Decimal.max(running.minus(amt), new Decimal(0));
    byMonth.set(key, running);
  }
  return Array.from(byMonth.entries())
    .slice(-24)
    .map(([month, val]) => ({ label: month.slice(2), value: val.toNumber() }));
}

async function validateScope(params: DashboardReportParams): Promise<void> {
  if (params.scope === 'single' && params.portfolioId) {
    const p = await prisma.portfolio.findUnique({ where: { id: params.portfolioId } });
    if (!p || p.userId !== params.userId) {
      const { ForbiddenError } = await import('../../lib/errors.js');
      throw new ForbiddenError();
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Excel
// ──────────────────────────────────────────────────────────────────────────────

export async function streamDashboardExcel(res: Response, params: DashboardReportParams): Promise<void> {
  await validateScope(params);
  const portfolioIdFilter = params.scope === 'single' ? params.portfolioId : undefined;
  const nw = await getDashboardNetWorth(params.userId, portfolioIdFilter);

  const portfolios = await prisma.portfolio.findMany({ where: { userId: params.userId } });
  const resolvedIds = portfolioIdFilter ? [portfolioIdFilter] : portfolios.map(p => p.id);

  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolioId: { in: resolvedIds } },
    include: { portfolio: true },
    orderBy: [{ assetClass: 'asc' }],
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PortfolioOS';
  wb.created = new Date();

  // Summary sheet
  const ws = wb.addWorksheet('Summary');
  ws.getCell('A1').value = 'PortfolioOS — Comprehensive Portfolio Report';
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = `Portfolio: ${portfolioIdFilter ? (portfolios.find(p => p.id === portfolioIdFilter)?.name ?? '') : 'All Portfolios'}`;
  ws.getCell('A3').value = `Generated: ${new Date().toISOString().slice(0, 10)}`;
  ws.addRow([]);
  ws.addRow(['Metric', 'Value']).font = { bold: true };
  ws.addRow(['Net Worth',          `₹${fmtNum(nw.totalNetWorth)}`]);
  ws.addRow(['Investments Value',  `₹${fmtNum(nw.portfolio.currentValue)}`]);
  ws.addRow(['Total Invested',     `₹${fmtNum(nw.portfolio.totalInvested)}`]);
  ws.addRow(['Unrealised P&L',     `₹${fmtNum(nw.portfolio.unrealisedPnL)}`]);
  ws.addRow(['Real Estate Value',  `₹${fmtNum(nw.realEstate.totalValue)}`]);
  ws.addRow(['Vehicle Value',      `₹${fmtNum(nw.vehicles.totalValue)}`]);
  ws.addRow(['Total Liabilities',  `₹${fmtNum(nw.totalLiabilities)}`]);
  ws.addRow([]);
  ws.addRow(['Asset Class', 'Value (Rs.)', '% of Net Worth', 'Category']).font = { bold: true };
  for (const a of nw.allocationBreakdown) {
    ws.addRow([a.label, a.value, `${a.percent.toFixed(1)}%`, a.category]);
  }
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 14;

  // Holdings sheet
  const wh = wb.addWorksheet('Holdings');
  wh.addRow(['Portfolio', 'Asset Class', 'Asset Name', 'Quantity', 'Avg Cost (Rs.)', 'Current (Rs.)', 'Invested (Rs.)', 'Value (Rs.)', 'P&L (Rs.)', '% Return']).font = { bold: true };
  for (const h of holdings) {
    const cost = d(h.totalCost);
    const value = h.currentValue ? d(h.currentValue) : cost;
    const pnl = value.minus(cost);
    const pct = cost.isZero() ? '0' : pnl.dividedBy(cost).times(100).toFixed(2);
    wh.addRow([
      h.portfolio.name, lbl(h.assetClass), h.assetName ?? h.isin ?? '—',
      h.quantity.toString(),
      h.avgCostPrice.toString(),
      h.currentPrice?.toString() ?? '',
      cost.toString(),
      value.toString(),
      pnl.toString(),
      `${pct}%`,
    ]);
  }
  wh.getColumn(1).width = 22;
  wh.getColumn(2).width = 18;
  wh.getColumn(3).width = 40;

  // Transactions sheet
  const allTxns = await prisma.transaction.findMany({
    where: { portfolioId: { in: resolvedIds } },
    orderBy: { tradeDate: 'desc' },
    take: 5000,
  });
  const wt = wb.addWorksheet('Transactions');
  wt.addRow(['Portfolio', 'Date', 'Asset Class', 'Asset Name', 'Type', 'Quantity', 'Price (Rs.)', 'Net Amount (Rs.)', 'Broker', 'Narration']).font = { bold: true };
  for (const t of allTxns) {
    wt.addRow([
      portfolios.find(p => p.id === t.portfolioId)?.name ?? '',
      t.tradeDate.toISOString().slice(0, 10),
      lbl(t.assetClass),
      t.assetName ?? t.isin ?? '—',
      t.transactionType,
      t.quantity.toString(),
      t.price?.toString() ?? '',
      t.netAmount.toString(),
      t.broker ?? '',
      t.narration ?? '',
    ]);
  }
  wt.getColumn(1).width = 22;
  wt.getColumn(4).width = 40;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="portfolioos-dashboard-report.xlsx"');
  await wb.xlsx.write(res);
  res.end();
}
