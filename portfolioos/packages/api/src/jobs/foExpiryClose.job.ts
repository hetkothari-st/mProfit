import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import { scanExpiringPositions } from '../services/foExpiry.service.js';

const TZ = 'Asia/Kolkata';
let running = false;

async function runExpiryScan(): Promise<void> {
  if (running) {
    logger.warn('[cron] F&O expiry scan already running — skipping');
    return;
  }
  running = true;
  const t0 = Date.now();
  try {
    logger.info('[cron] F&O expiry scan starting');
    const r = await runAsSystem(() => scanExpiringPositions());
    logger.info({ r, ms: Date.now() - t0 }, '[cron] F&O expiry scan done');
  } catch (err) {
    logger.error({ err }, '[cron] F&O expiry scan failed');
  } finally {
    running = false;
  }
}

export function startFoExpiryJob(): void {
  if (process.env.ENABLE_FO_EXPIRY_CRON === 'false') return;
  // 17:30 IST Mon–Fri (after bhavcopy publishes settlement at 16:45)
  cron.schedule('30 17 * * 1-5', runExpiryScan, { timezone: TZ });
  logger.info('[cron] scheduled: F&O expiry scan @17:30 IST Mon–Fri');
}

export { runExpiryScan };
