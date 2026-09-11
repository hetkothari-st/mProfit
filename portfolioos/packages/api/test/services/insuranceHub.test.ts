import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';

// Insurance hub, phase 1: policy numbers are kept encrypted (with a fingerprint
// for duplicate checks and email matching), nominees/contacts are validated,
// "next premium due" always comes from the shared premium schedule, and
// reminders catch up on missed days and follow each premium into its grace
// period.

const db = vi.hoisted(() => ({
  insurancePolicy: {
    create: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  premiumPayment: { create: vi.fn(), delete: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  alert: { findFirst: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
}));
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: db,
  runInTransaction: (fn: (tx: typeof db) => unknown) => fn(db),
}));

import {
  createPolicy,
  updatePolicy,
  listPolicies,
  revealPolicyNumber,
  addPremiumPayment,
  removePremiumPayment,
  generateRenewalAlerts,
  hookAutoMatchPremiumPayment,
  backfillPolicyNumberEncryption,
  hashPolicyNumber,
} from '../../src/services/insurance.service.js';
import { decryptIdentifier, encryptIdentifier } from '../../src/services/pfCredentials.service.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../src/lib/errors.js';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'pol1',
    userId: 'u1',
    portfolioId: null,
    insurer: 'HDFC Life',
    policyNumber: null,
    policyNumberEnc: null,
    policyNumberHash: null,
    policyNumberLast4: '2345',
    type: 'TERM',
    planName: 'Click 2 Protect Super',
    policyHolder: 'Het Kothari',
    nominees: null,
    contacts: null,
    sumAssured: new Prisma.Decimal('10000000'),
    premiumAmount: new Prisma.Decimal('25000'),
    premiumFrequency: 'ANNUAL',
    startDate: day('2025-10-01'),
    maturityDate: null,
    nextPremiumDue: day('2026-10-01'),
    premiumsTrackedFrom: day('2025-10-01'),
    gracePeriodDays: null,
    vehicleId: null,
    healthCoverDetails: null,
    status: 'ACTIVE',
    createdAt: day('2025-10-01'),
    ...over,
  };
}

const base = {
  insurer: 'HDFC Life',
  policyNumber: 'POL-123/45',
  type: 'TERM' as const,
  policyHolder: 'Het Kothari',
  sumAssured: '10000000',
  premiumAmount: '25000',
  premiumFrequency: 'ANNUAL' as const,
  startDate: '2025-10-01',
};

const unique = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-11T06:00:00Z') });
  vi.clearAllMocks();
  db.insurancePolicy.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...row(),
    ...data,
  }));
  db.insurancePolicy.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...row(),
    ...data,
  }));
  db.premiumPayment.findMany.mockResolvedValue([]);
  db.alert.findFirst.mockResolvedValue(null);
  db.alert.create.mockResolvedValue({});
  db.auditLog.create.mockResolvedValue({});
});
afterEach(() => vi.useRealTimers());

describe('policy numbers', () => {
  it('encrypts the number, keeps only a fingerprint and the last 4, and never returns it', async () => {
    const dto = await createPolicy('u1', base);

    const data = db.insurancePolicy.create.mock.calls[0]![0].data;
    expect(data.policyNumber).toBeNull();
    expect(await decryptIdentifier(data.policyNumberEnc)).toBe('POL-123/45');
    // Formatting doesn't change the fingerprint.
    expect(data.policyNumberHash).toBe(hashPolicyNumber('pol 12345'));
    expect(data.policyNumberLast4).toBe('2345');

    expect(dto).not.toHaveProperty('policyNumber');
    expect(dto).not.toHaveProperty('policyNumberEnc');
    expect(dto).not.toHaveProperty('policyNumberHash');
    expect(dto).toMatchObject({ policyNumberLast4: '2345', hasPolicyNumber: true });
    expect(JSON.stringify(dto)).not.toContain('POL-123/45');
  });

  it('refuses a policy already saved for that insurer', async () => {
    db.insurancePolicy.create.mockRejectedValue(unique());
    await expect(createPolicy('u1', base)).rejects.toBeInstanceOf(ConflictError);
  });

  it('re-encrypts a new number on update, and leaves the saved one alone otherwise', async () => {
    db.insurancePolicy.findFirst.mockResolvedValue(row());
    await updatePolicy('u1', 'pol1', { policyNumber: 'NEW-9876' });
    const data = db.insurancePolicy.update.mock.calls[0]![0].data;
    expect(await decryptIdentifier(data.policyNumberEnc)).toBe('NEW-9876');
    expect(data).toMatchObject({ policyNumber: null, policyNumberLast4: '9876' });

    db.insurancePolicy.update.mockClear();
    await updatePolicy('u1', 'pol1', { planName: 'Click 2 Protect Life' });
    expect(db.insurancePolicy.update.mock.calls[0]![0].data).not.toHaveProperty('policyNumberEnc');
  });

  it('reveals to the owner only, writing an audit row first', async () => {
    db.insurancePolicy.findFirst.mockResolvedValue({
      id: 'pol1',
      policyNumber: null,
      policyNumberEnc: await encryptIdentifier('POL-123/45'),
    });
    expect(await revealPolicyNumber('u1', 'pol1', { ip: '1.2.3.4', userAgent: 'vitest' })).toBe('POL-123/45');
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', action: 'pii_view', resource: 'InsurancePolicy:pol1' }),
    });
    expect(JSON.stringify(db.auditLog.create.mock.calls)).not.toContain('POL-123/45');

    db.auditLog.create.mockClear();
    db.insurancePolicy.findFirst.mockResolvedValue(null);
    await expect(revealPolicyNumber('u2', 'pol1', {})).rejects.toBeInstanceOf(NotFoundError);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("doesn't reveal when the audit write fails", async () => {
    db.insurancePolicy.findFirst.mockResolvedValue({
      id: 'pol1',
      policyNumber: null,
      policyNumberEnc: await encryptIdentifier('POL-123/45'),
    });
    db.auditLog.create.mockRejectedValue(new Error('db down'));
    await expect(revealPolicyNumber('u1', 'pol1', {})).rejects.toThrow('db down');
  });

  it('never returns a not-yet-converted plain number, and converts it when revealed', async () => {
    // `claims: []` — the list query includes them; phase 2 adds progress to each.
    db.insurancePolicy.findMany.mockResolvedValue([row({ policyNumber: 'LEG-5555', policyNumberLast4: null, claims: [] })]);
    const [dto] = await listPolicies('u1');
    expect(dto).toMatchObject({ policyNumberLast4: '5555', hasPolicyNumber: true });
    expect(JSON.stringify(dto)).not.toContain('LEG-5555');

    db.insurancePolicy.findFirst.mockResolvedValue({ id: 'pol1', policyNumber: 'LEG-5555', policyNumberEnc: null });
    expect(await revealPolicyNumber('u1', 'pol1', {})).toBe('LEG-5555');
    const data = db.insurancePolicy.update.mock.calls[0]![0].data;
    expect(await decryptIdentifier(data.policyNumberEnc)).toBe('LEG-5555');
    expect(data.policyNumberHash).toBe(hashPolicyNumber('LEG-5555'));
  });
});

describe('nominees and contacts', () => {
  const nominee = (name: string, sharePercent: number, over = {}) => ({ name, relation: 'Spouse', sharePercent, ...over });

  it('needs nominee shares to add up to 100%', async () => {
    await expect(
      createPolicy('u1', { ...base, nominees: [nominee('Priya', 60), nominee('Aarav', 30)] }),
    ).rejects.toBeInstanceOf(BadRequestError);
    await createPolicy('u1', { ...base, nominees: [nominee('Priya', 60), nominee('Aarav', 40)] });
    expect(db.insurancePolicy.create).toHaveBeenCalledTimes(1);
  });

  it('needs an appointee for a minor nominee', async () => {
    await expect(
      createPolicy('u1', { ...base, nominees: [nominee('Aarav', 100, { isMinor: true })] }),
    ).rejects.toBeInstanceOf(BadRequestError);
    await createPolicy('u1', {
      ...base,
      nominees: [nominee('Aarav', 100, { isMinor: true, appointeeName: 'Priya', appointeeRelation: 'Mother' })],
    });
    expect(db.insurancePolicy.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a claim email that is not an email', async () => {
    await expect(createPolicy('u1', { ...base, contacts: { claimEmail: 'claims at hdfclife' } })).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });
});

describe('next premium due', () => {
  it("starts a new policy's schedule where the user says premiums stand", async () => {
    await createPolicy('u1', { ...base, nextPremiumDue: '2026-10-01' });
    expect(db.insurancePolicy.create.mock.calls[0]![0].data).toMatchObject({
      premiumsTrackedFrom: day('2026-10-01'),
      nextPremiumDue: day('2026-10-01'),
    });
  });

  it("assumes premiums before today are settled when the user doesn't say", async () => {
    await createPolicy('u1', base);
    expect(db.insurancePolicy.create.mock.calls[0]![0].data).toMatchObject({
      premiumsTrackedFrom: day('2026-09-11'),
      nextPremiumDue: day('2026-10-01'),
    });
  });

  it('moves to the following premium once one is paid', async () => {
    db.insurancePolicy.findFirst.mockResolvedValue(row({ nextPremiumDue: day('2025-10-01') }));
    db.premiumPayment.create.mockResolvedValue({ id: 'pay1' });
    db.premiumPayment.findMany.mockResolvedValue([
      { periodFrom: day('2025-10-01'), periodTo: day('2026-10-01'), paidOn: day('2025-10-03'), amount: new Prisma.Decimal('25000') },
    ]);
    await addPremiumPayment('u1', 'pol1', {
      paidOn: '2025-10-03',
      amount: '25000',
      periodFrom: '2025-10-01',
      periodTo: '2026-10-01',
    });
    expect(db.insurancePolicy.update).toHaveBeenCalledWith({
      where: { id: 'pol1' },
      data: { nextPremiumDue: day('2026-10-01') },
    });
  });

  it('moves back when that payment is removed', async () => {
    db.premiumPayment.findFirst.mockResolvedValue({ id: 'pay1', policyId: 'pol1', policy: { userId: 'u1' } });
    db.insurancePolicy.findFirst.mockResolvedValue(row());
    db.premiumPayment.findMany.mockResolvedValue([]);
    await removePremiumPayment('u1', 'pay1');
    expect(db.insurancePolicy.update).toHaveBeenCalledWith({
      where: { id: 'pol1' },
      data: { nextPremiumDue: day('2025-10-01') },
    });
  });
});

describe('reminders', () => {
  const created = () => db.alert.create.mock.calls.map((c) => c[0].data);

  it('only looks at active policies', async () => {
    db.insurancePolicy.findMany.mockResolvedValue([]);
    await generateRenewalAlerts();
    expect(db.insurancePolicy.findMany.mock.calls[0]![0].where).toMatchObject({ status: 'ACTIVE' });
  });

  it('catches up on a reminder a missed daily scan would have sent', async () => {
    // 12 days out: the 15-day reminder was due 3 days ago.
    db.insurancePolicy.findMany.mockResolvedValue([row({ nextPremiumDue: day('2026-09-23') })]);
    expect(await generateRenewalAlerts()).toBe(1);
    const [alert] = created();
    expect(alert!.metadata.key).toBe('insurance_premium:pol1:2026-09-23:due-15');
    expect(alert!.title).toMatch(/due in 12 days/);
  });

  it("doesn't repeat a reminder, but a new premium gets its own", async () => {
    db.insurancePolicy.findMany.mockResolvedValue([row({ nextPremiumDue: day('2026-09-23') })]);
    db.alert.findFirst.mockResolvedValue({ id: 'already' });
    expect(await generateRenewalAlerts()).toBe(0);

    // The key carries the due date, so next year's premium isn't mistaken for this one.
    db.alert.findFirst.mockResolvedValue(null);
    db.insurancePolicy.findMany.mockResolvedValue([row({ nextPremiumDue: day('2027-09-23'), premiumFrequency: 'ANNUAL' })]);
    vi.setSystemTime(new Date('2027-09-11T06:00:00Z'));
    await generateRenewalAlerts();
    expect(created()[0]!.metadata.key).toBe('insurance_premium:pol1:2027-09-23:due-15');
  });

  it('warns during the grace period, and again once the policy may have lapsed', async () => {
    db.insurancePolicy.findMany.mockResolvedValue([row({ nextPremiumDue: day('2026-09-01') })]);
    await generateRenewalAlerts();
    expect(created()[0]).toMatchObject({ metadata: expect.objectContaining({ key: 'insurance_premium:pol1:2026-09-01:grace' }) });
    expect(created()[0]!.title).toMatch(/20 days/);

    db.alert.create.mockClear();
    db.insurancePolicy.findMany.mockResolvedValue([row({ nextPremiumDue: day('2026-08-01') })]);
    await generateRenewalAlerts();
    expect(created()[0]!.metadata.key).toBe('insurance_premium:pol1:2026-08-01:lapse');
  });

  it('says motor cover has ended — it has no grace period', async () => {
    db.insurancePolicy.findMany.mockResolvedValue([row({ type: 'MOTOR', nextPremiumDue: day('2026-09-05') })]);
    await generateRenewalAlerts();
    expect(created()[0]!.metadata.key).toBe('insurance_premium:pol1:2026-09-05:expired');
  });
});

describe('premium emails', () => {
  it('matches a premium email by policy number, whatever its formatting', async () => {
    db.insurancePolicy.findMany.mockResolvedValue([row({ policyNumberHash: hashPolicyNumber('POL12345') })]);
    db.insurancePolicy.findFirst.mockResolvedValue(row());
    db.insurancePolicy.findUnique.mockResolvedValue({ premiumFrequency: 'ANNUAL', nextPremiumDue: day('2026-10-01') });
    db.premiumPayment.create.mockResolvedValue({ id: 'pay1' });

    await hookAutoMatchPremiumPayment(
      {
        id: 'ev1',
        userId: 'u1',
        amount: new Prisma.Decimal('25000'),
        counterparty: null,
        metadata: { policyNumber: 'pol 123-45' },
      },
      'cf1',
    );
    expect(db.premiumPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ policyId: 'pol1', canonicalEventId: 'ev1' }),
    });
  });
});

describe('converting existing plain policy numbers', () => {
  it('encrypts each one once, checking it reads back', async () => {
    db.insurancePolicy.findMany
      .mockResolvedValueOnce([
        { id: 'a', policyNumber: 'LEG-1111' },
        { id: 'b', policyNumber: 'LEG-2222' },
      ])
      .mockResolvedValueOnce([]);
    expect(await backfillPolicyNumberEncryption()).toEqual({ encrypted: 2, failed: 0 });

    const [first, second] = db.insurancePolicy.update.mock.calls.map((c) => c[0]);
    expect(first.where).toEqual({ id: 'a' });
    expect(await decryptIdentifier(first.data.policyNumberEnc)).toBe('LEG-1111');
    expect(first.data).toMatchObject({ policyNumberHash: hashPolicyNumber('LEG-1111'), policyNumberLast4: '1111' });
    expect(await decryptIdentifier(second.data.policyNumberEnc)).toBe('LEG-2222');

    // Nothing left to do on the next start.
    db.insurancePolicy.findMany.mockResolvedValue([]);
    expect(await backfillPolicyNumberEncryption()).toEqual({ encrypted: 0, failed: 0 });
  });

  it('reports a number that clashes with one already saved, and carries on', async () => {
    db.insurancePolicy.findMany
      .mockResolvedValueOnce([
        { id: 'a', policyNumber: 'LEG-1111' },
        { id: 'b', policyNumber: 'LEG 1111' },
      ])
      .mockResolvedValueOnce([]);
    db.insurancePolicy.update.mockResolvedValueOnce({}).mockRejectedValueOnce(unique());
    expect(await backfillPolicyNumberEncryption()).toEqual({ encrypted: 1, failed: 1 });
  });
});
