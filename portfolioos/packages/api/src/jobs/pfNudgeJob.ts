/**
 * pfNudgeJob.ts
 *
 * Daily cron (node-cron) that scans ProvidentFundAccount rows and emits
 * PF_REFRESH_DUE alerts for accounts whose balance hasn't been refreshed in
 * ≥30 days. Uses node-cron (same pattern as insuranceJobs.ts / vehicleJobs.ts).
 *
 * Part of §5.1 task (PF refresh nudge), Plan E Track 5.
 */

import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { emitStaleAccountAlerts } from '../services/pfNudges.service.js';
import { runAsSystem } from '../lib/requestContext.js';

let running = false;

async function runPfNudgeJob(): Promise<void> {
  if (running) {
    logger.warn('[pf.nudges.cron] previous run still in progress — skipping');
    return;
  }
  running = true;
  try {
    const out = await runAsSystem(() => emitStaleAccountAlerts());
    logger.info({ out }, '[pf.nudges.cron] scan complete');
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      '[pf.nudges.cron] scan failed',
    );
  } finally {
    running = false;
  }
}

/**
 * Start the PF nudge cron. Runs daily at 09:00 IST.
 * Gated by ENABLE_PF_NUDGE_CRON env var — set to "false" in test/CI.
 */
export function startPfNudgeJob(): void {
  if (process.env.ENABLE_PF_NUDGE_CRON === 'false') return;
  // 09:00 IST = 03:30 UTC
  cron.schedule('30 3 * * *', () => void runPfNudgeJob(), {
    timezone: 'Asia/Kolkata',
  });
  logger.info('[pf.nudges.cron] scheduled (daily 09:00 IST)');
}
