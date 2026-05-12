/**
 * Statement-style Capital Gains report.
 *
 * Renders the user's FIFO-matched realised gains as three sectioned sub-tables
 * (Intraday · STCG · LTCG) for the requested FY, with a portfolio-level FY
 * summary in the footer cards. Follows the standard column ordering used in
 * Indian portfolio tax statements:
 *
 *   Asset · ISIN · Qty · Buy Date · Buy Price · Cost · Sell Date · Sell Price ·
 *   Sale Proceeds · Holding Days · Gain / Loss
 */

import { Decimal } from 'decimal.js';
import { prisma } from '../../../lib/prisma.js';
import { computeFIFOGains, financialYearOf } from '../../capitalGains.service.js';
import { fmtNum, fmtDate, type ExportPayload, type ExportSection } from '../../export.service.js';

export interface CapitalGainsStatementParams {
  userId: string;
  portfolioIds: string[];
  fy?: string; // e.g. "2024-25" — undefined means all FYs
  kind: 'all' | 'intraday' | 'stcg' | 'ltcg';
}

const KIND_LABEL: Record<CapitalGainsStatementParams['kind'], string> = {
  all: 'Capital Gains Statement',
  intraday: 'Intraday Capital Gains',
  stcg: 'Short-Term Capital Gains',
  ltcg: 'Long-Term Capital Gains',
};

const GAIN_COLUMNS = [
  { key: 'asset', header: 'Asset', width: 20 },
  { key: 'isin', header: 'ISIN', width: 11 },
  { key: 'portfolio', header: 'Portfolio', width: 11 },
  { key: 'qty', header: 'Qty', width: 7 },
  { key: 'buyDate', header: 'Buy Date', width: 9 },
  { key: 'buyPrice', header: 'Buy Price', width: 10 },
  { key: 'cost', header: 'Cost', width: 11 },
  { key: 'sellDate', header: 'Sell Date', width: 9 },
  { key: 'sellPrice', header: 'Sell Price', width: 10 },
  { key: 'proceeds', header: 'Proceeds', width: 11 },
  { key: 'days', header: 'Days', width: 6 },
  { key: 'gainLoss', header: 'Gain / Loss', width: 12 },
];

export async function buildCapitalGainsStatement(
  params: CapitalGainsStatementParams,
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

  const txs = await prisma.transaction.findMany({
    where: { portfolioId: { in: portfolioIds } },
    orderBy: { tradeDate: 'asc' },
  });
  let allRows = computeFIFOGains(txs);

  if (params.fy) {
    allRows = allRows.filter((r) => r.financialYear === params.fy);
  }

  // Bucket by capital-gain type.
  const buckets = {
    intraday: allRows.filter((r) => r.capitalGainType === 'INTRADAY'),
    stcg: allRows.filter((r) => r.capitalGainType === 'SHORT_TERM'),
    ltcg: allRows.filter((r) => r.capitalGainType === 'LONG_TERM'),
  };

  // Totals per bucket.
  const totals = {
    intraday: sumGain(buckets.intraday),
    stcg: sumGain(buckets.stcg),
    ltcg: sumGain(buckets.ltcg),
  };
  const grand = totals.intraday.plus(totals.stcg).plus(totals.ltcg);

  function toRow(r: (typeof allRows)[number]): Record<string, unknown> {
    const cost = new Decimal(r.buyAmount.toString());
    const proceeds = new Decimal(r.sellAmount.toString());
    const gain = new Decimal(r.gainLoss.toString());
    const days = Math.max(
      1,
      Math.round((r.sellDate.getTime() - r.buyDate.getTime()) / 86_400_000),
    );
    return {
      asset: r.assetName ?? '—',
      isin: r.isin ?? '',
      portfolio: portfolioName.get(r.portfolioId) ?? '',
      qty: fmtNum(new Decimal(r.quantity.toString()).toFixed(4)),
      buyDate: fmtDate(r.buyDate),
      buyPrice: fmtNum(new Decimal(r.buyPrice.toString()).toFixed(4)),
      cost: fmtNum(cost.toFixed(2)),
      sellDate: fmtDate(r.sellDate),
      sellPrice: fmtNum(new Decimal(r.sellPrice.toString()).toFixed(4)),
      proceeds: fmtNum(proceeds.toFixed(2)),
      days,
      gainLoss: `${gain.gte(0) ? '' : ''}${fmtNum(gain.toFixed(2))}`,
    };
  }

  function buildSection(
    title: string,
    rows: typeof allRows,
    total: Decimal,
  ): ExportSection {
    const mapped = rows.map(toRow);
    if (mapped.length > 0) {
      mapped.push({
        asset: 'Total',
        isin: '',
        portfolio: '',
        qty: '',
        buyDate: '',
        buyPrice: '',
        cost: '',
        sellDate: '',
        sellPrice: '',
        proceeds: '',
        days: '',
        gainLoss: `${total.gte(0) ? '' : ''}${fmtNum(total.toFixed(2))}`,
      });
    }
    return {
      title,
      columns: GAIN_COLUMNS,
      rows: mapped,
      emptyMessage: 'No transactions matched for this section.',
    };
  }

  // Pick which sections to render based on `kind`.
  const sections: ExportSection[] = [];
  if (params.kind === 'all' || params.kind === 'intraday') {
    sections.push(buildSection('Intraday (Speculative) — §43(5)', buckets.intraday, totals.intraday));
  }
  if (params.kind === 'all' || params.kind === 'stcg') {
    sections.push(buildSection('Short-Term Capital Gains', buckets.stcg, totals.stcg));
  }
  if (params.kind === 'all' || params.kind === 'ltcg') {
    sections.push(buildSection('Long-Term Capital Gains', buckets.ltcg, totals.ltcg));
  }

  // FY summary boxes — only show buckets relevant to the picked kind.
  const footer: Record<string, string> = {};
  if (params.kind === 'all' || params.kind === 'intraday') {
    footer.Intraday = `${totals.intraday.gte(0) ? '+' : ''}₹${fmtNum(totals.intraday.toFixed(2))}`;
  }
  if (params.kind === 'all' || params.kind === 'stcg') {
    footer.STCG = `${totals.stcg.gte(0) ? '+' : ''}₹${fmtNum(totals.stcg.toFixed(2))}`;
  }
  if (params.kind === 'all' || params.kind === 'ltcg') {
    footer.LTCG = `${totals.ltcg.gte(0) ? '+' : ''}₹${fmtNum(totals.ltcg.toFixed(2))}`;
  }
  if (params.kind === 'all') {
    footer['Net Realised'] = `${grand.gte(0) ? '+' : ''}₹${fmtNum(grand.toFixed(2))}`;
  }

  // First section is the main table; remaining go into additionalSections.
  const [main, ...rest] = sections;
  const portfolioLabel = portfolios.length === 1
    ? portfolios[0]!.name
    : `${portfolios.length} portfolios`;
  const fyLabel = params.fy ?? 'All FYs';

  return {
    title: KIND_LABEL[params.kind],
    subtitle: `Financial year ${fyLabel}`,
    meta: {
      Portfolio: portfolioLabel,
      'Financial Year': fyLabel,
      Sells: String(allRows.length),
    },
    footer,
    columns: main?.columns ?? GAIN_COLUMNS,
    rows: main?.rows ?? [],
    mainSectionLabel: main?.title ?? 'Capital Gains',
    additionalSections: rest,
    filenameStem: `portfolioos-${params.kind}-statement-${fyLabel.replace(/[^a-z0-9-]+/gi, '_')}`,
  };
}

function sumGain(rows: ReturnType<typeof computeFIFOGains>): Decimal {
  return rows.reduce((s, r) => s.plus(new Decimal(r.gainLoss.toString())), new Decimal(0));
}
