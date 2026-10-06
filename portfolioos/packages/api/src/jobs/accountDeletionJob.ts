/**
 * Daily purge of accounts whose 30-day deletion grace period has ended.
 * See services/accountDeletion.service.ts.
 */
import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { purgeDueAccounts } from '../services/accountDeletion.service.js';

const TZ = 'Asia/Kolkata';
let running = false;

export async function runAccountDeletionPurge(): Promise<void> {
  if (running) {
    logger.warn('[cron] account deletion purge already running — skipping');
    return;
  }
  running = true;
  try {
    const outcome = await purgeDueAccounts();
    if (outcome.purged + outcome.skipped + outcome.failed > 0) {
      logger.info(outcome, '[cron] account deletion purge finished');
    }
  } catch (err) {
    logger.error({ err }, '[cron] account deletion purge failed');
  } finally {
    running = false;
  }
}

export function startAccountDeletionJob(): void {
  if (process.env.ENABLE_ACCOUNT_PURGE_CRON === 'false') {
    logger.info('[cron] account deletion purge disabled via ENABLE_ACCOUNT_PURGE_CRON=false');
    return;
  }
  // Daily 03:30 IST, a quiet window.
  cron.schedule('30 3 * * *', () => void runAccountDeletionPurge(), { timezone: TZ });
}
