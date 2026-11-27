import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { computeHealthScore } from '../../src/services/analytics/healthScore.service.js';

/**
 * Launch review B10. The formulas are unchanged (10x annual income; six months
 * of spending). What changed is what the cards tell the user to do:
 *  - Emergency fund said "Record your spending (Cash Activity)", but spending
 *    is read only from confirmed bank/card debit alerts — Cash Activity entries
 *    never fill it in.
 *  - Insurance ordered "Add ₹X more life cover" from a rule of thumb.
 *
 * Synthetic numbers only.
 */
describe('health score cards say what to do, accurately', () => {
  let scope: TestScope;

  beforeEach(async () => {
    scope = await createTestScope('health-copy');
    await scope.runAs(async () => {
      await prisma.income.create({ data: { userId: scope.userId, sourceName: 'Salary', monthlyAmount: '100000' } });
      await prisma.insurancePolicy.create({
        data: {
          userId: scope.userId, insurer: 'Test Life', type: 'TERM', policyHolder: 'TEST USER',
          sumAssured: '1000000', premiumAmount: '10000', premiumFrequency: 'ANNUAL', startDate: new Date('2024-01-01'),
        },
      });
      await prisma.holdingProjection.create({
        data: {
          portfolioId: scope.portfolioId, assetKey: 'name:test-fd', assetClass: 'FIXED_DEPOSIT', assetName: 'Test FD',
          quantity: '1', avgCostPrice: '200000', totalCost: '200000', sourceTxCount: 1,
        },
      });
    });
  });
  afterEach(async () => {
    await scope.cleanup();
  });

  it('points the unscored emergency fund at the data it actually reads', async () => {
    const r = await scope.runAs(() => computeHealthScore(scope.userId, { force: true }));
    const ef = r.subScores.emergencyFund;
    expect(ef.score).toBeNull();
    expect(ef.action).not.toMatch(/Cash Activity/);
    expect(ef.action).toMatch(/Gmail/);
    expect(ef.action).toMatch(/debit alerts/);
  });

  it('states the life-cover gap as a rule-of-thumb estimate with a next step', async () => {
    const r = await scope.runAs(() => computeHealthScore(scope.userId, { force: true }));
    const ins = r.subScores.insurance;
    // 10x of 12,00,000 a year = 1,20,00,000; held 10,00,000 → about 1,10,00,000 short.
    expect(ins.action).toMatch(/rule of thumb/);
    expect(ins.action).toMatch(/about ₹1,10,00,000/);
    expect(ins.action).toMatch(/Insurance page/);
    expect(ins.action).not.toMatch(/^Add /);
  });
});

/**
 * User decision 2026-11-27: the 10x life-cover base is earned income only.
 * Life cover replaces income that stops at death; rent keeps coming and
 * trading P&L is not a wage.
 */
describe('life cover is sized on earned income only', () => {
  let scope: TestScope;
  afterEach(async () => {
    await scope.cleanup();
  });

  async function setup(incomes: Array<{ type: 'SALARY' | 'RENTAL' | 'TRADING'; monthly: string }>) {
    scope = await createTestScope('health-earned');
    await scope.runAs(async () => {
      for (const i of incomes) {
        await prisma.income.create({ data: { userId: scope.userId, type: i.type, sourceName: i.type, monthlyAmount: i.monthly } });
      }
      await prisma.insurancePolicy.create({
        data: {
          userId: scope.userId, insurer: 'Test Life', type: 'TERM', policyHolder: 'TEST USER',
          sumAssured: '1000000', premiumAmount: '10000', premiumFrequency: 'ANNUAL', startDate: new Date('2024-01-01'),
        },
      });
    });
  }

  it('ignores rent and trading income in the 10x base', async () => {
    // Salary 1,00,000 + rent 50,000 + trading 40,000 a month. Base is salary only:
    // 12,00,000 a year → 1,20,00,000 needed, 10,00,000 held → about 1,10,00,000 short.
    await setup([
      { type: 'SALARY', monthly: '100000' },
      { type: 'RENTAL', monthly: '50000' },
      { type: 'TRADING', monthly: '40000' },
    ]);
    const r = await scope.runAs(() => computeHealthScore(scope.userId, { force: true }));
    expect(r.subScores.insurance.action).toMatch(/about ₹1,10,00,000(.00)? short/);
  });

  it('says so when the only income on file is rent or trading', async () => {
    await setup([{ type: 'RENTAL', monthly: '50000' }, { type: 'TRADING', monthly: '40000' }]);
    const r = await scope.runAs(() => computeHealthScore(scope.userId, { force: true }));
    expect(r.subScores.insurance.score).toBeNull();
    expect(r.subScores.insurance.insight).toMatch(/no earned income/);
  });
});
