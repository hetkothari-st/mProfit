/**
 * Statement-style Transaction Ledger.
 *
 * Chronological per-portfolio ledger combining Transaction rows + CashFlow
 * rows. Each row carries a running balance so the document reads as a true
 * ledger rather than a flat list. Standard column ordering:
 *
 *   Date · Portfolio · Asset/Description · Type · Qty · Price · Debit · Credit · Running Balance
 */

import { Decimal } from 'decimal.js';
import { prisma } from '../../../lib/prisma.js';
import { fmtNum, fmtDate, type ExportPayload } from '../../export.service.js';

export interface LedgerStatementParams {
  userId: string;
  portfolioIds: string[];
  from?: Date;
  to?: Date;
}

interface LedgerEntry {
  date: Date;
  portfolioId: string;
  description: string;
  type: string;
  quantity: string;
  price: string;
  debit: Decimal;  // money leaving (BUY, WITHDRAWAL, OUTFLOW)
  credit: Decimal; // money entering (SELL, DEPOSIT, INFLOW, DIVIDEND, INTEREST, MATURITY)
}

const COLUMNS = [
  { key: 'date', header: 'Date', width: 9 },
  { key: 'portfolio', header: 'Portfolio', width: 12 },
  { key: 'description', header: 'Description', width: 22 },
  { key: 'type', header: 'Type', width: 11 },
  { key: 'qty', header: 'Qty', width: 7 },
  { key: 'price', header: 'Price', width: 9 },
  { key: 'debit', header: 'Debit (₹)', width: 11 },
  { key: 'credit', header: 'Credit (₹)', width: 11 },
  { key: 'balance', header: 'Running Balance', width: 13 },
];

const TX_TYPE_LABEL: Record<string, string> = {
  BUY: 'Buy', SELL: 'Sell',
  SIP: 'SIP', SWITCH_IN: 'Switch In', SWITCH_OUT: 'Switch Out',
  DIVIDEND_REINVEST: 'Dividend (Re)', DIVIDEND_PAYOUT: 'Dividend',
  BONUS: 'Bonus', SPLIT: 'Split',
  MERGER_IN: 'Merger In', MERGER_OUT: 'Merger Out',
  DEMERGER_IN: 'Demerger In', DEMERGER_OUT: 'Demerger Out',
  RIGHTS_ISSUE: 'Rights Issue',
  INTEREST_RECEIVED: 'Interest', MATURITY: 'Maturity', REDEMPTION: 'Redemption',
  DEPOSIT: 'Deposit', WITHDRAWAL: 'Withdrawal', OPENING_BALANCE: 'Opening Bal',
};

const CREDIT_TX = new Set<string>([
  'SELL', 'SWITCH_OUT', 'DIVIDEND_PAYOUT', 'INTEREST_RECEIVED', 'MATURITY',
  'REDEMPTION', 'DEPOSIT', 'OPENING_BALANCE', 'MERGER_OUT', 'DEMERGER_OUT',
]);

export async function buildLedgerStatement(
  params: LedgerStatementParams,
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

  const dateFilter: Record<string, Date> = {};
  if (params.from) dateFilter.gte = params.from;
  if (params.to) dateFilter.lte = params.to;

  const txs = await prisma.transaction.findMany({
    where: {
      portfolioId: { in: portfolioIds },
      ...(Object.keys(dateFilter).length ? { tradeDate: dateFilter } : {}),
    },
    orderBy: { tradeDate: 'asc' },
  });

  const cashFlows = await prisma.cashFlow.findMany({
    where: {
      portfolioId: { in: portfolioIds },
      ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
    },
    orderBy: { date: 'asc' },
  });

  // Normalise both sources into LedgerEntry rows.
  const entries: LedgerEntry[] = [];
  for (const t of txs) {
    const amount = new Decimal(t.netAmount.toString());
    const isCredit = CREDIT_TX.has(t.transactionType);
    entries.push({
      date: t.tradeDate,
      portfolioId: t.portfolioId,
      description: t.assetName ?? t.narration ?? '—',
      type: TX_TYPE_LABEL[t.transactionType] ?? t.transactionType,
      quantity: t.quantity ? new Decimal(t.quantity.toString()).toFixed(4) : '',
      price: t.price ? new Decimal(t.price.toString()).toFixed(4) : '',
      debit: isCredit ? new Decimal(0) : amount.abs(),
      credit: isCredit ? amount.abs() : new Decimal(0),
    });
  }
  for (const cf of cashFlows) {
    const amount = new Decimal(cf.amount.toString());
    const isCredit = cf.type === 'INFLOW';
    entries.push({
      date: cf.date,
      portfolioId: cf.portfolioId,
      description: cf.description ?? (isCredit ? 'Inflow' : 'Outflow'),
      type: isCredit ? 'Cash Inflow' : 'Cash Outflow',
      quantity: '',
      price: '',
      debit: isCredit ? new Decimal(0) : amount.abs(),
      credit: isCredit ? amount.abs() : new Decimal(0),
    });
  }

  // Chronological sort. Stable by intent — cashflow + tx sharing a date keep
  // their insertion order (txs first by virtue of being appended first).
  entries.sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = new Decimal(0);
  let totalDebit = new Decimal(0);
  let totalCredit = new Decimal(0);
  const rows = entries.map((e) => {
    running = running.plus(e.credit).minus(e.debit);
    totalDebit = totalDebit.plus(e.debit);
    totalCredit = totalCredit.plus(e.credit);
    return {
      date: fmtDate(e.date),
      portfolio: portfolioName.get(e.portfolioId) ?? '',
      description: e.description,
      type: e.type,
      qty: e.quantity,
      price: e.price,
      debit: e.debit.isZero() ? '' : fmtNum(e.debit.toFixed(2)),
      credit: e.credit.isZero() ? '' : fmtNum(e.credit.toFixed(2)),
      balance: fmtNum(running.toFixed(2)),
    };
  });

  const portfolioLabel = portfolios.length === 1
    ? portfolios[0]!.name
    : `${portfolios.length} portfolios`;
  const fromLabel = params.from ? fmtDate(params.from) : 'Earliest';
  const toLabel = params.to ? fmtDate(params.to) : fmtDate(new Date());

  return {
    title: 'Transaction Ledger',
    subtitle: `${fromLabel} → ${toLabel}`,
    meta: {
      Portfolio: portfolioLabel,
      From: fromLabel,
      To: toLabel,
      Entries: String(rows.length),
    },
    footer: {
      'Total Debits': `₹${fmtNum(totalDebit.toFixed(2))}`,
      'Total Credits': `₹${fmtNum(totalCredit.toFixed(2))}`,
      'Net Movement': `${running.gte(0) ? '+' : ''}₹${fmtNum(running.toFixed(2))}`,
      Entries: String(rows.length),
    },
    columns: COLUMNS,
    rows,
    mainSectionLabel: 'Transactions & Cash Movements (chronological)',
    filenameStem: `portfolioos-ledger-${fromLabel.replace(/[\s,]+/g, '_')}_to_${toLabel.replace(/[\s,]+/g, '_')}`,
  };
}
