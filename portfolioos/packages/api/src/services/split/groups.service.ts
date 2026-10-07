// packages/api/src/services/split/groups.service.ts
/**
 * Split groups and their members. RLS already hides groups the caller is not
 * in; requireMember turns "hidden" into a clean 404 and gives back the
 * caller's member id for writes.
 */
import { Decimal } from 'decimal.js';
import type { SplitGroupDto, SplitMemberDto } from '@everypaisa/shared';
import { serializeMoney } from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { getContactRow } from './contacts.service.js';
import { memberNets, type LedgerExpense, type LedgerSettlement } from './balances.js';
import { writeActivity } from './activity.js';

export interface CreateGroupInput {
  name: string;
  type?: 'TRIP' | 'HOME' | 'COUPLE' | 'OTHER';
  baseCurrency?: string;
  simplifyDebts?: boolean;
  myDisplayName: string;
  contactIds?: string[];
}

const CCY = /^[A-Z]{3}$/;

export async function requireMember(userId: string, groupId: string): Promise<{ memberId: string }> {
  const m = await prisma.splitMember.findFirst({ where: { groupId, userId, leftAt: null }, select: { id: true } });
  if (!m) throw new NotFoundError('Group not found');
  return { memberId: m.id };
}

export async function loadLedger(groupId: string) {
  const [members, expenses, settlements] = await Promise.all([
    prisma.splitMember.findMany({ where: { groupId }, select: { id: true } }),
    prisma.splitExpense.findMany({
      where: { groupId, deletedAt: null },
      select: { payers: { select: { memberId: true, baseAmount: true } }, shares: { select: { memberId: true, baseAmount: true } } },
    }),
    prisma.splitSettlement.findMany({
      where: { groupId, deletedAt: null },
      select: { fromMemberId: true, toMemberId: true, baseAmount: true },
    }),
  ]);
  const d = (v: { toString(): string }) => new Decimal(v.toString());
  return {
    memberIds: members.map((m) => m.id),
    expenses: expenses.map<LedgerExpense>((e) => ({
      payers: e.payers.map((p) => ({ memberId: p.memberId, baseAmount: d(p.baseAmount) })),
      shares: e.shares.map((s) => ({ memberId: s.memberId, baseAmount: d(s.baseAmount) })),
    })),
    settlements: settlements.map<LedgerSettlement>((s) => ({ fromMemberId: s.fromMemberId, toMemberId: s.toMemberId, baseAmount: d(s.baseAmount) })),
  };
}

type GroupRow = Awaited<ReturnType<typeof fetchGroup>>;
function fetchGroup(groupId: string) {
  return prisma.splitGroup.findUnique({ where: { id: groupId }, include: { members: { orderBy: { createdAt: 'asc' } } } });
}

async function toDto(userId: string, g: NonNullable<GroupRow>): Promise<SplitGroupDto> {
  const ledger = await loadLedger(g.id);
  const nets = memberNets(ledger.expenses, ledger.settlements, ledger.memberIds);
  const mine = g.members.find((m) => m.userId === userId && !m.leftAt);
  const members: SplitMemberDto[] = g.members.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    userId: m.userId,
    contactId: m.contactId,
    isMe: m.userId === userId,
    leftAt: m.leftAt?.toISOString() ?? null,
  }));
  return {
    id: g.id,
    name: g.name,
    type: g.type,
    baseCurrency: g.baseCurrency,
    simplifyDebts: g.simplifyDebts,
    archivedAt: g.archivedAt?.toISOString() ?? null,
    members,
    myNet: serializeMoney(mine ? nets.get(mine.id) ?? 0 : 0),
  };
}

export async function getGroup(userId: string, groupId: string): Promise<SplitGroupDto> {
  await requireMember(userId, groupId);
  const g = await fetchGroup(groupId);
  if (!g) throw new NotFoundError('Group not found');
  return toDto(userId, g);
}

async function memberDataForContact(userId: string, contactId: string) {
  const c = await getContactRow(userId, contactId);
  return { contactId: c.id, userId: c.linkedUserId, displayName: c.name };
}

export async function createGroup(userId: string, input: CreateGroupInput): Promise<SplitGroupDto> {
  const name = input.name.trim();
  if (!name) throw new BadRequestError('Group name is required');
  const baseCurrency = (input.baseCurrency ?? 'INR').toUpperCase();
  if (!CCY.test(baseCurrency)) throw new BadRequestError('Invalid currency code');
  const others = await Promise.all((input.contactIds ?? []).map((id) => memberDataForContact(userId, id)));
  const seen = new Set<string>([userId]);
  for (const o of others) {
    if (o.userId && seen.has(o.userId)) throw new ConflictError('That person is already in the group');
    if (o.userId) seen.add(o.userId);
  }

  const groupId = await runInTransaction(async (tx) => {
    const g = await tx.splitGroup.create({
      data: { name, type: input.type ?? 'OTHER', baseCurrency, simplifyDebts: input.simplifyDebts ?? true, createdById: userId },
    });
    await tx.splitMember.create({ data: { groupId: g.id, userId, displayName: input.myDisplayName.trim() || 'Me' } });
    for (const o of others) await tx.splitMember.create({ data: { groupId: g.id, ...o } });
    await writeActivity(tx, g.id, userId, 'GROUP_CREATED', { name });
    return g.id;
  });
  return getGroup(userId, groupId);
}

export async function listGroups(userId: string, opts: { includeDirect?: boolean; includeArchived?: boolean } = {}): Promise<SplitGroupDto[]> {
  const rows = await prisma.splitGroup.findMany({
    where: {
      members: { some: { userId, leftAt: null } },
      ...(opts.includeDirect ? {} : { type: { not: 'DIRECT' } }),
      ...(opts.includeArchived ? {} : { archivedAt: null }),
    },
    include: { members: { orderBy: { createdAt: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  });
  return Promise.all(rows.map((g) => toDto(userId, g)));
}

export async function updateGroup(
  userId: string,
  groupId: string,
  patch: { name?: string; type?: 'TRIP' | 'HOME' | 'COUPLE' | 'OTHER'; simplifyDebts?: boolean; archived?: boolean },
): Promise<SplitGroupDto> {
  await requireMember(userId, groupId);
  await runInTransaction(async (tx) => {
    await tx.splitGroup.update({
      where: { id: groupId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.simplifyDebts !== undefined ? { simplifyDebts: patch.simplifyDebts } : {}),
        ...(patch.archived !== undefined ? { archivedAt: patch.archived ? new Date() : null } : {}),
      },
    });
    await writeActivity(tx, groupId, userId, 'GROUP_UPDATED', patch);
  });
  return getGroup(userId, groupId);
}

export async function addMember(userId: string, groupId: string, contactId: string): Promise<SplitMemberDto> {
  await requireMember(userId, groupId);
  const data = await memberDataForContact(userId, contactId);
  if (data.userId) {
    const dup = await prisma.splitMember.findFirst({ where: { groupId, userId: data.userId } });
    if (dup) throw new ConflictError('That person is already in the group');
  }
  const m = await runInTransaction(async (tx) => {
    const row = await tx.splitMember.create({ data: { groupId, ...data } });
    await writeActivity(tx, groupId, userId, 'MEMBER_ADDED', { memberId: row.id, displayName: row.displayName });
    return row;
  });
  return { id: m.id, displayName: m.displayName, userId: m.userId, contactId: m.contactId, isMe: false, leftAt: null };
}

export async function removeMember(userId: string, groupId: string, memberId: string): Promise<void> {
  await requireMember(userId, groupId);
  const ledger = await loadLedger(groupId);
  if (!ledger.memberIds.includes(memberId)) throw new NotFoundError('Member not found');
  const net = memberNets(ledger.expenses, ledger.settlements, ledger.memberIds).get(memberId)!;
  if (!net.isZero()) throw new ConflictError('SPLIT_MEMBER_HAS_BALANCE: settle this member to zero first');
  const involved = ledger.expenses.some((e) => e.payers.some((p) => p.memberId === memberId) || e.shares.some((s) => s.memberId === memberId));
  await runInTransaction(async (tx) => {
    // Keep the row (history references it) once they took part in anything.
    if (involved) await tx.splitMember.update({ where: { id: memberId }, data: { leftAt: new Date() } });
    else await tx.splitMember.delete({ where: { id: memberId } });
    await writeActivity(tx, groupId, userId, 'MEMBER_REMOVED', { memberId });
  });
}

export async function getOrCreateDirectGroup(userId: string, myDisplayName: string, contactId: string): Promise<SplitGroupDto> {
  const other = await memberDataForContact(userId, contactId);
  const existing = await prisma.splitGroup.findFirst({
    where: {
      type: 'DIRECT',
      AND: [
        { members: { some: { userId, leftAt: null } } },
        { members: { some: other.userId ? { userId: other.userId } : { contactId } } },
      ],
    },
    select: { id: true },
  });
  if (existing) return getGroup(userId, existing.id);
  const groupId = await runInTransaction(async (tx) => {
    const g = await tx.splitGroup.create({ data: { name: other.displayName, type: 'DIRECT', createdById: userId } });
    await tx.splitMember.create({ data: { groupId: g.id, userId, displayName: myDisplayName.trim() || 'Me' } });
    await tx.splitMember.create({ data: { groupId: g.id, ...other } });
    return g.id;
  });
  return getGroup(userId, groupId);
}
