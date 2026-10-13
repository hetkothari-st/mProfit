/**
 * Review reminders for signed wills (spec: every 2 years + manual). One alert
 * per will per due date. `dueWillReviewUserIds` reads across users and runs
 * under runAsSystem; everything else runs under runAsUser(userId), so RLS
 * confines it to that user's wills and alerts. Alert text holds a version
 * number and a date, never a name.
 */
import { formatDateOnly, willNextReviewDate, type WillReviewedWire } from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { ConflictError } from '../../lib/errors.js';
import { dayOf, isoDay, loadOwnedWill, todayIst } from './willStore.js';

export const WILL_REVIEW_ALERT_TYPE = 'WILL_REVIEW_DUE' as const;

export function willReviewKey(willId: string, dueOn: string): string {
  return `will_review:${willId}:${dueOn}`;
}

/** Users with a signed will due for review, plus users holding an open reminder that may need closing. */
export async function dueWillReviewUserIds(today: string, only?: string[]): Promise<string[]> {
  const scope = only ? { userId: { in: only } } : {};
  const [due, open] = await Promise.all([
    prisma.will.findMany({
      where: {
        ...scope,
        status: 'EXECUTED',
        nextReviewAt: { lte: dayOf(today) },
        user: { isActive: true, deletionScheduledFor: null },
      },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.alert.findMany({
      where: { ...scope, type: WILL_REVIEW_ALERT_TYPE, isActive: true },
      select: { userId: true },
      distinct: ['userId'],
    }),
  ]);
  return [...new Set([...due, ...open].map((r) => r.userId))].sort();
}

export interface WillReviewSyncResult {
  created: number;
  resolved: number;
}

/**
 * Raise the reminder for every due signed will that never had one for this due
 * date (a reminder the user dismissed counts: it is not raised again), and
 * close open reminders whose will is no longer due.
 */
export async function syncWillReviewAlerts(userId: string, today: string): Promise<WillReviewSyncResult> {
  const due = await prisma.will.findMany({
    where: { userId, status: 'EXECUTED', nextReviewAt: { lte: dayOf(today) } },
    select: { id: true, version: true, executedAt: true, nextReviewAt: true },
  });
  const keep = new Set<string>();
  let created = 0;
  for (const w of due) {
    if (!w.nextReviewAt) continue;
    const dueOn = isoDay(w.nextReviewAt);
    const key = willReviewKey(w.id, dueOn);
    keep.add(key);
    const existing = await prisma.alert.findFirst({
      where: { userId, type: WILL_REVIEW_ALERT_TYPE, metadata: { path: ['key'], equals: key } },
      select: { id: true },
    });
    if (existing) continue;
    const signed = w.executedAt ? ` was signed on ${formatDateOnly(isoDay(w.executedAt))}` : ' was signed';
    await prisma.alert.create({
      data: {
        userId,
        type: WILL_REVIEW_ALERT_TYPE,
        title: 'Time to review your will',
        description: `Version ${w.version}${signed}. Check it still fits your family and your assets.`,
        triggerDate: dayOf(dueOn),
        metadata: { key, willId: w.id, version: w.version, dueOn },
      },
    });
    created++;
  }
  const open = await prisma.alert.findMany({
    where: { userId, type: WILL_REVIEW_ALERT_TYPE, isActive: true },
    select: { id: true, metadata: true },
  });
  const stale = open
    .filter((x) => {
      const key = (x.metadata as { key?: unknown } | null)?.key;
      return typeof key !== 'string' || !keep.has(key);
    })
    .map((x) => x.id);
  if (stale.length > 0) {
    await prisma.alert.updateMany({ where: { id: { in: stale }, userId }, data: { isActive: false } });
  }
  return { created, resolved: stale.length };
}

/** "Reviewed - no changes": the next review is two years from today; any open reminder closes. */
export async function markWillReviewed(
  userId: string,
  willId: string,
  deps: { today?: () => string } = {},
): Promise<WillReviewedWire> {
  const today = (deps.today ?? todayIst)();
  const will = await loadOwnedWill(userId, willId);
  if (will.status !== 'EXECUTED') {
    throw new ConflictError('Only a signed will has review reminders.', { reason: 'WILL_NOT_EXECUTED' });
  }
  const nextReviewAt = willNextReviewDate(today);
  await runInTransaction(async (tx) => {
    const res = await tx.will.updateMany({
      where: { id: will.id, userId, status: 'EXECUTED' },
      data: { nextReviewAt: dayOf(nextReviewAt) },
    });
    if (res.count === 0) {
      throw new ConflictError('Only a signed will has review reminders.', { reason: 'WILL_NOT_EXECUTED' });
    }
    await tx.alert.updateMany({
      where: { userId, type: WILL_REVIEW_ALERT_TYPE, isActive: true, metadata: { path: ['willId'], equals: will.id } },
      data: { isActive: false },
    });
  });
  return { nextReviewAt };
}
