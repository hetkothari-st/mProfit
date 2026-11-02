import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { runAsSystem, runAsUser } from '../lib/requestContext.js';
import { scanNewMail } from '../services/gmail/gmailScanJobs.service.js';

/**
 * Keeps every connected Gmail's financial documents fetched: once a night,
 * each mailbox gets the mail that arrived since its last scan (or its whole
 * history, if that was never fetched). Documents a scan could not sort
 * because the month's AI budget ran out are sorted by the next run.
 *
 * The mailboxes are listed as the system; each one is scanned as its owner,
 * so a scan only ever sees that user's rows.
 */
export async function runInboxScansForAll(now: Date = new Date()): Promise<Record<string, number>> {
  const mailboxes = await runAsSystem(() =>
    prisma.mailboxAccount.findMany({
      where: { provider: 'GMAIL_OAUTH', isActive: true },
      select: { id: true, userId: true },
    }),
  );
  const tally: Record<string, number> = {};
  for (const mb of mailboxes) {
    try {
      const outcome = await runAsUser(mb.userId, () => scanNewMail(mb.userId, mb.id, now));
      tally[outcome] = (tally[outcome] ?? 0) + 1;
    } catch (err) {
      tally['failed'] = (tally['failed'] ?? 0) + 1;
      logger.error({ err, mailboxId: mb.id }, '[gmailScan] nightly scan could not start');
    }
  }
  logger.info({ mailboxes: mailboxes.length, ...tally }, '[gmailScan] nightly scans queued');
  return tally;
}

/** Gated by ENABLE_GMAIL_SCAN_CRONS — set to "false" in test/CI. */
export function startGmailScanJobs(): void {
  if (process.env.ENABLE_GMAIL_SCAN_CRONS === 'false') return;
  // 05:00 IST: before the insurance scan (05:30) and the morning.
  cron.schedule(
    '0 5 * * *',
    () => {
      runInboxScansForAll().catch((err) => logger.error({ err }, '[gmailScan] nightly run failed'));
    },
    { timezone: 'Asia/Kolkata' },
  );
}
