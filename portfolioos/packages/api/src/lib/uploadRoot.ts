/**
 * The directory the API may write scratch files to.
 *
 * Everything that lands on disk here is a plain-text working copy: the bytes
 * are sealed into DocumentBlob as soon as they arrive (lib/fileStore), and
 * restored on demand. So the directory only has to be WRITABLE, not durable.
 *
 * It used to be `env.UPLOAD_DIR` unconditionally. In production that is
 * /data/uploads, owned by root, while the container runs as `node` — every
 * mkdir and write failed with EACCES and Gmail attachments and uploads were
 * dropped (logged at info, so nothing alerted). Now the configured directory
 * is probed once; if it cannot be written, a private directory under the OS
 * temp dir is used instead and the fallback is logged at error.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let cached: string | null = null;

function writable(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    // Random name, exclusive create: never follows a planted file or symlink.
    const probe = join(dir, `.write-probe-${randomUUID()}`);
    writeFileSync(probe, '', { mode: 0o600, flag: 'wx' });
    unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

/** The writable upload root (configured dir, or the temp fallback). */
export function uploadRoot(): string {
  if (cached) return cached;
  const configured = resolve(env.UPLOAD_DIR);
  if (writable(configured)) {
    cached = configured;
    return cached;
  }
  // A fresh, randomly named, owner-only directory: a fixed name in the shared
  // temp dir could be pre-created or symlinked by another local user.
  let fallback: string;
  try {
    fallback = mkdtempSync(join(tmpdir(), 'everypaisa-uploads-'));
  } catch {
    fallback = '';
  }
  if (!fallback || !writable(fallback)) {
    // Nothing writable at all: keep the configured dir so the real error
    // surfaces at the write site rather than being masked here.
    logger.error({ configured, fallback }, '[uploads] no writable upload directory');
    cached = configured;
    return cached;
  }
  logger.error(
    { configured, fallback },
    '[uploads] UPLOAD_DIR is not writable by this process; using a temp directory. Files are durable in DocumentBlob, so nothing is lost, but fix the directory permissions or UPLOAD_DIR.',
  );
  cached = fallback;
  return cached;
}

/** Every root a stored path may live under — the configured one and the one in use. */
export function uploadRoots(): string[] {
  return [...new Set([resolve(env.UPLOAD_DIR), uploadRoot()])];
}

/** Test hook: forget the probed root. */
export function resetUploadRootForTests(): void {
  cached = null;
}
