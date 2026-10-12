import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Decimal } from '@everypaisa/shared';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { getDashboardNetWorth } from '../../src/services/dashboard.service.js';
import { collectEstate, MAX_ESTATE_CANDIDATES } from '../../src/services/will/estate/registry.js';
import { CASH_MAY_DUPLICATE_NOTE } from '../../src/services/will/estate/adapters/financial.js';
import { loanCandidate, LOAN_SCHEDULE_FAILED_NOTE } from '../../src/services/will/estate/adapters/credit.js';
import type { EstateAdapter, EstateCandidate } from '../../src/services/will/estate/types.js';
import { clearEstateFixture, seedEstateFixture, TODAY } from './willFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let scope: TestScope;
let other: TestScope;
/** A second user's portfolio and row ids: the itemiser must never return them. */
const otherIds: string[] = [];
const collect = () => scope.runAs(() => collectEstate({ userId: scope.userId, today: TODAY }));
const sum = (cs: EstateCandidate[], kind: EstateCandidate['kind']) =>
  cs.filter((c) => c.kind === kind).reduce((s, c) => s.plus(c.value), new Decimal(0)).toFixed(2);

beforeAll(async () => {
  scope = await createTestScope('will-estate');
  await seedEstateFixture(scope.userId, scope.portfolioId);
  other = await createTestScope('will-estate-other');
  await seedEstateFixture(other.userId, other.portfolioId);
  await runAsSystem(async () => {
    const o = other.userId;
    const others = await Promise.all([
      prisma.bankAccount.findMany({ where: { userId: o }, select: { id: true } }),
      prisma.ownedProperty.findMany({ where: { userId: o }, select: { id: true } }),
      prisma.rentalProperty.findMany({ where: { userId: o }, select: { id: true } }),
      prisma.vehicle.findMany({ where: { userId: o }, select: { id: true } }),
      prisma.insurancePolicy.findMany({ where: { userId: o }, select: { id: true } }),
      prisma.loanGiven.findMany({ where: { userId: o }, select: { id: true } }),
      prisma.loan.findMany({ where: { userId: o }, select: { id: true } }),
      prisma.creditCard.findMany({ where: { userId: o }, select: { id: true } }),
    ]);
    otherIds.push(other.portfolioId, ...others.flat().map((r) => r.id));
  });
});
afterAll(async () => {
  await clearEstateFixture(scope.userId);
  await scope.cleanup();
  await clearEstateFixture(other.userId);
  await other.cleanup();
});

/** This user's closed, sold, inactive, overdraft and paid-off rows. Not in beforeAll: the dashboard counts inactive rentals. */
async function seedHiddenRows(u: string): Promise<string[]> {
  return runAsSystem(async () => {
    const created = await Promise.all([
      prisma.bankAccount.create({ data: { userId: u, bankName: 'Closed Bank', accountType: 'SAVINGS', accountHolder: 'Test', last4: '1111', currentBalance: '500', status: 'CLOSED' } }),
      prisma.bankAccount.create({ data: { userId: u, bankName: 'OD Bank', accountType: 'OD', accountHolder: 'Test', last4: '2222', currentBalance: '700' } }),
      prisma.ownedProperty.create({ data: { userId: u, name: 'Sold house', propertyType: 'APARTMENT', status: 'SOLD', currentValue: '100' } }),
      prisma.ownedProperty.create({ data: { userId: u, name: 'Inactive house', propertyType: 'APARTMENT', isActive: false, currentValue: '100' } }),
      prisma.rentalProperty.create({ data: { userId: u, name: 'Old rental', propertyType: 'RESIDENTIAL', isActive: false, currentValue: '100' } }),
      prisma.loan.create({
        data: { userId: u, lenderName: 'Closed Lender', loanType: 'CAR', borrowerName: 'Test', principalAmount: '100000', interestRate: '9', tenureMonths: 12, emiAmount: '8745.15', disbursementDate: new Date('2025-01-01'), firstEmiDate: new Date('2025-02-05'), status: 'CLOSED' },
      }),
      prisma.creditCard.create({
        data: { userId: u, issuerBank: 'ICICI Bank', cardName: 'Paid off', last4: '0000', creditLimit: '100000', outstandingBalance: '0', statementDay: 5, dueDay: 25 },
      }),
    ]);
    return created.map((r) => r.id);
  });
}

async function deleteHiddenRows(ids: readonly string[]): Promise<void> {
  await runAsSystem(async () => {
    const where = { id: { in: [...ids] } };
    await prisma.bankAccount.deleteMany({ where });
    await prisma.ownedProperty.deleteMany({ where });
    await prisma.rentalProperty.deleteMany({ where });
    await prisma.loan.deleteMany({ where });
    await prisma.creditCard.deleteMany({ where });
  });
}

describe('collectEstate', () => {
  it('reads every source without failures', async () => {
    const { candidates, failed } = await collect();
    expect(failed).toEqual([]);
    expect(candidates.map((c) => c.kind).sort()).toEqual([
      'BANK_ACCOUNT', 'CREDIT_CARD', 'HOLDING', 'HOLDING', 'INSURANCE', 'LOAN', 'LOAN_GIVEN',
      'OWNED_PROPERTY', 'RENTAL_PROPERTY', 'VEHICLE',
    ]);
  });

  it('matches the dashboard on the classes both count', async () => {
    const { candidates } = await collect();
    const net = await scope.runAs(() => getDashboardNetWorth(scope.userId));
    const d2 = (v: string) => new Decimal(v).toFixed(2);
    expect(sum(candidates, 'HOLDING')).toBe(d2(net.portfolio.currentValue));
    expect(sum(candidates, 'VEHICLE')).toBe(d2(net.vehicles.totalValue));
    expect(sum(candidates, 'RENTAL_PROPERTY')).toBe(d2(net.realEstate.totalValue));
    expect(sum(candidates, 'LOAN')).toBe(d2(net.liabilities.totalOutstanding));
    expect(sum(candidates, 'CREDIT_CARD')).toBe(d2(net.liabilities.totalCreditCardOutstanding));
    const lent = net.allocationBreakdown.find((x) => x.key === 'LOAN_GIVEN');
    expect(sum(candidates, 'LOAN_GIVEN')).toBe(d2(lent!.value));
  });

  it('maps ownership, identifiers and review states', async () => {
    const { candidates } = await collect();
    const by = (kind: EstateCandidate['kind']) => candidates.filter((c) => c.kind === kind);
    expect(by('BANK_ACCOUNT')[0]).toMatchObject({
      label: 'HDFC Bank savings account', ref: 'XXXX1234', value: '250000.00',
      ownership: { type: 'JOINT', sharePct: '50.00' }, review: 'NEEDS_REVIEW',
    });
    expect(by('BANK_ACCOUNT')[0]!.note).toContain('nominee');
    expect(by('OWNED_PROPERTY')[0]).toMatchObject({ label: 'Pune house, Pune', ownership: { type: 'JOINT', sharePct: '50.00' }, review: 'NEEDS_REVIEW' });
    expect(by('INSURANCE')[0]).toMatchObject({ ref: 'XXXX9876', value: '10000000.00', ownership: { type: 'NOMINEE_ONLY', sharePct: '100' } });
    expect(by('VEHICLE')[0]).toMatchObject({ label: 'Maruti Swift', ref: 'MH47BT5950', value: '450000.00', review: 'CONFIRMED' });
    expect(by('CREDIT_CARD')[0]).toMatchObject({ side: 'LIABILITY', ref: 'XXXX4321', value: '12500.75' });
    expect(by('LOAN')[0]).toMatchObject({ side: 'LIABILITY', label: 'Home loan - SBI' });
    const equity = by('HOLDING').find((c) => c.sourceKey.endsWith(':EQUITY'))!;
    expect(equity.value).toBe('2400.50');
    expect(equity.label).toMatch(/^Equity - Test portfolio /);
  });

  it('reports a PF account once, from the PF account, not again as a holding', async () => {
    const pf = await runAsSystem(async () => {
      await prisma.holdingProjection.create({
        data: { portfolioId: scope.portfolioId, assetKey: 'will-test:pf', assetClass: 'EPF', quantity: '1', avgCostPrice: '70000', totalCost: '70000', currentValue: '70000', sourceTxCount: 1 },
      });
      return prisma.providentFundAccount.create({
        data: { userId: scope.userId, type: 'EPF', institution: 'EPFO', identifierCipher: Buffer.from('x'), identifierLast4: '4455', holderName: 'Test', currentBalance: '80000', assetKey: 'will-test:pf' },
      });
    });
    try {
      const { candidates } = await collect();
      expect(candidates.some((c) => c.sourceKey.endsWith(':EPF'))).toBe(false);
      expect(candidates.find((c) => c.kind === 'PROVIDENT_FUND')).toMatchObject({ sourceKey: `pf:${pf.id}`, value: '80000.00', ref: 'XXXX4455' });
    } finally {
      await runAsSystem(async () => {
        await prisma.providentFundAccount.delete({ where: { id: pf.id } });
        await prisma.holdingProjection.deleteMany({ where: { portfolioId: scope.portfolioId, assetKey: 'will-test:pf' } });
      });
    }
  });

  it('skips a rental property that an owned property already covers', async () => {
    const ids = await runAsSystem(async () => {
      const rental = await prisma.rentalProperty.create({ data: { userId: scope.userId, name: 'Linked flat', propertyType: 'RESIDENTIAL', currentValue: '100' } });
      const owned = await prisma.ownedProperty.create({ data: { userId: scope.userId, name: 'Linked flat', propertyType: 'APARTMENT', rentalPropertyId: rental.id, currentValue: '100' } });
      return { rental: rental.id, owned: owned.id };
    });
    try {
      const { candidates } = await collect();
      expect(candidates.some((c) => c.sourceKey === `rentalProperty:${ids.rental}`)).toBe(false);
      expect(candidates.some((c) => c.sourceKey === `ownedProperty:${ids.owned}`)).toBe(true);
    } finally {
      await runAsSystem(async () => {
        await prisma.ownedProperty.delete({ where: { id: ids.owned } });
        await prisma.rentalProperty.delete({ where: { id: ids.rental } });
      });
    }
  });

  it('reports a failing source instead of swallowing it', async () => {
    const one: EstateCandidate = {
      sourceKey: 'x:1', side: 'ASSET', kind: 'OTHER_ASSET', label: 'X', ref: null, value: '1.00', valueAsOf: null,
      ownership: { type: 'SOLE', sharePct: '100' }, review: 'CONFIRMED', note: null,
    };
    const ok: EstateAdapter = { id: 'ok', version: '1', collect: async () => [one] };
    const boom: EstateAdapter = { id: 'boom', version: '1', collect: async () => { throw new Error('db down'); } };
    const r = await collectEstate({ userId: scope.userId, today: TODAY }, [ok, boom]);
    expect(r.failed).toEqual(['boom']);
    expect(r.candidates).toEqual([one]);
  });

  it("never returns another user's rows or closed, sold, inactive, overdraft or paid-off ones", async () => {
    const own = await seedHiddenRows(scope.userId);
    try {
      const { candidates, failed } = await collect();
      expect(failed).toEqual([]);
      const hidden = [...otherIds, ...own];
      expect(hidden.length).toBe(16);
      const leaked = candidates.filter((c) => hidden.some((id) => c.sourceKey.includes(id)));
      expect(leaked).toEqual([]);
      expect(candidates.filter((c) => c.kind === 'BANK_ACCOUNT').map((c) => c.ref)).toEqual(['XXXX1234']);
    } finally {
      await deleteHiddenRows(own);
    }
  });

  it('leaves CASH holdings out (but offered) when a bank account has a balance', async () => {
    await runAsSystem(() => prisma.holdingProjection.create({
      data: { portfolioId: scope.portfolioId, assetKey: 'will-test:cash', assetClass: 'CASH', quantity: '1', avgCostPrice: '250000', totalCost: '250000', currentValue: '250000', sourceTxCount: 1 },
    }));
    try {
      const { candidates } = await collect();
      expect(candidates.find((c) => c.sourceKey === `holdings:${scope.portfolioId}:CASH`)).toMatchObject({
        value: '250000.00', review: 'EXCLUDED', note: CASH_MAY_DUPLICATE_NOTE,
      });
    } finally {
      await runAsSystem(() => prisma.holdingProjection.deleteMany({ where: { portfolioId: scope.portfolioId, assetKey: 'will-test:cash' } }));
    }
  });

  it('counts CASH holdings normally when there is no funded bank account', async () => {
    const lone = await createTestScope('will-estate-cash');
    try {
      await runAsSystem(async () => {
        await prisma.holdingProjection.create({
          data: { portfolioId: lone.portfolioId, assetKey: 'will-test:cash', assetClass: 'CASH', quantity: '1', avgCostPrice: '5000', totalCost: '5000', currentValue: '5000', sourceTxCount: 1 },
        });
        // An overdraft with a balance does not count as a bank account here.
        await prisma.bankAccount.create({ data: { userId: lone.userId, bankName: 'OD Bank', accountType: 'OD', accountHolder: 'Test', last4: '3333', currentBalance: '900' } });
      });
      const { candidates, failed } = await lone.runAs(() => collectEstate({ userId: lone.userId, today: TODAY }));
      expect(failed).toEqual([]);
      expect(candidates).toEqual([
        expect.objectContaining({ sourceKey: `holdings:${lone.portfolioId}:CASH`, value: '5000.00', review: 'CONFIRMED', note: null }),
      ]);
    } finally {
      await lone.cleanup();
    }
  });

  it('reports a synchronous throw as a failure, not a rejection', async () => {
    const sync: EstateAdapter = { id: 'sync', version: '1', collect: () => { throw new Error('sync boom'); } };
    const r = await collectEstate({ userId: scope.userId, today: TODAY }, [sync]);
    expect(r).toEqual({ candidates: [], failed: ['sync'] });
  });

  it('reports truncation in failed', async () => {
    const many: EstateAdapter = {
      id: 'many', version: '1',
      collect: async () => Array.from({ length: MAX_ESTATE_CANDIDATES + 5 }, (_, i): EstateCandidate => ({
        sourceKey: `x:${i}`, side: 'ASSET', kind: 'OTHER_ASSET', label: 'X', ref: null, value: '1.00', valueAsOf: null,
        ownership: { type: 'SOLE', sharePct: '100' }, review: 'CONFIRMED', note: null,
      })),
    };
    const r = await collectEstate({ userId: scope.userId, today: TODAY }, [many]);
    expect(r.candidates).toHaveLength(MAX_ESTATE_CANDIDATES);
    expect(r.failed).toEqual(['truncated']);
  });
});

describe('loanCandidate', () => {
  const loan = { id: 'l1', loanType: 'HOME', lenderName: 'SBI', accountNumberLast4: null };
  it('asks for review when the schedule could not be built', () => {
    expect(loanCandidate(loan, { outstanding: new Decimal('1000000'), scheduleFailed: true })).toMatchObject({
      value: '1000000.00', review: 'NEEDS_REVIEW', note: LOAN_SCHEDULE_FAILED_NOTE,
    });
  });
  it('is confirmed when the schedule was built', () => {
    expect(loanCandidate(loan, { outstanding: new Decimal('400000'), scheduleFailed: false })).toMatchObject({
      value: '400000.00', review: 'CONFIRMED', note: null,
    });
  });
});
