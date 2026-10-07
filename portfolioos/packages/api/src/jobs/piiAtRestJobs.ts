import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import { backfillPiiAtRest } from '../services/piiAtRest.service.js';
import { sealLegacyBlobs } from '../lib/documentStorage.js';
import { sealLegacyInviteTokens } from '../lib/inviteToken.js';
import { sealLegacyGmailDocs } from '../lib/fileStore.js';

/**
 * Encrypt PAN and vehicle registration numbers still stored as plain text
 * (migration 20260918100000). Runs once on start; idempotent, so safe on every
 * start. Mirrors jobs/insuranceJobs.ts, which does the same for policy numbers.
 *
 * Gated by ENABLE_PII_BACKFILL — set to "false" in test/CI.
 */
export function startPiiAtRestJobs(): void {
  if (process.env.ENABLE_PII_BACKFILL === 'false') return;
  // Gmail attachments: encrypted copy for old rows, no lingering plain copies.
  runAsSystem(() => sealLegacyGmailDocs()).then(
    (result) => {
      if (result.sealed + result.dropped + result.failed > 0) logger.info(result, '[pii] sealed stored Gmail attachments');
    },
    (err: unknown) => {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, '[pii] Gmail attachment sealing failed');
    },
  );
  // Invitation tokens are encrypted under SECRETS_KEY, so this one does not
  // wait for APP_ENCRYPTION_KEY.
  runAsSystem(() => sealLegacyInviteTokens()).then(
    (result) => {
      if (result.clients + result.familyInvitations > 0) logger.info(result, '[pii] sealed stored invitation tokens');
    },
    (err: unknown) => {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, '[pii] invitation token sealing failed');
    },
  );
  if (!process.env.APP_ENCRYPTION_KEY) {
    logger.warn('[pii] APP_ENCRYPTION_KEY is not set — PAN and registration numbers stay unencrypted until it is');
    return;
  }
  runAsSystem(() => backfillPiiAtRest()).then(
    (result) => {
      if (result.users + result.clients + result.vehicles + result.loans + result.sealedFields + result.failed > 0) {
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
  // Vault files stored before per-user keys: sealed under each owner's key.
  sealLegacyBlobs().then(
    (result) => {
      if (result.sealed + result.failed > 0) logger.info(result, '[pii] sealed stored vault files');
    },
    (err: unknown) => {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, '[pii] vault file sealing failed');
    },
  );
}
