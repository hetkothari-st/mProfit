/**
 * Act on it, Task 7: a suggestion type that keeps missing its own promises
 * pauses itself — its open advice is withdrawn and the engine stops running it.
 */
import { describe, it, expect, afterAll, vi } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../../helpers/db.js';
import { runAsSystem, runAsUser } from '../../../src/lib/requestContext.js';
import type { AdvisorRule, RecommendationDraft } from '../../../src/services/advisor/types.js';

const registry = vi.hoisted(() => ({ rules: [] as AdvisorRule[] }));
vi.mock('../../../src/services/advisor/rules/index.js', () => ({
  get ADVISOR_RULES() {
    return registry.rules;
  },
}));
const { runAdvisorEngine } = await import('../../../src/services/advisor/advisorEngine.service.js');
const { updateRuleHealth } = await import('../../../src/services/actOnIt/ruleHealth.js');

const NOW = new Date('2026-11-06T06:00:00Z');
const RULE = 'TEST_HEALTH_RULE';
const scopes: TestScope[] = [];

afterAll(async () => {
  await runAsSystem(() => prisma.adviceRuleHealth.deleteMany({ where: { ruleId: { startsWith: 'TEST_HEALTH' } } }));
  for (const s of scopes) {
    await runAsSystem(async () => {
      await prisma.advisorRecommendation.deleteMany({ where: { userId: s.userId } });
      await prisma.advisorRun.deleteMany({ where: { userId: s.userId } });
    });
    await s.cleanup();
  }
});

async function seed(ruleId: string, outcomes: number[], openToo = true) {
  const s = await createTestScope('aoi-health');
  scopes.push(s);
  await runAsUser(s.userId, async () => {
    const run = await prisma.advisorRun.create({ data: { userId: s.userId, engineVersion: 'test', ruleVersionsSnapshot: {}, status: 'COMPLETED' } });
    const base = { userId: s.userId, generationRunId: run.id, ruleId, ruleVersion: 1, category: 'IDLE_CASH_PARKING' as const, priority: 22, action: [], rationale: 'r', inputsSnapshot: {}, headline: 'h', promise: { gainInr: '6300.00', riskBand: 'LOW', costInr: null, liquidity: null, confidence: 'HIGH' } };
    for (const [i, v] of outcomes.entries()) {
      await prisma.advisorRecommendation.create({
        data: { ...base, dedupeKey: `m${i}`, status: 'DONE', confirmedBy: 'DATA', confirmedAt: NOW, outcomeStatus: 'MEASURED', outcomeInr: String(v), measuredAt: new Date(NOW.getTime() - i * 1000) },
      });
    }
    if (openToo) await prisma.advisorRecommendation.create({ data: { ...base, dedupeKey: 'open', status: 'OPEN' } });
  });
  return s;
}

describe('rule health (DB)', () => {
  it('3 misses in the last 10 pauses the type and withdraws its open advice', async () => {
    const s = await seed(`${RULE}_A`, [6000, 6500, 1000, 7000, 2000, 6200, 3000, 6800, 6100, 6400]);
    await runAsSystem(() => updateRuleHealth(NOW));
    const h = await runAsSystem(() => prisma.adviceRuleHealth.findUniqueOrThrow({ where: { ruleId: `${RULE}_A` } }));
    expect(h).toMatchObject({ measured: 10, misses: 3 });
    expect(h.pausedAt).not.toBeNull();
    const open = await runAsUser(s.userId, () => prisma.advisorRecommendation.findFirstOrThrow({ where: { userId: s.userId, dedupeKey: 'open' } }));
    expect(open).toMatchObject({ status: 'WITHDRAWN', statusNote: 'This kind of advice is paused: it missed its own estimates too often' });
  });

  it('2 misses does not pause', async () => {
    await seed(`${RULE}_B`, [6000, 1000, 2000, 7000], false);
    await runAsSystem(() => updateRuleHealth(NOW));
    const h = await runAsSystem(() => prisma.adviceRuleHealth.findUniqueOrThrow({ where: { ruleId: `${RULE}_B` } }));
    expect(h).toMatchObject({ measured: 4, misses: 2, pausedAt: null });
  });

  it('the engine does not run a paused rule', async () => {
    const s = await seed(`${RULE}_C`, [], false);
    await runAsSystem(() => prisma.adviceRuleHealth.upsert({ where: { ruleId: `${RULE}_C` }, create: { ruleId: `${RULE}_C`, pausedAt: NOW, pauseReason: 'test' }, update: { pausedAt: NOW } }));
    const draft = { ruleId: `${RULE}_C`, ruleVersion: 1, category: 'IDLE_CASH_PARKING', priority: 22, action: [], rationale: 'r 1', inputsUsed: { a: 1 }, provenance: { kind: 'NONE' }, dedupeKey: 'k', headline: 'h', promise: { gainInr: null, riskBand: 'LOW', costInr: null, liquidity: null, confidence: 'HIGH' }, measurement: { method: 'NOT_MEASURED', horizonDays: 0, baseline: {} }, expiresAt: null, urgentUntil: null } as RecommendationDraft;
    registry.rules = [{ id: `${RULE}_C`, version: 1, description: 't', evaluate: () => [draft] }];
    const r = await runAsUser(s.userId, () => runAdvisorEngine(s.userId, { asOf: NOW }));
    expect(r.created).toBe(0);
    expect(r.ruleErrors[`${RULE}_C`]).toMatch(/paused/);
  });
});
