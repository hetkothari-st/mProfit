import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import PDFDocument from 'pdfkit';
import { createHash } from 'node:crypto';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { persistBytes } from '../../src/lib/fileStore.js';
import {
  readInsuranceDocument,
  verifyInsuranceExtract,
  type InsuranceDocExtract,
} from '../../src/ingestion/insurance/insuranceDocReader.js';
import { processInsuranceDocuments } from '../../src/services/insurance/insuranceDocPipeline.js';

/**
 * Insurance documents are read by a model and every field it returns must be
 * in the document. The model is stubbed: what is under test is the checking,
 * the statuses and the bookkeeping — the real model's accuracy needs real
 * insurer PDFs.
 */
const SCHEDULE = `HDFC Life Insurance Company Limited
POLICY SCHEDULE
Policy Number: 21345678
Name of the Policyholder: Mr. Het Kothari
Life Assured: Het Kothari
Plan: HDFC Life Click 2 Protect Super
Sum Assured: Rs. 1,00,00,000.00
Premium: Rs. 12,345.00  Premium Payment Frequency: Yearly
Date of Commencement: 15/04/2024   Date of Maturity: 15/04/2064
Next Premium Due Date: 15/04/2027
Nominee: Chantani Kothari (Mother)`;

const GOOD: InsuranceDocExtract = {
  doc_kind: 'POLICY_DOCUMENT',
  insurer: 'HDFC Life',
  policy_number: '21345678',
  policy_type: 'TERM',
  plan_name: 'HDFC Life Click 2 Protect Super',
  policy_holder: 'Het Kothari',
  insured_members: [{ name: 'Het Kothari', relation: 'Self' }],
  nominees: [{ name: 'Chantani Kothari', relation: 'Mother' }],
  sum_assured: '10000000.00',
  premium_amount: '12345.00',
  premium_frequency: 'ANNUAL',
  start_date: '2024-04-15',
  end_date: '2064-04-15',
  next_premium_due: '2027-04-15',
  premium_paid_amount: null,
  premium_paid_on: null,
  period_from: null,
  period_to: null,
  vehicle_registration: null,
  claim: null,
};

const stub = (input: unknown) => async () => ({ input, inputTokens: 0, outputTokens: 0 });

describe('insurance document verification', () => {
  it('accepts a reading that matches the document', () => {
    expect(verifyInsuranceExtract(GOOD, SCHEDULE)).toEqual([]);
  });

  it('catches an invented sum assured, a wrong policy number, a stranger as holder and a wrong date', () => {
    expect(
      verifyInsuranceExtract(
        { ...GOOD, sum_assured: '50000000.00', policy_number: '21345679', policy_holder: 'Rahul Sharma', next_premium_due: '2027-05-15' },
        SCHEDULE,
      ),
    ).toEqual([
      'policy number 21345679 does not appear in the document',
      'policy holder "Rahul Sharma" does not appear in the document',
      'sum assured 50000000.00 does not appear in the document',
      'next premium due 2027-05-15 does not appear in the document',
    ]);
  });

  it('rejects output that does not fit the schema', async () => {
    const r = await readInsuranceDocument(SCHEDULE, { userId: 'u', sourceRef: 'x' }, { callModel: stub({ doc_kind: 'POLICY_DOCUMENT' }) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_output');
  });
});

function pdfOf(text: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.text(text);
    doc.end();
  });
}

describe('insurance document pipeline', () => {
  let scope: TestScope;

  beforeAll(async () => {
    scope = await createTestScope('ins-docs');
  });
  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.insuranceDocument.deleteMany({ where: { userId: scope.userId } });
      await prisma.gmailDiscoveredDoc.deleteMany({ where: { userId: scope.userId } });
      await prisma.gmailScanJob.deleteMany({ where: { userId: scope.userId } });
      await prisma.mailboxAccount.deleteMany({ where: { userId: scope.userId } });
      await prisma.documentBlob.deleteMany({ where: { userId: scope.userId } });
      await prisma.userDataKey.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it('reads what the scan found, once per PDF, and holds a bad reading for review', async () => {
    const pdf = await pdfOf(SCHEDULE);
    const receipt = await pdfOf(SCHEDULE.replace('POLICY SCHEDULE', 'PREMIUM RECEIPT'));
    const docs = await scope.runAs(async () => {
      const mb = await prisma.mailboxAccount.create({ data: { userId: scope.userId, provider: 'GMAIL_OAUTH' } });
      const scan = await prisma.gmailScanJob.create({
        data: { userId: scope.userId, mailboxId: mb.id, lookbackFrom: new Date('2024-01-01'), lookbackTo: new Date('2026-01-01'), kind: 'INSURANCE' },
      });
      const make = async (bytes: Buffer, n: number, hash?: string) =>
        prisma.gmailDiscoveredDoc.create({
          data: {
            userId: scope.userId,
            scanJobId: scan.id,
            gmailMessageId: `m${n}`,
            gmailAttachmentId: `a${n}`,
            fromAddress: 'policy@hdfclife.com',
            subject: 'Your policy document',
            receivedAt: new Date('2025-04-16'),
            fileName: `policy-${n}.pdf`,
            fileSize: bytes.length,
            mimeType: 'application/pdf',
            contentHash: hash ?? createHash('sha256').update(bytes).digest('hex'),
            classifiedDocType: 'INSURANCE',
            storagePath: `/tmp/policy-${n}.pdf`,
            blobKey: await persistBytes(scope.userId, bytes, 'gmail', '.pdf'),
            status: 'PENDING_APPROVAL',
          },
        });
      return [await make(pdf, 1), await make(receipt, 2)];
    });

    // First PDF reads cleanly; the second comes back with an invented figure.
    let call = 0;
    const callModel = async () => ({
      input: call++ === 0 ? GOOD : { ...GOOD, doc_kind: 'PREMIUM_RECEIPT', premium_paid_amount: '99999.00' },
      inputTokens: 0,
      outputTokens: 0,
    });
    const summary = await scope.runAs(() => processInsuranceDocuments(scope.userId, { callModel }));
    expect(summary).toEqual({ created: 2, read: 1, needsReview: 1, needsPassword: 0, failed: 0, stillPending: 0 });

    const rows = await scope.runAs(() =>
      prisma.insuranceDocument.findMany({ where: { userId: scope.userId }, orderBy: { fileName: 'asc' } }),
    );
    expect(rows.map((r) => [r.gmailDocId, r.status, r.docKind])).toEqual([
      [docs[0]!.id, 'READ', 'POLICY_DOCUMENT'],
      [docs[1]!.id, 'NEEDS_REVIEW', 'PREMIUM_RECEIPT'],
    ]);
    expect(rows[1]!.problems).toEqual(['premium paid 99999.00 does not appear in the document']);

    // A second run reads nothing again.
    const again = await scope.runAs(() => processInsuranceDocuments(scope.userId, { callModel }));
    expect(again).toEqual({ created: 0, read: 0, needsReview: 0, needsPassword: 0, failed: 0, stillPending: 0 });
  });
});
