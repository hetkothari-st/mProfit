/**
 * Daily will review reminders (Will Maker part 2).
 *
 * Context: the user list is read once under runAsSystem (it spans users); each
 * user's wills and alerts are then handled under runAsUser(userId), so RLS
 * confines every step to that user. Deliberately NOT the alertJobs.ts pattern,
 * which runs its scanners with no RLS context at all. Single-flight: an
 * overlapping call returns null. Logs carry ids and error names only.
 */
import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { runAsSystem, runAsUser } from '../lib/requestContext.js';
import {
  dueWillReviewUserIds, syncWillReviewAlerts, type WillReviewSyncResult,
} from '../services/will/willReview.service.js';
import { todayIst } from '../services/will/willStore.js';

export interface WillReviewRunOptions {
  today?: string;
  /** Limit the run to these users (tests, manual re-runs). Default: every due user. */
  userIds?: string[];
  /** Per-user step; seam for tests. Default: syncWillReviewAlerts. */
  sync?: (userId: string, today: string) => Promise<WillReviewSyncResult>;
}

export interface WillReviewRunResult {
  users: number;
  created: number;
  resolved: number;
  failedUsers: number;
}

let running = false;

export async function runWillReviewChecks(options: WillReviewRunOptions = {}): Promise<WillReviewRunResult | null> {
  if (running) {
    logger.warn('[willReview] run already in progress - skipping');
    return null;
  }
  running = true;
  try {
    const today = options.today ?? todayIst();
    const userIds = await runAsSystem(() => dueWillReviewUserIds(today, options.userIds));
    const sync = options.sync ?? syncWillReviewAlerts;
    const result: WillReviewRunResult = { users: userIds.length, created: 0, resolved: 0, failedUsers: 0 };
    for (const userId of userIds) {
      try {
        const r = await runAsUser(userId, () => sync(userId, today));
        result.created += r.created;
        result.resolved += r.resolved;
      } catch (err) {
        // One user's failure must not cost everyone else their reminder; counted and logged.
        result.failedUsers++;
        logger.error({ userId, errName: err instanceof Error ? err.name : 'unknown' }, '[willReview] user skipped');
      }
    }
    return result;
  } finally {
    running = false;
  }
}

export async function runWillReviewJob(): Promise<void> {
  try {
    const result = await runWillReviewChecks();
    if (result) logger.info(result, '[willReview] daily run done');
  } catch (err) {
    logger.error({ errName: err instanceof Error ? err.name : 'unknown' }, '[willReview] daily run failed');
  }
}

export function startWillReviewJob(): void {
  if (process.env.ENABLE_ALERT_CRONS === 'false') return;
  cron.schedule('15 9 * * *', () => void runWillReviewJob(), { timezone: 'Asia/Kolkata' });
  logger.info('[willReview] scheduled daily at 09:15 IST');
}
