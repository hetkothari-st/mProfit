import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';

describe('legacy RLS', () => {
  let a: TestScope; let b: TestScope;
  beforeAll(async () => {
    a = await createTestScope('legacy-rls-a'); b = await createTestScope('legacy-rls-b');
    await runAsSystem(() => prisma.legacyPlan.create({ data: { userId: a.userId } }));
  });
  afterAll(async () => {
    await runAsSystem(() => prisma.legacyPlan.deleteMany({ where: { userId: { in: [a.userId, b.userId] } } }));
    await a.cleanup(); await b.cleanup();
  });

  it('owner sees own plan, other user sees nothing', async () => {
    expect(await a.runAs(() => prisma.legacyPlan.count({ where: { userId: a.userId } }))).toBe(1);
    expect(await b.runAs(() => prisma.legacyPlan.count({ where: { userId: a.userId } }))).toBe(0);
  });

  it('other user cannot insert a nominee into the plan', async () => {
    const plan = await runAsSystem(() => prisma.legacyPlan.findUniqueOrThrow({ where: { userId: a.userId } }));
    await expect(b.runAs(() => prisma.legacyNominee.create({ data: {
      planId: plan.id, userId: a.userId, nameEnc: 'x', emailEnc: 'y', relationship: 'Spouse', priority: 1, categories: ['INSURANCE'],
    } }))).rejects.toThrow();
  });
});
