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
import { mkdir, writeFile, readFile, unlink, stat } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { env } from '../config/env.js';

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

export function readStream(userId: string, storageKey: string) {
  return createReadStream(join(userDir(userId), storageKey));
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
