import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from '../../src/config/env.js';
import { resetUploadRootForTests, uploadRoot, uploadRoots } from '../../src/lib/uploadRoot.js';
import { persistBytes, ensureLocalFile } from '../../src/lib/fileStore.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { runAsUser } from '../../src/lib/requestContext.js';

/**
 * Production's UPLOAD_DIR (/data/uploads) was root-owned while the API runs as
 * `node`, so every Gmail attachment and upload failed to write. The upload
 * root must fall back to a writable directory, and a stored file whose
 * original directory cannot be written must still be restorable.
 */
const original = env.UPLOAD_DIR;
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  env.UPLOAD_DIR = original;
  resetUploadRootForTests();
  while (cleanups.length) await cleanups.pop()!();
});

describe('upload root', () => {
  it('uses UPLOAD_DIR when it is writable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'up-ok-'));
    env.UPLOAD_DIR = dir;
    expect(uploadRoot()).toBe(dir);
  });

  it('falls back to a writable temp directory when UPLOAD_DIR cannot be written', () => {
    // A directory "inside" a regular file can never be created.
    const file = join(mkdtempSync(join(tmpdir(), 'up-bad-')), 'not-a-dir');
    writeFileSync(file, '');
    env.UPLOAD_DIR = join(file, 'uploads');
    const root = uploadRoot();
    expect(root).not.toBe(env.UPLOAD_DIR);
    expect(root.startsWith(tmpdir())).toBe(true);
    // Both roots are known, so stored paths under either can be cleaned up.
    expect(uploadRoots()).toHaveLength(2);
  });
});

describe('restoring a stored file', () => {
  it('restores into the writable root when the original location cannot be written', async () => {
    const scope: TestScope = await createTestScope('upload-restore');
    cleanups.push(scope.cleanup);
    const bytes = Buffer.from('%PDF-1.4 statement');
    const blobKey = await runAsUser(scope.userId, () => persistBytes(scope.userId, bytes, 'import', '.pdf'));

    // A path whose parent is a regular file can never be created — the
    // same outcome as production's root-owned /data/uploads.
    const blocker = join(mkdtempSync(join(tmpdir(), 'up-ro-')), 'readonly');
    writeFileSync(blocker, '');

    const stored = join(blocker, 'imports', 'cas.pdf');
    const local = await runAsUser(scope.userId, () => ensureLocalFile(scope.userId, blobKey, stored));
    expect(local).not.toBe(stored);
    expect(local.startsWith(uploadRoot())).toBe(true);
    expect(readFileSync(local)).toEqual(bytes);
  });

  it('returns the original path when the file is already there', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'up-here-'));
    const path = join(dir, 'x.pdf');
    writeFileSync(path, 'x');
    expect(await ensureLocalFile('u', 'k', path)).toBe(path);
    expect(existsSync(path)).toBe(true);
  });
});
