import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import { rotateLegacySecrets } from '../services/secretRotation.service.js';

/**
 * Move stored third-party secrets off the legacy development key.
 *
 * Runs once on start when SECRETS_KEY is set. Idempotent: rows already in the
 * current format are skipped, so after the first successful run this is a
 * cheap scan. Mirrors jobs/insuranceJobs.ts and jobs/piiAtRestJobs.ts.
 *
 * Gated by ENABLE_SECRET_ROTATION — set to "false" in test/CI.
 */
export function startSecretRotationJobs(): void {
  if (process.env.ENABLE_SECRET_ROTATION === 'false') return;
  if (!process.env.SECRETS_KEY) return; // nothing to rotate onto
  runAsSystem(() => rotateLegacySecrets()).then(
    ({ rotated, undecryptable }) => {
      if (rotated > 0 || undecryptable > 0) {
        logger.info({ rotated, undecryptable }, '[secrets] re-encrypted stored secrets under SECRETS_KEY');
      }
    },
    (err: unknown) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        '[secrets] secret rotation run failed',
      );
    },
  );
}
