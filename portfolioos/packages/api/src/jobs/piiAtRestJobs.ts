import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import { backfillPiiAtRest } from '../services/piiAtRest.service.js';

/**
 * Encrypt PAN and vehicle registration numbers still stored as plain text
 * (migration 20260918100000). Runs once on start; idempotent, so safe on every
 * start. Mirrors jobs/insuranceJobs.ts, which does the same for policy numbers.
 *
 * Gated by ENABLE_PII_BACKFILL — set to "false" in test/CI.
 */
export function startPiiAtRestJobs(): void {
  if (process.env.ENABLE_PII_BACKFILL === 'false') return;
  if (!process.env.APP_ENCRYPTION_KEY) {
    logger.warn('[pii] APP_ENCRYPTION_KEY is not set — PAN and registration numbers stay unencrypted until it is');
    return;
  }
  runAsSystem(() => backfillPiiAtRest()).then(
    (result) => {
      if (result.users + result.clients + result.vehicles + result.failed > 0) {
        logger.info(
          { ...result, plaintextCleared: process.env.PII_BACKFILL_CLEAR_PLAINTEXT === 'true' },
          '[pii] encrypted saved identifiers',
        );
      }
    },
    (err: unknown) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        '[pii] identifier encryption run failed',
      );
    },
  );
}
