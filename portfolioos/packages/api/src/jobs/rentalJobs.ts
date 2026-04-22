/**
 * §8.1 Rental cron jobs.
 *
 * Daily @ 01:00 IST: flip every EXPECTED RentReceipt whose dueDate is
 * more than 7 days in the past to OVERDUE, so the alerts hub and the
 * Rental page surface delinquent receipts without any user intervention.
 *
 * Runs across all users (no userId filter) so it needs the system-
 * context RLS bypass — same pattern as vehicle and price jobs.
 */

import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import { markOverdueReceipts } from '../services/rental.service.js';

const TZ = 'Asia/Kolkata';
let running = false;

export async function runRentalOverdueJob(): Promise<void> {
  if (running) {
    logger.warn('[cron] rental overdue job already running — skipping');
    return;
  }
  running = true;
  const t0 = Date.now();
  try {
    const count = await runAsSystem(() => markOverdueReceipts());
    logger.info(
      { flipped: count, ms: Date.now() - t0 },
      '[cron] rental overdue job done',
    );
  } catch (err) {
    logger.error({ err }, '[cron] rental overdue job failed');
  } finally {
    running = false;
  }
}

export function startRentalJobs(): void {
  if (process.env.ENABLE_RENTAL_CRONS === 'false') {
    logger.info('[cron] rental jobs disabled via ENABLE_RENTAL_CRONS=false');
    return;
  }

  // 01:00 IST every day — quiet after midnight, before price syncs
  cron.schedule('0 1 * * *', () => void runRentalOverdueJob(), {
    timezone: TZ,
  });

  logger.info('[cron] scheduled: rental overdue daily @01:00 IST');
}
