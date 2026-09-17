/**
 * Statement-style Income report.
 *
 * Lists every dividend, interest, and maturity credit for the selected
 * portfolio(s) and FY, split into three sections (one per income type)
 * with subtotals, plus FY-level totals in the footer cards. Standard
 * Indian portfolio income-statement column ordering:
 *
 *   Date · Asset · ISIN · Portfolio · Type · Amount · Narration
 */

import { Decimal } from 'decimal.js';
import { prisma } from '../../../lib/prisma.js';
import { investmentIncome, type IncomeRow } from '../../investmentIncome.service.js';
import { fmtNum, fmtDate, type ExportPayload, type ExportSection } from '../../export.service.js';

export interface IncomeStatementParams {
  userId: string;
  portfolioIds: string[];
  fy?: string;
}

const TYPE_LABEL: Record<string, string> = {
  DIVIDEND_PAYOUT: 'Dividend',
  INTEREST_RECEIVED: 'Interest',
  MATURITY: 'Maturity Proceeds',
};

const COLUMNS = [
  { key: 'date', header: 'Date', width: 9 },
  { key: 'asset', header: 'Asset', width: 24 },
  { key: 'isin', header: 'ISIN', width: 11 },
  { key: 'portfolio', header: 'Portfolio', width: 13 },
  { key: 'type', header: 'Type', width: 11 },
  { key: 'amount', header: 'Amount', width: 13 },
  { key: 'narration', header: 'Narration', width: 19 },
];

export async function buildIncomeStatement(
  params: IncomeStatementParams,
): Promise<ExportPayload> {
  const portfolios = await prisma.portfolio.findMany({
    where: {
      userId: params.userId,
      ...(params.portfolioIds.length > 0 ? { id: { in: params.portfolioIds } } : {}),
    },
    select: { id: true, name: true },
  });
  const portfolioIds = portfolios.map((p) => p.id);

  // Amounts in INR, including dividends/interest confirmed from bank emails.
  const income = await investmentIncome({ id: { in: portfolioIds } }, params.fy);
  const filtered = income.rows;

  const buckets = {
    DIVIDEND_PAYOUT: filtered.filter((t) => t.type === 'DIVIDEND_PAYOUT'),
    INTEREST_RECEIVED: filtered.filter((t) => t.type === 'INTEREST_RECEIVED'),
    MATURITY: filtered.filter((t) => t.type === 'MATURITY'),
  };

  const totals = {
    DIVIDEND_PAYOUT: new Decimal(income.dividend),
    INTEREST_RECEIVED: new Decimal(income.interest),
    MATURITY: new Decimal(income.maturity),
  };
  // Maturity proceeds return principal; they are listed but are not income.
  const grand = new Decimal(income.total);

  function toRow(t: IncomeRow): Record<string, unknown> {
    return {
      date: fmtDate(t.date),
      asset: t.assetName || '—',
      isin: t.isin ?? '',
      portfolio: t.portfolioName,
      type: TYPE_LABEL[t.type] ?? t.type,
      amount: fmtNum(new Decimal(t.amount).toFixed(2)),
      narration: t.narration ?? '',
    };
  }

  function section(title: string, rows: typeof filtered, total: Decimal): ExportSection {
    const mapped = rows.map(toRow);
    if (mapped.length > 0) {
      mapped.push({
        date: '',
        asset: 'Subtotal',
        isin: '',
        portfolio: '',
        type: '',
        amount: fmtNum(total.toFixed(2)),
        narration: '',
      });
    }
    return {
      title,
      columns: COLUMNS,
      rows: mapped,
      emptyMessage: 'No entries for this category.',
    };
  }

  const dividends = section('Dividends', buckets.DIVIDEND_PAYOUT, totals.DIVIDEND_PAYOUT);
  const interest = section('Interest received', buckets.INTEREST_RECEIVED, totals.INTEREST_RECEIVED);
  const maturity = section('Maturity proceeds (principal returned — not income)', buckets.MATURITY, totals.MATURITY);

  const portfolioLabel = portfolios.length === 1
    ? portfolios[0]!.name
    : `${portfolios.length} portfolios`;
  const fyLabel = params.fy ?? 'All FYs';

  return {
    title: 'Income Statement',
    subtitle: `Financial year ${fyLabel}`,
    meta: {
      Portfolio: portfolioLabel,
      'Financial Year': fyLabel,
      Entries: String(filtered.length),
    },
    footer: {
      Dividends: `₹${fmtNum(totals.DIVIDEND_PAYOUT.toFixed(2))}`,
      Interest: `₹${fmtNum(totals.INTEREST_RECEIVED.toFixed(2))}`,
      'Total Income': `₹${fmtNum(grand.toFixed(2))}`,
      'Maturity proceeds (not income)': `₹${fmtNum(totals.MATURITY.toFixed(2))}`,
    },
    columns: dividends.columns,
    rows: dividends.rows,
    mainSectionLabel: dividends.title,
    additionalSections: [interest, maturity],
    filenameStem: `everypaisa-income-statement-${fyLabel.replace(/[^a-z0-9-]+/gi, '_')}`,
  };
}
