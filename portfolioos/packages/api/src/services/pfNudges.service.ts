/**
 * pfNudges.service.ts
 *
 * Daily scan for stale ProvidentFundAccount rows (no refresh in ≥30 days) and
 * emits PF_REFRESH_DUE alerts so the user is prompted to re-fetch their balance.
 *
 * Re-nudge logic:
 *   - An account qualifies if it is ACTIVE AND lastRefreshedAt is null or older
 *     than STALE_DAYS.
 *   - A second nudge won't fire until RENUDGE_DAYS have passed since lastNudgedAt.
 *   - If the user snoozed (nudgeSnoozedUntil in the future), skip until that date.
 *
 * Part of §5.1 task (PF refresh nudge), Plan E Track 5.
 */

import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { NotFoundError } from '../lib/errors.js';

const STALE_DAYS = 30;
const RENUDGE_DAYS = 7;

export async function emitStaleAccountAlerts(): Promise<{ emitted: number; scanned: number }> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);
  const renudgeBefore = new Date(now.getTime() - RENUDGE_DAYS * 24 * 60 * 60 * 1000);

  const accounts = await prisma.providentFundAccount.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { lastRefreshedAt: null },
        { lastRefreshedAt: { lt: staleBefore } },
      ],
      AND: [
        {
          OR: [
            { nudgeSnoozedUntil: null },
            { nudgeSnoozedUntil: { lt: now } },
          ],
        },
        {
          OR: [
            { lastNudgedAt: null },
            { lastNudgedAt: { lt: renudgeBefore } },
          ],
        },
      ],
    },
  });

  let emitted = 0;
  for (const acct of accounts) {
    const daysSince = acct.lastRefreshedAt
      ? Math.floor((now.getTime() - acct.lastRefreshedAt.getTime()) / (24 * 60 * 60 * 1000))
      : null;

    const title = `Refresh ${acct.type} account`;
    const description = daysSince != null
      ? `${acct.holderName} (···${acct.identifierLast4}) last refreshed ${daysSince} days ago — tap to refresh and keep data current.`
      : `${acct.holderName} (···${acct.identifierLast4}) has never been refreshed.`;

    // Dedup: only one unread PF_REFRESH_DUE alert per account
    const metaKey = `pf_refresh_due:${acct.id}`;
    const existing = await prisma.alert.findFirst({
      where: {
        userId: acct.userId,
        type: 'PF_REFRESH_DUE',
        isRead: false,
        isActive: true,
        metadata: { path: ['key'], equals: metaKey },
      },
    });
    if (existing) continue;

    await prisma.alert.create({
      data: {
        userId: acct.userId,
        portfolioId: acct.portfolioId ?? null,
        type: 'PF_REFRESH_DUE',
        title,
        description,
        triggerDate: now,
        metadata: {
          key: metaKey,
          providentFundAccountId: acct.id,
          daysSince: daysSince ?? null,
        },
      },
    });

    await prisma.providentFundAccount.update({
      where: { id: acct.id },
      data: { lastNudgedAt: now },
    });

    emitted++;
  }

  logger.info({ emitted, scanned: accounts.length }, '[pf.nudges] stale account scan complete');
  return { emitted, scanned: accounts.length };
}

export async function snoozeNudge(opts: {
  userId: string;
  accountId: string;
  days: number;
}): Promise<void> {
  const acct = await prisma.providentFundAccount.findFirst({
    where: { id: opts.accountId, userId: opts.userId },
  });
  if (!acct) throw new NotFoundError('PF account not found');

  const until = new Date(Date.now() + opts.days * 24 * 60 * 60 * 1000);
  await prisma.providentFundAccount.update({
    where: { id: acct.id },
    data: { nudgeSnoozedUntil: until },
  });

  await prisma.alert.updateMany({
    where: {
      userId: opts.userId,
      type: 'PF_REFRESH_DUE',
      isRead: false,
      isActive: true,
      metadata: { path: ['providentFundAccountId'], equals: acct.id },
    },
    data: { isRead: true },
  });
}
