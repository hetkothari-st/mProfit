import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { dropLocalFile, ensureLocalFile, persistLocalFile } from '../../src/lib/fileStore.js';
import { createImportJob, processImportJob } from '../../src/services/imports/import.service.js';
import { readBuffer } from '../../src/lib/documentStorage.js';

/**
 * Uploaded files used to live only on the container's disk: plain text, and
 * gone after every deploy. They are now sealed into the database on arrival
 * and put back on disk only while something needs them.
 */
describe('encrypted file store', () => {
  let scope: TestScope;
  const CSV = 'Date,Description,Amount\n2025-07-01,Test,100\n';
  const tmp = () => path.join(os.tmpdir(), `fs-test-${randomUUID()}.csv`);

  beforeAll(async () => {
    scope = await createTestScope('file-store');
  });
  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.importJob.deleteMany({ where: { userId: scope.userId } });
      await prisma.documentBlob.deleteMany({ where: { userId: scope.userId } });
      await prisma.userDataKey.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it('restores a wiped file byte-for-byte and drops the plain copy again', async () => {
    const p = tmp();
    fs.writeFileSync(p, CSV);
    const key = await persistLocalFile(scope.userId, p, 'test');
    const row = await runAsSystem(() => prisma.documentBlob.findUniqueOrThrow({ where: { storageKey: key } }));
    expect(row.keyed).toBe(true);
    expect(Buffer.from(row.data).includes(Buffer.from('2025-07-01'))).toBe(false);

    fs.unlinkSync(p); // a deploy wipes the disk
    await ensureLocalFile(scope.userId, key, p);
    expect(fs.readFileSync(p, 'utf8')).toBe(CSV);

    await dropLocalFile(key, p);
    expect(fs.existsSync(p)).toBe(false);
  });

  it('an import job survives its disk file disappearing, and leaves no plain copy behind', async () => {
    const p = tmp();
    fs.writeFileSync(p, CSV);
    const job = await createImportJob({
      userId: scope.userId,
      portfolioId: scope.portfolioId,
      type: 'GENERIC_CSV',
      fileName: 'statement.csv',
      filePath: p,
    });
    expect(job.blobKey).toBeTruthy();

    fs.unlinkSync(p); // deploy between upload and processing
    await scope.runAs(() => processImportJob(job.id));

    const after = await runAsSystem(() => prisma.importJob.findUniqueOrThrow({ where: { id: job.id } }));
    expect(after.errorMessage ?? '').not.toMatch(/ENOENT|no such file/i);
    expect(fs.existsSync(p)).toBe(false);
    expect((await readBuffer(scope.userId, job.blobKey!)).toString('utf8')).toBe(CSV);
  });
});
