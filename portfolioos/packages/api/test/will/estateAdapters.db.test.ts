import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Decimal } from '@everypaisa/shared';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { getDashboardNetWorth } from '../../src/services/dashboard.service.js';
import { collectEstate } from '../../src/services/will/estate/registry.js';
import type { EstateAdapter, EstateCandidate } from '../../src/services/will/estate/types.js';
import { clearEstateFixture, seedEstateFixture, TODAY } from './willFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let scope: TestScope;
const collect = () => scope.runAs(() => collectEstate({ userId: scope.userId, today: TODAY }));
const sum = (cs: EstateCandidate[], kind: EstateCandidate['kind']) =>
  cs.filter((c) => c.kind === kind).reduce((s, c) => s.plus(c.value), new Decimal(0)).toFixed(2);

beforeAll(async () => {
  scope = await createTestScope('will-estate');
  await seedEstateFixture(scope.userId, scope.portfolioId);
});
afterAll(async () => {
  await clearEstateFixture(scope.userId);
  await scope.cleanup();
});

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
});
