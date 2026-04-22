import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { generateRenewalAlerts } from '../services/insurance.service.js';

let running = false;

async function runInsuranceRenewalJob(): Promise<void> {
  if (running) {
    logger.warn('[insurance.cron] previous run still in progress — skipping');
    return;
  }
  running = true;
  try {
    const created = await generateRenewalAlerts();
    logger.info({ created }, '[insurance.cron] renewal alert scan complete');
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      '[insurance.cron] renewal alert scan failed',
    );
  } finally {
    running = false;
  }
}

/**
 * Start the insurance renewal-alert cron. Runs daily at 02:00 IST.
 * Gated by ENABLE_INSURANCE_CRONS env var — set to "false" in test/CI.
 */
export function startInsuranceJobs(): void {
  if (process.env.ENABLE_INSURANCE_CRONS === 'false') return;
  // 02:00 IST = 20:30 UTC previous day
  cron.schedule('30 20 * * *', () => void runInsuranceRenewalJob(), {
    timezone: 'Asia/Kolkata',
  });
  logger.info('[insurance.cron] renewal alert job scheduled (daily 02:00 IST)');
}
