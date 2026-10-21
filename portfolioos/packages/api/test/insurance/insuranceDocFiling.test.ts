import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { persistBytes } from '../../src/lib/fileStore.js';
import { buildStorageKey, saveBuffer } from '../../src/lib/documentStorage.js';
import { createPolicy } from '../../src/services/insurance/insurance.service.js';
import { matchInsuranceDocuments } from '../../src/services/insurance/insuranceDocMatching.js';
import { sealedExtractColumns } from '../../src/services/insurance/insuranceDocExtract.js';
import { listDocuments } from '../../src/services/documents/document.service.js';
import { listDiscoveredDocs } from '../../src/services/gmail/gmailDiscoveredDocs.service.js';
import { approveDoc } from '../../src/services/gmail/gmailDocApproval.service.js';
import type { InsuranceDocExtract } from '../../src/ingestion/insurance/insuranceDocReader.js';

/**
 * Linked insurance documents are filed into the policy holder's folder in
 * Documents, once, and shown on the policy from that one copy.
 */
const RECEIPT: InsuranceDocExtract = {
  doc_kind: 'PREMIUM_RECEIPT',
  insurer: 'Star Health',
  policy_number: 'SH-998877',
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
  premium_paid_amount: '24000.00',
  premium_paid_on: '2025-04-02',
  period_from: null,
  period_to: null,
  vehicle_registration: null,
  claim: null,
};

describe('filing insurance documents into Documents', () => {
  let scope: TestScope;
  let policyId: string;

  beforeAll(async () => {
    scope = await createTestScope('ins-file');
    policyId = await scope.runAs(async () => {
      // The holder already has a folder, under a slightly different spelling.
      await prisma.documentPerson.create({
        data: { userId: scope.userId, displayName: 'Mr. Test Holder', nameKey: 'holder test', autoCreated: false },
      });
      const p = await createPolicy(scope.userId, {
        insurer: 'Star Health',
        policyNumber: 'SH998877',
        type: 'HEALTH',
        policyHolder: 'Test Holder',
        sumAssured: '500000',
        premiumAmount: '24000',
        premiumFrequency: 'ANNUAL',
        startDate: '2024-04-10',
      });
      return p.id;
    });
  });
  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.insuranceDocument.deleteMany({ where: { userId: scope.userId } });
      await prisma.document.deleteMany({ where: { userId: scope.userId } });
      await prisma.documentPerson.deleteMany({ where: { userId: scope.userId } });
      await prisma.documentBlob.deleteMany({ where: { userId: scope.userId } });
      await prisma.gmailDiscoveredDoc.deleteMany({ where: { userId: scope.userId } });
      await prisma.gmailScanJob.deleteMany({ where: { userId: scope.userId } });
      await prisma.mailboxAccount.deleteMany({ where: { userId: scope.userId } });
      await prisma.insurancePolicy.deleteMany({ where: { userId: scope.userId } });
      await prisma.userDataKey.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  const addDoc = (bytes: Buffer, x: InsuranceDocExtract) =>
    scope.runAs(async () =>
      prisma.insuranceDocument.create({
        data: {
          userId: scope.userId,
          fileName: 'receipt.pdf',
          contentHash: createHash('sha256').update(bytes).digest('hex'),
          blobKey: await persistBytes(scope.userId, bytes, 'gmail', '.pdf'),
          receivedAt: new Date('2025-04-02'),
          docKind: x.doc_kind,
          status: 'READ',
          ...(await sealedExtractColumns(x)),
        },
      }),
    );

  it('files a linked PDF under the policy holder and shows it on the policy', async () => {
    const pdf = Buffer.from(`%PDF-1.4 receipt ${randomUUID()}`);
    const doc = await addDoc(pdf, RECEIPT);
    await scope.runAs(() => matchInsuranceDocuments(scope.userId));

    const row = await scope.runAs(() => prisma.insuranceDocument.findUniqueOrThrow({ where: { id: doc.id } }));
    expect([row.status, row.policyId]).toEqual(['FILED', policyId]);

    const filed = await scope.runAs(() =>
      prisma.document.findUniqueOrThrow({ where: { id: row.documentId! }, include: { person: true } }),
    );
    expect({
      ownerType: filed.ownerType,
      docType: filed.docType,
      fileName: filed.fileName,
      person: filed.person?.displayName,
      sortStatus: filed.sortStatus,
    }).toEqual({
      ownerType: 'PERSON_DOCS',
      docType: 'INSURANCE',
      fileName: 'Star Health Premium receipt 2025-04-02.pdf',
      person: 'Mr. Test Holder',
      sortStatus: 'FILED',
    });
    // No second folder for the same person.
    expect(await scope.runAs(() => prisma.documentPerson.count({ where: { userId: scope.userId } }))).toBe(1);

    const onPolicy = await scope.runAs(() =>
      listDocuments(scope.userId, { ownerType: 'INSURANCE_POLICY', ownerId: policyId }),
    );
    expect(onPolicy.map((d) => d.id)).toEqual([filed.id]);

    // Running again files nothing twice.
    await scope.runAs(() => matchInsuranceDocuments(scope.userId));
    expect(await scope.runAs(() => prisma.document.count({ where: { userId: scope.userId } }))).toBe(1);
  });

  it('links a PDF already in Documents instead of copying it', async () => {
    const pdf = Buffer.from(`%PDF-1.4 uploaded ${randomUUID()}`);
    const mine = await scope.runAs(async () => {
      const storageKey = buildStorageKey('mine.pdf');
      await saveBuffer(scope.userId, storageKey, pdf);
      return prisma.document.create({
        data: {
          userId: scope.userId,
          ownerType: 'PERSON_DOCS',
          ownerId: scope.userId,
          fileName: 'mine.pdf',
          mimeType: 'application/pdf',
          sizeBytes: pdf.length,
          storageKey,
          externalEditKey: randomUUID(),
          contentHash: createHash('sha256').update(pdf).digest('hex'),
        },
      });
    });
    const doc = await addDoc(pdf, { ...RECEIPT, premium_paid_on: '2026-04-03' });
    await scope.runAs(() => matchInsuranceDocuments(scope.userId));

    const row = await scope.runAs(() => prisma.insuranceDocument.findUniqueOrThrow({ where: { id: doc.id } }));
    expect([row.status, row.documentId]).toEqual(['FILED', mine.id]);
    expect(await scope.runAs(() => prisma.document.count({ where: { userId: scope.userId } }))).toBe(2);
  });

  it('keeps what an insurance search finds out of the statement-import queue', async () => {
    const found = await scope.runAs(async () => {
      const mb = await prisma.mailboxAccount.create({ data: { userId: scope.userId, provider: 'GMAIL_OAUTH' } });
      const scan = await prisma.gmailScanJob.create({
        data: { userId: scope.userId, mailboxId: mb.id, lookbackFrom: new Date('2024-01-01'), lookbackTo: new Date('2026-01-01'), kind: 'INSURANCE' },
      });
      return prisma.gmailDiscoveredDoc.create({
        data: {
          userId: scope.userId,
          scanJobId: scan.id,
          gmailMessageId: 'm1',
          gmailAttachmentId: 'a1',
          fromAddress: 'policy@starhealth.in',
          subject: 'Premium receipt',
          receivedAt: new Date('2025-04-02'),
          fileName: 'receipt.pdf',
          fileSize: 10,
          mimeType: 'application/pdf',
          contentHash: randomUUID(),
          classifiedDocType: 'INSURANCE',
          storagePath: '/tmp/receipt.pdf',
          status: 'PENDING_APPROVAL',
        },
      });
    });
    const listed = await scope.runAs(() => listDiscoveredDocs({ userId: scope.userId }));
    expect(listed.some((d) => d.id === found.id)).toBe(false);
    await expect(scope.runAs(() => approveDoc(scope.userId, found.id))).rejects.toThrow(
      'Insurance documents are handled on the Insurance page',
    );
  });
});
