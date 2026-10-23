import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createPolicy, updatePolicy } from '../../src/services/insurance/insurance.service.js';

// A matured policy kept getting premium reminders: the status could not be
// changed from any screen, and reminders already raised stayed up even when it
// could. Marking it non-active must retire those reminders.

describe('marking a policy matured stops its reminders', () => {
  let scope: TestScope;
  beforeAll(async () => {
    scope = await createTestScope('ins-status');
  });
  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.alert.deleteMany({ where: { userId: scope.userId } });
      await prisma.insurancePolicy.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it('retires the open premium reminder for that policy', async () => {
    await scope.runAs(async () => {
      const p = await createPolicy(scope.userId, {
        insurer: 'LIC',
        policyNumber: 'LIC12345678',
        type: 'ENDOWMENT',
        policyHolder: 'Test Holder',
        sumAssured: '500000',
        premiumAmount: '24000',
        premiumFrequency: 'ANNUAL',
        startDate: '2010-04-10',
      });
      const alert = await prisma.alert.create({
        data: {
          userId: scope.userId,
          type: 'INSURANCE_PREMIUM',
          title: 'LIC premium due',
          triggerDate: new Date(),
          metadata: { key: 'k1', policyId: p.id },
        },
      });

      const updated = await updatePolicy(scope.userId, p.id, { status: 'MATURED' });
      expect(updated.status).toBe('MATURED');
      const after = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } });
      expect(after.isActive).toBe(false);
    });
  });
});
