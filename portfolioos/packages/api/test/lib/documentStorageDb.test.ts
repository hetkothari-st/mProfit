import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { runAsUser } from '../../src/lib/requestContext.js';
import { env } from '../../src/config/env.js';
import {
  buildStorageKey,
  saveBuffer,
  readBuffer,
  fileSize,
  deleteFile,
} from '../../src/lib/documentStorage.js';
import { NotFoundError } from '../../src/lib/errors.js';

// Vault files lived on the API container's disk, which every Railway deploy
// wipes, so uploaded agreements and receipts silently disappeared. The bytes
// now live in Postgres.
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function person(label: string): Promise<TestScope> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  return scope;
}

describe('document storage', () => {
  it('keeps the bytes in the database, not on disk', async () => {
    const u = await person('docblob');
    const key = buildStorageKey('agreement.pdf');
    const bytes = Buffer.from('%PDF-1.4 test body');

    await runAsUser(u.userId, () => saveBuffer(u.userId, key, bytes));

    expect(existsSync(join(env.UPLOAD_DIR, 'documents', `user_${u.userId}`, key))).toBe(false);
    expect(await runAsUser(u.userId, () => readBuffer(u.userId, key))).toEqual(bytes);
    expect(await runAsUser(u.userId, () => fileSize(u.userId, key))).toBe(bytes.length);
  });

  it('replaces bytes on re-save and forgets them on delete', async () => {
    const u = await person('docblob-replace');
    const key = buildStorageKey('notes.docx');
    await runAsUser(u.userId, () => saveBuffer(u.userId, key, Buffer.from('v1')));
    await runAsUser(u.userId, () => saveBuffer(u.userId, key, Buffer.from('version 2')));
    expect((await runAsUser(u.userId, () => readBuffer(u.userId, key))).toString()).toBe('version 2');

    await runAsUser(u.userId, () => deleteFile(u.userId, key));
    await expect(runAsUser(u.userId, () => readBuffer(u.userId, key))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not hand one user's file to another", async () => {
    const a = await person('docblob-a');
    const b = await person('docblob-b');
    const key = buildStorageKey('secret.pdf');
    await runAsUser(a.userId, () => saveBuffer(a.userId, key, Buffer.from('mine')));
    await expect(runAsUser(b.userId, () => readBuffer(b.userId, key))).rejects.toBeInstanceOf(NotFoundError);
  });
});
