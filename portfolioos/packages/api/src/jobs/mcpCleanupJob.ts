/**
 * AI Connector housekeeping: once a day, delete expired auth requests, used or
 * expired codes, expired tokens and clients nobody connected (spec section 7).
 * Logs counts only.
 */
import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { purgeExpiredMcpRows } from '../services/mcp/oauth.service.js';

export function startMcpCleanupJob(): void {
  cron.schedule('40 3 * * *', () => {
    purgeExpiredMcpRows()
      .then((r) => logger.info(r, '[mcpCleanup] swept'))
      .catch((err) => logger.error({ err }, '[mcpCleanup] failed'));
  }, { timezone: 'Asia/Kolkata' });
}
