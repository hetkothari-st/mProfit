/**
 * Statement originals are deleted 30 days after they were read; everything
 * else (contract notes, CAS, insurance documents) and anything still recent
 * is kept. Purged rows say so instead of failing on a missing file.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsUser } from '../../src/lib/requestContext.js';
import { persistBytes, PURGED_MESSAGE } from '../../src/lib/fileStore.js';
import { runRawFilePurge } from '../../src/jobs/rawFilePurgeJob.js';
import { processImportJob } from '../../src/services/imports/import.service.js';

const DAY = 86_400_000;
const scopes: TestScope[] = [];
afterAll(async () => {
  for (const s of scopes) await s.cleanup();
});

describe('statement purge (DB)', () => {
  it('deletes statement originals 30 days after reading, and keeps everything else', async () => {
    const s = await createTestScope('purge');
    scopes.push(s);
    const uid = s.userId;
    const now = new Date(Date.now() + 40 * DAY); // run the job "40 days from now"
    const daysBefore = (n: number) => new Date(now.getTime() - n * DAY);

    const ids = await runAsUser(uid, async () => {
      const blob = (p: string) => persistBytes(uid, Buffer.from(`fake ${p} bytes`), p, '.pdf');
      const job = async (type: string, status: string, completed: Date | null, created?: Date) =>
        (await prisma.importJob.create({
          data: {
            userId: uid, type: type as never, status: status as never, fileName: `${type}.pdf`,
            filePath: `/nonexistent/${type}-${status}.pdf`, blobKey: await blob('import'),
            completedAt: completed, ...(created && { createdAt: created }),
          },
        })).id;
      const mb = await prisma.mailboxAccount.create({ data: { userId: uid, provider: 'GMAIL_OAUTH' } });
      const scan = await prisma.gmailScanJob.create({
        data: { userId: uid, mailboxId: mb.id, lookbackFrom: new Date('2024-01-01'), lookbackTo: new Date('2026-01-01') },
      });
      let n = 0;
      const doc = async (docType: string, status: string) =>
        (await prisma.gmailDiscoveredDoc.create({
          data: {
            userId: uid, scanJobId: scan.id, gmailMessageId: `m${++n}`, gmailAttachmentId: `a${n}`, fromAddress: 'alerts@bank.example',
            subject: 'Statement', receivedAt: new Date('2026-01-02'), fileName: `${docType}.pdf`, fileSize: 10, mimeType: 'application/pdf',
            contentHash: `h-${uid}-${n}`, storagePath: `/nonexistent/doc-${n}.pdf`, blobKey: await blob('gmail'),
            classifiedDocType: docType, status: status as never,
          },
        })).id;
      return {
        oldStatement: await job('BANK_STATEMENT_PDF', 'COMPLETED', daysBefore(31)),
        recentStatement: await job('BANK_STATEMENT_CSV', 'COMPLETED', daysBefore(10)),
        lockedStatement: await job('BANK_STATEMENT_PDF', 'NEEDS_PASSWORD', null, daysBefore(35)),
        oldCas: await job('MF_CAS_PDF', 'COMPLETED', daysBefore(90)),
        // Docs were last touched "now" in real time, i.e. 40 days before the run.
        cardDoc: await doc('CC_STATEMENT', 'IMPORTED'),
        pendingDoc: await doc('BANK_STATEMENT', 'PENDING_APPROVAL'),
        insuranceDoc: await doc('INSURANCE_POLICY', 'IMPORTED'),
      };
    });

    const r = await runRawFilePurge(now);
    expect(r).toEqual({ imports: 2, gmailDocs: 1, failed: 0 });

    const jobs = await runAsUser(uid, () => prisma.importJob.findMany({ where: { userId: uid }, select: { id: true, blobKey: true, filePurgedAt: true } }));
    const job = (id: string) => jobs.find((j) => j.id === id)!;
    expect(job(ids.oldStatement)).toMatchObject({ blobKey: null, filePurgedAt: now });
    expect(job(ids.lockedStatement).filePurgedAt).toEqual(now);
    expect(job(ids.recentStatement).blobKey).not.toBeNull();
    expect(job(ids.oldCas).blobKey).not.toBeNull();

    const docs = await runAsUser(uid, () => prisma.gmailDiscoveredDoc.findMany({ where: { userId: uid }, select: { id: true, blobKey: true } }));
    const doc = (id: string) => docs.find((d) => d.id === id)!;
    expect(doc(ids.cardDoc).blobKey).toBeNull();
    expect(doc(ids.pendingDoc).blobKey).not.toBeNull();
    expect(doc(ids.insuranceDoc).blobKey).not.toBeNull();

    // The encrypted bytes themselves are gone: only the 4 kept files remain.
    expect(await runAsUser(uid, () => prisma.documentBlob.count({ where: { userId: uid } }))).toBe(4);

    // A purged import says so rather than failing on a missing file.
    await expect(runAsUser(uid, () => processImportJob(ids.oldStatement))).rejects.toThrow(PURGED_MESSAGE);

    // A second run finds nothing more to do.
    expect(await runRawFilePurge(now)).toEqual({ imports: 0, gmailDocs: 0, failed: 0 });
  });
});
