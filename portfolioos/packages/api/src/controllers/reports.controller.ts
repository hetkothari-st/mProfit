import type { Request, Response } from 'express';
import type ExcelJSType from 'exceljs';
import { prisma } from '../lib/prisma.js';
import { ok } from '../lib/response.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import {
  intradayReport,
  stcgReport,
  ltcgReport,
  schedule112AReport,
  incomeReport,
  unrealisedReport,
  historicalValuation,
  portfolioSummary,
} from '../services/reports.service.js';
import {
  computePortfolioXirr,
  computeRollingXirr,
  computeUserXirr,
} from '../services/xirr.service.js';
import { persistCapitalGainsForPortfolio } from '../services/capitalGains.service.js';
import { streamExcel, streamPdf, fmtNum, fmtDate, type ExportColumn, type ExportPayload } from '../services/export.service.js';
import { buildHoldingsExport } from '../services/reportBuilder/holdingsReport.js';
import { streamDashboardPdf, streamDashboardExcel, type DashboardScope } from '../services/reportBuilder/dashboardReport.js';
import type { AssetClass } from '@prisma/client';

async function assertOwnedPortfolio(req: Request): Promise<string> {
  const userId = req.user!.id;
  const portfolioId = (req.query.portfolioId as string | undefined) ?? (req.params.portfolioId as string | undefined);
  if (!portfolioId) throw new BadRequestError('portfolioId required');
  const p = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
  if (!p) throw new NotFoundError('Portfolio not found');
  if (p.userId !== userId) throw new ForbiddenError();
  return portfolioId;
}

function getFy(req: Request): string | undefined {
  const fy = req.query.fy as string | undefined;
  return fy?.trim() || undefined;
}

function getFormat(req: Request): 'json' | 'xlsx' | 'pdf' {
  const f = (req.query.format as string | undefined)?.toLowerCase();
  if (f === 'xlsx' || f === 'excel') return 'xlsx';
  if (f === 'pdf') return 'pdf';
  return 'json';
}

// ─── Handlers ─────────────────────────────────────────────────────

export async function getSummary(req: Request, res: Response) {
  const portfolioId = await assertOwnedPortfolio(req);
  const data = await portfolioSummary(portfolioId);
  ok(res, data);
}

export async function getIntraday(req: Request, res: Response) {
  const portfolioId = await assertOwnedPortfolio(req);
  const fy = getFy(req);
  const data = await intradayReport(portfolioId, fy);
  if (getFormat(req) === 'json') return ok(res, data);
  await exportCapitalGains(req, res, 'Intraday', data, fy);
}

export async function getStcg(req: Request, res: Response) {
  const portfolioId = await assertOwnedPortfolio(req);
  const fy = getFy(req);
  const data = await stcgReport(portfolioId, fy);
  if (getFormat(req) === 'json') return ok(res, data);
  await exportCapitalGains(req, res, 'Short-Term Capital Gains', data, fy);
}

export async function getLtcg(req: Request, res: Response) {
  const portfolioId = await assertOwnedPortfolio(req);
  const fy = getFy(req);
  const data = await ltcgReport(portfolioId, fy);
  if (getFormat(req) === 'json') return ok(res, data);
  await exportCapitalGains(req, res, 'Long-Term Capital Gains', data, fy);
}

export async function get112A(req: Request, res: Response) {
  const portfolioId = await assertOwnedPortfolio(req);
  const fy = getFy(req);
  const data = await schedule112AReport(portfolioId, fy);
  if (getFormat(req) === 'json') return ok(res, data);
  await exportCapitalGains(req, res, 'Schedule 112A', data, fy);
}

export async function getIncome(req: Request, res: Response) {
  const portfolioId = await assertOwnedPortfolio(req);
  const fy = getFy(req);
  const data = await incomeReport(portfolioId, fy);
  if (getFormat(req) === 'json') return ok(res, data);
  const columns: ExportColumn[] = [
    { key: 'date', header: 'Date', width: 12, formatter: fmtDate },
    { key: 'type', header: 'Type', width: 14 },
    { key: 'assetName', header: 'Asset', width: 40 },
    { key: 'amount', header: 'Amount', width: 16, formatter: (v) => fmtNum(v) },
    { key: 'narration', header: 'Narration', width: 40 },
  ];
  await emit(req, res, {
    title: `Income Report${fy ? ` ${fy}` : ''}`,
    columns,
    rows: data.rows,
    meta: fy ? { 'Financial Year': fy } : undefined,
    footer: {
      Dividends: fmtNum(data.dividend),
      Interest: fmtNum(data.interest),
      Maturity: fmtNum(data.maturity),
      Total: fmtNum(data.total),
    },
  });
}

export async function getUnrealised(req: Request, res: Response) {
  const portfolioId = await assertOwnedPortfolio(req);
  const data = await unrealisedReport(portfolioId);
  if (getFormat(req) === 'json') return ok(res, data);
  const columns: ExportColumn[] = [
    { key: 'assetClass', header: 'Class', width: 14 },
    { key: 'assetName', header: 'Asset', width: 34 },
    { key: 'quantity', header: 'Qty', width: 10, formatter: (v) => fmtNum(v, 4) },
    { key: 'avgCostPrice', header: 'Avg Cost', width: 12, formatter: (v) => fmtNum(v) },
    { key: 'currentPrice', header: 'CMP', width: 12, formatter: (v) => fmtNum(v) },
    { key: 'totalCost', header: 'Invested', width: 14, formatter: (v) => fmtNum(v) },
    { key: 'currentValue', header: 'Value', width: 14, formatter: (v) => fmtNum(v) },
    { key: 'unrealisedPnL', header: 'P&L', width: 14, formatter: (v) => fmtNum(v) },
    { key: 'pctReturn', header: '% Rtn', width: 10, formatter: (v) => `${v}%` },
  ];
  await emit(req, res, {
    title: 'Unrealised P&L',
    columns,
    rows: data.rows,
    footer: {
      'Total Cost': fmtNum(data.totalCost),
      'Total Value': fmtNum(data.totalValue),
      'Unrealised P&L': fmtNum(data.unrealisedPnL),
    },
  });
}

export async function getXirr(req: Request, res: Response) {
  const portfolioId = await assertOwnedPortfolio(req);
  const overall = await computePortfolioXirr(portfolioId);
  const oneY = await computeRollingXirr(portfolioId, 1);
  const threeY = await computeRollingXirr(portfolioId, 3);
  const fiveY = await computeRollingXirr(portfolioId, 5);
  ok(res, { overall, oneYear: oneY, threeYear: threeY, fiveYear: fiveY });
}

export async function getUserXirr(req: Request, res: Response) {
  const userId = req.user!.id;
  const data = await computeUserXirr(userId);
  ok(res, data);
}

export async function getHistoricalValuation(req: Request, res: Response) {
  const portfolioId = await assertOwnedPortfolio(req);
  const granularity = (req.query.granularity as string | undefined) === 'QUARTERLY'
    ? 'QUARTERLY'
    : 'MONTHLY';
  const data = await historicalValuation(portfolioId, granularity);
  ok(res, data);
}

export async function rebuildCapitalGains(req: Request, res: Response) {
  const portfolioId = await assertOwnedPortfolio(req);
  const count = await persistCapitalGainsForPortfolio(portfolioId);
  ok(res, { persisted: count });
}

// ─── Holdings / Transactions export (per-section download) ───────────────────

export async function getHoldingsExport(req: Request, res: Response) {
  const userId = req.user!.id;

  // portfolioIds: comma-separated list, or empty for all
  const rawIds  = (req.query.portfolioIds as string | undefined) ?? '';
  const portfolioIds = rawIds ? rawIds.split(',').map(s => s.trim()).filter(Boolean) : [];

  // Verify ownership of every requested portfolio
  if (portfolioIds.length > 0) {
    const owned = await prisma.portfolio.findMany({
      where: { id: { in: portfolioIds }, userId },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map(p => p.id));
    for (const id of portfolioIds) {
      if (!ownedSet.has(id)) throw new ForbiddenError();
    }
  }

  const rawClasses = (req.query.assetClasses as string | undefined) ?? '';
  const assetClasses = rawClasses
    ? (rawClasses.split(',').map(s => s.trim()).filter(Boolean) as AssetClass[])
    : undefined;

  const format = getFormat(req);
  const { holdingsPayload, transactionsPayload, summaryTitle } = await buildHoldingsExport({
    userId,
    portfolioIds,
    assetClasses,
  });

  if (format === 'xlsx') {
    // Multi-sheet workbook
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PortfolioOS';
    wb.created = new Date();

    function addSheet(ws: ExcelJSType.Worksheet, payload: ExportPayload) {
      ws.getCell(1, 1).value = payload.title;
      ws.getCell(1, 1).font = { bold: true, size: 13 };
      let row = 2;
      if (payload.meta) {
        for (const [k, v] of Object.entries(payload.meta)) {
          ws.getCell(row, 1).value = k;
          ws.getCell(row, 1).font = { bold: true };
          ws.getCell(row, 2).value = String(v);
          row++;
        }
        row++;
      }
      const headerRow = ws.getRow(row);
      payload.columns.forEach((col, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = col.header;
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
        if (col.width) ws.getColumn(i + 1).width = col.width;
      });
      row++;
      for (const data of payload.rows) {
        const r = ws.getRow(row);
        payload.columns.forEach((col, i) => {
          const raw = data[col.key];
          r.getCell(i + 1).value = col.formatter ? col.formatter(raw) : (raw as ExcelJSType.CellValue);
        });
        row++;
      }
      if (payload.footer) {
        row++;
        for (const [k, v] of Object.entries(payload.footer)) {
          ws.getCell(row, 1).value = k; ws.getCell(row, 1).font = { bold: true };
          ws.getCell(row, 2).value = String(v); row++;
        }
      }
    }

    addSheet(wb.addWorksheet('Holdings'), holdingsPayload);
    addSheet(wb.addWorksheet('Transactions'), transactionsPayload);

    const safeName = summaryTitle.replace(/[^a-z0-9-_]+/gi, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
    return;
  }

  if (format === 'pdf') {
    // PDF: holdings first, then transactions
    const PDFDocumentClass = (await import('pdfkit')).default;
    const { BRAND } = await import('../services/charts/pdfCharts.js');

    const safeTitle = summaryTitle.replace(/[^a-z0-9-_]+/gi, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.pdf"`);

    const doc = new PDFDocumentClass({ margin: 36, size: 'A4', layout: 'landscape', bufferPages: true });
    doc.pipe(res);

    // Render each sheet as a section — reuse streamPdf logic inline
    for (const payload of [holdingsPayload, transactionsPayload]) {
      if (doc.bufferedPageRange().count > 0) doc.addPage();
      const ML   = doc.page.margins.left;
      const pageW = doc.page.width - ML - doc.page.margins.right;
      doc.rect(0, 0, doc.page.width, 48).fill(BRAND.ink);
      doc.font('Helvetica-Bold').fontSize(14).fillColor(BRAND.white).text('PortfolioOS', ML, 10);
      doc.font('Helvetica').fontSize(9).fillColor('#94AECB').text(payload.title, ML, 30);
      doc.y = 58;

      if (payload.meta) {
        doc.font('Helvetica').fontSize(8).fillColor(BRAND.muted);
        Object.entries(payload.meta).forEach(([k, v]) => doc.text(`${k}: ${v}`));
        doc.moveDown(0.4);
      }

      const totalW    = payload.columns.reduce((s, c) => s + (c.width ?? 10), 0) || payload.columns.length;
      const colWidths = payload.columns.map(c => ((c.width ?? 10) / totalW) * pageW);
      const ROW_H     = 14;

      const drawRow = (values: string[], opts: { bold?: boolean; alt?: boolean }) => {
        const y = doc.y;
        if (opts.bold)       doc.rect(ML, y, pageW, ROW_H).fill(BRAND.headerBg);
        else if (opts.alt)   doc.rect(ML, y, pageW, ROW_H).fill(BRAND.rowAlt);
        doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor(BRAND.ink);
        let x = ML;
        for (let i = 0; i < values.length; i++) {
          doc.text(values[i] ?? '', x + 3, y + 3, { width: (colWidths[i] ?? 80) - 5, ellipsis: true });
          x += colWidths[i] ?? 80;
        }
        doc.y = y + ROW_H;
        if (doc.y > doc.page.height - doc.page.margins.bottom - 30) {
          doc.addPage(); doc.y = 36;
          const hy = doc.y;
          doc.rect(ML, hy, pageW, ROW_H).fill(BRAND.headerBg);
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.ink);
          let hx = ML;
          payload.columns.forEach((col, i) => {
            doc.text(col.header, hx + 3, hy + 3, { width: (colWidths[i] ?? 80) - 5, ellipsis: true });
            hx += colWidths[i] ?? 80;
          });
          doc.y = hy + ROW_H;
        }
      };

      drawRow(payload.columns.map(c => c.header), { bold: true });
      payload.rows.forEach((data, idx) => {
        const values = payload.columns.map(col => {
          const raw = data[col.key];
          if (col.formatter) return col.formatter(raw);
          return raw == null ? '' : String(raw);
        });
        drawRow(values, { alt: idx % 2 === 1 });
      });

      if (payload.footer) {
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND.ink);
        for (const [k, v] of Object.entries(payload.footer)) {
          doc.text(`${k}: ${v}`);
        }
      }
    }

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.font('Helvetica').fontSize(6.5).fillColor(BRAND.muted).text(
        `PortfolioOS  ·  Page ${i + 1} of ${range.count}`,
        36, doc.page.height - 20, { width: doc.page.width - 72, align: 'center' },
      );
    }
    doc.flushPages();
    doc.end();
    return;
  }

  ok(res, { holdings: holdingsPayload.rows.length, transactions: transactionsPayload.rows.length });
}

// ─── Dashboard export ─────────────────────────────────────────────────────────

export async function getDashboardExport(req: Request, res: Response) {
  const userId      = req.user!.id;
  const portfolioId = req.query.portfolioId as string | undefined;
  const rawScope    = (req.query.scope as string | undefined) ?? 'all';
  const scope: DashboardScope = rawScope === 'single' ? 'single' : rawScope === 'per-portfolio' ? 'per-portfolio' : 'all';

  // If scope = single, verify portfolio ownership
  if (scope === 'single' && portfolioId) {
    const p = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
    if (!p) throw new NotFoundError('Portfolio not found');
    if (p.userId !== userId) throw new ForbiddenError();
  }

  const format = getFormat(req);

  if (format === 'xlsx') {
    await streamDashboardExcel(res, { userId, portfolioId, scope });
    return;
  }

  // PDF (default)
  await streamDashboardPdf(res, { userId, portfolioId, scope });
}

// ─── Specialized section exports (Vehicles / Insurance / Loans / Credit Cards / Rental) ─────

type SectionType = 'vehicles' | 'insurance' | 'loans' | 'credit-cards' | 'rental';

export async function getSectionExport(req: Request, res: Response) {
  const userId  = req.user!.id;
  const section = (req.query.section as string | undefined) as SectionType | undefined;
  const format  = getFormat(req);

  if (!section || !['vehicles', 'insurance', 'loans', 'credit-cards', 'rental'].includes(section)) {
    throw new BadRequestError('section must be one of: vehicles, insurance, loans, credit-cards, rental');
  }

  let payload: Parameters<typeof streamExcel>[1];

  switch (section) {
    case 'vehicles': {
      const rows = await prisma.vehicle.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
      payload = {
        title: 'Vehicles',
        meta: { 'Generated On': new Date().toISOString().slice(0, 10), 'Total': String(rows.length) },
        columns: [
          { key: 'registrationNo', header: 'Reg No',       width: 14 },
          { key: 'make',           header: 'Make',          width: 14 },
          { key: 'model',          header: 'Model',         width: 16 },
          { key: 'manufacturingYear', header: 'Year',       width: 6 },
          { key: 'fuelType',       header: 'Fuel',          width: 10 },
          { key: 'ownerName',      header: 'Owner',         width: 20 },
          { key: 'purchasePrice',  header: 'Purchase Price',width: 14, formatter: v => fmtNum(v) },
          { key: 'currentValue',   header: 'Current Value', width: 14, formatter: v => fmtNum(v) },
          { key: 'insuranceExpiry',header: 'Ins. Expiry',   width: 12, formatter: fmtDate },
          { key: 'pucExpiry',      header: 'PUC Expiry',    width: 12, formatter: fmtDate },
          { key: 'fitnessExpiry',  header: 'Fitness Expiry',width: 12, formatter: fmtDate },
        ],
        rows: rows.map(v => ({ ...v, purchasePrice: v.purchasePrice?.toString(), currentValue: v.currentValue?.toString() })),
      };
      break;
    }
    case 'insurance': {
      const rows = await prisma.insurancePolicy.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
      payload = {
        title: 'Insurance Policies',
        meta: { 'Generated On': new Date().toISOString().slice(0, 10), 'Total': String(rows.length) },
        columns: [
          { key: 'insurer',          header: 'Insurer',       width: 18 },
          { key: 'type',             header: 'Type',          width: 14 },
          { key: 'planName',         header: 'Plan',          width: 20 },
          { key: 'policyHolder',     header: 'Policy Holder', width: 20 },
          { key: 'sumAssured',       header: 'Sum Assured',   width: 14, formatter: v => fmtNum(v) },
          { key: 'premiumAmount',    header: 'Premium',       width: 12, formatter: v => fmtNum(v) },
          { key: 'premiumFrequency', header: 'Frequency',     width: 12 },
          { key: 'startDate',        header: 'Start Date',    width: 12, formatter: fmtDate },
          { key: 'maturityDate',     header: 'Maturity Date', width: 12, formatter: fmtDate },
          { key: 'nextPremiumDue',   header: 'Next Due',      width: 12, formatter: fmtDate },
          { key: 'status',           header: 'Status',        width: 10 },
        ],
        rows: rows.map(r => ({ ...r, sumAssured: r.sumAssured.toString(), premiumAmount: r.premiumAmount.toString() })),
      };
      break;
    }
    case 'loans': {
      const rows = await prisma.loan.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
      payload = {
        title: 'Loans',
        meta: { 'Generated On': new Date().toISOString().slice(0, 10), 'Total': String(rows.length) },
        columns: [
          { key: 'lenderName',       header: 'Lender',          width: 20 },
          { key: 'loanType',         header: 'Type',            width: 12 },
          { key: 'borrowerName',     header: 'Borrower',        width: 20 },
          { key: 'principalAmount',  header: 'Principal',       width: 14, formatter: v => fmtNum(v) },
          { key: 'interestRate',     header: 'Rate %',          width: 10, formatter: v => fmtNum(v, 2) },
          { key: 'tenureMonths',     header: 'Tenure (m)',      width: 10 },
          { key: 'emiAmount',        header: 'EMI',             width: 12, formatter: v => fmtNum(v) },
          { key: 'disbursementDate', header: 'Disbursed',       width: 12, formatter: fmtDate },
          { key: 'status',           header: 'Status',          width: 12 },
        ],
        rows: rows.map(r => ({ ...r, principalAmount: r.principalAmount.toString(), emiAmount: r.emiAmount.toString(), interestRate: r.interestRate.toString() })),
      };
      break;
    }
    case 'credit-cards': {
      const rows = await prisma.creditCard.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
      payload = {
        title: 'Credit Cards',
        meta: { 'Generated On': new Date().toISOString().slice(0, 10), 'Total': String(rows.length) },
        columns: [
          { key: 'cardName',       header: 'Card',          width: 20 },
          { key: 'bankName',       header: 'Bank',          width: 18 },
          { key: 'last4Digits',    header: 'Last 4',        width: 8 },
          { key: 'creditLimit',    header: 'Limit',         width: 14, formatter: v => fmtNum(v) },
          { key: 'billingCycleDay',header: 'Billing Day',   width: 10 },
          { key: 'dueDayOffset',   header: 'Due Day',       width: 10 },
          { key: 'isActive',       header: 'Active',        width: 8, formatter: v => v ? 'Yes' : 'No' },
        ],
        rows: rows.map(r => ({ ...r, creditLimit: r.creditLimit?.toString() ?? '' })),
      };
      break;
    }
    case 'rental': {
      const rows = await prisma.rentalProperty.findMany({
        where: { userId },
        include: { tenancies: { where: { isActive: true }, take: 1, orderBy: { startDate: 'desc' } } },
        orderBy: { createdAt: 'desc' },
      });
      payload = {
        title: 'Rental Properties',
        meta: { 'Generated On': new Date().toISOString().slice(0, 10), 'Total': String(rows.length) },
        columns: [
          { key: 'name',            header: 'Property',       width: 24 },
          { key: 'propertyType',    header: 'Type',           width: 14 },
          { key: 'address',         header: 'Address',        width: 30 },
          { key: 'purchasePrice',   header: 'Purchase Price', width: 14, formatter: v => fmtNum(v) },
          { key: 'currentValue',    header: 'Current Value',  width: 14, formatter: v => fmtNum(v) },
          { key: 'tenantName',      header: 'Tenant',         width: 20 },
          { key: 'monthlyRent',     header: 'Monthly Rent',   width: 14, formatter: v => fmtNum(v) },
          { key: 'tenancyStart',    header: 'Tenancy Start',  width: 12, formatter: fmtDate },
          { key: 'isActive',        header: 'Active',         width: 8, formatter: v => v ? 'Yes' : 'No' },
        ],
        rows: rows.map(r => {
          const t = r.tenancies[0];
          return {
            name: r.name,
            propertyType: r.propertyType,
            address: r.address ?? '',
            purchasePrice: r.purchasePrice?.toString() ?? '',
            currentValue: r.currentValue?.toString() ?? '',
            tenantName: t?.tenantName ?? '—',
            monthlyRent: t?.monthlyRent.toString() ?? '',
            tenancyStart: t?.startDate ?? '',
            isActive: r.isActive,
          };
        }),
      };
      break;
    }
  }

  if (format === 'xlsx') return streamExcel(res, payload);
  if (format === 'pdf')  return streamPdf(res, payload);
  ok(res, payload);
}

// ─── Shared export helpers ────────────────────────────────────────

async function exportCapitalGains(
  req: Request,
  res: Response,
  title: string,
  data: { rows: Array<unknown>; totalGain?: string; taxable?: string; exemptionLimit?: string },
  fy?: string,
) {
  const columns: ExportColumn[] = [
    { key: 'assetName', header: 'Asset', width: 30 },
    { key: 'isin', header: 'ISIN', width: 14 },
    { key: 'buyDate', header: 'Buy Date', width: 12, formatter: fmtDate },
    { key: 'sellDate', header: 'Sell Date', width: 12, formatter: fmtDate },
    { key: 'quantity', header: 'Qty', width: 10, formatter: (v) => fmtNum(v, 4) },
    { key: 'buyPrice', header: 'Buy Price', width: 12, formatter: (v) => fmtNum(v) },
    { key: 'sellPrice', header: 'Sell Price', width: 12, formatter: (v) => fmtNum(v) },
    { key: 'buyAmount', header: 'Cost', width: 14, formatter: (v) => fmtNum(v) },
    { key: 'sellAmount', header: 'Proceeds', width: 14, formatter: (v) => fmtNum(v) },
    { key: 'gainLoss', header: 'Gain/Loss', width: 14, formatter: (v) => fmtNum(v) },
    { key: 'taxableGain', header: 'Taxable', width: 14, formatter: (v) => fmtNum(v) },
    { key: 'financialYear', header: 'FY', width: 10 },
  ];
  const normalized = data.rows.map((raw) => {
    const r = raw as Record<string, { toString?: () => string } | unknown>;
    return {
      assetName: r.assetName,
      isin: r.isin,
      buyDate: r.buyDate,
      sellDate: r.sellDate,
      quantity: (r.quantity as { toString?: () => string })?.toString?.() ?? r.quantity,
      buyPrice: (r.buyPrice as { toString?: () => string })?.toString?.() ?? r.buyPrice,
      sellPrice: (r.sellPrice as { toString?: () => string })?.toString?.() ?? r.sellPrice,
      buyAmount: (r.buyAmount as { toString?: () => string })?.toString?.() ?? r.buyAmount,
      sellAmount: (r.sellAmount as { toString?: () => string })?.toString?.() ?? r.sellAmount,
      gainLoss: (r.gainLoss as { toString?: () => string })?.toString?.() ?? r.gainLoss,
      taxableGain: (r.taxableGain as { toString?: () => string })?.toString?.() ?? r.taxableGain,
      financialYear: r.financialYear,
    };
  });

  const footer: Record<string, string> = {};
  if (data.totalGain !== undefined) footer['Total Gain/Loss'] = fmtNum(data.totalGain);
  if (data.exemptionLimit !== undefined) footer['Section 112A Exemption'] = fmtNum(data.exemptionLimit);
  if (data.taxable !== undefined) footer['Taxable'] = fmtNum(data.taxable);

  await emit(req, res, {
    title: `${title}${fy ? ` FY ${fy}` : ''}`,
    columns,
    rows: normalized,
    meta: fy ? { 'Financial Year': fy } : undefined,
    footer,
  });
}

async function emit(
  req: Request,
  res: Response,
  payload: Parameters<typeof streamExcel>[1],
): Promise<void> {
  const format = getFormat(req);
  if (format === 'xlsx') return streamExcel(res, payload);
  if (format === 'pdf') return streamPdf(res, payload);
  ok(res, payload);
}
