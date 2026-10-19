import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';

// An empty mailbox: no network, so the test only proves the job runs.
vi.mock('../../src/ingestion/gmail/gmailMessageLister.js', async (orig) => ({
  ...(await orig<typeof import('../../src/ingestion/gmail/gmailMessageLister.js')>()),
  listMessageIdsPage: vi.fn(async () => ({ ids: [], nextPageToken: null })),
}));

const { runScanJob } = await import('../../src/jobs/gmailScanWorker.js');

/**
 * The Bull worker calls runScanJob with no request context. GmailScanJob is
 * row-level-secured, so without a context the job is invisible and was
 * dropped as "missing" — no scan ever ran. The worker must pick up the job.
 */
describe('gmail scan worker context', () => {
  let scope: TestScope;
  let scanJobId: string;

  beforeAll(async () => {
    scope = await createTestScope('scan-ctx');
    await runAsSystem(async () => {
      const mb = await prisma.mailboxAccount.create({
        data: { userId: scope.userId, provider: 'GMAIL_OAUTH', googleEmail: 'ctx@example.com' },
      });
      const job = await prisma.gmailScanJob.create({
        data: {
          userId: scope.userId,
          mailboxId: mb.id,
          lookbackFrom: new Date('2026-01-01'),
          lookbackTo: new Date('2026-01-02'),
          kind: 'INSURANCE',
        },
      });
      scanJobId = job.id;
    });
  });
  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.gmailScanJob.deleteMany({ where: { userId: scope.userId } });
      await prisma.mailboxAccount.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it('runs a queued scan job without an ambient user context', async () => {
    await runScanJob(scanJobId);
    const job = await runAsSystem(() => prisma.gmailScanJob.findUniqueOrThrow({ where: { id: scanJobId } }));
    expect(job.status).toBe('COMPLETED');
    expect(job.totalMessages).toBe(0);
  });
});
