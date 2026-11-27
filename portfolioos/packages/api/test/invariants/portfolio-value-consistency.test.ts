import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { getDashboardNetWorth } from '../../src/services/analytics/dashboard.service.js';
import { getAllocationByClass, getKpis } from '../../src/services/analytics/analytics.service.js';
import { unrealisedReport } from '../../src/services/reports/reports.service.js';
import { buildAdvisorFacts } from '../../src/services/advisor/advisorFacts.builder.js';

/**
 * Launch review B1: the same account showed a different "portfolio value" on
 * the dashboard, Reports/Advisor, and Act on it. For one fixture, every screen
 * that shows the investments total must show the same figure: a priced holding
 * at market value, an unpriced one at cost, across all of the user's
 * portfolios.
 *
 * The dashboard's *net worth* legitimately differs (it adds bank balances,
 * property and vehicles); this test pins only the investments total.
 *
 * Synthetic numbers only.
 */

describe('one portfolio value everywhere it is shown', () => {
  let scope: TestScope;
  let secondPortfolioId: string;

  beforeAll(async () => {
    scope = await createTestScope('pv-consistency');
    await runAsSystem(async () => {
      const second = await prisma.portfolio.create({ data: { userId: scope.userId, name: 'Second' } });
      secondPortfolioId = second.id;
      await prisma.holdingProjection.createMany({
        data: [
          // Priced: counts at market value (12 × 1,050.25 = 12,603).
          {
            portfolioId: scope.portfolioId, assetKey: 'name:priced-stock', assetClass: 'EQUITY', assetName: 'Priced Stock',
            quantity: '12', avgCostPrice: '1000', totalCost: '12000', currentPrice: '1050.25', currentValue: '12603', sourceTxCount: 1,
          },
          // Unpriced: counts at cost.
          {
            portfolioId: scope.portfolioId, assetKey: 'name:test-fd', assetClass: 'FIXED_DEPOSIT', assetName: 'Test FD',
            quantity: '1', avgCostPrice: '50000', totalCost: '50000', sourceTxCount: 1,
          },
          // A second portfolio is part of "all portfolios".
          {
            portfolioId: second.id, assetKey: 'name:test-fund', assetClass: 'MUTUAL_FUND', assetName: 'Test Fund',
            quantity: '100.5', avgCostPrice: '20', totalCost: '2010', currentPrice: '25.1', currentValue: '2522.55', sourceTxCount: 1,
          },
        ],
      });
    });
  });

  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.holdingProjection.deleteMany({ where: { portfolioId: secondPortfolioId } });
      await prisma.portfolio.delete({ where: { id: secondPortfolioId } });
    });
    await scope.cleanup();
  });

  const EXPECTED = '65125.55'; // 12,603 + 50,000 + 2,522.55
  const money = (v: { toString(): string }) => new Decimal(v.toString()).toFixed(2);

  it('dashboard, analytics, reports, advisor and Act on it agree', async () => {
    await scope.runAs(async () => {
      const dashboard = await getDashboardNetWorth(scope.userId);
      const allocation = await getAllocationByClass({ kind: 'user', userId: scope.userId });
      const kpis = await getKpis({ kind: 'user', userId: scope.userId });
      const reports = await Promise.all([unrealisedReport(scope.portfolioId), unrealisedReport(secondPortfolioId)]);
      const facts = await buildAdvisorFacts(scope.userId);

      const values = {
        dashboard: money(dashboard.portfolio.currentValue),
        analyticsAllocation: money(allocation.reduce((s, a) => s.plus(a.value), new Decimal(0))),
        // Also what the AI assistant's allocation context reads.
        analyticsKpis: money(kpis.currentValue),
        reports: money(reports.reduce((s, r) => s.plus(r.totalValue), new Decimal(0))),
        // Advisor allocation and every Act on it draft read this total.
        advisorAndActOnIt: money(facts.totalPortfolioValue),
      };
      expect(values).toEqual({
        dashboard: EXPECTED,
        analyticsAllocation: EXPECTED,
        analyticsKpis: EXPECTED,
        reports: EXPECTED,
        advisorAndActOnIt: EXPECTED,
      });
    });
  });
});
