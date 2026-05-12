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
import { enqueuePendingReminders } from '../services/rental.reminders.service.js';

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

let reminderScanRunning = false;

export async function runReminderEnqueueJob(): Promise<void> {
  if (reminderScanRunning) {
    logger.warn('[cron] rental reminder scan already running — skipping');
    return;
  }
  reminderScanRunning = true;
  const t0 = Date.now();
  try {
    const queued = await runAsSystem(() => enqueuePendingReminders());
    logger.info(
      { queued, ms: Date.now() - t0 },
      '[cron] rental reminder scan done',
    );
  } catch (err) {
    logger.error({ err }, '[cron] rental reminder scan failed');
  } finally {
    reminderScanRunning = false;
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
  // 09:00 IST every day — reminder enqueue. Pushed PENDING_APPROVAL
  // rows into the queue at lead days 5/3/1/0; landlord reviews + sends
  // through the UI. Scheduled after most people's morning routine so
  // they see fresh reminders ready when they open the app.
  cron.schedule('0 9 * * *', () => void runReminderEnqueueJob(), {
    timezone: TZ,
  });

  logger.info('[cron] scheduled: rental overdue @01:00 IST, reminder scan @09:00 IST');
}
