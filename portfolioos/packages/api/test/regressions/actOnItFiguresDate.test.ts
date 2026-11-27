import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { getActOnItView } from '../../src/services/actOnIt/view.js';

/**
 * Launch review B1: an Act on it "Trim a holding" card quoted a portfolio total
 * different from the dashboard's. The daily run refreshes a live card's facts
 * when the advice has not materially moved, but keeps its headline and reason
 * as first shown — so the reason's total is from the day it was written. The
 * card now carries both dates so the page can say which figures are from when.
 *
 * Synthetic numbers only.
 */
describe('Act on it cards carry the date of their figures', () => {
  let scope: TestScope;

  beforeAll(async () => {
    scope = await createTestScope('aoi-dates');
    await runAsSystem(async () => {
      const run = await prisma.advisorRun.create({
        data: { userId: scope.userId, engineVersion: 'test', ruleVersionsSnapshot: {}, status: 'COMPLETED' },
      });
      await prisma.advisorRecommendation.create({
        data: {
          userId: scope.userId,
          generationRunId: run.id,
          ruleId: 'CONCENTRATION_TRIM',
          ruleVersion: 1,
          category: 'CONCENTRATION_TRIM',
          priority: 10,
          action: {},
          rationale: 'Test Stock is 40.0% of your ₹10,00,000.00 portfolio.',
          // Refreshed by a later run: the facts are newer than the reason.
          inputsSnapshot: { asOf: '2026-11-20T00:00:00.000Z', totalPortfolioValue: '900000' },
          dedupeKey: 'CONCENTRATION_TRIM:test',
          createdAt: new Date('2026-10-01T00:00:00.000Z'),
        },
      });
    });
  });
  afterAll(async () => {
    await runAsSystem(() => prisma.advisorRun.deleteMany({ where: { userId: scope.userId } }));
    await scope.cleanup();
  });

  it('exposes when the reason was written and when the facts were refreshed', async () => {
    const view = await scope.runAs(() => getActOnItView(scope.userId, new Date('2026-11-21T00:00:00Z')));
    const card = [view.current, ...view.waiting].find((c) => c && c.category === 'CONCENTRATION_TRIM');
    expect(card).toBeTruthy();
    expect(card!.createdAt).toBe('2026-10-01T00:00:00.000Z');
    expect(card!.factsAsOf).toBe('2026-11-20T00:00:00.000Z');
  });
});
