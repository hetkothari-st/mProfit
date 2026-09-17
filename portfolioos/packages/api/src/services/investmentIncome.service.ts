import { Decimal } from 'decimal.js';
import type { Prisma } from '@prisma/client';
import { financialYearOf } from '@everypaisa/shared';
import { prisma } from '../lib/prisma.js';

/**
 * Investment income — dividends and interest — plus maturity proceeds, which
 * are reported alongside but are NOT income: a maturity returns principal and
 * any gain on it is already booked by the capital-gains engine.
 *
 * One source for the income report, the income statement, the tax page and
 * the analytics KPIs so they can never disagree.
 */

export type IncomeKind = 'DIVIDEND_PAYOUT' | 'INTEREST_RECEIVED' | 'MATURITY';
export const INCOME_TRANSACTION_TYPES: IncomeKind[] = ['DIVIDEND_PAYOUT', 'INTEREST_RECEIVED', 'MATURITY'];

/** Email/bank events projected to cash flows rather than transactions. */
const EVENT_KIND: Record<string, IncomeKind> = {
  DIVIDEND: 'DIVIDEND_PAYOUT',
  INTEREST_CREDIT: 'INTEREST_RECEIVED',
  MATURITY_CREDIT: 'MATURITY',
};

/**
 * INR value of a money amount recorded in another currency: the INR
 * equivalent frozen at the time, else amount × rate, else the amount as is
 * (INR rows have no currency). Same order as the holdings projection.
 */
export function inrAmount(row: {
  amount: { toString(): string };
  currency?: string | null;
  inrEquivalent?: { toString(): string } | null;
  fxRate?: { toString(): string } | null;
}): Decimal {
  const raw = new Decimal(row.amount.toString());
  if (!row.currency || row.currency === 'INR') return raw;
  if (row.inrEquivalent != null) return new Decimal(row.inrEquivalent.toString());
  if (row.fxRate != null) return raw.times(row.fxRate.toString());
  return raw;
}

/** `inrAmount` for a transaction's net amount. */
export function transactionInrNet(t: {
  netAmount: { toString(): string };
  currency?: string | null;
  inrEquivalent?: { toString(): string } | null;
  fxRateAtTrade?: { toString(): string } | null;
}): Decimal {
  return inrAmount({ amount: t.netAmount, currency: t.currency, inrEquivalent: t.inrEquivalent, fxRate: t.fxRateAtTrade });
}

export type IncomeRow = {
  id: string;
  date: Date;
  type: IncomeKind;
  assetName: string;
  isin: string | null;
  portfolioId: string;
  portfolioName: string;
  /** INR. */
  amount: string;
  narration: string | null;
  source: 'TRANSACTION' | 'BANK_OR_EMAIL';
};

export interface IncomeSummary {
  rows: IncomeRow[];
  dividend: string;
  interest: string;
  /** Principal returned at maturity — shown for reference, not part of `total`. */
  maturity: string;
  /** Dividends + interest. */
  total: string;
  count: number;
}

export async function investmentIncome(
  portfolioWhere: Prisma.PortfolioWhereInput,
  fy?: string,
): Promise<IncomeSummary> {
  const txs = await prisma.transaction.findMany({
    where: { portfolio: portfolioWhere, transactionType: { in: INCOME_TRANSACTION_TYPES } },
    include: { portfolio: { select: { name: true } } },
    orderBy: { tradeDate: 'asc' },
  });
  const rows: IncomeRow[] = txs.map((t) => ({
    id: t.id,
    date: t.tradeDate,
    type: t.transactionType as IncomeKind,
    assetName: t.assetName ?? '',
    isin: t.isin,
    portfolioId: t.portfolioId,
    portfolioName: t.portfolio.name,
    amount: transactionInrNet(t).toString(),
    narration: t.narration ?? null,
    source: 'TRANSACTION',
  }));

  // Dividends / interest / maturity credits confirmed from bank or broker
  // emails land as cash flows. Skip one that repeats a transaction already
  // recorded (same portfolio, kind, date and amount), e.g. from a CAS import.
  const owners = await prisma.portfolio.findMany({ where: portfolioWhere, select: { userId: true } });
  const events = await prisma.canonicalEvent.findMany({
    where: {
      userId: { in: [...new Set(owners.map((o) => o.userId))] },
      eventType: { in: Object.keys(EVENT_KIND) as never },
      status: 'PROJECTED',
      projectedCashFlowId: { not: null },
    },
    select: { eventType: true, projectedCashFlowId: true, counterparty: true, instrumentName: true, instrumentIsin: true },
  });
  if (events.length > 0) {
    const flows = await prisma.cashFlow.findMany({
      where: { id: { in: events.map((e) => e.projectedCashFlowId!) }, portfolio: portfolioWhere, type: 'INFLOW' },
      include: { portfolio: { select: { name: true } } },
    });
    const eventByFlow = new Map(events.map((e) => [e.projectedCashFlowId!, e]));
    const seen = new Set(rows.map((r) => `${r.portfolioId}|${r.type}|${r.date.toISOString().slice(0, 10)}|${new Decimal(r.amount).toFixed(2)}`));
    for (const f of flows) {
      const e = eventByFlow.get(f.id)!;
      const type = EVENT_KIND[e.eventType]!;
      const amount = inrAmount(f);
      const key = `${f.portfolioId}|${type}|${f.date.toISOString().slice(0, 10)}|${amount.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id: f.id,
        date: f.date,
        type,
        assetName: e.instrumentName ?? e.counterparty ?? f.description ?? '',
        isin: e.instrumentIsin ?? null,
        portfolioId: f.portfolioId,
        portfolioName: f.portfolio.name,
        amount: amount.toString(),
        narration: f.description ?? null,
        source: 'BANK_OR_EMAIL',
      });
    }
  }

  const filtered = (fy ? rows.filter((r) => financialYearOf(r.date) === fy) : rows).sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  const sumOf = (kind: IncomeKind) =>
    filtered.filter((r) => r.type === kind).reduce((acc, r) => acc.plus(r.amount), new Decimal(0));
  const dividend = sumOf('DIVIDEND_PAYOUT');
  const interest = sumOf('INTEREST_RECEIVED');
  const maturity = sumOf('MATURITY');
  return {
    rows: filtered,
    dividend: dividend.toString(),
    interest: interest.toString(),
    maturity: maturity.toString(),
    total: dividend.plus(interest).toString(),
    count: filtered.length,
  };
}
