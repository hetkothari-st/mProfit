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
