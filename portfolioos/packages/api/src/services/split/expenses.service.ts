// packages/api/src/services/split/expenses.service.ts
/**
 * Expense writes. Shares and payers are computed and validated in memory
 * first; only then does one transaction replace the rows, so a rejected edit
 * never leaves an expense half-rewritten.
 */
import { Decimal } from 'decimal.js';
import type { Prisma } from '@prisma/client';
import type { SplitExpenseDto } from '@everypaisa/shared';
import { serializeMoney } from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { computeShares, toBase, allocateBase } from './allocate.js';
import { requireMember } from './groups.service.js';
import { writeActivity } from './activity.js';
import { resolveFxRate } from './fx.js';

export interface ExpenseInput {
  groupId: string;
  description: string;
  date: string;
  amount: string;
  currency: string;
  fxRate?: string | null;
  splitMode: 'EQUAL' | 'EXACT' | 'PERCENT' | 'SHARES';
  payers: Array<{ memberId: string; amount: string }>;
  shares: Array<{ memberId: string; value?: string }>;
}

const DAY_MS = 86_400_000;
const INCLUDE = { payers: true, shares: true } as const;
type Row = Prisma.SplitExpenseGetPayload<{ include: typeof INCLUDE }>;

function toDto(e: Row): SplitExpenseDto {
  const byId = <T extends { memberId: string }>(a: T, b: T) => (a.memberId < b.memberId ? -1 : 1);
  return {
    id: e.id,
    groupId: e.groupId,
    description: e.description,
    date: e.date.toISOString().slice(0, 10),
    amount: serializeMoney(e.amount.toString()),
    currency: e.currency,
    fxRate: e.fxRate.toString(),
    baseAmount: serializeMoney(e.baseAmount.toString()),
    splitMode: e.splitMode,
    createdById: e.createdById,
    sourceType: e.sourceType,
    deletedAt: e.deletedAt?.toISOString() ?? null,
    payers: [...e.payers].sort(byId).map((p) => ({ memberId: p.memberId, amount: serializeMoney(p.amount.toString()), baseAmount: serializeMoney(p.baseAmount.toString()) })),
    shares: [...e.shares].sort(byId).map((s) => ({ memberId: s.memberId, amount: serializeMoney(s.amount.toString()), baseAmount: serializeMoney(s.baseAmount.toString()), rawInput: s.rawInput?.toString() ?? null })),
  };
}

async function build(groupId: string, input: Omit<ExpenseInput, 'groupId'>) {
  const description = input.description.trim();
  if (!description) throw new BadRequestError('Description is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new BadRequestError('Invalid date');
  const date = new Date(`${input.date}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getTime() > Date.now() + DAY_MS) throw new BadRequestError('Invalid date');
  const currency = input.currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestError('Invalid currency code');
  if (!/^\d+(\.\d+)?$/.test(input.amount)) throw new BadRequestError('SPLIT_BAD_INPUT: amount');
  const amount = new Decimal(input.amount);

  const group = await prisma.splitGroup.findUnique({ where: { id: groupId }, select: { baseCurrency: true } });
  if (!group) throw new NotFoundError('Group not found');
  const active = new Set(
    (await prisma.splitMember.findMany({ where: { groupId, leftAt: null }, select: { id: true } })).map((m) => m.id),
  );
  for (const id of [...input.payers.map((p) => p.memberId), ...input.shares.map((s) => s.memberId)]) {
    if (!active.has(id)) throw new BadRequestError('A participant is not in this group');
  }

  const shares = computeShares(input.splitMode, amount, input.shares);
  const payers = new Map<string, Decimal>();
  let paid = new Decimal(0);
  for (const p of input.payers) {
    if (!/^\d+(\.\d{1,2})?$/.test(p.amount)) throw new BadRequestError('SPLIT_BAD_INPUT: payer amount');
    const v = new Decimal(p.amount);
    if (v.lte(0)) throw new BadRequestError('SPLIT_BAD_INPUT: payer amount must be > 0');
    payers.set(p.memberId, (payers.get(p.memberId) ?? new Decimal(0)).plus(v));
    paid = paid.plus(v);
  }
  if (payers.size === 0) throw new BadRequestError('SPLIT_NO_PARTICIPANTS: nobody paid');
  if (!paid.eq(amount)) throw new BadRequestError(`SPLIT_SUM_MISMATCH: payers add to ${paid.toFixed(2)}, expense is ${amount.toFixed(2)}`);

  const fxRate = await resolveFxRate(currency, group.baseCurrency, input.fxRate);
  const baseAmount = toBase(amount, fxRate);
  const baseShares = allocateBase(baseAmount, shares);
  const basePayers = allocateBase(baseAmount, payers);
  const raw = new Map(input.shares.map((s) => [s.memberId, s.value]));

  return {
    scalar: { description, date, amount: amount.toFixed(2), currency, fxRate: fxRate.toString(), baseAmount: baseAmount.toFixed(2), splitMode: input.splitMode },
    payers: [...payers].map(([memberId, v]) => ({ memberId, amount: v.toFixed(2), baseAmount: basePayers.get(memberId)!.toFixed(2) })),
    shares: [...shares].map(([memberId, v]) => ({
      memberId,
      amount: v.toFixed(2),
      baseAmount: baseShares.get(memberId)!.toFixed(2),
      rawInput: input.splitMode === 'EQUAL' ? null : raw.get(memberId) ?? null,
    })),
  };
}

async function loadOwned(userId: string, id: string): Promise<Row> {
  const e = await prisma.splitExpense.findUnique({ where: { id }, include: INCLUDE });
  if (!e) throw new NotFoundError('Expense not found');
  await requireMember(userId, e.groupId);
  return e;
}

export async function getExpense(userId: string, id: string): Promise<SplitExpenseDto> {
  return toDto(await loadOwned(userId, id));
}

export async function listExpenses(userId: string, groupId: string, opts: { includeDeleted?: boolean } = {}): Promise<SplitExpenseDto[]> {
  await requireMember(userId, groupId);
  const rows = await prisma.splitExpense.findMany({
    where: { groupId, ...(opts.includeDeleted ? {} : { deletedAt: null }) },
    include: INCLUDE,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map(toDto);
}

export async function createExpense(userId: string, input: ExpenseInput): Promise<SplitExpenseDto> {
  await requireMember(userId, input.groupId);
  const b = await build(input.groupId, input);
  const id = await runInTransaction(async (tx) => {
    const e = await tx.splitExpense.create({
      data: { groupId: input.groupId, createdById: userId, ...b.scalar, payers: { create: b.payers }, shares: { create: b.shares } },
    });
    await writeActivity(tx, input.groupId, userId, 'EXPENSE_ADDED', { expenseId: e.id, description: b.scalar.description, amount: b.scalar.amount, currency: b.scalar.currency });
    await tx.splitGroup.update({ where: { id: input.groupId }, data: { updatedAt: new Date() } });
    return e.id;
  });
  return getExpense(userId, id);
}

export async function updateExpense(userId: string, id: string, input: Omit<ExpenseInput, 'groupId'>): Promise<SplitExpenseDto> {
  const existing = await loadOwned(userId, id);
  if (existing.deletedAt) throw new BadRequestError('Restore the expense before editing it');
  const b = await build(existing.groupId, input);
  await runInTransaction(async (tx) => {
    await tx.splitPayer.deleteMany({ where: { expenseId: id } });
    await tx.splitShare.deleteMany({ where: { expenseId: id } });
    await tx.splitExpense.update({
      where: { id },
      data: { ...b.scalar, payers: { create: b.payers }, shares: { create: b.shares } },
    });
    await writeActivity(tx, existing.groupId, userId, 'EXPENSE_EDITED', {
      expenseId: id,
      before: { description: existing.description, amount: existing.amount.toString(), currency: existing.currency },
      after: { description: b.scalar.description, amount: b.scalar.amount, currency: b.scalar.currency },
    });
  });
  return getExpense(userId, id);
}

export async function deleteExpense(userId: string, id: string): Promise<void> {
  const e = await loadOwned(userId, id);
  if (e.deletedAt) return;
  await runInTransaction(async (tx) => {
    await tx.splitExpense.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeActivity(tx, e.groupId, userId, 'EXPENSE_DELETED', { expenseId: id, description: e.description });
  });
}

export async function restoreExpense(userId: string, id: string): Promise<SplitExpenseDto> {
  const e = await loadOwned(userId, id);
  if (e.deletedAt) {
    await runInTransaction(async (tx) => {
      await tx.splitExpense.update({ where: { id }, data: { deletedAt: null } });
      await writeActivity(tx, e.groupId, userId, 'EXPENSE_RESTORED', { expenseId: id, description: e.description });
    });
  }
  return getExpense(userId, id);
}
