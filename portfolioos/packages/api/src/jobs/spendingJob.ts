import cron from 'node-cron';
import { SPENDING_CONSENT_VERSION } from '@everypaisa/shared';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { runAsSystem, runAsUser } from '../lib/requestContext.js';
import { syncSpending } from '../services/spending/spendingSync.js';
import { CANONICAL_SPEND_TYPES } from '../services/spending/sources/canonicalEventSource.js';

/**
 * Keeps the spending store (SpendTxn) in step with its sources. Nightly at
 * 03:15 IST, plus a one-off backfill shortly after the first boot that has
 * this job (recorded in AppSetting, so later deploys skip it).
 *
 * Only users who agreed to the spending consent notice and have bank events
 * or spending rows are synced. The user list
 * is read as system; each user's sync runs in their own context so row-level
 * security applies. One user's failure is logged and the rest still run.
 * ENABLE_SPENDING_SYNC=false disables both.
 */

const TZ = 'Asia/Kolkata';
const BOOT_DELAY_MS = 60_000;
// Bumped whenever the sync learns something new existing rows need:
// v2 categories (20261105140000), v3 recurring series + monthly totals (20261105160000).
export const SPENDING_BACKFILL_KEY = 'spending.backfill.v3';

let running = false;

async function usersToSync(): Promise<string[]> {
  // Only users who agreed to their bank spending being read (consent notice).
  const consented = new Set(
    (await prisma.inflationProfile.findMany({
      where: { spendingConsentAt: { not: null }, spendingConsentVersion: SPENDING_CONSENT_VERSION },
      select: { userId: true },
    })).map((p) => p.userId),
  );
  if (consented.size === 0) return [];
  const [fromEvents, fromStore] = await Promise.all([
    prisma.canonicalEvent.findMany({
      where: { eventType: { in: CANONICAL_SPEND_TYPES } },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.spendTxn.findMany({ select: { userId: true }, distinct: ['userId'] }),
  ]);
  return [...new Set([...fromEvents, ...fromStore].map((r) => r.userId))].filter((id) => consented.has(id));
}

export interface SpendingJobResult {
  users: number;
  failed: number;
  created: number;
  removed: number;
}

export async function runSpendingSync(): Promise<SpendingJobResult | null> {
  if (running) {
    logger.warn('[cron] spending sync already running — skipping');
    return null;
  }
  running = true;
  const out: SpendingJobResult = { users: 0, failed: 0, created: 0, removed: 0 };
  try {
    const userIds = await runAsSystem(() => usersToSync());
    for (const userId of userIds) {
      try {
        const r = await runAsUser(userId, () => syncSpending(userId));
        out.created += r.created;
        out.removed += r.removed;
      } catch (err) {
        out.failed += 1;
        logger.error({ err, userId }, '[cron] spending sync failed for user');
      }
    }
    out.users = userIds.length;
    logger.info(out, '[cron] spending sync done');
    return out;
  } catch (err) {
    logger.error({ err }, '[cron] spending sync failed');
    return null;
  } finally {
    running = false;
  }
}

/** Run the first full backfill once per database. */
export async function runSpendingBackfillOnce(): Promise<boolean> {
  const done = await runAsSystem(() => prisma.appSetting.findUnique({ where: { key: SPENDING_BACKFILL_KEY } }));
  if (done) return false;
  const result = await runSpendingSync();
  if (!result || result.failed > 0) return false; // try again on the next boot
  await runAsSystem(() =>
    prisma.appSetting.upsert({
      where: { key: SPENDING_BACKFILL_KEY },
      create: { key: SPENDING_BACKFILL_KEY, value: { at: new Date().toISOString(), users: result.users } },
      update: {},
    }),
  );
  return true;
}

/** NOT self-registering: called from index.ts. */
export function startSpendingJob(): void {
  if (process.env.ENABLE_SPENDING_SYNC === 'false') {
    logger.info('[cron] spending sync disabled via ENABLE_SPENDING_SYNC=false');
    return;
  }
  cron.schedule('15 3 * * *', () => void runSpendingSync(), { timezone: TZ });
  setTimeout(() => void runSpendingBackfillOnce().catch((err) => logger.error({ err }, '[cron] spending backfill failed')), BOOT_DELAY_MS).unref();
  logger.info('[cron] scheduled: spending sync @03:15 IST daily');
}
