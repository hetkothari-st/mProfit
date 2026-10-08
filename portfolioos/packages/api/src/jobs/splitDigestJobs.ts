import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { sendActivityDigests, sendWeeklyDigests } from '../services/split/notify.service.js';

let activityRunning = false;
let weeklyRunning = false;

async function runActivity(): Promise<void> {
  if (activityRunning) { logger.warn('[split.digest.cron] activity digest still running — skipping'); return; }
  activityRunning = true;
  try {
    logger.info({ out: await sendActivityDigests() }, '[split.digest.cron] activity digest done');
  } catch (err) {
    // Cron entrypoint: nothing upstream to rethrow to; the next hour retries.
    logger.error({ err }, '[split.digest.cron] activity digest failed');
  } finally { activityRunning = false; }
}

async function runWeekly(): Promise<void> {
  if (weeklyRunning) { logger.warn('[split.digest.cron] weekly digest still running — skipping'); return; }
  weeklyRunning = true;
  try {
    logger.info({ out: await sendWeeklyDigests() }, '[split.digest.cron] weekly digest done');
  } catch (err) {
    // Cron entrypoint: nothing upstream to rethrow to.
    logger.error({ err }, '[split.digest.cron] weekly digest failed');
  } finally { weeklyRunning = false; }
}

/** Hourly at :05 and Mondays 09:00 IST. Set ENABLE_SPLIT_DIGEST_CRON=false in test/CI. */
export function startSplitDigestJobs(): void {
  if (process.env.ENABLE_SPLIT_DIGEST_CRON === 'false') return;
  cron.schedule('5 * * * *', () => void runActivity(), { timezone: 'Asia/Kolkata' });
  cron.schedule('0 9 * * 1', () => void runWeekly(), { timezone: 'Asia/Kolkata' });
  logger.info('[split.digest.cron] scheduled (hourly :05, weekly Mon 09:00 IST)');
}
