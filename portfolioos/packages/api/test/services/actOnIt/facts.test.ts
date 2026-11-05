/**
 * Act on it, Task 4: the facts the new suggestion types read. Sections that
 * reuse an existing, separately tested service (FD maturities, loan market
 * comparison, fund findings, index prices) are covered by the rule tests with
 * fixture facts; here: empty user, bank balances and rate, health cover,
 * missed SIPs, and the regular → direct match.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { Decimal } from 'decimal.js';
import { createTestScope, prisma, type TestScope } from '../../helpers/db.js';
import { runAsSystem, runAsUser } from '../../../src/lib/requestContext.js';
import { buildActOnItFacts, TYPICAL_SAVINGS_RATE_PCT } from '../../../src/services/advisor/actOnItFacts.builder.js';
import type { AdvisorHoldingFact } from '../../../src/services/advisor/types.js';

const NOW = new Date('2026-11-06T06:00:00Z');
const noHarvest = { rows: [], totals: { realisedLtcgInFy: '0' }, savings: { ltcgExemption: '125000' } };
const scopes: TestScope[] = [];
const CODES = ['TEST-AOI-REG', 'TEST-AOI-DIR'];

afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.mfSchemeTer.deleteMany({ where: { schemeCode: { in: CODES } } });
    await prisma.mfSchemeMeta.deleteMany({ where: { schemeCode: { in: CODES } } });
    await prisma.mutualFundMaster.deleteMany({ where: { schemeCode: { in: CODES } } });
  });
  for (const s of scopes) await s.cleanup();
});

describe('act on it facts (DB)', () => {
  it('a user with nothing gets empty sections and the typical savings rate, flagged as assumed', async () => {
    const s = await createTestScope('aoi-facts-empty');
    scopes.push(s);
    const f = await runAsUser(s.userId, () => buildActOnItFacts(s.userId, NOW, { holdings: [], fallbackMonthlyExpenses: null, harvest: noHarvest }));
    expect(f).toMatchObject({ spendingConsent: false, monthlySpending: null, regularPlans: [], fds: [], loans: [], sips: [], weakFunds: [], advanceTax: null });
    expect(f.bank).toMatchObject({ balanceMonths: [], latestBalance: null, savingsRatePct: TYPICAL_SAVINGS_RATE_PCT, savingsRateAssumed: true });
    expect(f.healthCover.policies).toBe(0);
  });

  it('reads month-end balances, the account rate, health cover and missed SIPs', async () => {
    const s = await createTestScope('aoi-facts-bank');
    scopes.push(s);
    const uid = s.userId;
    await runAsUser(uid, async () => {
      const acc = await prisma.bankAccount.create({
        data: { userId: uid, bankName: 'Test Bank', accountType: 'SAVINGS', accountHolder: 'Test User', last4: '9876', interestRatePct: '2.75', currentBalance: '300000' },
      });
      for (let i = 12; i >= 1; i--) {
        const day = new Date(Date.UTC(2026, 10 - i, 20));
        await prisma.bankBalanceSnapshot.create({ data: { accountId: acc.id, asOfDate: day, balance: String(200000 + (12 - i) * 10000), source: 'manual' } });
      }
      await prisma.insurancePolicy.create({
        data: { userId: uid, insurer: 'Test Health', policyNumber: 'P1', type: 'HEALTH', policyHolder: 'Test User', sumAssured: '500000', premiumAmount: '15000', premiumFrequency: 'ANNUAL', startDate: new Date('2025-01-01') },
      });
      await prisma.sipPlan.create({ data: { userId: uid, assetName: 'Test Index Fund', amount: '10000', frequency: 'MONTHLY', startDate: new Date('2025-01-01') } });
    });
    const f = await runAsUser(uid, () => buildActOnItFacts(uid, NOW, { holdings: [], fallbackMonthlyExpenses: new Decimal(40000), harvest: noHarvest }));
    expect(f.bank.balanceMonths).toHaveLength(12);
    expect(f.bank.balanceMonths[11]).toMatchObject({ month: '2026-10' });
    expect(f.bank.balanceMonths[11]!.balance.toNumber()).toBe(310000);
    expect(f.bank).toMatchObject({ savingsRatePct: 2.75, savingsRateAssumed: false });
    expect(f.bank.latestBalance!.toNumber()).toBe(300000);
    expect(f.monthlySpending!.toNumber()).toBe(40000); // no consent: the alert-based estimate
    expect(f.healthCover).toMatchObject({ policies: 1 });
    expect(f.healthCover.sumInsured.toNumber()).toBe(500000);
    expect(f.sips).toEqual([expect.objectContaining({ name: 'Test Index Fund', missedMonths: ['2026-08', '2026-09', '2026-10'] })]);
  });

  it('matches a regular-plan holding to its cheaper direct plan', async () => {
    const s = await createTestScope('aoi-facts-mf');
    scopes.push(s);
    const ids = await runAsSystem(async () => {
      const meta = (code: string, plan: 'REGULAR' | 'DIRECT') => prisma.mfSchemeMeta.create({
        data: { schemeCode: code, schemeName: `Test Flexi Cap ${plan}`, amcCode: 'TAMC', amcName: 'Test AMC', sebiCategory: 'EQUITY', sebiSubCategory: 'Flexi Cap Fund', planType: plan, optionType: 'GROWTH', inceptionDate: new Date('2015-01-01'), sourceHash: code, fetchedAt: NOW },
      });
      await meta('TEST-AOI-REG', 'REGULAR');
      await meta('TEST-AOI-DIR', 'DIRECT');
      await prisma.mfSchemeTer.create({ data: { schemeCode: 'TEST-AOI-REG', effectiveFrom: new Date('2026-10-01'), terPct: '1.80', sourceHash: 'r', fetchedAt: NOW } });
      await prisma.mfSchemeTer.create({ data: { schemeCode: 'TEST-AOI-DIR', effectiveFrom: new Date('2026-10-01'), terPct: '0.60', sourceHash: 'd', fetchedAt: NOW } });
      const reg = await prisma.mutualFundMaster.create({ data: { schemeCode: 'TEST-AOI-REG', schemeName: 'Test Flexi Cap Fund', amcName: 'Test AMC', category: 'EQUITY', planType: 'Regular Plan', optionType: 'Growth Option' } });
      const dir = await prisma.mutualFundMaster.create({ data: { schemeCode: 'TEST-AOI-DIR', schemeName: 'Test Flexi Cap Fund', amcName: 'Test AMC', category: 'EQUITY', planType: 'Direct Plan', optionType: 'Growth Option' } });
      return { reg: reg.id, dir: dir.id };
    });
    const holding: AdvisorHoldingFact = {
      holdingKey: 'fund:x', portfolioId: 'pf', assetName: 'Test Flexi Cap Fund - Regular', assetClass: 'MUTUAL_FUND', bucket: 'EQUITY_DOMESTIC',
      fundId: ids.reg, stockId: null, isin: null, quantity: new Decimal(100), currentPrice: new Decimal(5000), currentValue: new Decimal(500000),
      totalCost: new Decimal(400000), unrealisedPnL: new Decimal(100000), priceStale: false,
    };
    const f = await runAsUser(s.userId, () => buildActOnItFacts(s.userId, NOW, { holdings: [holding], fallbackMonthlyExpenses: null, harvest: noHarvest }));
    expect(f.regularPlans).toEqual([
      expect.objectContaining({ fundId: ids.reg, directFundId: ids.dir, directSchemeCode: 'TEST-AOI-DIR', regularTerPct: 1.8, directTerPct: 0.6 }),
    ]);
  });
});
