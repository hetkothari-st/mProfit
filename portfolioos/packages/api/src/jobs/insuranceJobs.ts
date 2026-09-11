import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import { backfillPolicyNumberEncryption } from '../services/insurance.service.js';

/**
 * Insurance startup work. Premium reminders run in the daily alert scan
 * (alerts.service runAllAlertScans); here, once on start, any policy number
 * still stored in plain text is encrypted. Idempotent, so it's safe on every
 * start. Gated by ENABLE_INSURANCE_CRONS — set to "false" in test/CI.
 */
export function startInsuranceJobs(): void {
  if (process.env.ENABLE_INSURANCE_CRONS === 'false') return;
  if (!process.env.APP_ENCRYPTION_KEY) {
    logger.warn('[insurance] APP_ENCRYPTION_KEY is not set — policy numbers stay unencrypted until it is');
    return;
  }
  runAsSystem(() => backfillPolicyNumberEncryption()).then(
    ({ encrypted, failed }) => {
      if (encrypted > 0 || failed > 0) {
        logger.info({ encrypted, failed }, '[insurance] encrypted saved policy numbers');
      }
    },
    (err: unknown) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        '[insurance] policy number encryption run failed',
      );
    },
  );
}
