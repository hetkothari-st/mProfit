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
  const portfolioIds = await resolvePortfolioIds(params);
  const portfolioLabel = await getPortfolioLabel(params);
  const data = await loadPortfolioData(portfolioIds);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="portfolio-report.pdf"');

  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'portrait', bufferPages: true });
  doc.pipe(res);

  const W = doc.page.width - 80;  // usable width (margin 40 each side)
  const ML = 40;                  // margin left

  // ── Cover header ──────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 90).fill(BRAND.ink);
  doc.font('Helvetica-Bold').fontSize(22).fillColor(BRAND.white)
     .text('PortfolioOS', ML, 24);
  doc.font('Helvetica').fontSize(11).fillColor('#94AECB')
     .text('Portfolio Report', ML, 52);
  doc.font('Helvetica').fontSize(8.5).fillColor('#94AECB')
     .text(`${portfolioLabel}  ·  Generated ${new Date().toISOString().slice(0, 10)}`, ML, 70);

  // ── Summary bar ─────────────────────────────────────────────────────────────
  const sY = 106;
  const cardW = (W - 12) / 4;
  const summaryCards = [
    { label: 'Net Worth',       value: `₹${fmtNum(data.totalValue.toString())}` },
    { label: 'Total Invested',  value: `₹${fmtNum(data.totalInvested.toString())}` },
    { label: 'Unrealised P&L',  value: `₹${fmtNum(data.totalPnl.toString())}` },
    { label: 'XIRR',            value: data.xirrPct ?? '—' },
  ];
  summaryCards.forEach((card, i) => {
    const cx = ML + i * (cardW + 4);
    doc.rect(cx, sY, cardW, 44).fill(BRAND.headerBg);
    doc.font('Helvetica').fontSize(7.5).fillColor(BRAND.muted)
       .text(card.label, cx + 8, sY + 8, { width: cardW - 12 });
    const isNeg = card.value.includes('-') && card.label.includes('P&L');
    doc.font('Helvetica-Bold').fontSize(11).fillColor(isNeg ? BRAND.negative : BRAND.ink)
       .text(card.value, cx + 8, sY + 22, { width: cardW - 12 });
  });

  // ── Section: Asset Allocation ────────────────────────────────────────────────
  let cy = sY + 60;
  drawSectionHeader(doc, 'Asset Allocation', ML, cy, W);
  cy += 18;
  drawPieChart(doc, data.pieData, { x: ML, y: cy, width: W, height: 180, title: undefined });
  cy += 188;

  // ── Section: Portfolio Value Over Time ──────────────────────────────────────
  if (data.historicalLine.length >= 2) {
    checkPageBreak(doc, cy, 200);
    cy = doc.y;
    drawSectionHeader(doc, 'Portfolio Value — Monthly Cost Basis', ML, cy, W);
    cy += 18;
    drawLineChart(doc, data.historicalLine, { x: ML, y: cy, width: W, height: 160 });
    cy += 175;
  }

  // ── Section: Capital Gains Summary ──────────────────────────────────────────
  if (data.cgBars.length > 0) {
    checkPageBreak(doc, cy, 160);
    cy = doc.y;
    drawSectionHeader(doc, 'Capital Gains by Financial Year (STCG + LTCG)', ML, cy, W);
    cy += 18;
    drawHorizontalBarChart(doc, data.cgBars, { x: ML, y: cy, width: W, height: data.cgBars.length * 22 + 20 });
    cy += data.cgBars.length * 22 + 30;
  }

  // ── Section: Holdings Table ──────────────────────────────────────────────────
  doc.addPage();
  cy = 40;
  drawSectionHeader(doc, `Holdings (${data.holdingCount} total)`, ML, cy, W);
  cy += 18;

  const holdingCols = [
    { key: 'portfolioName', header: 'Portfolio', width: 90 },
    { key: 'assetClass',    header: 'Class',     width: 72 },
    { key: 'assetName',     header: 'Asset',     width: 140 },
    { key: 'invested',      header: 'Invested',  width: 72, money: true },
    { key: 'value',         header: 'Value',     width: 72, money: true },
    { key: 'pnl',           header: 'P&L',       width: 60, money: true, signed: true },
    { key: 'pctReturn',     header: '%',         width: 36, pct: true },
  ];

  const totalColW = holdingCols.reduce((s, c) => s + c.width, 0);
  const scale = W / totalColW;
  const scaledCols = holdingCols.map(c => ({ ...c, width: c.width * scale }));

  cy = drawTable(doc, data.holdingRows, scaledCols, cy, ML, W);

  addPageNumbers(doc);
  doc.flushPages();
  doc.end();
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
  res.setHeader('Content-Disposition', 'attachment; filename="portfolio-report.xlsx"');
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

function drawSectionHeader(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  x: number,
  y: number,
  width: number,
): void {
  doc.rect(x, y, width, 15).fill(BRAND.headerBg);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BRAND.ink)
     .text(text, x + 6, y + 3.5, { width: width - 12 });
  doc.y = y + 15;
}

function checkPageBreak(doc: InstanceType<typeof PDFDocument>, cy: number, needed: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom - 40;
  if (cy + needed > bottom) {
    doc.addPage();
    doc.y = 40;
  }
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
  const ROW_H = 14;
  let y = startY;

  // Header
  doc.rect(marginLeft, y, totalWidth, ROW_H).fill(BRAND.headerBg);
  let x = marginLeft;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.ink);
  for (const col of cols) {
    doc.text(col.header, x + 3, y + 3, { width: col.width - 6, ellipsis: true });
    x += col.width;
  }
  y += ROW_H;

  for (let i = 0; i < rows.length; i++) {
    if (y > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
      y = 40;
      // Repeat header
      doc.rect(marginLeft, y, totalWidth, ROW_H).fill(BRAND.headerBg);
      x = marginLeft;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.ink);
      for (const col of cols) {
        doc.text(col.header, x + 3, y + 3, { width: col.width - 6, ellipsis: true });
        x += col.width;
      }
      y += ROW_H;
    }

    if (i % 2 === 1) doc.rect(marginLeft, y, totalWidth, ROW_H).fill(BRAND.rowAlt);
    x = marginLeft;
    doc.font('Helvetica').fontSize(7.5);
    for (const col of cols) {
      const raw   = rows[i]![col.key] ?? '';
      const value = col.pct ? `${raw}%` : raw;
      const isNeg = (col.signed || col.money) && String(raw).startsWith('-');
      doc.fillColor(isNeg ? BRAND.negative : BRAND.ink);
      const align = (col.money || col.pct) ? 'right' : 'left';
      doc.text(value, x + 3, y + 3, { width: col.width - 6, ellipsis: true, align });
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
         `PortfolioOS  ·  Page ${i + 1} of ${total}`,
         40,
         doc.page.height - 28,
         { width: doc.page.width - 80, align: 'center' },
       );
  }
}
