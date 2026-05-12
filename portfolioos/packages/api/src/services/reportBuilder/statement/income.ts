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
import type { TransactionType } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { financialYearOf } from '../../capitalGains.service.js';
import { fmtNum, fmtDate, type ExportPayload, type ExportSection } from '../../export.service.js';

export interface IncomeStatementParams {
  userId: string;
  portfolioIds: string[];
  fy?: string;
}

const INCOME_TYPES: TransactionType[] = ['DIVIDEND_PAYOUT', 'INTEREST_RECEIVED', 'MATURITY'];

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
  const portfolioName = new Map(portfolios.map((p) => [p.id, p.name] as const));

  const txs = await prisma.transaction.findMany({
    where: {
      portfolioId: { in: portfolioIds },
      transactionType: { in: INCOME_TYPES },
    },
    orderBy: { tradeDate: 'asc' },
  });
  const filtered = params.fy
    ? txs.filter((t) => financialYearOf(t.tradeDate) === params.fy)
    : txs;

  const buckets = {
    DIVIDEND_PAYOUT: filtered.filter((t) => t.transactionType === 'DIVIDEND_PAYOUT'),
    INTEREST_RECEIVED: filtered.filter((t) => t.transactionType === 'INTEREST_RECEIVED'),
    MATURITY: filtered.filter((t) => t.transactionType === 'MATURITY'),
  };

  const totals = {
    DIVIDEND_PAYOUT: sum(buckets.DIVIDEND_PAYOUT),
    INTEREST_RECEIVED: sum(buckets.INTEREST_RECEIVED),
    MATURITY: sum(buckets.MATURITY),
  };
  const grand = totals.DIVIDEND_PAYOUT.plus(totals.INTEREST_RECEIVED).plus(totals.MATURITY);

  function toRow(t: (typeof filtered)[number]): Record<string, unknown> {
    return {
      date: fmtDate(t.tradeDate),
      asset: t.assetName ?? '—',
      isin: t.isin ?? '',
      portfolio: portfolioName.get(t.portfolioId) ?? '',
      type: TYPE_LABEL[t.transactionType] ?? t.transactionType,
      amount: fmtNum(new Decimal(t.netAmount.toString()).toFixed(2)),
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
  const maturity = section('Maturity proceeds', buckets.MATURITY, totals.MATURITY);

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
      Maturity: `₹${fmtNum(totals.MATURITY.toFixed(2))}`,
      'Total Income': `₹${fmtNum(grand.toFixed(2))}`,
    },
    columns: dividends.columns,
    rows: dividends.rows,
    mainSectionLabel: dividends.title,
    additionalSections: [interest, maturity],
    filenameStem: `portfolioos-income-statement-${fyLabel.replace(/[^a-z0-9-]+/gi, '_')}`,
  };
}

function sum(rows: { netAmount: { toString(): string } }[]): Decimal {
  return rows.reduce((s, r) => s.plus(new Decimal(r.netAmount.toString())), new Decimal(0));
}
