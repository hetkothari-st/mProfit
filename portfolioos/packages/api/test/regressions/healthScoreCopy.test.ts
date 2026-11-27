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
