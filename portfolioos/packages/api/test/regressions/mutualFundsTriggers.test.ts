/**
 * Mutual-funds defect 1: the MF analysis only re-ran on "Refresh analysis".
 *
 * `onMfHoldingsChanged` and `onMfSchemeScoresUpdated` existed but nothing
 * called them, so findings and verdicts went stale after every import or
 * nightly score. These tests pin the wiring and the debounce: a burst of
 * holdings changes (a CAS import) must produce one run, not one per row.
 *
 * The engine is mocked — what is under test is when it is called, not what
 * it concludes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const runMfAnalysis = vi.fn(async (_userId: string, _opts: { triggeredBy: string }) => ({
  runId: 'run',
  status: 'COMPLETED',
  findings: [],
  verdictsCreated: 0,
  verdictsSuperseded: 0,
  verdictsUnchanged: 0,
}));

vi.mock('../../src/services/mf/mfAnalytics/mfAnalysisEngine.service.js', () => ({
  runMfAnalysis: (userId: string, opts: { triggeredBy: string }) => runMfAnalysis(userId, opts),
}));

const scoreUniverse = vi.fn();
vi.mock('../../src/services/mf/mfAnalytics/mfScoring/mfScore.service.js', () => ({
  scoreUniverse: (...args: unknown[]) => scoreUniverse(...args),
  MF_SCORE_SERVICE_VERSION: 'test',
}));

import {
  enqueueMfAnalysis,
  pendingMfAnalysis,
  startMfAnalysisJob,
  stopMfAnalysisJob,
  MF_ANALYSIS_DEBOUNCE_MS,
  MF_ANALYSIS_MAX_WAIT_MS,
} from '../../src/jobs/mfAnalysisJob.js';
import { runMfScoreForUniverses } from '../../src/jobs/mfScoreJob.js';
import { recomputeForAsset } from '../../src/services/holdings/holdingsProjection.js';
import { createTestScope, prisma } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

describe('MF analysis queue — debounced, coalesced', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runMfAnalysis.mockClear();
    stopMfAnalysisJob();
    startMfAnalysisJob();
  });
  afterEach(() => {
    stopMfAnalysisJob();
    vi.useRealTimers();
  });

  it('runs once for a burst of holdings changes, after the burst is over', async () => {
    for (let i = 0; i < 40; i += 1) {
      enqueueMfAnalysis('user-burst', 'HOLDINGS_CHANGE');
      await vi.advanceTimersByTimeAsync(100);
    }
    // Mid-import: nothing has run against a half-written portfolio.
    expect(runMfAnalysis).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(MF_ANALYSIS_DEBOUNCE_MS);
    await flush();
    expect(runMfAnalysis).toHaveBeenCalledTimes(1);
    expect(runMfAnalysis.mock.calls[0]).toEqual(['user-burst', { triggeredBy: 'HOLDINGS_CHANGE' }]);
  });

  it('does not let a steady trickle postpone the run past the ceiling', async () => {
    const step = Math.floor(MF_ANALYSIS_DEBOUNCE_MS / 2);
    for (let t = 0; t <= MF_ANALYSIS_MAX_WAIT_MS + step; t += step) {
      enqueueMfAnalysis('user-trickle', 'HOLDINGS_CHANGE');
      await vi.advanceTimersByTimeAsync(step);
    }
    await flush();
    expect(runMfAnalysis).toHaveBeenCalled();
  });
});

describe('holdings recompute queues an MF analysis (01 §5(a))', () => {
  beforeEach(() => stopMfAnalysisJob());

  it('queues the owner after an MF holding is rewritten, and not after a stock', async () => {
    const scope = await createTestScope('mf-trigger');
    try {
      const fundKey = `isin:INFTEST${Date.now()}`;
      await runAsSystem(() =>
        prisma.transaction.create({
          data: {
            portfolioId: scope.portfolioId,
            assetClass: 'MUTUAL_FUND',
            transactionType: 'BUY',
            assetName: 'Trigger Test Fund',
            assetKey: fundKey,
            tradeDate: new Date('2025-01-10T00:00:00Z'),
            quantity: '10',
            price: '100',
            grossAmount: '1000',
            netAmount: '1000',
          },
        }),
      );
      const stockKey = `name:trigger-stock-${Date.now()}`;
      await runAsSystem(() =>
        prisma.transaction.create({
          data: {
            portfolioId: scope.portfolioId,
            assetClass: 'EQUITY',
            transactionType: 'BUY',
            assetName: 'Trigger Test Stock',
            assetKey: stockKey,
            tradeDate: new Date('2025-01-10T00:00:00Z'),
            quantity: '1',
            price: '10',
            grossAmount: '10',
            netAmount: '10',
          },
        }),
      );

      await scope.runAs(() => recomputeForAsset(scope.portfolioId, stockKey));
      expect(pendingMfAnalysis().has(scope.userId)).toBe(false);

      await scope.runAs(() => recomputeForAsset(scope.portfolioId, fundKey));
      expect(pendingMfAnalysis().get(scope.userId)).toBe('HOLDINGS_CHANGE');

      // Deleting the last transaction removes the holding — also a change.
      stopMfAnalysisJob();
      await runAsSystem(() => prisma.transaction.deleteMany({ where: { portfolioId: scope.portfolioId, assetKey: fundKey } }));
      await scope.runAs(() => recomputeForAsset(scope.portfolioId, fundKey));
      expect(pendingMfAnalysis().get(scope.userId)).toBe('HOLDINGS_CHANGE');
    } finally {
      await runAsSystem(() => prisma.holdingProjection.deleteMany({ where: { portfolioId: scope.portfolioId } }));
      await scope.cleanup();
    }
  });
});

describe('scoring job queues holders of rescored schemes (01 §5(b))', () => {
  beforeEach(() => {
    stopMfAnalysisJob();
    scoreUniverse.mockReset();
  });

  it('queues a user who holds a scheme that received a new score, and nobody on a no-op re-run', async () => {
    const scope = await createTestScope('mf-score-trigger');
    const schemeCode = `T${Date.now()}`;
    const fund = await runAsSystem(() =>
      prisma.mutualFundMaster.create({
        data: { schemeCode, schemeName: 'Score Trigger Fund', amcName: 'Test AMC', category: 'EQUITY' },
      }),
    );
    try {
      await runAsSystem(() =>
        prisma.holdingProjection.create({
          data: {
            portfolioId: scope.portfolioId,
            assetKey: `fund:${fund.id}`,
            assetClass: 'MUTUAL_FUND',
            fundId: fund.id,
            quantity: '5',
            avgCostPrice: '10',
            totalCost: '50',
            sourceTxCount: 1,
          },
        }),
      );
      const ref = { universeKey: 'u1', sebiSubCategory: 'LARGE_CAP', planType: 'DIRECT' } as never;

      // Same-day re-run: every row already existed, nothing changed.
      scoreUniverse.mockResolvedValueOnce({
        written: 0, scored: 1, skippedExisting: 1, skippedUnmeasured: 0,
        ratingStatusCounts: { RATED: 1 }, rows: [{ schemeCode }],
      });
      await runAsSystem(() => runMfScoreForUniverses([ref], new Date('2026-09-30T00:00:00Z')));
      expect(pendingMfAnalysis().has(scope.userId)).toBe(false);

      scoreUniverse.mockResolvedValueOnce({
        written: 1, scored: 1, skippedExisting: 0, skippedUnmeasured: 0,
        ratingStatusCounts: { RATED: 1 }, rows: [{ schemeCode }],
      });
      await runAsSystem(() => runMfScoreForUniverses([ref], new Date('2026-09-30T00:00:00Z')));
      expect(pendingMfAnalysis().get(scope.userId)).toBe('SCORE_UPDATE');
    } finally {
      await runAsSystem(async () => {
        await prisma.holdingProjection.deleteMany({ where: { portfolioId: scope.portfolioId } });
        await prisma.mutualFundMaster.delete({ where: { id: fund.id } });
      });
      await scope.cleanup();
    }
  });
});
