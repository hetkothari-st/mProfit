import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTransaction } from '../../src/services/transaction.service.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import {
  generateFdMaturityInsights,
  generateTaxLossHarvestInsight,
} from '../../src/services/deterministicInsights.js';

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

describe('generateFdMaturityInsights', () => {
  let scope: TestScope;

  beforeAll(async () => {
    scope = await createTestScope('fd-maturity-insight');
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('surfaces an FD maturing in 15 days but not one maturing in 60 days', () => scope.runAs(async () => {
    await createTransaction(scope.userId, {
      portfolioId: scope.portfolioId,
      transactionType: 'BUY',
      assetClass: 'FIXED_DEPOSIT',
      assetName: 'HDFC Bank FD',
      tradeDate: '2024-01-15',
      quantity: '1',
      price: '150000',
      interestRate: '7.1',
      maturityDate: daysFromNow(15),
    });

    await createTransaction(scope.userId, {
      portfolioId: scope.portfolioId,
      transactionType: 'BUY',
      assetClass: 'FIXED_DEPOSIT',
      assetName: 'ICICI Bank FD',
      tradeDate: '2024-02-01',
      quantity: '1',
      price: '200000',
      interestRate: '7.25',
      maturityDate: daysFromNow(60),
    });

    const insights = await generateFdMaturityInsights(scope.userId, new Date());

    expect(insights).toHaveLength(1);
    expect(insights[0]!.type).toBe('FD_MATURITY');
    expect(insights[0]!.message).toContain('HDFC Bank FD');
    expect(insights[0]!.message).not.toContain('ICICI');
    expect(insights[0]!.impactAmountInr).toBe('150000.0000');
    expect(insights[0]!.action).toBeNull();
  }));
});

describe('generateFdMaturityInsights — no open FDs', () => {
  let scope: TestScope;

  beforeAll(async () => {
    scope = await createTestScope('fd-maturity-insight-empty');
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('returns nothing for a user with no FD holdings', () => scope.runAs(async () => {
    const insights = await generateFdMaturityInsights(scope.userId, new Date());
    expect(insights).toHaveLength(0);
  }));
});

describe('generateTaxLossHarvestInsight', () => {
  let scope: TestScope;

  beforeAll(async () => {
    scope = await createTestScope('tax-loss-harvest-insight');
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('returns a card in the Oct-Mar window when there are unrealised equity losses', () => scope.runAs(async () => {
    await prisma.holdingProjection.create({
      data: {
        portfolioId: scope.portfolioId,
        assetKey: 'name:test-loss-co',
        assetClass: 'EQUITY',
        assetName: 'Test Loss Co',
        quantity: '10',
        avgCostPrice: '100',
        totalCost: '1000',
        currentPrice: '60',
        currentValue: '600',
        unrealisedPnL: '-400',
        sourceTxCount: 1,
      },
    });

    const insights = await generateTaxLossHarvestInsight(scope.userId, new Date('2026-01-15T00:00:00.000Z'));

    expect(insights).toHaveLength(1);
    expect(insights[0]!.type).toBe('TAX_LOSS_HARVEST');
    expect(insights[0]!.impactAmountInr).toBe('400.0000');
    expect(insights[0]!.action).toEqual({
      kind: 'NAVIGATE',
      label: 'View tax-harvest worksheet',
      href: '/tax',
    });
  }));

  it('returns nothing outside the Oct-Mar window, even with losses present', () => scope.runAs(async () => {
    const insights = await generateTaxLossHarvestInsight(scope.userId, new Date('2026-06-15T00:00:00.000Z'));
    expect(insights).toHaveLength(0);
  }));
});

describe('generateTaxLossHarvestInsight — no losses', () => {
  let scope: TestScope;

  beforeAll(async () => {
    scope = await createTestScope('tax-loss-harvest-empty');
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('returns nothing for a user with no unrealised losses', () => scope.runAs(async () => {
    const insights = await generateTaxLossHarvestInsight(scope.userId, new Date('2026-01-15T00:00:00.000Z'));
    expect(insights).toHaveLength(0);
  }));
});
