import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const db = vi.hoisted(() => ({
  transaction: { findMany: vi.fn() },
  alert: { findFirst: vi.fn(), create: vi.fn() },
}));
vi.mock('../../src/lib/prisma.js', () => ({ prisma: db }));

import { generateDepositReminderAlerts } from '../../src/services/depositReminders.service.js';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

function fd(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    portfolioId: 'p1',
    assetClass: 'FIXED_DEPOSIT',
    assetName: 'Kotak',
    isin: null,
    transactionType: 'DEPOSIT',
    tradeDate: d('2026-05-01'),
    maturityDate: d('2027-11-10'),
    price: '100000',
    netAmount: '100000',
    portfolio: { userId: 'u1' },
    ...over,
  };
}

/** `count` monthly ₹5,000 installments from 5 Jan 2026. */
function rd(count: number, maturity: string) {
  return Array.from({ length: count }, (_, i) =>
    fd({
      id: `r${i}`,
      assetClass: 'RECURRING_DEPOSIT',
      assetName: 'ICICI Bank',
      tradeDate: d(`2026-${String(i + 1).padStart(2, '0')}-05`),
      maturityDate: d(maturity),
      price: '5000',
      netAmount: '5000',
    }),
  );
}

function setToday(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${iso}T06:00:00Z`) });
}

const created = () => db.alert.create.mock.calls.map((c) => c[0].data);

beforeEach(() => {
  vi.clearAllMocks();
  db.alert.findFirst.mockResolvedValue(null);
  db.alert.create.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('generateDepositReminderAlerts', () => {
  it('reminds 7 days before an FD matures', async () => {
    setToday('2026-09-10');
    db.transaction.findMany.mockResolvedValue([fd({ maturityDate: d('2026-09-17') })]);

    expect(await generateDepositReminderAlerts()).toBe(1);
    expect(created()).toEqual([
      expect.objectContaining({
        userId: 'u1',
        type: 'FD_MATURITY',
        title: 'Kotak FD matures in 7 days',
        description: '₹1,00,000.00 deposit matures on 2026-09-17',
      }),
    ]);
  });

  it('stays quiet between thresholds', async () => {
    setToday('2026-09-10');
    db.transaction.findMany.mockResolvedValue([fd({ maturityDate: d('2026-09-18') })]);
    expect(await generateDepositReminderAlerts()).toBe(0);
    expect(db.alert.create).not.toHaveBeenCalled();
  });

  it('raises one maturity alert per RD, not one per installment', async () => {
    setToday('2026-09-10');
    // 8 installments on an 8-month plan maturing in 7 days: all paid.
    db.transaction.findMany.mockResolvedValue(rd(8, '2026-09-17'));

    expect(await generateDepositReminderAlerts()).toBe(1);
    expect(created()[0]).toMatchObject({ type: 'FD_MATURITY', title: 'ICICI Bank RD matures in 7 days' });
  });

  it('reminds 3 days before the next RD installment', async () => {
    setToday('2026-09-02');
    // 8 of 24 paid (Jan–Aug); the 9th falls due 5 Sep.
    db.transaction.findMany.mockResolvedValue(rd(8, '2028-01-05'));

    expect(await generateDepositReminderAlerts()).toBe(1);
    expect(created()[0]).toMatchObject({
      type: 'CUSTOM',
      title: 'ICICI Bank RD installment due in 3 days',
      description: 'Installment of ₹5,000.00 due on 2026-09-05',
    });
  });

  it('flags an overdue installment once', async () => {
    setToday('2026-09-10');
    db.transaction.findMany.mockResolvedValue(rd(8, '2028-01-05'));

    expect(await generateDepositReminderAlerts()).toBe(1);
    expect(created()[0]).toMatchObject({
      title: 'ICICI Bank RD installment overdue by 5 days',
      description: 'Installment of ₹5,000.00 was due on 2026-09-05',
    });

    // Next night's scan finds the alert it already raised.
    db.alert.create.mockClear();
    db.alert.findFirst.mockResolvedValue({ id: 'a1' });
    expect(await generateDepositReminderAlerts()).toBe(0);
    expect(db.alert.create).not.toHaveBeenCalled();
  });

  it('ignores deposits that have matured or been withdrawn', async () => {
    setToday('2026-09-10');
    db.transaction.findMany.mockResolvedValue([
      fd({ maturityDate: d('2026-09-17') }),
      fd({ id: 't2', transactionType: 'WITHDRAWAL', tradeDate: d('2026-08-01') }),
    ]);
    expect(await generateDepositReminderAlerts()).toBe(0);
  });

  it("scopes the scan to one user's portfolios when asked", async () => {
    setToday('2026-09-10');
    db.transaction.findMany.mockResolvedValue([]);
    await generateDepositReminderAlerts('u1');
    expect(db.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ portfolio: { userId: 'u1' } }) }),
    );
  });
});
