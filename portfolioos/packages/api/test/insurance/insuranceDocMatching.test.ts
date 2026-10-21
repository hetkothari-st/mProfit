import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createPolicy } from '../../src/services/insurance/insurance.service.js';
import {
  approveSuggestedPolicy,
  dismissInsuranceDocument,
  listInsuranceDocuments,
  matchInsuranceDocuments,
} from '../../src/services/insurance/insuranceDocMatching.js';
import { sealedExtractColumns } from '../../src/services/insurance/insuranceDocExtract.js';
import type { InsuranceDocExtract } from '../../src/ingestion/insurance/insuranceDocReader.js';

/**
 * Read documents → policies. Readings are written straight in, as the
 * pipeline stores them (sealed); what is under test is the matching, what it
 * records on the policy, and the suggest → approve path.
 */
const BLANK: InsuranceDocExtract = {
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

const POLICY_DOC: InsuranceDocExtract = {
  ...BLANK,
  doc_kind: 'POLICY_DOCUMENT',
  insurer: 'Star Health',
  policy_number: 'P/211/0001234/2024',
  policy_type: 'HEALTH',
  plan_name: 'Family Health Optima',
  policy_holder: 'Test User',
  sum_assured: '500000.00',
  premium_amount: '24000.00',
  premium_frequency: 'ANNUAL',
  start_date: '2024-04-10',
};

describe('matching insurance documents to policies', () => {
  let scope: TestScope;
  let n = 0;

  beforeAll(async () => {
    scope = await createTestScope('ins-match');
  });
  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.insuranceDocument.deleteMany({ where: { userId: scope.userId } });
      await prisma.insurancePolicy.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  const addDoc = (x: InsuranceDocExtract, receivedAt: string) =>
    scope.runAs(async () =>
      prisma.insuranceDocument.create({
        data: {
          userId: scope.userId,
          fileName: `doc-${++n}.pdf`,
          contentHash: randomUUID(),
          receivedAt: new Date(receivedAt),
          docKind: x.doc_kind,
          status: 'READ',
          ...(await sealedExtractColumns(x)),
        },
      }),
    );
  const statusOf = (id: string) =>
    scope.runAs(() => prisma.insuranceDocument.findUniqueOrThrow({ where: { id } }));

  it('stores the reading encrypted, never the policy number in plain text', async () => {
    const doc = await addDoc(POLICY_DOC, '2024-04-12');
    const row = await statusOf(doc.id);
    expect(row.extract).toBeNull();
    expect(row.extractEnc).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain('0001234');
    await scope.runAs(() => dismissInsuranceDocument(scope.userId, doc.id));
  });

  it('suggests a new policy once, holds its receipts, and links everything on approval', async () => {
    const older = await addDoc(POLICY_DOC, '2024-04-12');
    const renewal = await addDoc(
      { ...POLICY_DOC, doc_kind: 'RENEWAL_NOTICE', premium_amount: '26000.00', next_premium_due: '2025-04-10' },
      '2025-03-01',
    );
    const receipt = await addDoc(
      {
        ...BLANK,
        doc_kind: 'PREMIUM_RECEIPT',
        insurer: 'Star Health',
        policy_number: 'P211-0001234-2024',
        premium_paid_amount: '26000.00',
        premium_paid_on: '2025-04-02',
      },
      '2025-04-02',
    );

    const first = await scope.runAs(() => matchInsuranceDocuments(scope.userId));
    expect(first).toEqual({ matched: 0, suggested: 1, waiting: 2 });
    // The latest document that describes the policy is the suggestion.
    expect((await statusOf(renewal.id)).status).toBe('SUGGESTED');
    expect((await statusOf(older.id)).status).toBe('READ');
    expect((await statusOf(receipt.id)).note).toBe('Waiting for its policy to be added.');

    const listed = await scope.runAs(() => listInsuranceDocuments(scope.userId));
    const shown = listed.find((d) => d.id === renewal.id)!;
    expect(shown.policyNumberLast4).toBe('2024');
    expect(JSON.stringify(listed)).not.toContain('0001234');

    const { policyId } = await scope.runAs(() =>
      approveSuggestedPolicy(scope.userId, renewal.id, {
        insurer: 'Star Health',
        type: 'HEALTH',
        planName: 'Family Health Optima',
        policyHolder: 'Test User',
        sumAssured: '500000.00',
        premiumAmount: '26000.00',
        premiumFrequency: 'ANNUAL',
        startDate: '2024-04-10',
      }),
    );
    expect(policyId).toBeTruthy();

    for (const d of [older, renewal, receipt]) {
      const row = await statusOf(d.id);
      expect([row.status, row.policyId]).toEqual(['MATCHED', policyId]);
    }
    const payments = await scope.runAs(() => prisma.premiumPayment.findMany({ where: { policyId: policyId! } }));
    expect(payments.map((p) => [p.paidOn.toISOString().slice(0, 10), p.amount.toString(), p.periodFrom.toISOString().slice(0, 10)])).toEqual([
      ['2025-04-02', '26000', '2025-04-10'],
    ]);
    expect((await statusOf(receipt.id)).note).toBe('Recorded a premium of ₹26,000.00 paid on 2 Apr 2025.');

    // The same premium mailed again is not recorded twice.
    const again = await addDoc(
      { ...BLANK, doc_kind: 'PREMIUM_RECEIPT', insurer: 'Star Health', policy_number: 'P/211/0001234/2024', premium_paid_amount: '26000.00', premium_paid_on: '2025-04-05' },
      '2025-04-05',
    );
    await scope.runAs(() => matchInsuranceDocuments(scope.userId));
    expect((await statusOf(again.id)).note).toBe('Linked to the policy. The premium due 10 Apr 2025 was already recorded.');
    expect(await scope.runAs(() => prisma.premiumPayment.count({ where: { policyId: policyId! } }))).toBe(1);
  });

  it('adds a claim from a letter and only ever moves it forward', async () => {
    const policy = await scope.runAs(() =>
      createPolicy(scope.userId, {
        insurer: 'HDFC Ergo',
        policyNumber: '2856 2010 1234',
        type: 'HEALTH',
        policyHolder: 'Test User',
        sumAssured: '1000000',
        premiumAmount: '18000',
        premiumFrequency: 'ANNUAL',
        startDate: '2023-06-01',
      }),
    );
    const letter = (status: 'SUBMITTED' | 'SETTLED', received: string) =>
      addDoc(
        {
          ...BLANK,
          doc_kind: 'CLAIM_LETTER',
          insurer: 'HDFC Ergo',
          policy_number: '285620101234',
          claim: {
            claim_number: 'RR-HS23-1001',
            claim_date: '2025-01-15',
            claim_type: 'Hospitalisation',
            claimed_amount: '84000.00',
            settled_amount: status === 'SETTLED' ? '80000.00' : null,
            status,
            settled_on: status === 'SETTLED' ? '2025-02-10' : null,
            rejection_reason: null,
          },
        },
        received,
      );

    // Read out of order: the settlement arrives first in the list, but the
    // older acknowledgement must not undo it.
    const settled = await letter('SETTLED', '2025-02-11');
    const ack = await letter('SUBMITTED', '2025-01-16');
    await scope.runAs(() => matchInsuranceDocuments(scope.userId));

    const claims = await scope.runAs(() => prisma.insuranceClaim.findMany({ where: { policyId: policy.id } }));
    expect(claims.map((c) => [c.claimNumber, c.status, c.settledAmount?.toString()])).toEqual([
      ['RR-HS23-1001', 'SETTLED', '80000'],
    ]);
    expect((await statusOf(ack.id)).note).toBe('Added a claim of ₹84,000.00 made on 15 Jan 2025.');
    expect((await statusOf(settled.id)).note).toBe('Updated the claim: settled.');
  });

  it('never applies a document held for review, and dismissed ones stay hidden', async () => {
    const held = await addDoc(
      { ...BLANK, doc_kind: 'PREMIUM_RECEIPT', insurer: 'HDFC Ergo', policy_number: '285620101234', premium_paid_amount: '99999.00', premium_paid_on: '2025-06-01' },
      '2025-06-01',
    );
    await scope.runAs(() => prisma.insuranceDocument.update({ where: { id: held.id }, data: { status: 'NEEDS_REVIEW' } }));
    await scope.runAs(() => matchInsuranceDocuments(scope.userId));
    expect((await statusOf(held.id)).status).toBe('NEEDS_REVIEW');

    await scope.runAs(() => dismissInsuranceDocument(scope.userId, held.id));
    const listed = await scope.runAs(() => listInsuranceDocuments(scope.userId));
    expect(listed.some((d) => d.id === held.id)).toBe(false);
  });
});
