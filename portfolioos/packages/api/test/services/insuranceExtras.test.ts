import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';

// Insurance hub, phase 5: premiums imported from insurance statements are
// matched to policies (policy number first, then insurer + amount), linked
// once each for the premium they cover, and auto-linked only on an exact
// policy number; the yearly tax summary; the new policy fields.

const db = vi.hoisted(() => ({
  insurancePolicy: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  premiumPayment: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  transaction: { findFirst: vi.fn(), findMany: vi.fn() },
  insuranceImportDismissal: { findMany: vi.fn(), upsert: vi.fn() },
}));
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: db,
  runInTransaction: (fn: (tx: typeof db) => unknown) => fn(db),
}));

import {
  dismissImportSuggestion,
  getTaxSummary,
  hookAutoLinkImportedPremium,
  linkImportedPremium,
  listImportSuggestions,
} from '../../src/services/insuranceExtras.service.js';
import { hashPolicyNumber, toPolicyDto, updatePolicy } from '../../src/services/insurance.service.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../src/lib/errors.js';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function policy(over: Record<string, unknown> = {}) {
  return {
    id: 'pol1',
    userId: 'u1',
    insurer: 'HDFC Life',
    policyNumber: null,
    policyNumberEnc: 'enc',
    policyNumberHash: hashPolicyNumber('POL12345'),
    policyNumberLast4: '2345',
    type: 'ENDOWMENT',
    planName: 'Sanchay Plus',
    policyHolder: 'Het Kothari',
    sumAssured: new Prisma.Decimal('500000'),
    premiumAmount: new Prisma.Decimal('25000'),
    premiumFrequency: 'ANNUAL',
    startDate: day('2024-10-01'),
    maturityDate: null,
    nextPremiumDue: day('2025-10-01'),
    premiumsTrackedFrom: day('2025-10-01'),
    gracePeriodDays: null,
    taxBucket: null,
    seniorCitizen: null,
    surrenderValue: null,
    surrenderValueAsOf: null,
    status: 'ACTIVE',
    ...over,
  };
}

function imported(over: Record<string, unknown> = {}) {
  return {
    id: 'tx1',
    tradeDate: day('2025-10-03'),
    quantity: new Prisma.Decimal('25000'),
    price: new Prisma.Decimal('1'),
    orderNo: 'POL-123/45',
    broker: 'HDFC Life',
    ...over,
  };
}

let stored: Array<Record<string, unknown>>;

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-11T06:00:00Z') });
  vi.clearAllMocks();
  stored = [];
  db.insurancePolicy.findFirst.mockResolvedValue(policy());
  db.insurancePolicy.findMany.mockResolvedValue([policy()]);
  db.insurancePolicy.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...policy(), ...data }));
  db.transaction.findMany.mockResolvedValue([imported()]);
  db.transaction.findFirst.mockResolvedValue(imported());
  db.premiumPayment.findFirst.mockResolvedValue(null);
  db.premiumPayment.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    where['sourceTransactionId'] ? [] : stored,
  );
  db.premiumPayment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const row = { id: `pay${stored.length + 1}`, ...data };
    stored.push(row);
    return row;
  });
  db.insuranceImportDismissal.findMany.mockResolvedValue([]);
  db.insuranceImportDismissal.upsert.mockResolvedValue({});
});
afterEach(() => vi.useRealTimers());

describe('suggestions', () => {
  it('suggests a statement premium with the same policy number, for the premium it covers', async () => {
    const list = await listImportSuggestions('u1', 'pol1');
    expect(list).toEqual([
      {
        transactionId: 'tx1',
        paidOn: '2025-10-03',
        amount: '25000.00',
        insurer: 'HDFC Life',
        policyNumberLast4: '2345',
        matchedBy: 'POLICY_NUMBER',
        periodFrom: '2025-10-01',
        periodTo: '2026-10-01',
      },
    ]);
    // Only the user's own imported insurance deposits are looked at.
    expect(db.transaction.findMany.mock.calls[0]![0].where).toMatchObject({
      assetClass: 'INSURANCE',
      transactionType: 'DEPOSIT',
      portfolio: { userId: 'u1' },
    });
    // The statement's policy number never leaves the server in full.
    expect(JSON.stringify(list)).not.toContain('POL-123/45');
  });

  it('otherwise matches the insurer and an amount within 5%', async () => {
    db.transaction.findMany.mockResolvedValue([imported({ orderNo: null, quantity: new Prisma.Decimal('24000') })]);
    expect((await listImportSuggestions('u1', 'pol1'))[0]).toMatchObject({ matchedBy: 'INSURER_AMOUNT' });

    db.transaction.findMany.mockResolvedValue([imported({ orderNo: null, quantity: new Prisma.Decimal('30000') })]);
    expect(await listImportSuggestions('u1', 'pol1')).toEqual([]);
  });

  it("doesn't suggest a premium whose policy number is another policy's", async () => {
    db.insurancePolicy.findMany.mockResolvedValue([policy(), policy({ id: 'pol2', policyNumberHash: hashPolicyNumber('OTHER999') })]);
    db.transaction.findMany.mockResolvedValue([imported({ orderNo: 'OTHER-999' })]);
    expect(await listImportSuggestions('u1', 'pol1')).toEqual([]);
  });

  it('leaves out premiums already linked, or dismissed for this policy', async () => {
    db.premiumPayment.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where['sourceTransactionId'] ? [{ sourceTransactionId: 'tx1' }] : [],
    );
    expect(await listImportSuggestions('u1', 'pol1')).toEqual([]);

    db.premiumPayment.findMany.mockResolvedValue([]);
    db.insuranceImportDismissal.findMany.mockResolvedValue([{ transactionId: 'tx1' }]);
    expect(await listImportSuggestions('u1', 'pol1')).toEqual([]);
    expect(db.insuranceImportDismissal.findMany.mock.calls[0]![0].where).toMatchObject({ userId: 'u1', policyId: 'pol1' });
  });

  it('gives premiums from successive years successive premiums, newest first', async () => {
    db.transaction.findMany.mockResolvedValue([
      imported({ id: 'a', tradeDate: day('2024-10-02') }),
      imported({ id: 'b', tradeDate: day('2025-09-28') }),
    ]);
    const list = await listImportSuggestions('u1', 'pol1');
    expect(list.map((s) => [s.transactionId, s.periodFrom])).toEqual([
      ['b', '2025-10-01'],
      ['a', '2024-10-01'],
    ]);
  });

  it("won't list suggestions for someone else's policy", async () => {
    db.insurancePolicy.findFirst.mockResolvedValue(null);
    await expect(listImportSuggestions('u2', 'pol1')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('linking', () => {
  it('records the payment once, for the premium it covers, and moves the next due date', async () => {
    const payment = await linkImportedPremium('u1', 'pol1', 'tx1');
    expect(db.premiumPayment.create).toHaveBeenCalledTimes(1);
    const data = db.premiumPayment.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      policyId: 'pol1',
      sourceTransactionId: 'tx1',
      paidOn: day('2025-10-03'),
      periodFrom: day('2025-10-01'),
      periodTo: day('2026-10-01'),
    });
    expect(data.amount.toString()).toBe('25000');
    expect(payment).toMatchObject({ id: 'pay1' });
    // restoreNextPremiumDue: the 2025 premium is paid, so the next is 2026's.
    expect(db.insurancePolicy.update).toHaveBeenCalledWith({
      where: { id: 'pol1' },
      data: { nextPremiumDue: day('2026-10-01') },
    });
  });

  it('is idempotent, and refuses a premium already linked to another policy', async () => {
    db.premiumPayment.findFirst.mockResolvedValue({ id: 'pay9', policyId: 'pol1' });
    expect(await linkImportedPremium('u1', 'pol1', 'tx1')).toMatchObject({ id: 'pay9' });
    expect(db.premiumPayment.create).not.toHaveBeenCalled();

    db.insurancePolicy.findFirst.mockResolvedValue(policy({ id: 'pol2' }));
    await expect(linkImportedPremium('u1', 'pol2', 'tx1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('treats a link made meanwhile as done', async () => {
    db.premiumPayment.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    db.premiumPayment.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'pay7', policyId: 'pol1' });
    expect(await linkImportedPremium('u1', 'pol1', 'tx1')).toMatchObject({ id: 'pay7' });
  });

  it("won't link another user's premium", async () => {
    db.transaction.findFirst.mockResolvedValue(null);
    await expect(linkImportedPremium('u1', 'pol1', 'tx1')).rejects.toBeInstanceOf(NotFoundError);
    expect(db.transaction.findFirst.mock.calls[0]![0].where).toMatchObject({ id: 'tx1', portfolio: { userId: 'u1' } });
  });

  it('remembers a "not this policy"', async () => {
    await dismissImportSuggestion('u1', 'pol1', 'tx1');
    expect(db.insuranceImportDismissal.upsert).toHaveBeenCalledWith({
      where: { policyId_transactionId: { policyId: 'pol1', transactionId: 'tx1' } },
      create: { userId: 'u1', policyId: 'pol1', transactionId: 'tx1' },
      update: {},
    });
  });
});

describe('auto-link on import', () => {
  it('links a premium whose policy number matches exactly', async () => {
    await hookAutoLinkImportedPremium('u1', 'tx1');
    expect(db.premiumPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ policyId: 'pol1', sourceTransactionId: 'tx1' }),
    });
  });

  it('leaves an insurer-and-amount match as a suggestion', async () => {
    db.transaction.findFirst.mockResolvedValue(imported({ orderNo: null }));
    await hookAutoLinkImportedPremium('u1', 'tx1');
    expect(db.premiumPayment.create).not.toHaveBeenCalled();
  });

  it('never fails the import', async () => {
    db.transaction.findFirst.mockRejectedValue(new Error('db down'));
    await expect(hookAutoLinkImportedPremium('u1', 'tx1')).resolves.toBeUndefined();
  });
});

describe('tax summary', () => {
  it('works from the premiums recorded in the year', async () => {
    db.insurancePolicy.findMany.mockResolvedValue([
      {
        ...policy(),
        premiumHistory: [
          {
            paidOn: day('2026-10-02'),
            amount: new Prisma.Decimal('25000'),
            periodFrom: day('2026-10-01'),
            periodTo: day('2027-10-01'),
          },
        ],
      },
    ]);
    const s = await getTaxSummary('u1', '2026-27');
    expect(db.insurancePolicy.findMany.mock.calls[0]![0].where).toEqual({ userId: 'u1' });
    expect(s.life.lines[0]).toMatchObject({ policyId: 'pol1', paid: '25000.00', eligible: '25000.00' });
  });

  it('defaults to the current financial year and refuses a malformed one', async () => {
    db.insurancePolicy.findMany.mockResolvedValue([]);
    expect((await getTaxSummary('u1')).fy).toBe('2026-27');
    await expect(getTaxSummary('u1', '2026-28')).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe('policy tax and surrender fields', () => {
  it('dates a surrender quote today unless told otherwise', async () => {
    await updatePolicy('u1', 'pol1', { surrenderValue: '180000' });
    const data = db.insurancePolicy.update.mock.calls[0]![0].data;
    expect(data.surrenderValue.toString()).toBe('180000');
    expect(data.surrenderValueAsOf).toEqual(day('2026-09-11'));

    db.insurancePolicy.update.mockClear();
    await updatePolicy('u1', 'pol1', { surrenderValue: null });
    expect(db.insurancePolicy.update.mock.calls[0]![0].data).toMatchObject({ surrenderValue: null, surrenderValueAsOf: null });
  });

  it('refuses a surrender value on a term plan, and a future quote date', async () => {
    db.insurancePolicy.findFirst.mockResolvedValue(policy({ type: 'TERM' }));
    await expect(updatePolicy('u1', 'pol1', { surrenderValue: '1000' })).rejects.toBeInstanceOf(BadRequestError);
    db.insurancePolicy.findFirst.mockResolvedValue(policy());
    await expect(
      updatePolicy('u1', 'pol1', { surrenderValue: '1000', surrenderValueAsOf: '2026-12-01' }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('keeps the health-deduction fields to health policies', async () => {
    await expect(updatePolicy('u1', 'pol1', { taxBucket: 'PARENTS' })).rejects.toBeInstanceOf(BadRequestError);
    db.insurancePolicy.findFirst.mockResolvedValue(policy({ type: 'HEALTH' }));
    await updatePolicy('u1', 'pol1', { taxBucket: 'PARENTS', seniorCitizen: true });
    expect(db.insurancePolicy.update.mock.calls[0]![0].data).toMatchObject({ taxBucket: 'PARENTS', seniorCitizen: true });
  });

  it('sends the surrender value as a string', () => {
    const dto = toPolicyDto(policy({ surrenderValue: new Prisma.Decimal('180000.50'), surrenderValueAsOf: day('2026-09-01') }));
    expect(dto.surrenderValue).toBe('180000.5');
    expect(toPolicyDto(policy()).surrenderValue).toBeNull();
  });
});
