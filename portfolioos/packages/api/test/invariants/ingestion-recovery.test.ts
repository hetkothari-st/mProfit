import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';

/**
 * INVARIANT: a failed email or import is never a dead end. It is recorded
 * once, retried automatically a bounded number of times, and marked resolved
 * when it goes through — so the data-quality banner lists only what is still
 * missing.
 *
 * The parser is stubbed: what is under test is the retry bookkeeping, not
 * parsing (covered by the parser suites).
 */
const outcome = { status: 'FAILED' as 'FAILED' | 'COMPLETED', failed: 1 };
vi.mock('../../src/services/imports/import.service.js', async (orig) => {
  const real = await orig<typeof import('../../src/services/imports/import.service.js')>();
  return {
    ...real,
    processImportJob: vi.fn(async (id: string) => {
      const { prisma: db } = await import('../../src/lib/prisma.js');
      await db.importJob.update({
        where: { id },
        data: { status: outcome.status, errorLog: { parser: 'stub' }, completedAt: new Date() },
      });
      return { parser: 'stub', total: 1, success: 1 - outcome.failed, failed: outcome.failed, errors: [] };
    }),
  };
});

const {
  recordSourceFailure,
  resolveSourceFailure,
  retryFailedImports,
  IMPORT_AUTO_RETRY_LIMIT,
} = await import('../../src/services/imports/ingestionRecovery.service.js');

describe('invariant: ingestion recovery', () => {
  let scope: TestScope;
  const later = () => new Date(Date.now() + 2 * 60 * 60_000); // past the 1h grace period

  beforeAll(async () => {
    scope = await createTestScope('ingest-recovery');
  });
  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.ingestionFailure.deleteMany({ where: { userId: scope.userId } });
      await prisma.importJob.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it('a failing message is recorded once and resolved when it goes through', () =>
    scope.runAs(async () => {
      const ref = 'gmail:acc1:msg1';
      for (let i = 0; i < 3; i++) {
        await recordSourceFailure({ userId: scope.userId, sourceAdapter: 'gmail.attachment', sourceRef: ref, error: new Error('EACCES') });
      }
      expect(await prisma.ingestionFailure.count({ where: { userId: scope.userId, sourceRef: ref, resolvedAt: null } })).toBe(1);
      await resolveSourceFailure(scope.userId, ref);
      const row = await prisma.ingestionFailure.findFirstOrThrow({ where: { userId: scope.userId, sourceRef: ref } });
      expect(row.resolvedAction).toBe('retry_succeeded');
    }));

  it('a failed import is retried, stops after the limit, and recovers when it goes through', async () => {
    const job = await scope.runAs(() =>
      prisma.importJob.create({
        data: {
          userId: scope.userId,
          portfolioId: scope.portfolioId,
          type: 'GENERIC_CSV',
          status: 'FAILED',
          fileName: 'stuck.csv',
          filePath: '/tmp/stuck.csv',
          blobKey: 'stub-key',
          completedAt: new Date(),
        },
      }),
    );
    await scope.runAs(() =>
      prisma.ingestionFailure.create({
        data: { userId: scope.userId, sourceAdapter: 'generic.csv', adapterVersion: '1', sourceRef: '/tmp/stuck.csv#row-1', errorMessage: 'bad row' },
      }),
    );

    // Too fresh: the user may still be fixing it.
    expect((await retryFailedImports(new Date())).attempted).toBe(0);

    outcome.status = 'FAILED';
    outcome.failed = 1;
    for (let i = 0; i < IMPORT_AUTO_RETRY_LIMIT; i++) {
      const s = await retryFailedImports(later());
      expect(s.attempted).toBe(1);
      expect(s.stillFailing).toBe(1);
    }
    // Limit reached: left alone, still visible.
    expect((await retryFailedImports(later())).attempted).toBe(0);

    // A job under the limit that now goes through is recovered and its old
    // row failures resolved.
    await scope.runAs(() =>
      prisma.importJob.update({ where: { id: job.id }, data: { status: 'FAILED', errorLog: { autoRetries: 1 } } }),
    );
    outcome.status = 'COMPLETED';
    outcome.failed = 0;
    const s = await retryFailedImports(later());
    expect(s.recovered).toBe(1);
    const after = await scope.runAs(() => prisma.importJob.findUniqueOrThrow({ where: { id: job.id } }));
    expect(after.status).toBe('COMPLETED');
    expect((after.errorLog as { autoRetries: number }).autoRetries).toBe(2);
    expect(
      await scope.runAs(() =>
        prisma.ingestionFailure.count({ where: { userId: scope.userId, sourceRef: '/tmp/stuck.csv#row-1', resolvedAt: null } }),
      ),
    ).toBe(0);
  });
});
