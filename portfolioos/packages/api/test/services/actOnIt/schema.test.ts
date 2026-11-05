/** Act on it, Task 1: tracking columns default sensibly; prompts are per-user (RLS). */
import { describe, it, expect, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../../helpers/db.js';
import { runAsSystem, runAsUser } from '../../../src/lib/requestContext.js';

const scopes: TestScope[] = [];
afterAll(async () => {
  for (const s of scopes) {
    await runAsSystem(() => prisma.advisorRun.deleteMany({ where: { userId: s.userId } }));
    await s.cleanup();
  }
});

describe('act on it schema (DB)', () => {
  it('a new recommendation starts PENDING, and prompts stay with their owner', async () => {
    const a = await createTestScope('aoi-schema-a');
    const b = await createTestScope('aoi-schema-b');
    scopes.push(a, b);
    const rec = await runAsUser(a.userId, async () => {
      const run = await prisma.advisorRun.create({ data: { userId: a.userId, engineVersion: 'test', ruleVersionsSnapshot: {}, status: 'COMPLETED' } });
      return prisma.advisorRecommendation.create({
        data: {
          userId: a.userId, generationRunId: run.id, ruleId: 'test.rule', ruleVersion: 1, category: 'IDLE_CASH_PARKING',
          priority: 20, action: [], rationale: 'r', inputsSnapshot: {}, dedupeKey: 'k', headline: 'h',
        },
      });
    });
    expect(rec.outcomeStatus).toBe('PENDING');
    expect(rec.acceptedAt).toBeNull();

    await runAsUser(a.userId, () => prisma.advicePrompt.create({ data: { userId: a.userId, recommendationId: rec.id, kind: 'NEW' } }));
    expect(await runAsUser(a.userId, () => prisma.advicePrompt.count({ where: { userId: a.userId } }))).toBe(1);
    expect(await runAsUser(b.userId, () => prisma.advicePrompt.count())).toBe(0);
  });
});
