/** Group expense labels (spec §2 SplitLabel, §9). Group labels only; personal labels are not used. */
import type { SplitLabelDto } from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { requireMember } from './groups.service.js';
import { writeActivity } from './activity.js';

export const DEFAULT_LABELS: ReadonlyArray<{ name: string; color: string }> = [
  { name: 'Food', color: '#E07A5F' }, { name: 'Travel', color: '#3D5A80' }, { name: 'Rent', color: '#81B29A' },
  { name: 'Groceries', color: '#F2CC8F' }, { name: 'Utilities', color: '#6D597A' },
  { name: 'Entertainment', color: '#B56576' }, { name: 'Other', color: '#8D99AE' },
];
const COLOR = /^#[0-9a-fA-F]{6}$/;
const toDto = (l: { id: string; groupId: string | null; name: string; color: string }): SplitLabelDto =>
  ({ id: l.id, groupId: l.groupId!, name: l.name, color: l.color });

export async function listLabels(userId: string, groupId: string): Promise<SplitLabelDto[]> {
  await requireMember(userId, groupId);
  let rows = await prisma.splitLabel.findMany({ where: { groupId }, orderBy: { id: 'asc' } });
  if (rows.length === 0) {
    await runInTransaction(async (tx) => {
      for (const d of DEFAULT_LABELS) await tx.splitLabel.create({ data: { groupId, name: d.name, color: d.color } });
    });
    rows = await prisma.splitLabel.findMany({ where: { groupId } });
    const order = new Map(DEFAULT_LABELS.map((d, i) => [d.name, i]));
    rows.sort((x, y) => (order.get(x.name) ?? 99) - (order.get(y.name) ?? 99));
  }
  return rows.map(toDto);
}

export async function createLabel(userId: string, groupId: string, input: { name: string; color: string }): Promise<SplitLabelDto> {
  await requireMember(userId, groupId);
  const name = input.name.trim();
  if (name.length < 1 || name.length > 30) throw new BadRequestError('Label name must be 1–30 characters');
  if (!COLOR.test(input.color)) throw new BadRequestError('Pick a colour like #3D5A80');
  const dup = await prisma.splitLabel.findFirst({ where: { groupId, name: { equals: name, mode: 'insensitive' } } });
  if (dup) throw new ConflictError('That label already exists');
  return toDto(await prisma.splitLabel.create({ data: { groupId, name, color: input.color } }));
}

export async function deleteLabel(userId: string, labelId: string): Promise<void> {
  const l = await prisma.splitLabel.findUnique({ where: { id: labelId } });
  if (!l || !l.groupId) throw new NotFoundError('Label not found');
  await requireMember(userId, l.groupId);
  await prisma.splitLabel.delete({ where: { id: labelId } }); // SplitExpenseLabel cascades
}

export async function setExpenseLabels(userId: string, expenseId: string, labelIds: string[]): Promise<string[]> {
  const e = await prisma.splitExpense.findUnique({ where: { id: expenseId }, select: { id: true, groupId: true, description: true } });
  if (!e) throw new NotFoundError('Expense not found');
  await requireMember(userId, e.groupId);
  const unique = [...new Set(labelIds)];
  if (unique.length > 10) throw new BadRequestError('At most 10 labels');
  const found = await prisma.splitLabel.findMany({ where: { id: { in: unique } }, select: { id: true, groupId: true } });
  if (found.length !== unique.length || found.some((l) => l.groupId !== e.groupId)) {
    throw new BadRequestError('SPLIT_BAD_INPUT: label from another group');
  }
  await runInTransaction(async (tx) => {
    await tx.splitExpenseLabel.deleteMany({ where: { expenseId } });
    for (const labelId of unique) await tx.splitExpenseLabel.create({ data: { expenseId, labelId } });
    await writeActivity(tx, e.groupId, userId, 'EXPENSE_LABELED', { expenseId, description: e.description, labelIds: unique });
  });
  return unique.sort();
}
