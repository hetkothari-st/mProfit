/**
 * Per-user document storage.
 *
 * Bytes live in Postgres (`DocumentBlob`, keyed by `storageKey`). They used to
 * live on disk at ${UPLOAD_DIR}/documents/user_${userId}/${storageKey}, but the
 * API container's disk is wiped by every Railway deploy, so uploads silently
 * vanished. Reads still fall back to that disk path for any file written
 * before the move that happens to survive; nothing new is written there.
 *
 * `storageKey` is a random name including extension. Original file names are
 * stored separately in `Document.fileName` for display only (BUG-015).
 *
 * Every DB call runs as the owning user: the table's RLS policy is owner-only,
 * and callers such as the OnlyOffice download route have no request user.
 *
 * Bytes are sealed with the owner's data key (lib/userKeys) when one can be
 * made; `keyed` says which rows are. The AAD is the storage key, so a blob
 * moved to another row or another user does not decrypt.
 */

import { join } from 'node:path';
import { readFile, unlink, stat, open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import type { Response } from 'express';
import { env } from '../config/env.js';
import { NotFoundError } from './errors.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { runAsSystem, runAsUser } from './requestContext.js';
import { openForUser, SEAL_OVERHEAD, sealForUser, userKeysAvailable } from './userKeys.js';

const GONE = 'This file is no longer stored on the server. Please upload it again.';

function userDir(userId: string): string {
  // userId is a Prisma cuid — alphanumeric only — but be defensive against
  // path traversal anyway.
  if (!/^[a-zA-Z0-9]+$/.test(userId)) {
    throw new Error('Invalid userId for storage path');
  }
  return join(env.UPLOAD_DIR, 'documents', `user_${userId}`);
}

export function buildStorageKey(originalName: string): string {
  const ext = extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, '');
  return `${randomUUID()}${ext.slice(0, 12)}`;
}

export async function saveBuffer(
  userId: string,
  storageKey: string,
  buffer: Buffer,
): Promise<void> {
  userDir(userId); // validates the id, as the disk layout did
  const keyed = userKeysAvailable();
  const data = keyed ? await sealForUser(userId, storageKey, buffer) : buffer;
  await runAsUser(userId, () =>
    prisma.documentBlob.upsert({
      where: { storageKey },
      create: { storageKey, userId, data, keyed },
      update: { data, keyed },
    }),
  );
}

async function openBlob(userId: string, storageKey: string, blob: { data: Uint8Array; keyed: boolean }) {
  const bytes = Buffer.from(blob.data);
  return blob.keyed ? openForUser(userId, storageKey, bytes) : bytes;
}

export async function saveStream(
  userId: string,
  storageKey: string,
  stream: Readable,
): Promise<number> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  const buffer = Buffer.concat(chunks);
  await saveBuffer(userId, storageKey, buffer);
  return buffer.length;
}

/**
 * Stream a stored file into an HTTP response, safely.
 *
 * Files live on the container's disk, which a redeploy can wipe. Piping a
 * bare createReadStream() into `res` left its 'error' event unhandled, so a
 * missing file reached the process's uncaughtException handler and took the
 * whole API down. Open the file first — a missing one becomes a 404 the
 * caller's error handler turns into a message — and keep an error listener on
 * the stream for anything that fails mid-way.
 */
export async function streamFileTo(res: Response, path: string): Promise<void> {
  let handle;
  try {
    handle = await open(path, 'r');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFoundError(GONE);
    }
    throw err;
  }
  const stream = handle.createReadStream();
  stream.on('error', (err) => {
    logger.error({ err, path }, '[documents] stream failed mid-response');
    res.destroy(err);
  });
  stream.pipe(res);
}

/** Bytes of a stored file. NotFoundError when neither the DB nor a legacy disk copy has it. */
export async function readBuffer(userId: string, storageKey: string): Promise<Buffer> {
  const blob = await runAsUser(userId, () =>
    prisma.documentBlob.findUnique({ where: { storageKey }, select: { userId: true, data: true, keyed: true } }),
  );
  if (blob && blob.userId === userId) return openBlob(userId, storageKey, blob);
  try {
    const legacy = await readFile(join(userDir(userId), storageKey));
    // Written before the move to Postgres and still on this container: copy it
    // in, so the next deploy doesn't lose it.
    await saveBuffer(userId, storageKey, legacy);
    return legacy;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new NotFoundError(GONE);
    throw err;
  }
}

export async function deleteFile(userId: string, storageKey: string): Promise<void> {
  await runAsUser(userId, () => prisma.documentBlob.deleteMany({ where: { storageKey, userId } }));
  try {
    await unlink(join(userDir(userId), storageKey));
  } catch (err) {
    // A legacy disk copy usually isn't there; anything else is worth knowing.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn({ err, storageKey }, '[documents] legacy file delete failed');
    }
  }
}

export async function fileSize(userId: string, storageKey: string): Promise<number> {
  const blob = await runAsUser(userId, () =>
    prisma.documentBlob.findUnique({ where: { storageKey }, select: { userId: true, data: true, keyed: true } }),
  );
  if (blob && blob.userId === userId) return blob.data.length - (blob.keyed ? SEAL_OVERHEAD : 0);
  const s = await stat(join(userDir(userId), storageKey));
  return s.size;
}

/**
 * Seal vault files stored before per-user keys existed. Idempotent and
 * batched; each row is re-read after sealing to prove it opens before the
 * plaintext is replaced. Runs at boot when APP_ENCRYPTION_KEY is set.
 */
export async function sealLegacyBlobs(batchSize = 20): Promise<{ sealed: number; failed: number }> {
  if (!userKeysAvailable()) return { sealed: 0, failed: 0 };
  let sealed = 0;
  let failed = 0;
  const skipped: string[] = [];
  for (;;) {
    const batch = await runAsSystem(() =>
      prisma.documentBlob.findMany({
        where: { keyed: false, ...(skipped.length > 0 && { storageKey: { notIn: skipped } }) },
        select: { storageKey: true, userId: true, data: true },
        take: batchSize,
      }),
    );
    if (batch.length === 0) break;
    for (const row of batch) {
      try {
        const plain = Buffer.from(row.data);
        const data = await sealForUser(row.userId, row.storageKey, plain);
        if (!(await openForUser(row.userId, row.storageKey, data)).equals(plain)) {
          throw new Error('sealed blob did not open back');
        }
        await runAsSystem(() =>
          prisma.documentBlob.update({ where: { storageKey: row.storageKey }, data: { data, keyed: true } }),
        );
        sealed += 1;
      } catch (err) {
        failed += 1;
        skipped.push(row.storageKey);
        logger.warn(
          { storageKey: row.storageKey, err: err instanceof Error ? err.message : String(err) },
          '[documents] could not seal a stored file',
        );
      }
    }
  }
  return { sealed, failed };
}
