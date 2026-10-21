import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import PDFDocument from 'pdfkit';
import { createHash, randomUUID } from 'node:crypto';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { persistBytes } from '../../src/lib/fileStore.js';
import { getSavedDocPasswords } from '../../src/lib/userDocPasswords.js';
import { createPolicy } from '../../src/services/insurance/insurance.service.js';
import {
  processInsuranceDocuments,
  unlockInsuranceDocument,
} from '../../src/services/insurance/insuranceDocPipeline.js';
import type { InsuranceDocExtract } from '../../src/ingestion/insurance/insuranceDocReader.js';

/**
 * Locked insurance PDFs: opened with the user's own policy numbers when one
 * fits, otherwise the user is asked once — the password opens every locked
 * document it fits and, when remembered, the ones that arrive later.
 */
const NOTHING: InsuranceDocExtract = {
  doc_kind: 'OTHER',
  insurer: null,
  policy_number: null,
  policy_type: null,
  plan_name: null,
  policy_holder: null,
  insured_members: [],
  nominees: [],
  sum_assured: null,
  premium_amount: null,
  premium_frequency: null,
  start_date: null,
  end_date: null,
  next_premium_due: null,
  premium_paid_amount: null,
  premium_paid_on: null,
  period_from: null,
  period_to: null,
  vehicle_registration: null,
  claim: null,
};
const callModel = async () => ({ input: NOTHING, inputTokens: 0, outputTokens: 0 });

function lockedPdf(password: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ userPassword: password, ownerPassword: `${password}-owner` });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.text(`Insurance document ${randomUUID()}`);
    doc.end();
  });
}

describe('locked insurance PDFs', () => {
  let scope: TestScope;
  let scanJobId: string;
  let n = 0;

  beforeAll(async () => {
    scope = await createTestScope('ins-pw');
    scanJobId = await scope.runAs(async () => {
      const mb = await prisma.mailboxAccount.create({ data: { userId: scope.userId, provider: 'GMAIL_OAUTH' } });
      const scan = await prisma.gmailScanJob.create({
        data: { userId: scope.userId, mailboxId: mb.id, lookbackFrom: new Date('2024-01-01'), lookbackTo: new Date('2026-01-01'), kind: 'INSURANCE' },
      });
      return scan.id;
    });
  });
  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.insuranceDocument.deleteMany({ where: { userId: scope.userId } });
      await prisma.gmailDiscoveredDoc.deleteMany({ where: { userId: scope.userId } });
      await prisma.gmailScanJob.deleteMany({ where: { userId: scope.userId } });
      await prisma.mailboxAccount.deleteMany({ where: { userId: scope.userId } });
      await prisma.insurancePolicy.deleteMany({ where: { userId: scope.userId } });
      await prisma.documentBlob.deleteMany({ where: { userId: scope.userId } });
      await prisma.userDataKey.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  const found = (bytes: Buffer) =>
    scope.runAs(async () => {
      const i = ++n;
      return prisma.gmailDiscoveredDoc.create({
        data: {
          userId: scope.userId,
          scanJobId,
          gmailMessageId: `m${i}`,
          gmailAttachmentId: `a${i}`,
          fromAddress: 'policy@starhealth.in',
          subject: 'Your policy',
          receivedAt: new Date('2025-04-16'),
          fileName: `locked-${i}.pdf`,
          fileSize: bytes.length,
          mimeType: 'application/pdf',
          contentHash: createHash('sha256').update(bytes).digest('hex'),
          classifiedDocType: 'INSURANCE',
          storagePath: `/tmp/locked-${i}.pdf`,
          blobKey: await persistBytes(scope.userId, bytes, 'gmail', '.pdf'),
          status: 'PENDING_APPROVAL',
        },
      });
    });
  const statusOf = (gmailDocId: string) =>
    scope.runAs(async () => (await prisma.insuranceDocument.findUniqueOrThrow({ where: { gmailDocId } })).status);
  const run = () => scope.runAs(() => processInsuranceDocuments(scope.userId, { callModel }));

  it('opens a PDF locked with one of the user’s policy numbers without asking', async () => {
    await scope.runAs(() =>
      createPolicy(scope.userId, {
        insurer: 'Star Health',
        policyNumber: 'P/445566',
        type: 'HEALTH',
        policyHolder: 'Test User',
        sumAssured: '500000',
        premiumAmount: '20000',
        premiumFrequency: 'ANNUAL',
        startDate: '2024-04-10',
      }),
    );
    const doc = await found(await lockedPdf('P445566'));
    await run();
    expect(await statusOf(doc.id)).toBe('READ');
  });

  it('asks once: the password opens every locked PDF it fits, and later ones when remembered', async () => {
    const a = await found(await lockedPdf('star1990'));
    const b = await found(await lockedPdf('star1990'));
    await run();
    expect([await statusOf(a.id), await statusOf(b.id)]).toEqual(['NEEDS_PASSWORD', 'NEEDS_PASSWORD']);
    const docA = await scope.runAs(() => prisma.insuranceDocument.findUniqueOrThrow({ where: { gmailDocId: a.id } }));

    await expect(
      scope.runAs(() => unlockInsuranceDocument(scope.userId, docA.id, 'wrong', true, { callModel })),
    ).rejects.toThrow("That password didn't open this PDF");
    expect(await getSavedDocPasswords(scope.userId)).toEqual([]);

    const r = await scope.runAs(() => unlockInsuranceDocument(scope.userId, docA.id, 'star1990', true, { callModel }));
    expect(r).toEqual({ unlocked: 2 });
    expect([await statusOf(a.id), await statusOf(b.id)]).toEqual(['READ', 'READ']);
    expect(await getSavedDocPasswords(scope.userId)).toEqual(['star1990']);

    // Next month's PDF from the same insurer opens on its own.
    const c = await found(await lockedPdf('star1990'));
    await run();
    expect(await statusOf(c.id)).toBe('READ');
  });

  it('does not keep the password when asked not to', async () => {
    const d = await found(await lockedPdf('other2020'));
    await run();
    const doc = await scope.runAs(() => prisma.insuranceDocument.findUniqueOrThrow({ where: { gmailDocId: d.id } }));
    await scope.runAs(() => unlockInsuranceDocument(scope.userId, doc.id, 'other2020', false, { callModel }));
    expect(await statusOf(d.id)).toBe('READ');
    expect(await getSavedDocPasswords(scope.userId)).toEqual(['star1990']);
  });
});
