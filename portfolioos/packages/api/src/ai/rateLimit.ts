/**
 * AI Assistant — tier gating + daily rate limit.
 *
 * PlanTier → daily message quota:
 *   FREE         → 30 messages/day
 *   PLUS         → 100 messages/day
 *   FAMILY       → 200 messages/day
 *   PRO_ADVISOR  → 500 messages/day
 *
 * The daily counter is a single AiUsage row per (user, date). Increment
 * on each successful assistant response (not on the user's message).
 */

import type { PlanTier } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: 'tier_locked' | 'daily_cap';
  used: number;
  limit: number;
  resetsAt: string;
}

function dailyLimitFor(plan: PlanTier): number {
  // MVP gating: assistant is open to every authenticated user; tiers
  // just widen the daily quota. Real "wealth-tier lock" comes back
  // when subscription billing is live. FREE users would otherwise hit a
  // 403 immediately, which is the wrong first impression during beta.
  switch (plan) {
    case 'PRO_ADVISOR':
      return 500;
    case 'FAMILY':
      return 200;
    case 'PLUS':
      return 100;
    case 'FREE':
    default:
      return 30;
  }
}

function todayDate(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function tomorrowIso(): string {
  const d = todayDate();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export async function checkQuota(userId: string): Promise<QuotaCheckResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  const plan = user?.plan ?? 'FREE';
  const limit = dailyLimitFor(plan);
  if (limit === 0) {
    return {
      allowed: false,
      reason: 'tier_locked',
      used: 0,
      limit: 0,
      resetsAt: tomorrowIso(),
    };
  }
  const row = await prisma.aiUsage.findUnique({
    where: { userId_date: { userId, date: todayDate() } },
  });
  const used = row?.messageCount ?? 0;
  if (used >= limit) {
    return {
      allowed: false,
      reason: 'daily_cap',
      used,
      limit,
      resetsAt: tomorrowIso(),
    };
  }
  return { allowed: true, used, limit, resetsAt: tomorrowIso() };
}

export async function incrementUsage(userId: string): Promise<void> {
  await prisma.aiUsage.upsert({
    where: { userId_date: { userId, date: todayDate() } },
    create: {
      userId,
      date: todayDate(),
      messageCount: 1,
    },
    update: {
      messageCount: { increment: 1 },
    },
  });
}
