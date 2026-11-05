/**
 * Act on it, Task 3: what the user can do with a recommendation, expiry, and
 * how an engine re-run treats accepted and no-longer-true advice.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
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
const { acceptAdvice, snoozeAdvice, dismissAdvice, markDoneElsewhere, expireDue } = await import(
  '../../../src/services/actOnIt/lifecycle.js'
);

const NOW = new Date('2026-11-06T06:00:00Z');
const DAY = 86_400_000;

function draft(amountInr: string, dedupeKey = 'k1'): RecommendationDraft {
  return {
    ruleId: 'TEST_RULE', ruleVersion: 1, category: 'IDLE_CASH_PARKING', priority: 20,
    action: [], rationale: `Move ${amountInr} to a liquid fund.`, inputsUsed: { amountInr },
    provenance: { kind: 'NONE' }, dedupeKey, headline: 'Put it to work',
    promise: { gainInr: null, riskBand: 'LOW', costInr: '0.00', liquidity: '1 working day', confidence: 'HIGH' },
    measurement: { method: 'NAV_VS_CASH', horizonDays: 365, baseline: { amountInr } },
    expiresAt: new Date(NOW.getTime() + 30 * DAY), urgentUntil: null,
  };
}
const rule = (emit: () => RecommendationDraft[]): AdvisorRule => ({ id: 'TEST_RULE', version: 1, description: 't', evaluate: emit });

const scopes: TestScope[] = [];
let a: TestScope;
let b: TestScope;

async function clean(userId: string) {
  await runAsSystem(async () => {
    await prisma.advisorRecommendation.updateMany({ where: { userId }, data: { supersededById: null } });
    await prisma.advisorRecommendation.deleteMany({ where: { userId } });
    await prisma.advisorRun.deleteMany({ where: { userId } });
  });
}

beforeEach(async () => {
  if (!a) {
    a = await createTestScope('aoi-life-a');
    b = await createTestScope('aoi-life-b');
    scopes.push(a, b);
  }
  registry.rules = [];
  await clean(a.userId);
});
afterAll(async () => {
  for (const s of scopes) {
    await clean(s.userId);
    await s.cleanup();
  }
});

const one = async () => {
  registry.rules = [rule(() => [draft('180000.00')])];
  await runAsUser(a.userId, () => runAdvisorEngine(a.userId, { asOf: NOW }));
  return runAsUser(a.userId, () => prisma.advisorRecommendation.findFirstOrThrow({ where: { userId: a.userId }, orderBy: { createdAt: 'desc' } }));
};
const get = (id: string) => runAsUser(a.userId, () => prisma.advisorRecommendation.findUniqueOrThrow({ where: { id } }));

describe('act on it lifecycle (DB)', () => {
  it('stores the promise, measurement and expiry the rule gave', async () => {
    const r = await one();
    expect(r).toMatchObject({ status: 'OPEN', headline: 'Put it to work', outcomeStatus: 'PENDING' });
    expect((r.measurement as { method: string }).method).toBe('NAV_VS_CASH');
    expect(r.expiresAt?.toISOString()).toBe(new Date(NOW.getTime() + 30 * DAY).toISOString());
  });

  it('accept, snooze, dismiss and "did it elsewhere" move the state', async () => {
    const r = await one();
    await runAsUser(a.userId, () => snoozeAdvice(a.userId, r.id, NOW));
    expect(await get(r.id)).toMatchObject({ status: 'SNOOZED' });
    expect((await get(r.id)).snoozedUntil?.toISOString()).toBe(new Date(NOW.getTime() + 7 * DAY).toISOString());

    await runAsUser(a.userId, () => acceptAdvice(a.userId, r.id, NOW));
    expect(await get(r.id)).toMatchObject({ status: 'ACCEPTED', acceptedAt: NOW });

    await runAsUser(a.userId, () => markDoneElsewhere(a.userId, r.id, NOW));
    expect(await get(r.id)).toMatchObject({ status: 'DONE', confirmedBy: 'USER', confirmedAt: NOW });

    // A finished one cannot be dismissed.
    await expect(runAsUser(a.userId, () => dismissAdvice(a.userId, r.id, NOW))).rejects.toThrow(/cannot/i);
  });

  it('dismiss counts as skipped; another user cannot touch it', async () => {
    const r = await one();
    await expect(runAsUser(b.userId, () => acceptAdvice(b.userId, r.id, NOW))).rejects.toThrow(/not found/i);
    await runAsUser(a.userId, () => dismissAdvice(a.userId, r.id, NOW));
    expect(await get(r.id)).toMatchObject({ status: 'DISMISSED' });
  });

  it('undecided advice past its expiry becomes EXPIRED', async () => {
    const r = await one();
    expect(await runAsUser(a.userId, () => expireDue(a.userId, new Date(NOW.getTime() + 29 * DAY)))).toBe(0);
    expect(await runAsUser(a.userId, () => expireDue(a.userId, new Date(NOW.getTime() + 31 * DAY)))).toBe(1);
    expect(await get(r.id)).toMatchObject({ status: 'EXPIRED' });
  });

  it('a re-run where the rule no longer fires withdraws open advice, not accepted advice', async () => {
    const r = await one();
    registry.rules = [rule(() => [])];
    await runAsUser(a.userId, () => runAdvisorEngine(a.userId, { asOf: NOW }));
    expect(await get(r.id)).toMatchObject({ status: 'WITHDRAWN' });

    // True again: a new recommendation, the withdrawn one stays on record.
    const r2 = await one();
    expect(r2.id).not.toBe(r.id);
    await runAsUser(a.userId, () => acceptAdvice(a.userId, r2.id, NOW));
    registry.rules = [rule(() => [])];
    await runAsUser(a.userId, () => runAdvisorEngine(a.userId, { asOf: NOW }));
    expect(await get(r2.id)).toMatchObject({ status: 'ACCEPTED' });
  });

  it('a re-run with changed numbers leaves accepted advice alone and adds nothing', async () => {
    const r = await one();
    await runAsUser(a.userId, () => acceptAdvice(a.userId, r.id, NOW));
    registry.rules = [rule(() => [draft('400000.00')])];
    await runAsUser(a.userId, () => runAdvisorEngine(a.userId, { asOf: NOW }));
    const all = await runAsUser(a.userId, () => prisma.advisorRecommendation.findMany({ where: { userId: a.userId } }));
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ status: 'ACCEPTED', supersededById: null });
  });

  it('a rule that throws withdraws nothing', async () => {
    const r = await one();
    registry.rules = [rule(() => { throw new Error('boom'); })];
    await runAsUser(a.userId, () => runAdvisorEngine(a.userId, { asOf: NOW }));
    expect(await get(r.id)).toMatchObject({ status: 'OPEN' });
  });
});
