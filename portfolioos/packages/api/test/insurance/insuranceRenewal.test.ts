import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createPolicy } from '../../src/services/insurance/insurance.service.js';
import { matchInsuranceDocuments } from '../../src/services/insurance/insuranceDocMatching.js';
import { sealedExtractColumns } from '../../src/services/insurance/insuranceDocExtract.js';
import {
  answerRenewal,
  pendingRenewals,
  proposeRenewal,
} from '../../src/services/insurance/insuranceRenewal.js';
import type { InsuranceDocExtract } from '../../src/ingestion/insurance/insuranceDocReader.js';

/**
 * Renewal notices propose this year's figures for their policy; the user
 * applies or ignores them. Only the latest notice speaks for a policy, and a
 * renewal only ever extends cover.
 */
const NOTICE: InsuranceDocExtract = {
  doc_kind: 'RENEWAL_NOTICE',
  insurer: 'Star Health',
  policy_number: 'SH-RN-1001',
  policy_type: 'HEALTH',
  plan_name: null,
  policy_holder: null,
  insured_members: [],
  nominees: [],
  sum_assured: '550000.00',
  premium_amount: '26000.00',
  premium_frequency: 'ANNUAL',
  start_date: '2025-04-10',
  end_date: '2026-04-09',
  next_premium_due: '2025-04-10',
  premium_paid_amount: null,
  premium_paid_on: null,
  period_from: null,
  period_to: null,
  vehicle_registration: null,
  claim: null,
};

describe('proposeRenewal', () => {
  const policy = {
    premiumAmount: '24000',
    sumAssured: '500000',
    maturityDate: new Date('2025-04-09'),
    nextPremiumDue: new Date('2025-04-10'),
    premiumFrequency: 'ANNUAL',
  };

  it('proposes the new premium, sum assured and a later end date', () => {
    expect(proposeRenewal(policy, NOTICE).map((c) => [c.field, c.from, c.to])).toEqual([
      ['premiumAmount', '₹24,000.00', '₹26,000.00'],
      ['sumAssured', '₹5,00,000.00', '₹5,50,000.00'],
      ['maturityDate', '9 Apr 2025', '9 Apr 2026'],
    ]);
  });

  it('never shortens cover or moves the due date back', () => {
    expect(
      proposeRenewal(policy, { ...NOTICE, premium_amount: '24000.00', sum_assured: null, end_date: '2024-04-09', next_premium_due: '2024-04-10' }),
    ).toEqual([]);
  });
});

describe('answering renewal notices', () => {
  let scope: TestScope;
  let policyId: string;

  beforeAll(async () => {
    scope = await createTestScope('ins-renew');
    policyId = await scope.runAs(async () =>
      (
        await createPolicy(scope.userId, {
          insurer: 'Star Health',
          policyNumber: 'SH-RN-1001',
          type: 'HEALTH',
          policyHolder: 'Test User',
          sumAssured: '500000',
          premiumAmount: '24000',
          premiumFrequency: 'ANNUAL',
          startDate: '2024-04-10',
          maturityDate: '2025-04-09',
          nextPremiumDue: '2024-04-10',
        })
      ).id,
    );
  });
  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.insuranceDocument.deleteMany({ where: { userId: scope.userId } });
      await prisma.insurancePolicy.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  const addNotice = (x: InsuranceDocExtract, receivedAt: string) =>
    scope.runAs(async () =>
      prisma.insuranceDocument.create({
        data: {
          userId: scope.userId,
          fileName: 'renewal.pdf',
          contentHash: randomUUID(),
          receivedAt: new Date(receivedAt),
          docKind: x.doc_kind,
          status: 'READ',
          ...(await sealedExtractColumns(x)),
        },
      }),
    );

  it('proposes from the latest notice only, applies on confirmation, and is then done', async () => {
    const older = await addNotice({ ...NOTICE, premium_amount: '25000.00', end_date: '2025-12-31' }, '2025-02-01');
    const latest = await addNotice(NOTICE, '2025-03-01');
    await scope.runAs(() => matchInsuranceDocuments(scope.userId));

    const pending = await scope.runAs(() => pendingRenewals(scope.userId));
    expect([...pending.keys()]).toEqual([latest.id]);
    // The cover had ended, so the policy had no next due date: the notice's is new too.
    expect(pending.get(latest.id)!.map((c) => c.field)).toEqual(['premiumAmount', 'sumAssured', 'maturityDate', 'nextPremiumDue']);

    await expect(scope.runAs(() => answerRenewal(scope.userId, older.id, true))).rejects.toThrow(
      'This renewal notice has nothing left to change',
    );

    const r = await scope.runAs(() => answerRenewal(scope.userId, latest.id, true));
    expect(r.applied).toEqual(['premiumAmount', 'sumAssured', 'maturityDate', 'nextPremiumDue']);
    const policy = await scope.runAs(() => prisma.insurancePolicy.findUniqueOrThrow({ where: { id: policyId } }));
    expect([
      policy.premiumAmount.toString(),
      policy.sumAssured.toString(),
      policy.maturityDate?.toISOString().slice(0, 10),
      policy.premiumsTrackedFrom?.toISOString().slice(0, 10),
    ]).toEqual(['26000', '550000', '2026-04-09', '2025-04-10']);

    expect((await scope.runAs(() => pendingRenewals(scope.userId))).size).toBe(0);
    await expect(scope.runAs(() => answerRenewal(scope.userId, latest.id, true))).rejects.toThrow(
      'This renewal notice was already answered',
    );
  });

  it('ignoring changes nothing on the policy', async () => {
    const next = await addNotice({ ...NOTICE, premium_amount: '28000.00', end_date: '2027-04-09' }, '2026-03-01');
    await scope.runAs(() => matchInsuranceDocuments(scope.userId));
    expect((await scope.runAs(() => pendingRenewals(scope.userId))).has(next.id)).toBe(true);

    await scope.runAs(() => answerRenewal(scope.userId, next.id, false));
    const policy = await scope.runAs(() => prisma.insurancePolicy.findUniqueOrThrow({ where: { id: policyId } }));
    expect(policy.premiumAmount.toString()).toBe('26000');
    const row = await scope.runAs(() => prisma.insuranceDocument.findUniqueOrThrow({ where: { id: next.id } }));
    expect(row.renewalAction).toBe('IGNORED');
  });
});
