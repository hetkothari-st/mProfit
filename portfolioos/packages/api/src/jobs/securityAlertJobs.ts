import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import { runSecurityScan } from '../services/securityAlerts.service.js';

/** Every 15 minutes: look for credential stuffing and export/PII spikes. */
export function startSecurityAlertJobs(): void {
  if (process.env.ENABLE_SECURITY_SCAN === 'false') return;
  cron.schedule('*/15 * * * *', () => {
    runAsSystem(() => runSecurityScan()).then(
      (r) => {
        if (r.findings > 0) logger.info(r, '[security] scan');
      },
      (err: unknown) => logger.error({ err: err instanceof Error ? err.message : String(err) }, '[security] scan failed'),
    );
  });
}
