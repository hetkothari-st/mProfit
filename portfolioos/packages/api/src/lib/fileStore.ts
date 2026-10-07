/**
 * Durable, encrypted storage for files that arrive on local disk: uploaded
 * import files, Gmail attachments, transaction photos.
 *
 * The API container's disk is wiped by every Railway deploy, and anything on
 * it is plain text. So the bytes are sealed into DocumentBlob under the
 * owner's data key (lib/documentStorage + lib/userKeys) as soon as they
 * arrive, and the row keeps the `blobKey`. Parsers still want a real path, so
 * `ensureLocalFile` puts the file back at its original path from the database
 * when the disk copy is gone, and `dropLocalFile` removes the plaintext copy
 * once it is no longer needed.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile, access } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { readBuffer, saveBuffer } from './documentStorage.js';

/** Seal a local file into the encrypted store; returns its blob key. */
export async function persistLocalFile(userId: string, path: string, prefix: string): Promise<string> {
  const ext = extname(path).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 12);
  const key = `${prefix}-${randomUUID()}${ext}`;
  await saveBuffer(userId, key, await readFile(path));
  return key;
}

/** Seal bytes already in memory; returns its blob key. */
export async function persistBytes(userId: string, bytes: Buffer, prefix: string, ext = ''): Promise<string> {
  const key = `${prefix}-${randomUUID()}${ext.toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 12)}`;
  await saveBuffer(userId, key, bytes);
  return key;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Make sure `path` holds the file. If the disk copy is gone (a deploy wiped
 * it, or it was dropped after processing), write it back from the encrypted
 * store. Without a blob key there is nothing to restore from.
 */
export async function ensureLocalFile(userId: string, blobKey: string | null | undefined, path: string): Promise<void> {
  if (await exists(path)) return;
  if (!blobKey) return; // legacy row from before the store; caller sees the missing file
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, await readBuffer(userId, blobKey));
}

/** Remove the plain-text disk copy of a file the encrypted store holds. */
export async function dropLocalFile(blobKey: string | null | undefined, path: string): Promise<void> {
  if (!blobKey) return; // only drop what can be restored
  try {
    await unlink(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn({ err, path }, '[fileStore] could not remove local copy');
    }
  }
}

/** Statuses after which a Gmail attachment's plain copy is never needed again. */
const GMAIL_DOC_DONE = ['NOT_FINANCIAL', 'DUPLICATE', 'IMPORTED', 'PARSE_FAILED', 'REJECTED'] as const;

/**
 * Gmail attachments saved before the encrypted store, or whose plain copy was
 * never removed (duplicates skipped classification): seal what is still on
 * disk and remove the plain copies of finished ones. Idempotent; run
 * privileged on start.
 */
export async function sealLegacyGmailDocs(): Promise<{ sealed: number; dropped: number; failed: number }> {
  let sealed = 0;
  let dropped = 0;
  let failed = 0;
  const legacy = await prisma.gmailDiscoveredDoc.findMany({
    where: { blobKey: null },
    select: { id: true, userId: true, storagePath: true },
  });
  for (const doc of legacy) {
    if (!(await exists(doc.storagePath))) continue; // wiped by a deploy; nothing to keep
    try {
      const blobKey = await persistLocalFile(doc.userId, doc.storagePath, 'gmail');
      await prisma.gmailDiscoveredDoc.update({ where: { id: doc.id }, data: { blobKey } });
      sealed++;
    } catch (err) {
      failed++;
      logger.warn({ err: err instanceof Error ? err.message : String(err), docId: doc.id }, '[fileStore] could not seal Gmail attachment');
    }
  }
  const finished = await prisma.gmailDiscoveredDoc.findMany({
    where: { blobKey: { not: null }, status: { in: [...GMAIL_DOC_DONE] } },
    select: { blobKey: true, storagePath: true },
  });
  for (const doc of finished) {
    if (!(await exists(doc.storagePath))) continue;
    await dropLocalFile(doc.blobKey, doc.storagePath);
    dropped++;
  }
  return { sealed, dropped, failed };
}
