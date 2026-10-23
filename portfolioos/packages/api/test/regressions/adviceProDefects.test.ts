/**
 * Regressions for the advisor page's allocation card and recommendation feed.
 *
 *  1. The allocation card must measure the user against the model portfolio
 *     their risk assessment chose — the same one the engine advises against —
 *     not whichever active model portfolio was created last (which, after the
 *     four defaults are seeded, is always Aggressive).
 *  3. A snooze whose deadline has passed is open again. The feed asks for
 *     `status=OPEN`, so the server has to count expired snoozes as open there,
 *     and stop listing them under Snoozed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Request } from 'express';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { getAllocation } from '../../src/controllers/advisor.controller.js';
import { submitQuestionnaire } from '../../src/services/advisor/riskProfile.service.js';
import { buildAdvisorFacts } from '../../src/services/advisor/advisorFacts.builder.js';
import { listRecommendations } from '../../src/services/advisor/advisorRecommendations.service.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { fakeResponse } from '../helpers/fakeResponse.js';

describe('allocation card uses the assessed model portfolio', () => {
  let scope: TestScope;

  beforeAll(async () => {
    scope = await createTestScope('advice-alloc');
  });
  afterAll(async () => {
    await scope.cleanup();
  });

  it('a conservative investor is measured against the Conservative targets, as the engine is', async () => {
    const profile = await scope.runAs(() =>
      submitQuestionnaire(scope.userId, {
        age: 60,
        horizon: 'LT_3Y',
        drawdownReaction: 'SELL_ALL',
        investableShareOfIncome: 'LT_10',
        objective: 'PRESERVE',
        hasEmergencyFund: true,
        taxSlab: 'PCT_30',
      }),
    );
    expect(profile.category).toBe('CONSERVATIVE');

    const captured = fakeResponse();
    await scope.runAs(() =>
      getAllocation({ user: { id: scope.userId } } as unknown as Request, captured.res),
    );
    const body = captured.json() as {
      data: { modelPortfolio: { id: string; riskCategory: string } | null; target: Array<{ bucket: string; targetPct: number }> };
    };
    const facts = await scope.runAs(() => buildAdvisorFacts(scope.userId));

    expect(body.data.modelPortfolio?.riskCategory).toBe('CONSERVATIVE');
    // The card and the engine read one model portfolio, so they cannot disagree.
    expect(body.data.modelPortfolio?.id).toBe(facts.modelPortfolio.id);
    expect(body.data.target).toEqual(facts.modelPortfolio.targets);
  });
});

describe('expired snoozes come back as open', () => {
  let scope: TestScope;
  let expiredId: string;
  let liveId: string;
  let openId: string;

  beforeAll(async () => {
    scope = await createTestScope('advice-snooze');
    await runAsSystem(async () => {
      const run = await prisma.advisorRun.create({
        data: { userId: scope.userId, engineVersion: 'test', ruleVersionsSnapshot: {}, status: 'COMPLETED' },
      });
      const base = {
        userId: scope.userId,
        generationRunId: run.id,
        ruleId: 'test.rule',
        ruleVersion: 1,
        category: 'REBALANCE' as const,
        priority: 20,
        action: {},
        rationale: 'test',
        inputsSnapshot: {},
      };
      const day = 24 * 60 * 60 * 1000;
      expiredId = (await prisma.advisorRecommendation.create({
        data: { ...base, dedupeKey: 'a', status: 'SNOOZED', snoozedUntil: new Date(Date.now() - day) },
      })).id;
      liveId = (await prisma.advisorRecommendation.create({
        data: { ...base, dedupeKey: 'b', status: 'SNOOZED', snoozedUntil: new Date(Date.now() + day) },
      })).id;
      openId = (await prisma.advisorRecommendation.create({ data: { ...base, dedupeKey: 'c' } })).id;
    });
  });
  afterAll(async () => {
    await runAsSystem(() => prisma.advisorRun.deleteMany({ where: { userId: scope.userId } }));
    await scope.cleanup();
  });

  it('lists an expired snooze under Open, reported as OPEN', async () => {
    const open = await scope.runAs(() => listRecommendations(scope.userId, { status: 'OPEN' }));
    expect(open.map((r) => r.id).sort()).toEqual([expiredId, openId].sort());
    expect(open.every((r) => r.status === 'OPEN')).toBe(true);
  });

  it('lists only the live snooze under Snoozed', async () => {
    const snoozed = await scope.runAs(() => listRecommendations(scope.userId, { status: 'SNOOZED' }));
    expect(snoozed.map((r) => r.id)).toEqual([liveId]);
  });
});
