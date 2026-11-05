import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { runAsSystem, runAsUser } from '../lib/requestContext.js';
import { deleteFile } from '../lib/documentStorage.js';
import { dropLocalFile } from '../lib/fileStore.js';

/**
 * Deletes the stored originals of bank and card statements 30 days after
 * they were read (consent notice: "uploaded files are deleted once they are
 * read"). What was read from them stays: transactions, spending rows and
 * monthly totals, so the personal inflation rate still recomputes.
 *
 * Only statements: contract notes, CAS, NPS and insurance files are the
 * user's records and are kept. A statement that was never read successfully
 * (failed, password never given) is deleted 30 days after it arrived.
 * Nightly at 03:45 IST; ENABLE_RAW_FILE_PURGE=false disables it.
 */

const TZ = 'Asia/Kolkata';
export const PURGE_AFTER_DAYS = 30;
const DAY_MS = 86_400_000;

export const STATEMENT_IMPORT_TYPES = ['BANK_STATEMENT_PDF', 'BANK_STATEMENT_CSV'] as const;
export const STATEMENT_GMAIL_DOC_TYPES = ['BANK_STATEMENT', 'CC_STATEMENT'] as const;
/** Gmail attachments past these states are never read again. */
const GMAIL_FINISHED = ['IMPORTED', 'PARSE_FAILED', 'REJECTED', 'NOT_FINANCIAL', 'DUPLICATE'] as const;

export interface PurgeResult {
  imports: number;
  gmailDocs: number;
  failed: number;
}

export async function runRawFilePurge(now: Date = new Date()): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - PURGE_AFTER_DAYS * DAY_MS);
  const out: PurgeResult = { imports: 0, gmailDocs: 0, failed: 0 };

  const [jobs, docs] = await runAsSystem(() =>
    Promise.all([
      prisma.importJob.findMany({
        where: {
          type: { in: [...STATEMENT_IMPORT_TYPES] },
          filePurgedAt: null,
          OR: [
            { status: { in: ['COMPLETED', 'COMPLETED_WITH_ERRORS'] }, completedAt: { lt: cutoff } },
            { status: { in: ['FAILED', 'NEEDS_PASSWORD'] }, createdAt: { lt: cutoff } },
          ],
        },
        select: { id: true, userId: true, blobKey: true, filePath: true },
      }),
      prisma.gmailDiscoveredDoc.findMany({
        where: {
          classifiedDocType: { in: [...STATEMENT_GMAIL_DOC_TYPES] },
          status: { in: [...GMAIL_FINISHED] },
          updatedAt: { lt: cutoff },
          filePurgedAt: null,
        },
        select: { id: true, userId: true, blobKey: true, storagePath: true },
      }),
    ]),
  );

  const purge = async (userId: string, blobKey: string | null, path: string, mark: () => Promise<unknown>) => {
    try {
      await runAsUser(userId, async () => {
        if (blobKey) await deleteFile(userId, blobKey);
        // Any plain copy on disk goes too; dropLocalFile only skips when there
        // is no key to restore from, which no longer matters once purged.
        await dropLocalFile(blobKey ?? path, path);
        await mark();
      });
      return true;
    } catch (err) {
      out.failed += 1;
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, '[purge] could not delete a statement original');
      return false;
    }
  };

  for (const j of jobs) {
    const done = await purge(j.userId, j.blobKey, j.filePath, () =>
      prisma.importJob.update({ where: { id: j.id }, data: { blobKey: null, filePurgedAt: now } }),
    );
    if (done) out.imports += 1;
  }
  for (const d of docs) {
    const done = await purge(d.userId, d.blobKey, d.storagePath, () =>
      prisma.gmailDiscoveredDoc.update({ where: { id: d.id }, data: { blobKey: null, filePurgedAt: now } }),
    );
    if (done) out.gmailDocs += 1;
  }
  logger.info(out, '[cron] statement originals purged');
  return out;
}

/** NOT self-registering: called from index.ts. */
export function startRawFilePurgeJob(): void {
  if (process.env.ENABLE_RAW_FILE_PURGE === 'false') {
    logger.info('[cron] statement purge disabled via ENABLE_RAW_FILE_PURGE=false');
    return;
  }
  cron.schedule('45 3 * * *', () => void runRawFilePurge().catch((err) => logger.error({ err }, '[cron] statement purge failed')), { timezone: TZ });
  logger.info('[cron] scheduled: statement purge @03:45 IST daily');
}
