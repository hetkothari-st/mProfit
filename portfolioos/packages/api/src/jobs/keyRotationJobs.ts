import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import { rotateAppEncryptionKey } from '../services/appKeyRotation.service.js';

/**
 * APP_ENCRYPTION_KEY rotation (services/appKeyRotation.service.ts). Runs on
 * boot only while APP_ENCRYPTION_KEY_PREVIOUS is set; otherwise a no-op.
 * SECRETS_KEY rotation runs in jobs/secretRotationJobs.ts.
 */
export function startKeyRotationJobs(): void {
  if (!process.env.APP_ENCRYPTION_KEY_PREVIOUS || !process.env.APP_ENCRYPTION_KEY) return;
  runAsSystem(() => rotateAppEncryptionKey()).then(
    (result) => logger.info(result, '[keys] APP_ENCRYPTION_KEY rotation pass'),
    (err: unknown) =>
      logger.error({ err: err instanceof Error ? err.message : String(err) }, '[keys] APP_ENCRYPTION_KEY rotation failed'),
  );
}
