import type { Request, Response } from 'express';
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
import { streamExcel, streamPdf, fmtNum, fmtDate, type ExportColumn } from '../services/export.service.js';

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
