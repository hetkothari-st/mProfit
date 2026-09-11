/**
 * Income CRUD (salary, business, trading, freelance, rental, etc.), plus
 * the shared `activeMonthlyIncomeTotal` helper used by Health Score (and
 * any future module needing "monthly income"). Manual entries here are
 * preferred over the Gmail-estimated NEFT/UPI credit average — most
 * users don't have Gmail connected.
 */

import { Decimal } from 'decimal.js';
import type { IncomeType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { serializeMoney } from '@everypaisa/shared';
import { computeUserFoPnl } from './foPnl.service.js';

export const INCOME_TYPES = [
  'SALARY', 'BUSINESS', 'TRADING', 'FREELANCE', 'RENTAL', 'INTEREST_DIVIDEND', 'CAPITAL_GAINS', 'OTHER',
] as const satisfies readonly IncomeType[];

export interface IncomeInput {
  type?: IncomeType;
  sourceName: string;
  monthlyAmount: string | number;
  payDay?: number;
  isActive?: boolean;
  notes?: string | null;
}

const ZERO = new Decimal(0);

function d(v: { toString(): string } | null | undefined): Decimal {
  if (v == null) return ZERO;
  return new Decimal(v.toString());
}

function validateInput(input: IncomeInput) {
  if (!input.sourceName?.trim()) throw new BadRequestError('Source name required');
  if (new Decimal(input.monthlyAmount).lessThanOrEqualTo(0)) throw new BadRequestError('Monthly amount must be positive');
  if (input.payDay != null && (input.payDay < 1 || input.payDay > 31)) throw new BadRequestError('Pay day must be between 1 and 31');
}

function serialize(row: {
  id: string; userId: string; type: IncomeType; sourceName: string; monthlyAmount: { toString(): string };
  payDay: number; isActive: boolean; notes: string | null; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: row.id,
    type: row.type,
    sourceName: row.sourceName,
    monthlyAmount: serializeMoney(d(row.monthlyAmount)),
    payDay: row.payDay,
    isActive: row.isActive,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listIncomes(userId: string) {
  const rows = await prisma.income.findMany({ where: { userId }, orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] });
  return rows.map(serialize);
}

export async function getIncome(userId: string, id: string) {
  const row = await prisma.income.findFirst({ where: { id, userId } });
  if (!row) throw new NotFoundError('Income entry not found');
  return serialize(row);
}

export async function createIncome(userId: string, input: IncomeInput) {
  validateInput(input);
  const row = await prisma.income.create({
    data: {
      userId,
      type: input.type ?? 'SALARY',
      sourceName: input.sourceName.trim(),
      monthlyAmount: new Decimal(input.monthlyAmount).toString(),
      payDay: input.payDay ?? 1,
      isActive: input.isActive ?? true,
      notes: input.notes ?? null,
    },
  });
  return serialize(row);
}

export async function updateIncome(userId: string, id: string, input: Partial<IncomeInput>) {
  const existing = await prisma.income.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError('Income entry not found');
  if (input.sourceName !== undefined || input.monthlyAmount !== undefined || input.payDay !== undefined) {
    validateInput({ ...existing, ...input } as IncomeInput);
  }
  const row = await prisma.income.update({
    where: { id },
    data: {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.sourceName !== undefined ? { sourceName: input.sourceName.trim() } : {}),
      ...(input.monthlyAmount !== undefined ? { monthlyAmount: new Decimal(input.monthlyAmount).toString() } : {}),
      ...(input.payDay !== undefined ? { payDay: input.payDay } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
  return serialize(row);
}

export async function deleteIncome(userId: string, id: string) {
  const existing = await prisma.income.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError('Income entry not found');
  await prisma.income.delete({ where: { id } });
}

/** Sum of active entries' monthlyAmount across all income types. Zero if the user has none entered. */
export async function activeMonthlyIncomeTotal(userId: string): Promise<Decimal> {
  const rows = await prisma.income.findMany({ where: { userId, isActive: true }, select: { monthlyAmount: true } });
  return rows.reduce((s, r) => s.plus(d(r.monthlyAmount)), ZERO);
}

// ── Suggestions: pull a starting monthlyAmount from data the user has
// already entered elsewhere, instead of asking them to retype it. ──────

export interface IncomeSuggestion {
  sourceName: string;
  monthlyAmount: string;
  payDay?: number;
  note: string;
}

function monthsAgo(n: number): Date {
  const dt = new Date();
  dt.setUTCMonth(dt.getUTCMonth() - n);
  return dt;
}

/** One suggestion per active tenancy — rent is a known, stable monthly figure. */
async function rentalSuggestions(userId: string): Promise<IncomeSuggestion[]> {
  const properties = await prisma.rentalProperty.findMany({
    where: { userId, isActive: true },
    select: {
      name: true,
      tenancies: { where: { isActive: true }, select: { tenantName: true, monthlyRent: true, rentDueDay: true } },
    },
  });
  return properties.flatMap((p) =>
    p.tenancies.map((t) => ({
      sourceName: `${p.name} — ${t.tenantName}`,
      monthlyAmount: serializeMoney(d(t.monthlyRent)),
      payDay: t.rentDueDay,
      note: 'From your Rental section',
    })),
  );
}

/** Average of dividend/interest transactions over the trailing 12 months. */
async function interestDividendSuggestion(userId: string): Promise<IncomeSuggestion[]> {
  const txs = await prisma.transaction.findMany({
    where: {
      portfolio: { userId },
      transactionType: { in: ['DIVIDEND_PAYOUT', 'INTEREST_RECEIVED'] },
      tradeDate: { gte: monthsAgo(12) },
    },
    select: { netAmount: true },
  });
  if (txs.length === 0) return [];
  const monthly = txs.reduce((s, t) => s.plus(d(t.netAmount)), ZERO).dividedBy(12);
  if (monthly.lessThanOrEqualTo(0)) return [];
  return [{
    sourceName: 'Portfolio dividends & interest',
    monthlyAmount: serializeMoney(monthly),
    note: 'Average of dividend/interest transactions over the last 12 months',
  }];
}

/**
 * Average of realized F&O P&L over the trailing 12 months, clamped to zero
 * — trading P&L can go negative for a stretch, and a negative "monthly
 * income" would corrupt the health-score math (and any other consumer
 * expecting income to be non-negative). Reuses the same replay engine as
 * the F&O tax report (foPnl.service) rather than re-deriving P&L here.
 */
async function tradingSuggestion(userId: string): Promise<IncomeSuggestion[]> {
  const { rows } = await computeUserFoPnl(userId);
  const cutoff = monthsAgo(12);
  const recent = rows.filter((r) => new Date(r.expiryDate) >= cutoff);
  if (recent.length === 0) return [];
  const monthly = recent.reduce((s, r) => s.plus(d(r.realizedPnl)), ZERO).dividedBy(12);
  if (monthly.lessThanOrEqualTo(0)) return [];
  return [{
    sourceName: 'F&O trading',
    monthlyAmount: serializeMoney(monthly),
    note: 'Estimated from realized F&O P&L over the last 12 months — trading income varies, adjust as needed',
  }];
}

export async function getIncomeSuggestions(userId: string, type: IncomeType): Promise<IncomeSuggestion[]> {
  switch (type) {
    case 'RENTAL': return rentalSuggestions(userId);
    case 'INTEREST_DIVIDEND': return interestDividendSuggestion(userId);
    case 'TRADING': return tradingSuggestion(userId);
    default: return [];
  }
}
