import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';

/**
 * INVARIANT: a model-read row whose figures are not in the source document is
 * never imported. It becomes a failed row with the reason, so a person checks
 * it, and the rows that do check out import normally.
 *
 * The adapter runner is stubbed to return what an AI parser would after
 * verification: one clean row, one flagged row.
 */
vi.mock('../../src/ingestion/fileImport/runner.js', () => ({
  runFileImportAdapter: vi.fn(async () => {
    const base = (qty: string, problems?: string[]) => ({
      sourceAdapter: 'bank.statement.ai',
      sourceAdapterVer: '1',
      sourceRef: 'test',
      eventType: 'BUY',
      eventDate: '2024-01-10',
      amount: null,
      quantity: qty,
      price: '1',
      counterparty: null,
      instrumentIsin: null,
      instrumentSymbol: null,
      instrumentName: 'Test FD',
      accountLast4: null,
      currency: 'INR',
      confidence: '1',
      parserNotes: null,
      metadata: {
        assetClass: 'FIXED_DEPOSIT',
        transactionType: 'DEPOSIT',
        ...(problems ? { verificationProblems: problems } : {}),
      },
    });
    return {
      adapter: { id: 'bank.statement.ai', version: '1' },
      result: {
        ok: true,
        events: [base('50000'), base('99999', ['quantity 99999 does not appear in the document'])],
        warnings: [],
      },
    };
  }),
}));

const { createImportJob, processImportJob } = await import('../../src/services/imports/import.service.js');

describe('invariant: AI-read figures must be in the document', () => {
  let scope: TestScope;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-verify-'));

  beforeAll(async () => {
    scope = await createTestScope('ai-verify');
  });
  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.ingestionFailure.deleteMany({ where: { userId: scope.userId } });
      await prisma.importJob.deleteMany({ where: { userId: scope.userId } });
      await prisma.documentBlob.deleteMany({ where: { userId: scope.userId } });
      await prisma.userDataKey.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('imports the verified row and turns the unverified one into a failed row', async () => {
    const file = path.join(dir, 'statement.pdf');
    fs.writeFileSync(file, '%PDF-1.4 stub');
    const job = await createImportJob({
      userId: scope.userId,
      portfolioId: scope.portfolioId,
      type: 'BANK_STATEMENT_PDF',
      fileName: 'statement.pdf',
      filePath: file,
    });
    const result = await scope.runAs(() => processImportJob(job.id));

    expect(result.failed).toBe(1);
    const txs = await scope.runAs(() => prisma.transaction.findMany({ where: { portfolioId: scope.portfolioId } }));
    expect(txs.map((t) => t.quantity.toString())).toEqual(['50000']);

    const dlq = await scope.runAs(() =>
      prisma.ingestionFailure.findMany({ where: { userId: scope.userId, resolvedAt: null } }),
    );
    expect(dlq).toHaveLength(1);
    expect(dlq[0]!.errorMessage).toContain('quantity 99999 does not appear in the document');
  });
});
