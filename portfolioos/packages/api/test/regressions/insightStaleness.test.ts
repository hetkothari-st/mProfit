import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { getLatestInsight, getOrGenerateInsights } from '../../src/services/analytics/analytics.insights.js';

/**
 * Launch review B2: the Analytics "AI Portfolio Insights" card showed a cached
 * insight from weeks earlier whose text quoted a different XIRR and net worth
 * from the live numbers beside it. The insight row stores the portfolio value
 * it was written against "for staleness detection", but nothing compared it.
 *
 * Synthetic numbers only.
 */

describe('AI insights are never shown as current once the data has moved', () => {
  let scope: TestScope;

  beforeEach(async () => {
    scope = await createTestScope('insight-stale');
  });
  afterEach(async () => {
    await scope.cleanup();
  });

  const HOUR = 3_600_000;

  async function holding(value: string) {
    await scope.runAs(() =>
      prisma.holdingProjection.create({
        data: {
          portfolioId: scope.portfolioId,
          assetKey: 'name:test-fund',
          assetClass: 'MUTUAL_FUND',
          assetName: 'Test Fund',
          quantity: '100',
          avgCostPrice: '1000',
          totalCost: '100000',
          currentValue: value,
          sourceTxCount: 1,
        },
      }),
    );
  }

  async function insight(valueInr: string, generatedAt: Date) {
    await scope.runAs(() =>
      prisma.portfolioInsight.create({
        data: {
          userId: scope.userId,
          portfolioId: null,
          portfolioValueInr: valueInr,
          period: '1Y',
          cards: [],
          narrative: 'Your portfolio is worth about one lakh.',
          model: 'test-model',
          inputTokens: 1,
          outputTokens: 1,
          costInr: '0',
          generatedAt,
        },
      }),
    );
  }

  const latest = () => scope.runAs(() => getLatestInsight({ kind: 'user', userId: scope.userId }));

  it('is current when the value has not moved and nothing changed since', async () => {
    await holding('100000');
    await insight('100000', new Date(Date.now() - HOUR));
    const r = await latest();
    expect(r?.stale).toBe(false);
  });

  it('is out of date once the portfolio value moves materially', async () => {
    await holding('150000');
    await insight('100000', new Date(Date.now() - HOUR));
    const r = await latest();
    expect(r?.stale).toBe(true);
    expect(r?.staleReason).toMatch(/value/i);
  });

  it('is out of date after a day, whatever the numbers', async () => {
    await holding('100000');
    await insight('100000', new Date(Date.now() - 30 * HOUR));
    expect((await latest())?.stale).toBe(true);
  });

  it('is out of date once a transaction is added after it was written', async () => {
    await holding('100000');
    await insight('100000', new Date(Date.now() - HOUR));
    await scope.runAs(() =>
      prisma.transaction.create({
        data: {
          portfolioId: scope.portfolioId, assetClass: 'MUTUAL_FUND', transactionType: 'BUY',
          assetName: 'Test Fund', assetKey: 'name:test-fund', tradeDate: new Date('2026-01-05'),
          quantity: '1', price: '1000', grossAmount: '1000', netAmount: '1000',
        },
      }),
    );
    expect((await latest())?.stale).toBe(true);
  });

  it('does not serve an out-of-date insight from the 24h cache as if it were fresh', async () => {
    await holding('150000');
    await insight('100000', new Date(Date.now() - HOUR));
    // The LLM is off in tests: a cache miss surfaces as the gate refusal,
    // a cache hit would come back ok with the old narrative.
    const r = await scope.runAs(() => getOrGenerateInsights({ kind: 'user', userId: scope.userId }, '1Y', false));
    expect(r.ok).toBe(false);
  });
});
