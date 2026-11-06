import { prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';

/**
 * What the user can do with a recommendation, and expiry
 * (docs/superpowers/specs/2026-11-06-act-on-it-design.md §6.1).
 *
 *   OPEN ──accept──▶ ACCEPTED ──seen in data (confirm.ts)──▶ DONE
 *   OPEN ──not now─▶ SNOOZED (7 days, then OPEN again)
 *   OPEN ──dismiss─▶ DISMISSED (skipped)          past expiresAt ─▶ EXPIRED (skipped)
 *   any undecided ──"did it elsewhere"──▶ DONE, confirmedBy USER
 *
 * Every function runs in the user's context; another user's id reads as not found.
 */

const DAY_MS = 86_400_000;
export const SNOOZE_DAYS = 7;

type Status = 'OPEN' | 'ACCEPTED' | 'DISMISSED' | 'SNOOZED' | 'DONE' | 'EXPIRED' | 'WITHDRAWN';

async function load(userId: string, id: string) {
  const rec = await prisma.advisorRecommendation.findFirst({
    where: { id, userId, supersededById: null },
    select: { id: true, status: true },
  });
  if (!rec) throw new NotFoundError('Recommendation not found');
  return rec;
}

async function move(userId: string, id: string, from: readonly Status[], data: Record<string, unknown>, now: Date) {
  const rec = await load(userId, id);
  if (!from.includes(rec.status as Status)) {
    throw new BadRequestError(`This advice is ${rec.status.toLowerCase()} and cannot be changed that way`);
  }
  await prisma.advisorRecommendation.update({ where: { id }, data: { ...data, statusChangedAt: now } });
}

export function acceptAdvice(userId: string, id: string, now: Date = new Date()): Promise<void> {
  return move(userId, id, ['OPEN', 'SNOOZED'], { status: 'ACCEPTED', acceptedAt: now, snoozedUntil: null }, now);
}

export function snoozeAdvice(userId: string, id: string, now: Date = new Date()): Promise<void> {
  return move(userId, id, ['OPEN', 'SNOOZED'], { status: 'SNOOZED', snoozedUntil: new Date(now.getTime() + SNOOZE_DAYS * DAY_MS) }, now);
}

export function dismissAdvice(userId: string, id: string, now: Date = new Date()): Promise<void> {
  return move(userId, id, ['OPEN', 'SNOOZED', 'ACCEPTED'], { status: 'DISMISSED', snoozedUntil: null }, now);
}

/** The user says they did it somewhere the app cannot see. Listed, never counted in the ₹ total. */
export function markDoneElsewhere(userId: string, id: string, now: Date = new Date()): Promise<void> {
  return move(
    userId,
    id,
    ['OPEN', 'SNOOZED', 'ACCEPTED', 'DISMISSED', 'EXPIRED'],
    { status: 'DONE', confirmedAt: now, confirmedBy: 'USER', snoozedUntil: null },
    now,
  );
}

/** Undecided advice past its expiry becomes EXPIRED (counted as skipped). Returns how many. */
export async function expireDue(userId: string, now: Date = new Date()): Promise<number> {
  const res = await prisma.advisorRecommendation.updateMany({
    where: { userId, status: { in: ['OPEN', 'SNOOZED'] }, supersededById: null, expiresAt: { lt: now } },
    data: { status: 'EXPIRED', statusChangedAt: now, snoozedUntil: null },
  });
  return res.count;
}
