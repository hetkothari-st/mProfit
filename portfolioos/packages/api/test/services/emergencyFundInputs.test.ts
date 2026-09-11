import { describe, it, expect, vi, beforeEach } from 'vitest';

// The emergency fund is money you can reach this week. Savings balances are
// the most obvious part of it and used to be left out entirely; a bank
// statement import can also mirror the same account as a CASH holding, so the
// two must not be added together.

const db = vi.hoisted(() => ({
  holdingFindMany: vi.fn(),
  bankFindMany: vi.fn(),
  eventFindMany: vi.fn(),
}));
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    holdingProjection: { findMany: db.holdingFindMany },
    bankAccount: { findMany: db.bankFindMany },
    canonicalEvent: { findMany: db.eventFindMany },
  },
}));

import { getEmergencyFundInputs } from '../../src/services/healthScore.service.js';

const holdings = [
  { assetClass: 'CASH', currentValue: '50000', totalCost: '50000' },
  { assetClass: 'FIXED_DEPOSIT', currentValue: null, totalCost: '100000' },
];

beforeEach(() => {
  vi.clearAllMocks();
  db.holdingFindMany.mockResolvedValue(holdings);
  db.eventFindMany.mockResolvedValue([]);
});

describe('getEmergencyFundInputs', () => {
  it('counts bank balances, in place of cash holdings that mirror the same accounts', async () => {
    db.bankFindMany.mockResolvedValue([{ currentBalance: '200000' }, { currentBalance: null }]);
    const r = await getEmergencyFundInputs('u1');
    expect(r.bankBalances.toString()).toBe('200000');
    // ₹2 L in the bank + ₹1 L FD; the ₹50,000 CASH holding is the same money.
    expect(r.liquidAssets.toString()).toBe('300000');
  });

  it('falls back to cash holdings when no bank balance is on file', async () => {
    db.bankFindMany.mockResolvedValue([]);
    const r = await getEmergencyFundInputs('u1');
    expect(r.bankBalances.toString()).toBe('0');
    expect(r.liquidAssets.toString()).toBe('150000');
  });

  it('reads only open accounts, and never an overdraft', async () => {
    db.bankFindMany.mockResolvedValue([]);
    await getEmergencyFundInputs('u1');
    expect(db.bankFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'u1', status: 'ACTIVE', accountType: { not: 'OD' } }),
      }),
    );
  });
});
