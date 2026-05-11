import { Decimal } from 'decimal.js';
import type { Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import { fmtNum } from '../export.service.js';
import { computePortfolioXirr } from '../xirr.service.js';
import { computePortfolioCapitalGains } from '../capitalGains.service.js';
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
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

export type DashboardScope = 'single' | 'all';

export interface DashboardReportParams {
  userId: string;
  portfolioId?: string;   // required when scope = 'single'
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

// ─── Shared data loader ───────────────────────────────────────────────────────

async function loadPortfolioData(portfolioIds: string[]) {
  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolioId: { in: portfolioIds } },
    include: { portfolio: true },
  });

  const effVal = (h: typeof holdings[0]) =>
    h.currentValue !== null ? d(h.currentValue) : d(h.totalCost);

  let totalValue    = new Decimal(0);
  let totalInvested = new Decimal(0);

  const allocationMap = new Map<string, Decimal>();
  const holdingRows: {
    portfolioName: string; assetClass: string; assetName: string;
    invested: string; value: string; pnl: string; pctReturn: string;
  }[] = [];

  for (const h of holdings) {
    const val  = effVal(h);
    const cost = d(h.totalCost);
    totalValue    = totalValue.plus(val);
    totalInvested = totalInvested.plus(cost);
    allocationMap.set(h.assetClass, (allocationMap.get(h.assetClass) ?? new Decimal(0)).plus(val));
    const pnl = val.minus(cost);
    holdingRows.push({
      portfolioName: h.portfolio.name,
      assetClass:    lbl(h.assetClass),
      assetName:     h.assetName ?? h.isin ?? '—',
      invested:      cost.toString(),
      value:         val.toString(),
      pnl:           pnl.toString(),
      pctReturn:     cost.isZero() ? '0.00' : pnl.dividedBy(cost).times(100).toFixed(2),
    });
  }

  const totalPnl = totalValue.minus(totalInvested);

  const pieData: PieSlice[] = Array.from(allocationMap.entries())
    .filter(([, v]) => v.greaterThan(0))
    .sort(([, a], [, b]) => (b.greaterThan(a) ? 1 : -1))
    .map(([ac, val], i) => ({
      label: lbl(ac),
      value: val.toNumber(),
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));

  // Historical points (monthly, last 24 months from transactions)
  const txns = await prisma.transaction.findMany({
    where: { portfolioId: { in: portfolioIds } },
    orderBy: { tradeDate: 'asc' },
    select: { tradeDate: true, netAmount: true, transactionType: true },
  });

  const historicalLine = buildHistoricalLine(txns, totalInvested);

  // Capital gains by FY (aggregated)
  const cgMap = new Map<string, { intraday: Decimal; stcg: Decimal; ltcg: Decimal }>();
  for (const pid of portfolioIds) {
    try {
      const { summaryByFy } = await computePortfolioCapitalGains(pid);
      for (const [fy, v] of Object.entries(summaryByFy)) {
        const existing = cgMap.get(fy) ?? { intraday: new Decimal(0), stcg: new Decimal(0), ltcg: new Decimal(0) };
        cgMap.set(fy, {
          intraday: existing.intraday.plus(d(v.intraday.toString())),
          stcg:     existing.stcg.plus(d(v.stcg.toString())),
          ltcg:     existing.ltcg.plus(d(v.ltcg.toString())),
        });
      }
    } catch { /* portfolio may have no CG */ }
  }

  const cgBars: BarDatum[] = Array.from(cgMap.entries())
    .sort(([a], [b]) => a > b ? 1 : -1)
    .map(([fy, v]) => ({
      label: fy,
      value: v.stcg.plus(v.ltcg).toNumber(),
      color: BRAND.accent,
    }));

  // XIRR (first portfolio only if multiple — expensive per portfolio)
  let xirrPct: string | null = null;
  if (portfolioIds.length > 0) {
    try {
      const x = await computePortfolioXirr(portfolioIds[0]!);
      if (x.xirr != null) xirrPct = `${(x.xirr * 100).toFixed(2)}%`;
    } catch { /* ok */ }
  }

  return {
    totalValue, totalInvested, totalPnl,
    holdingRows, pieData, historicalLine, cgBars, xirrPct,
    holdingCount: holdings.length,
  };
}

// Build a simplified monthly line from transaction history (cumulative cost as proxy)
function buildHistoricalLine(
  txns: { tradeDate: Date; netAmount: { toString(): string }; transactionType: string }[],
  fallbackValue: Decimal,
): LineDatum[] {
  if (txns.length < 2) return [];
  const BUY_TYPES = new Set(['BUY', 'SIP', 'SWITCH_IN', 'DEPOSIT', 'OPENING_BALANCE']);
  const SELL_TYPES = new Set(['SELL', 'REDEMPTION', 'SWITCH_OUT', 'MATURITY', 'WITHDRAWAL']);

  const byMonth = new Map<string, Decimal>();
  let running = new Decimal(0);

  for (const t of txns) {
    const key = t.tradeDate.toISOString().slice(0, 7);
    const amt = d(t.netAmount).abs();   // netAmount may be negative for sells; normalise
    if (BUY_TYPES.has(t.transactionType))  running = running.plus(amt);
    if (SELL_TYPES.has(t.transactionType)) running = Decimal.max(running.minus(amt), new Decimal(0));
    byMonth.set(key, running);
  }

  return Array.from(byMonth.entries())
    .slice(-24)
    .map(([month, val]) => ({ label: month.slice(2), value: val.toNumber() }));
}

// ─── PDF report ───────────────────────────────────────────────────────────────

export async function streamDashboardPdf(res: Response, params: DashboardReportParams): Promise<void> {
  const portfolioIds   = await resolvePortfolioIds(params);
  const portfolioLabel = await getPortfolioLabel(params);
  const data           = await loadPortfolioData(portfolioIds);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="portfolioos-dashboard-report.pdf"');

  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'portrait', bufferPages: true });
  doc.pipe(res);

  const ML    = 40;
  const W     = doc.page.width - 80;
  const pageH = doc.page.height;
  const todayStr = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

  // ─────────────────────────────────────────────────────────────────
  // COVER HEADER
  // ─────────────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 94).fill(BRAND.ink);
  doc.font('Helvetica-Bold').fontSize(22).fillColor(BRAND.white)
     .text('PortfolioOS', ML, 22);
  doc.font('Helvetica').fontSize(11).fillColor('#94AECB')
     .text('Portfolio Report', ML, 52);
  doc.font('Helvetica').fontSize(8.5).fillColor('#94AECB')
     .text(pdfSafe(`${portfolioLabel}  ·  Generated ${todayStr}`), ML, 72);

  let cy = 110;

  // ─────────────────────────────────────────────────────────────────
  // METRIC CARDS
  // ─────────────────────────────────────────────────────────────────
  const cardGap = 8;
  const cardW = (W - cardGap * 3) / 4;
  const cardH = 50;
  const cards = [
    { label: 'Net Worth',       value: `Rs. ${fmtNum(data.totalValue.toString())}`, neg: false },
    { label: 'Total Invested',  value: `Rs. ${fmtNum(data.totalInvested.toString())}`, neg: false },
    { label: 'Unrealised P&L',  value: `${data.totalPnl.isNegative() ? '' : '+'}Rs. ${fmtNum(data.totalPnl.toString())}`, neg: data.totalPnl.isNegative() },
    { label: 'XIRR',            value: data.xirrPct ?? '—', neg: false },
  ];
  cards.forEach((c, i) => {
    const cx = ML + i * (cardW + cardGap);
    doc.rect(cx, cy, cardW, cardH).fill(BRAND.headerBg);
    doc.rect(cx, cy, 3, cardH).fill(BRAND.accent);
    doc.font('Helvetica').fontSize(7.5).fillColor(BRAND.muted)
       .text(c.label.toUpperCase(), cx + 10, cy + 9, { width: cardW - 14, characterSpacing: 0.5 });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(c.neg ? BRAND.negative : BRAND.ink)
       .text(pdfSafe(c.value), cx + 10, cy + 26, { width: cardW - 14, ellipsis: true });
  });
  cy += cardH + 18;

  // ─────────────────────────────────────────────────────────────────
  // ASSET ALLOCATION (pie + legend)
  // ─────────────────────────────────────────────────────────────────
  cy = renderSection(doc, ML, W, cy, 'Asset Allocation', (top) => {
    return drawPieChart(doc, data.pieData, { x: ML, y: top, width: W, height: 170 });
  });

  // ─────────────────────────────────────────────────────────────────
  // PORTFOLIO VALUE OVER TIME (line)
  // ─────────────────────────────────────────────────────────────────
  if (data.historicalLine.length >= 2) {
    cy = ensureSpace(doc, cy, 200);
    cy = renderSection(doc, ML, W, cy, 'Portfolio Value — Monthly (Cost Basis)', (top) => {
      return drawLineChart(doc, data.historicalLine, { x: ML, y: top, width: W, height: 160 });
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // CAPITAL GAINS BY FY (bars)
  // ─────────────────────────────────────────────────────────────────
  if (data.cgBars.length > 0) {
    const barChartH = data.cgBars.length * 20 + 10;
    cy = ensureSpace(doc, cy, barChartH + 40);
    cy = renderSection(doc, ML, W, cy, 'Capital Gains by Financial Year (STCG + LTCG)', (top) => {
      return drawHorizontalBarChart(doc, data.cgBars, { x: ML, y: top, width: W, height: barChartH });
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // HOLDINGS TABLE (new page)
  // ─────────────────────────────────────────────────────────────────
  doc.addPage();
  cy = 40;
  drawSectionHeader(doc, `Holdings (${data.holdingCount} total)`, ML, cy, W);
  cy += 22;

  const holdingCols: ColDef[] = [
    { key: 'portfolioName', header: 'Portfolio',       width: 90 },
    { key: 'assetClass',    header: 'Class',           width: 72 },
    { key: 'assetName',     header: 'Asset',           width: 130 },
    { key: 'invested',      header: 'Invested (Rs.)',  width: 88, money: true },
    { key: 'value',         header: 'Value (Rs.)',     width: 88, money: true },
    { key: 'pnl',           header: 'P&L (Rs.)',       width: 78, money: true, signed: true },
    { key: 'pctReturn',     header: '%',               width: 42, pct: true },
  ];
  const totalColW = holdingCols.reduce((s, c) => s + c.width, 0);
  const scale = W / totalColW;
  const scaledCols = holdingCols.map(c => ({ ...c, width: c.width * scale }));
  drawTable(doc, data.holdingRows, scaledCols, cy, ML, W);

  addPageNumbers(doc);
  doc.flushPages();
  doc.end();
}

// Render a section header band + body. Body is a closure that draws the section
// content starting at `top` and returns the bottom y of the rendered content.
function renderSection(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  width: number,
  y: number,
  title: string,
  body: (top: number) => number,
): number {
  drawSectionHeader(doc, title, x, y, width);
  const contentTop = y + 22;
  const bottom = body(contentTop);
  return bottom + 16;
}

// Move to next page if `needed` pixels won't fit on the current page.
function ensureSpace(doc: InstanceType<typeof PDFDocument>, cy: number, needed: number): number {
  const bottom = doc.page.height - doc.page.margins.bottom - 40;
  if (cy + needed > bottom) {
    doc.addPage();
    return 40;
  }
  return cy;
}

// ─── Excel report ─────────────────────────────────────────────────────────────

export async function streamDashboardExcel(res: Response, params: DashboardReportParams): Promise<void> {
  const portfolioIds = await resolvePortfolioIds(params);
  const portfolioLabel = await getPortfolioLabel(params);
  const data = await loadPortfolioData(portfolioIds);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PortfolioOS';
  wb.created = new Date();

  // ── Summary sheet ──────────────────────────────────────────────────────────
  const ws = wb.addWorksheet('Summary');
  ws.getCell('A1').value = 'PortfolioOS — Portfolio Report';
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = `Portfolio: ${portfolioLabel}`;
  ws.getCell('A3').value = `Generated: ${new Date().toISOString().slice(0, 10)}`;

  ws.addRow([]);
  ws.addRow(['Metric', 'Value']).font = { bold: true };
  ws.addRow(['Net Worth',       `₹${fmtNum(data.totalValue.toString())}`]);
  ws.addRow(['Total Invested',  `₹${fmtNum(data.totalInvested.toString())}`]);
  ws.addRow(['Unrealised P&L',  `₹${fmtNum(data.totalPnl.toString())}`]);
  ws.addRow(['XIRR',            data.xirrPct ?? '—']);
  ws.addRow([]);
  ws.addRow(['Asset Class', 'Value ₹', '% Allocation']).font = { bold: true };
  for (const s of data.pieData) {
    ws.addRow([s.label, s.value.toFixed(2), `${((s.value / data.totalValue.toNumber()) * 100).toFixed(1)}%`]);
  }
  ws.getColumn(1).width = 24;
  ws.getColumn(2).width = 18;

  // ── Holdings sheet ──────────────────────────────────────────────────────────
  const wh = wb.addWorksheet('Holdings');
  const hHeaders = ['Portfolio', 'Asset Class', 'Asset Name', 'Invested ₹', 'Value ₹', 'P&L ₹', '% Return'];
  wh.addRow(hHeaders).font = { bold: true };
  for (const h of data.holdingRows) {
    wh.addRow([h.portfolioName, h.assetClass, h.assetName, h.invested, h.value, h.pnl, `${h.pctReturn}%`]);
  }
  wh.getColumn(1).width = 20;
  wh.getColumn(2).width = 18;
  wh.getColumn(3).width = 36;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="portfolioos-dashboard-report.xlsx"');
  await wb.xlsx.write(res);
  res.end();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function resolvePortfolioIds(params: DashboardReportParams): Promise<string[]> {
  const portfolios = await prisma.portfolio.findMany({ where: { userId: params.userId } });
  if (params.scope === 'single' && params.portfolioId) {
    if (!portfolios.some(p => p.id === params.portfolioId)) {
      const { ForbiddenError } = await import('../../lib/errors.js');
      throw new ForbiddenError();
    }
    return [params.portfolioId];
  }
  return portfolios.map(p => p.id);
}

async function getPortfolioLabel(params: DashboardReportParams): Promise<string> {
  if (params.scope === 'single' && params.portfolioId) {
    const p = await prisma.portfolio.findUnique({ where: { id: params.portfolioId } });
    return p?.name ?? 'Portfolio';
  }
  return 'All Portfolios';
}

function truncToFit(doc: InstanceType<typeof PDFDocument>, text: string, maxWidth: number): string {
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

function drawSectionHeader(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  x: number,
  y: number,
  width: number,
): void {
  doc.rect(x, y, width, 18).fill(BRAND.ink);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND.white)
     .text(pdfSafe(text), x + 8, y + 5, { width: width - 12 });
  doc.y = y + 18;
}

interface ColDef {
  key: string; header: string; width: number;
  money?: boolean; signed?: boolean; pct?: boolean;
}

function drawTable(
  doc: InstanceType<typeof PDFDocument>,
  rows: Record<string, string>[],
  cols: ColDef[],
  startY: number,
  marginLeft: number,
  totalWidth: number,
): number {
  const ROW_H = 16;
  let y = startY;

  const drawHeader = (yy: number): void => {
    doc.rect(marginLeft, yy, totalWidth, ROW_H).fill(BRAND.ink);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.white);
    let xx = marginLeft;
    for (const col of cols) {
      doc.text(pdfSafe(col.header), xx + 4, yy + 5, { width: col.width - 8, ellipsis: true });
      xx += col.width;
    }
  };

  drawHeader(y);
  y += ROW_H;

  if (rows.length === 0) {
    doc.rect(marginLeft, y, totalWidth, 40).fill(BRAND.rowAlt);
    doc.font('Helvetica').fontSize(9).fillColor(BRAND.muted)
       .text('No holdings to display.', marginLeft, y + 14, { width: totalWidth, align: 'center' });
    return y + 50;
  }

  for (let i = 0; i < rows.length; i++) {
    if (y > doc.page.height - doc.page.margins.bottom - 30) {
      doc.addPage();
      y = 40;
      drawHeader(y);
      y += ROW_H;
    }

    if (i % 2 === 1) doc.rect(marginLeft, y, totalWidth, ROW_H).fill(BRAND.rowAlt);
    let x = marginLeft;
    doc.font('Helvetica').fontSize(8);
    for (const col of cols) {
      const raw   = rows[i]![col.key] ?? '';
      let value = String(raw);
      if (col.pct) value = `${value}%`;
      else if (col.money) value = fmtNum(value);  // no Rs. prefix in cells
      const isNeg = (col.signed || col.money) && String(raw).startsWith('-');
      doc.fillColor(isNeg ? BRAND.negative : BRAND.ink);
      const align = (col.money || col.pct) ? 'right' : 'left';
      const cellW = col.width - 8;
      // Truncate to fit current font metrics
      const safe = pdfSafe(value);
      const display = doc.widthOfString(safe) <= cellW
        ? safe
        : truncToFit(doc, safe, cellW);
      doc.text(display, x + 4, y + 5, { width: cellW, align, lineBreak: false });
      x += col.width;
    }
    y += ROW_H;
  }

  return y + 8;
}

function addPageNumbers(doc: InstanceType<typeof PDFDocument>): void {
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i);
    doc.font('Helvetica').fontSize(7).fillColor(BRAND.muted)
       .text(
         pdfSafe(`PortfolioOS  ·  Portfolio Report  ·  Page ${i + 1} of ${total}`),
         40,
         doc.page.height - 24,
         { width: doc.page.width - 80, align: 'center' },
       );
  }
}
