import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';

// Insurance hub, phase 2: claims follow a guide (checked against the policy
// type), carry a document checklist, a call log and escalation dates, come
// back with where they stand, and raise a reminder when it's time to complain
// or go to the Ombudsman.

const db = vi.hoisted(() => ({
  insurancePolicy: { findFirst: vi.fn() },
  insuranceClaim: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  alert: { findFirst: vi.fn(), create: vi.fn() },
}));
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: db,
  runInTransaction: (fn: (tx: typeof db) => unknown) => fn(db),
}));

import { addClaim, updateClaim, generateClaimAlerts } from '../../src/services/insurance.service.js';
import { BadRequestError, NotFoundError } from '../../src/lib/errors.js';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function claimRow(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    policyId: 'pol1',
    claimNumber: null,
    claimDate: day('2026-08-01'),
    claimType: 'Hospitalisation',
    claimedAmount: new Prisma.Decimal('100000'),
    settledAmount: null,
    status: 'SUBMITTED',
    settledOn: null,
    documents: null,
    kind: 'HEALTH_REIMBURSEMENT',
    documentsCompletedOn: day('2026-08-01'),
    surveyorAllocatedOn: null,
    checklist: null,
    timeline: null,
    rejectionReason: null,
    grievanceFiledOn: null,
    grievanceRef: null,
    ombudsmanFiledOn: null,
    ombudsmanRef: null,
    createdAt: day('2026-08-01'),
    updatedAt: day('2026-08-01'),
    ...over,
  };
}

const healthPolicy = { id: 'pol1', userId: 'u1', type: 'HEALTH' };

const baseInput = {
  claimDate: '2026-08-01',
  claimType: 'Hospitalisation',
  claimedAmount: '100000',
  status: 'SUBMITTED' as const,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-11T06:00:00Z'));
  for (const model of Object.values(db)) for (const fn of Object.values(model)) fn.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('addClaim', () => {
  it('stores the tracker fields and says where the claim stands', async () => {
    db.insurancePolicy.findFirst.mockResolvedValue(healthPolicy);
    db.insuranceClaim.create.mockResolvedValue(claimRow({ checklist: { claim_form: true } }));

    const out = await addClaim('u1', 'pol1', {
      ...baseInput,
      kind: 'HEALTH_REIMBURSEMENT',
      documentsCompletedOn: '2026-08-01',
      checklist: { claim_form: true },
    });

    const data = db.insuranceClaim.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      kind: 'HEALTH_REIMBURSEMENT',
      documentsCompletedOn: day('2026-08-01'),
      checklist: { claim_form: true },
    });
    // Submitted 1 Aug, due 16 Aug: late, so the next step is a complaint.
    expect(out.progress).toMatchObject({ decisionDueOn: '2026-08-16', next: { action: 'FILE_GRIEVANCE' } });
    expect(out.claimedAmount).toBe('100000');
  });

  it("refuses a guide that doesn't fit the policy", async () => {
    db.insurancePolicy.findFirst.mockResolvedValue(healthPolicy);
    await expect(addClaim('u1', 'pol1', { ...baseInput, kind: 'MOTOR_THEFT' })).rejects.toBeInstanceOf(BadRequestError);
    expect(db.insuranceClaim.create).not.toHaveBeenCalled();
  });

  it('refuses checklist items that are not in the guide', async () => {
    db.insurancePolicy.findFirst.mockResolvedValue(healthPolicy);
    await expect(
      addClaim('u1', 'pol1', { ...baseInput, kind: 'HEALTH_REIMBURSEMENT', checklist: { made_up: true } }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('refuses a call-log entry without a proper date', async () => {
    db.insurancePolicy.findFirst.mockResolvedValue(healthPolicy);
    await expect(
      addClaim('u1', 'pol1', { ...baseInput, timeline: [{ on: 'yesterday', note: 'Called the TPA' }] }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('refuses a complaint dated before the claim', async () => {
    db.insurancePolicy.findFirst.mockResolvedValue(healthPolicy);
    await expect(
      addClaim('u1', 'pol1', { ...baseInput, status: 'REJECTED', grievanceFiledOn: '2026-07-01' }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe('updateClaim', () => {
  it('records a complaint and counts down to the insurer’s reply', async () => {
    db.insuranceClaim.findFirst.mockResolvedValue({ ...claimRow({ status: 'REJECTED' }), policy: { userId: 'u1', type: 'HEALTH' } });
    db.insuranceClaim.update.mockResolvedValue(
      claimRow({ status: 'REJECTED', grievanceFiledOn: day('2026-09-01'), grievanceRef: 'GR-1' }),
    );

    const out = await updateClaim('u1', 'c1', { grievanceFiledOn: '2026-09-01', grievanceRef: 'GR-1' });

    expect(db.insuranceClaim.update.mock.calls[0][0].data).toMatchObject({
      grievanceFiledOn: day('2026-09-01'),
      grievanceRef: 'GR-1',
    });
    expect(out.progress.next).toMatchObject({ action: 'WAIT', dueOn: '2026-09-15' });
  });

  it("can't touch another user's claim", async () => {
    db.insuranceClaim.findFirst.mockResolvedValue({ ...claimRow(), policy: { userId: 'u2', type: 'HEALTH' } });
    await expect(updateClaim('u1', 'c1', { status: 'SETTLED' })).rejects.toBeInstanceOf(NotFoundError);
    expect(db.insuranceClaim.update).not.toHaveBeenCalled();
  });
});

describe('generateClaimAlerts', () => {
  const policy = { userId: 'u1', insurer: 'Star Health', planName: 'Family Optima', type: 'HEALTH' };

  it('reminds once when it is time to complain or go to the Ombudsman', async () => {
    db.insuranceClaim.findMany.mockResolvedValue([
      { ...claimRow(), policy },
      { ...claimRow({ id: 'c2', status: 'REJECTED', grievanceFiledOn: day('2026-08-01') }), policy },
      { ...claimRow({ id: 'c3', status: 'SETTLED', settledAmount: new Prisma.Decimal('100000') }), policy },
      { ...claimRow({ id: 'c4', documentsCompletedOn: day('2026-09-05') }), policy },
    ]);
    db.alert.findFirst.mockResolvedValue(null);

    const created = await generateClaimAlerts();

    expect(created).toBe(2);
    const alerts = db.alert.create.mock.calls.map((c) => c[0].data);
    expect(alerts.map((a) => a.metadata.key)).toEqual([
      'insurance_claim:c1:FILE_GRIEVANCE',
      'insurance_claim:c2:GO_TO_OMBUDSMAN',
    ]);
    expect(alerts.every((a) => a.type === 'INSURANCE_CLAIM' && a.userId === 'u1')).toBe(true);
    expect(alerts[0].title).toMatch(/Star Health/);
  });

  it("doesn't repeat a reminder", async () => {
    db.insuranceClaim.findMany.mockResolvedValue([{ ...claimRow(), policy }]);
    db.alert.findFirst.mockResolvedValue({ id: 'a1' });
    expect(await generateClaimAlerts()).toBe(0);
    expect(db.alert.create).not.toHaveBeenCalled();
  });
});
