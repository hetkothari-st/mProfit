/**
 * Daily net-worth snapshot cron.
 *
 * Iterates every active user, reuses getDashboardNetWorth() (no re-implementing
 * net-worth math), and upserts one NetWorthSnapshot row per user per day so the
 * dashboard trend chart has a time series to render.
 *
 * Scheduled comfortably after the last EOD price refresh of the day
 * (commodities @23:30 IST — see priceJobs.ts) so today's closing prices have
 * landed in HoldingProjection before the snapshot reads it.
 */

import cron from 'node-cron';
import type { NetWorthSnapshot } from '@prisma/client';
import { logger } from '../lib/logger.js';
import { runAsSystem, runAsUser } from '../lib/requestContext.js';
import { prisma } from '../lib/prisma.js';
import { getDashboardNetWorth } from '../services/dashboard.service.js';

const TZ = 'Asia/Kolkata';
let running = false;

function todayAsOf(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function runNetWorthSnapshotForUser(
  userId: string,
  asOf: Date = todayAsOf(),
): Promise<NetWorthSnapshot> {
  return runAsUser(userId, async () => {
    const nw = await getDashboardNetWorth(userId);
    return prisma.netWorthSnapshot.upsert({
      where: { userId_asOf: { userId, asOf } },
      create: {
        userId,
        asOf,
        totalNetWorth: nw.totalNetWorth,
        totalLiabilities: nw.totalLiabilities,
        netWorthAfterLiabilities: nw.netWorthAfterLiabilities,
        breakdownJson: nw.allocationBreakdown,
      },
      update: {
        totalNetWorth: nw.totalNetWorth,
        totalLiabilities: nw.totalLiabilities,
        netWorthAfterLiabilities: nw.netWorthAfterLiabilities,
        breakdownJson: nw.allocationBreakdown,
      },
    });
  });
}

export async function runNetWorthSnapshotJob(): Promise<void> {
  if (running) {
    logger.warn('[cron] net worth snapshot job already running — skipping');
    return;
  }
  running = true;
  const t0 = Date.now();
  let ok = 0;
  let failed = 0;
  try {
    const users = await runAsSystem(() =>
      prisma.user.findMany({ where: { isActive: true }, select: { id: true } }),
    );
    const asOf = todayAsOf();
    for (const u of users) {
      try {
        await runNetWorthSnapshotForUser(u.id, asOf);
        ok++;
      } catch (err) {
        failed++;
        logger.error({ err, userId: u.id }, '[cron] net worth snapshot failed for user');
      }
    }
    logger.info({ ok, failed, ms: Date.now() - t0 }, '[cron] net worth snapshot job done');
  } catch (err) {
    logger.error({ err }, '[cron] net worth snapshot job failed');
  } finally {
    running = false;
  }
}

export function startNetWorthSnapshotJob(): void {
  if (process.env.ENABLE_NET_WORTH_SNAPSHOT_CRON === 'false') {
    logger.info('[cron] net worth snapshot job disabled via ENABLE_NET_WORTH_SNAPSHOT_CRON=false');
    return;
  }
  // 23:45 IST daily — after AMFI NAV (22:00), stock EOD (16:30 Mon-Fri) and
  // commodities EOD (23:30) so today's closing prices have landed first.
  cron.schedule('45 23 * * *', () => void runNetWorthSnapshotJob(), { timezone: TZ });
  logger.info('[cron] scheduled: net worth snapshot @23:45 IST');
}
