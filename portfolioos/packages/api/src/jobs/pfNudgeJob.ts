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
import { emitStaleAccountAlerts } from '../services/pf/pfNudges.service.js';
import { runAsSystem } from '../lib/requestContext.js';

/** 09:00 every day, IST (see the timezone passed to cron.schedule). */
export const PF_NUDGE_CRON = '0 9 * * *';

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
  // The expression is read in Asia/Kolkata (the timezone option), so it is
  // written in IST. It used to be '30 3' — 03:30 UTC converted by hand — which
  // with the IST timezone fired at 03:30 IST, raising the reminder in the
  // middle of the night instead of at the 09:00 the docs promise.
  cron.schedule(PF_NUDGE_CRON, () => void runPfNudgeJob(), {
    timezone: 'Asia/Kolkata',
  });
  logger.info('[pf.nudges.cron] scheduled (daily 09:00 IST)');
}
