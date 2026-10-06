/**
 * Per-user document filesystem storage.
 *
 * Layout:
 *   ${UPLOAD_DIR}/documents/user_${userId}/${storageKey}
 *
 * `storageKey` is the random filename including extension. Original file
 * names are stored separately in `Document.fileName` for display only —
 * never trusted on disk (BUG-015).
 */

import { join } from 'node:path';
import { mkdir, writeFile, readFile, unlink, stat, open } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';
import { env } from '../config/env.js';
import { NotFoundError } from './errors.js';
import { logger } from './logger.js';

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
  const dir = userDir(userId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, storageKey), buffer);
}

export async function saveStream(
  userId: string,
  storageKey: string,
  stream: Readable,
): Promise<number> {
  const dir = userDir(userId);
  await mkdir(dir, { recursive: true });
  const target = join(dir, storageKey);
  let bytes = 0;
  stream.on('data', (chunk: Buffer) => {
    bytes += chunk.length;
  });
  await pipeline(stream, createWriteStream(target));
  return bytes;
}

export function storedFilePath(userId: string, storageKey: string): string {
  return join(userDir(userId), storageKey);
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
      throw new NotFoundError(
        'This file is no longer stored on the server. Please upload it again.',
      );
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

export async function readBuffer(userId: string, storageKey: string): Promise<Buffer> {
  return readFile(join(userDir(userId), storageKey));
}

export async function deleteFile(userId: string, storageKey: string): Promise<void> {
  await unlink(join(userDir(userId), storageKey)).catch(() => undefined);
}

export async function fileSize(userId: string, storageKey: string): Promise<number> {
  const s = await stat(join(userDir(userId), storageKey));
  return s.size;
}
