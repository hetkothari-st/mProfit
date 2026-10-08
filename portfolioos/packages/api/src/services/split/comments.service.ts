/**
 * Expense comments (spec §8). Soft delete; author-only delete; RLS pins authorUserId on insert.
 * There is deliberately no edit endpoint: RLS still lets members UPDATE comment rows, so the API must never expose body edits.
 */
import type { SplitCommentDto } from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { requireMember } from './groups.service.js';
import { writeActivity } from './activity.js';

async function loadExpense(userId: string, expenseId: string) {
  const e = await prisma.splitExpense.findUnique({ where: { id: expenseId }, select: { id: true, groupId: true, description: true, deletedAt: true } });
  if (!e) throw new NotFoundError('Expense not found');
  await requireMember(userId, e.groupId);
  return e;
}

async function names(groupId: string): Promise<Map<string, string>> {
  const ms = await prisma.splitMember.findMany({ where: { groupId, userId: { not: null } }, select: { userId: true, displayName: true } });
  return new Map(ms.map((m) => [m.userId!, m.displayName]));
}

export async function listComments(userId: string, expenseId: string): Promise<SplitCommentDto[]> {
  const e = await loadExpense(userId, expenseId);
  const [rows, who] = await Promise.all([
    prisma.splitComment.findMany({ where: { expenseId, deletedAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    names(e.groupId),
  ]);
  return rows.map((c) => ({
    id: c.id, expenseId: c.expenseId, authorUserId: c.authorUserId, authorName: who.get(c.authorUserId) ?? 'Former member',
    body: c.body, createdAt: c.createdAt.toISOString(), mine: c.authorUserId === userId,
  }));
}

export async function addComment(userId: string, expenseId: string, body: string): Promise<SplitCommentDto> {
  const e = await loadExpense(userId, expenseId);
  if (e.deletedAt) throw new BadRequestError('Restore the expense first');
  const text = body.trim();
  if (!text) throw new BadRequestError('Write a comment first');
  if (text.length > 1000) throw new BadRequestError('Comments can be at most 1000 characters');
  const c = await runInTransaction(async (tx) => {
    const row = await tx.splitComment.create({ data: { expenseId, authorUserId: userId, body: text } });
    await writeActivity(tx, e.groupId, userId, 'COMMENTED', { expenseId, description: e.description });
    return row;
  });
  const who = await names(e.groupId);
  return { id: c.id, expenseId, authorUserId: userId, authorName: who.get(userId) ?? 'You', body: c.body, createdAt: c.createdAt.toISOString(), mine: true };
}

export async function deleteComment(userId: string, commentId: string): Promise<void> {
  const c = await prisma.splitComment.findUnique({ where: { id: commentId } });
  if (!c || c.deletedAt) throw new NotFoundError('Comment not found');
  await loadExpense(userId, c.expenseId);
  if (c.authorUserId !== userId) throw new ForbiddenError('Only the author can delete a comment');
  await prisma.splitComment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
}
