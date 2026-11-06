/**
 * Act on it, Task 9: the nightly run — advice, expiry, confirmation,
 * measurement, prompts — for users whose plan includes advice, idempotent.
 */
import { describe, it, expect, afterAll, vi } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import type { AdvisorRule, RecommendationDraft } from '../../src/services/advisor/types.js';

const registry = vi.hoisted(() => ({ rules: [] as AdvisorRule[] }));
vi.mock('../../src/services/advisor/rules/index.js', () => ({
  get ADVISOR_RULES() {
    return registry.rules;
  },
}));
const { runActOnItJob } = await import('../../src/jobs/actOnItJob.js');

const NOW = new Date('2026-11-06T06:00:00Z');
const scopes: TestScope[] = [];
const draft: RecommendationDraft = {
  ruleId: 'TEST_JOB_RULE', ruleVersion: 1, category: 'IDLE_CASH_PARKING', priority: 22, action: [], rationale: 'Move 180000.00 to a liquid fund.',
  inputsUsed: { a: 1 }, provenance: { kind: 'NONE' }, dedupeKey: 'job', headline: 'Your money is resting',
  promise: { gainInr: '6300.00', riskBand: 'LOW', costInr: '0.00', liquidity: '1 working day', confidence: 'HIGH' },
  measurement: { method: 'NOT_MEASURED', horizonDays: 0, baseline: {} }, expiresAt: null, urgentUntil: null,
};

afterAll(async () => {
  for (const s of scopes) {
    await runAsSystem(async () => {
      await prisma.alert.deleteMany({ where: { userId: s.userId } });
      await prisma.advicePrompt.deleteMany({ where: { userId: s.userId } });
      await prisma.advisorRecommendation.deleteMany({ where: { userId: s.userId } });
      await prisma.advisorRun.deleteMany({ where: { userId: s.userId } });
    });
    await s.cleanup();
  }
});

describe('act on it nightly job (DB)', () => {
  it('advises and prompts paying users only, and a second run adds nothing', async () => {
    const paid = await createTestScope('aoi-job-paid');
    const free = await createTestScope('aoi-job-free');
    scopes.push(paid, free);
    await runAsSystem(async () => {
      await prisma.user.update({ where: { id: paid.userId }, data: { plan: 'PLUS' } });
      await prisma.user.update({ where: { id: free.userId }, data: { plan: 'FREE' } });
    });
    registry.rules = [{ id: 'TEST_JOB_RULE', version: 1, description: 't', evaluate: () => [draft] }];

    const r = await runActOnItJob(NOW, { userIds: [paid.userId, free.userId], send: async () => ({ sent: true }) });
    expect(r).toMatchObject({ users: 1, failed: 0, prompts: 1 });
    expect(await runAsUser(paid.userId, () => prisma.advisorRecommendation.count({ where: { userId: paid.userId } }))).toBe(1);
    expect(await runAsUser(free.userId, () => prisma.advisorRecommendation.count({ where: { userId: free.userId } }))).toBe(0);
    expect(await runAsUser(paid.userId, () => prisma.alert.count({ where: { userId: paid.userId, type: 'ADVICE' } }))).toBe(1);

    const again = await runActOnItJob(new Date(NOW.getTime() + 86_400_000), { userIds: [paid.userId, free.userId], send: async () => ({ sent: true }) });
    expect(again).toMatchObject({ users: 1, prompts: 0 });
    expect(await runAsUser(paid.userId, () => prisma.advisorRecommendation.count({ where: { userId: paid.userId } }))).toBe(1);
  });
});
