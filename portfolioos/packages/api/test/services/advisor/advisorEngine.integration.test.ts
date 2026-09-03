import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../../helpers/db.js';
import { runAsSystem } from '../../../src/lib/requestContext.js';
import type { AdvisorRule, RecommendationDraft } from '../../../src/services/advisor/types.js';

/**
 * The engine's persistence contract, exercised against a real database.
 *
 * The rule *registry* is swapped for a controllable one. That is deliberate:
 * these tests are about what the engine does with drafts (persist, supersede,
 * respect a decision the user already made), and pinning them to whatever the
 * real forty rules happen to emit for a synthetic portfolio would make them
 * fail every time a rule's threshold moved. The registry-coverage test at the
 * bottom loads the real rules and checks the snapshot against them, so the
 * production array is not left untested.
 */
const registry = vi.hoisted(() => ({ rules: [] as AdvisorRule[] }));

vi.mock('../../../src/services/advisor/rules/index.js', () => ({
  get ADVISOR_RULES() {
    return registry.rules;
  },
}));

const { runAdvisorEngine } = await import('../../../src/services/advisor/advisorEngine.service.js');
const { submitQuestionnaire } = await import('../../../src/services/advisor/riskProfile.service.js');

const DEDUPE_KEY = 'rebalance:EQUITY_DOMESTIC';

/** A rule that always emits one rebalance instruction of the given size. */
function emittingRule(id: string, amountInr: string, version = 1): AdvisorRule {
  return {
    id,
    version,
    description: `Test rule ${id}`,
    evaluate(): RecommendationDraft[] {
      return [
        {
          ruleId: id,
          ruleVersion: version,
          category: 'REBALANCE',
          priority: 20,
          action: [
            {
              direction: 'BUY',
              bucket: 'EQUITY_DOMESTIC',
              portfolioId: null,
              instrumentName: 'Test Equity Fund',
              fundId: null,
              stockId: null,
              isin: null,
              holdingKey: null,
              units: null,
              amountInr,
            },
          ],
          rationale: `Buy ${amountInr} of Test Equity Fund to close the equity gap.`,
          inputsUsed: { amountInr },
          provenance: { kind: 'NONE' },
          dedupeKey: DEDUPE_KEY,
        },
      ];
    },
  };
}

/** A rule with nothing to say. Must still appear in ruleVersionsSnapshot. */
function silentRule(id: string, version = 3): AdvisorRule {
  return { id, version, description: 'Emits nothing', evaluate: () => [] };
}

/** A rule that falls over. Must be recorded and must not stop the others. */
function throwingRule(id: string, version = 7): AdvisorRule {
  return {
    id,
    version,
    description: 'Always throws',
    evaluate() {
      throw new Error('boom');
    },
  };
}

describe('advisorEngine.service (integration)', () => {
  let scope: TestScope;

  beforeAll(async () => {
    scope = await createTestScope('advisor-engine');
    // Gives the user a risk profile and the four seeded model portfolios, so
    // the facts builder has a model portfolio version to stamp on to advice.
    await scope.runAs(() =>
      submitQuestionnaire(scope.userId, {
        age: 35,
        horizon: 'Y7_15',
        drawdownReaction: 'HOLD',
        investableShareOfIncome: 'PCT_20_35',
        objective: 'BALANCED_GROWTH',
        hasEmergencyFund: true,
        taxSlab: 'PCT_30',
      }),
    );
  });

  beforeEach(async () => {
    registry.rules = [];
    await runAsSystem(async () => {
      // Clear the forward pointers first — supersededById is a self-relation
      // and a unique column.
      await prisma.advisorRecommendation.updateMany({
        where: { userId: scope.userId },
        data: { supersededById: null },
      });
      await prisma.advisorRecommendation.deleteMany({ where: { userId: scope.userId } });
      await prisma.advisorRun.deleteMany({ where: { userId: scope.userId } });
    });
  });

  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.advisorRecommendation.updateMany({
        where: { userId: scope.userId },
        data: { supersededById: null },
      });
      await prisma.advisorRecommendation.deleteMany({ where: { userId: scope.userId } });
      await prisma.advisorRun.deleteMany({ where: { userId: scope.userId } });
      await prisma.advisorApprovedProduct.deleteMany({ where: { userId: scope.userId } });
      await prisma.riskProfileAssessment.deleteMany({ where: { userId: scope.userId } });
      const portfolios = await prisma.modelPortfolio.findMany({
        where: { userId: scope.userId },
        select: { id: true },
      });
      await prisma.modelPortfolioVersion.deleteMany({
        where: { modelPortfolioId: { in: portfolios.map((p) => p.id) } },
      });
      await prisma.modelPortfolio.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it('persists the recommendations a rule emits and completes the run', async () => {
    registry.rules = [emittingRule('TEST_REBALANCE', '50000')];

    const result = await scope.runAs(() => runAdvisorEngine(scope.userId, { triggeredBy: 'USER' }));

    expect(result.status).toBe('COMPLETED');
    expect(result.created).toBe(1);
    expect(result.recommendationCount).toBe(1);

    const rows = await runAsSystem(() =>
      prisma.advisorRecommendation.findMany({ where: { userId: scope.userId } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('OPEN');
    expect(rows[0]!.ruleId).toBe('TEST_REBALANCE');
    expect(rows[0]!.dedupeKey).toBe(DEDUPE_KEY);
    expect(rows[0]!.generationRunId).toBe(result.runId);

    const run = await runAsSystem(() =>
      prisma.advisorRun.findUniqueOrThrow({ where: { id: result.runId } }),
    );
    expect(run.status).toBe('COMPLETED');
    expect(run.completedAt).not.toBeNull();
    expect(run.recommendationCount).toBe(1);
    expect(run.engineVersion).toBeTruthy();
  });

  it('a second run with materially changed figures supersedes rather than duplicates', async () => {
    registry.rules = [emittingRule('TEST_REBALANCE', '50000')];
    const first = await scope.runAs(() => runAdvisorEngine(scope.userId));

    // 60% larger — comfortably past MATERIALITY_TOLERANCE.
    registry.rules = [emittingRule('TEST_REBALANCE', '80000')];
    const second = await scope.runAs(() => runAdvisorEngine(scope.userId));

    expect(second.superseded).toBe(1);
    expect(second.created).toBe(1);

    const rows = await runAsSystem(() =>
      prisma.advisorRecommendation.findMany({
        where: { userId: scope.userId },
        orderBy: { createdAt: 'asc' },
      }),
    );
    expect(rows).toHaveLength(2);

    const [older, newer] = rows;
    expect(older!.generationRunId).toBe(first.runId);
    expect(newer!.generationRunId).toBe(second.runId);
    // The old row keeps its own numbers and gains a forward pointer.
    expect(older!.supersededById).toBe(newer!.id);
    expect(JSON.stringify(older!.action)).toContain('50000');
    expect(JSON.stringify(newer!.action)).toContain('80000');
    expect(newer!.supersededById).toBeNull();

    // Only one live row for this issue.
    const live = rows.filter((r) => r.supersededById === null && r.status === 'OPEN');
    expect(live).toHaveLength(1);
  });

  it('a second run with unchanged figures refreshes rather than inserting', async () => {
    registry.rules = [emittingRule('TEST_REBALANCE', '50000')];
    await scope.runAs(() => runAdvisorEngine(scope.userId));
    const second = await scope.runAs(() => runAdvisorEngine(scope.userId));

    expect(second.created).toBe(0);
    expect(second.refreshed).toBe(1);
    expect(second.recommendationCount).toBe(1);

    const rows = await runAsSystem(() =>
      prisma.advisorRecommendation.findMany({ where: { userId: scope.userId } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.supersededById).toBeNull();
  });

  it('does not resurrect a DISMISSED recommendation on a later run', async () => {
    registry.rules = [emittingRule('TEST_REBALANCE', '50000')];
    await scope.runAs(() => runAdvisorEngine(scope.userId));

    const created = await runAsSystem(() =>
      prisma.advisorRecommendation.findFirstOrThrow({ where: { userId: scope.userId } }),
    );
    const dismissedAt = new Date();
    await runAsSystem(() =>
      prisma.advisorRecommendation.update({
        where: { id: created.id },
        data: { status: 'DISMISSED', statusChangedAt: dismissedAt },
      }),
    );

    // Same facts, same rule, same figures — the user has already said no.
    const second = await scope.runAs(() => runAdvisorEngine(scope.userId));
    expect(second.created).toBe(0);
    expect(second.refreshed).toBe(0);
    expect(second.suppressed).toBe(1);

    const rows = await runAsSystem(() =>
      prisma.advisorRecommendation.findMany({ where: { userId: scope.userId } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(created.id);
    expect(rows[0]!.status).toBe('DISMISSED');
    expect(rows[0]!.supersededById).toBeNull();
    // Nothing OPEN was minted under the same dedupe key.
    expect(rows.filter((r) => r.status === 'OPEN')).toHaveLength(0);
  });

  it('records every rule that ran — including silent and throwing ones', async () => {
    registry.rules = [
      emittingRule('TEST_EMITS', '50000', 2),
      silentRule('TEST_SILENT', 3),
      throwingRule('TEST_THROWS', 7),
    ];

    const result = await scope.runAs(() => runAdvisorEngine(scope.userId));

    // A throwing rule must not fail the run or block the rules after it.
    expect(result.status).toBe('COMPLETED');
    expect(result.created).toBe(1);
    expect(result.ruleErrors).toHaveProperty('TEST_THROWS');
    expect(result.ruleErrors.TEST_THROWS).toContain('boom');

    const run = await runAsSystem(() =>
      prisma.advisorRun.findUniqueOrThrow({ where: { id: result.runId } }),
    );
    const snapshot = run.ruleVersionsSnapshot as Record<string, number>;
    expect(snapshot).toEqual({ TEST_EMITS: 2, TEST_SILENT: 3, TEST_THROWS: 7 });
    expect(run.ruleErrors).toHaveProperty('TEST_THROWS');
  });

  it('ruleVersionsSnapshot covers every rule in the real registry', async () => {
    const actual = await vi.importActual<typeof import('../../../src/services/advisor/rules/index.js')>(
      '../../../src/services/advisor/rules/index.js',
    );
    registry.rules = [...actual.ADVISOR_RULES];
    expect(registry.rules.length).toBeGreaterThan(0);

    const result = await scope.runAs(() => runAdvisorEngine(scope.userId, { triggeredBy: 'SYSTEM' }));
    const run = await runAsSystem(() =>
      prisma.advisorRun.findUniqueOrThrow({ where: { id: result.runId } }),
    );
    const snapshot = run.ruleVersionsSnapshot as Record<string, number>;

    for (const rule of actual.ADVISOR_RULES) {
      expect(snapshot[rule.id]).toBe(rule.version);
    }
    expect(Object.keys(snapshot)).toHaveLength(actual.ADVISOR_RULES.length);
  });
});
