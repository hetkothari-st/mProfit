import { Decimal } from 'decimal.js';
import type { SplitSettlementDto } from '@everypaisa/shared';
import { serializeMoney } from '@everypaisa/shared';
import type { SplitSettlement } from '@prisma/client';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { requireMember } from './groups.service.js';
import { writeActivity } from './activity.js';
import { resolveFxRate } from './fx.js';
import { toBase } from './allocate.js';

export interface SettlementInput {
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: string;
  currency?: string;
  fxRate?: string | null;
  method: 'CASH' | 'UPI' | 'OTHER';
  date: string;
}

function toDto(s: SplitSettlement): SplitSettlementDto {
  return {
    id: s.id, groupId: s.groupId, fromMemberId: s.fromMemberId, toMemberId: s.toMemberId,
    amount: serializeMoney(s.amount.toString()), currency: s.currency, fxRate: s.fxRate.toString(),
    baseAmount: serializeMoney(s.baseAmount.toString()), method: s.method,
    date: s.date.toISOString().slice(0, 10), deletedAt: s.deletedAt?.toISOString() ?? null,
  };
}

async function build(groupId: string, input: Omit<SettlementInput, 'groupId'>) {
  if (input.fromMemberId === input.toMemberId) throw new BadRequestError('Payer and receiver must differ');
  if (!/^\d+(\.\d{1,2})?$/.test(input.amount) || new Decimal(input.amount).lte(0)) throw new BadRequestError('Amount must be > 0 with at most 2 decimals');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new BadRequestError('Invalid date');
  const group = await prisma.splitGroup.findUnique({ where: { id: groupId }, select: { baseCurrency: true } });
  if (!group) throw new NotFoundError('Group not found');
  const n = await prisma.splitMember.count({ where: { groupId, leftAt: null, id: { in: [input.fromMemberId, input.toMemberId] } } });
  if (n !== 2) throw new BadRequestError('A participant is not in this group');
  const currency = (input.currency ?? group.baseCurrency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestError('Invalid currency code');
  const amount = new Decimal(input.amount);
  const fxRate = await resolveFxRate(currency, group.baseCurrency, input.fxRate);
  return {
    fromMemberId: input.fromMemberId, toMemberId: input.toMemberId, amount: amount.toFixed(2), currency,
    fxRate: fxRate.toString(), baseAmount: toBase(amount, fxRate).toFixed(2), method: input.method,
    date: new Date(`${input.date}T00:00:00Z`),
  };
}

async function loadOwned(userId: string, id: string) {
  const s = await prisma.splitSettlement.findUnique({ where: { id } });
  if (!s) throw new NotFoundError('Settlement not found');
  await requireMember(userId, s.groupId);
  return s;
}

export async function createSettlement(userId: string, input: SettlementInput): Promise<SplitSettlementDto> {
  await requireMember(userId, input.groupId);
  const data = await build(input.groupId, input);
  const row = await runInTransaction(async (tx) => {
    const s = await tx.splitSettlement.create({ data: { groupId: input.groupId, createdById: userId, ...data } });
    await writeActivity(tx, input.groupId, userId, 'SETTLED', { settlementId: s.id, from: s.fromMemberId, to: s.toMemberId, amount: data.amount, currency: data.currency });
    return s;
  });
  return toDto(row);
}

export async function updateSettlement(userId: string, id: string, input: Omit<SettlementInput, 'groupId'>): Promise<SplitSettlementDto> {
  const existing = await loadOwned(userId, id);
  const data = await build(existing.groupId, input);
  const row = await runInTransaction(async (tx) => {
    const s = await tx.splitSettlement.update({ where: { id }, data });
    await writeActivity(tx, existing.groupId, userId, 'SETTLEMENT_EDITED', { settlementId: id, amount: data.amount });
    return s;
  });
  return toDto(row);
}

export async function deleteSettlement(userId: string, id: string): Promise<void> {
  const s = await loadOwned(userId, id);
  if (s.deletedAt) return;
  await runInTransaction(async (tx) => {
    await tx.splitSettlement.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeActivity(tx, s.groupId, userId, 'SETTLEMENT_DELETED', { settlementId: id });
  });
}

export async function listSettlements(userId: string, groupId: string): Promise<SplitSettlementDto[]> {
  await requireMember(userId, groupId);
  const rows = await prisma.splitSettlement.findMany({ where: { groupId, deletedAt: null }, orderBy: { date: 'desc' } });
  return rows.map(toDto);
}
