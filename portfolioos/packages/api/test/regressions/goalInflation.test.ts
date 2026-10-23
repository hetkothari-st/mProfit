import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createGoal } from '../../src/services/goals/goals.service.js';

// The inflation rate was saved and turned into an inflation-adjusted target the
// page never showed, while the required return was worked out against the
// un-inflated target — so changing the rate changed nothing on screen.

describe('goal inflation rate', () => {
  let scope: TestScope;
  beforeAll(async () => {
    scope = await createTestScope('goal-infl');
  });
  afterAll(async () => {
    await runAsSystem(() => prisma.goal.deleteMany({ where: { userId: scope.userId } }));
    await scope.cleanup();
  });

  it('raises the required return against the inflation-adjusted target', async () => {
    await scope.runAs(async () => {
      const inTenYears = new Date(Date.now() + 10 * 365.25 * 86_400_000).toISOString().slice(0, 10);
      const base = { name: 'Home', targetAmount: '2000000', initialAmount: '1000000', targetDate: inTenYears };
      const plain = await createGoal(scope.userId, base);
      const inflated = await createGoal(scope.userId, { ...base, name: 'Home (6%)', inflationRate: '0.06' });

      expect(plain.requiredCagr).not.toBeNull();
      // 2× in 10 years ≈ 7.18%; with 6% inflation the target is ≈ 35.8L, ≈ 13.6%.
      expect(plain.requiredCagr!).toBeCloseTo(0.0718, 3);
      expect(inflated.requiredCagr!).toBeCloseTo(0.1361, 2);
      expect(inflated.inflationAdjustedTarget).not.toBeNull();
    });
  });
});
