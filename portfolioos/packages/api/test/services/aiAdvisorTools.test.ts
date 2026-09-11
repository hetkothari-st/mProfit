import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Decimal } from 'decimal.js';

// Every tool the adviser can call runs an existing service; none does its own
// arithmetic on money beyond what those services already provide, and a tool
// that fails says so instead of guessing.

const svc = vi.hoisted(() => ({
  buildTaxSummary: vi.fn(),
  listRecommendations: vi.fn(),
  computeHealthScore: vi.fn(),
  buildInsuranceData: vi.fn(),
}));
vi.mock('../../src/services/tax.service.js', () => ({ buildTaxSummary: svc.buildTaxSummary }));
vi.mock('../../src/services/advisor/advisorRecommendations.service.js', () => ({
  listRecommendations: svc.listRecommendations,
}));
vi.mock('../../src/services/healthScore.service.js', () => ({ computeHealthScore: svc.computeHealthScore }));
vi.mock('../../src/ai/contextBuilder.js', () => ({ buildInsuranceData: svc.buildInsuranceData }));

import { ADVISOR_TOOLS, runAdvisorTool } from '../../src/ai/advisorTools.js';
import type { AdvisorFacts } from '../../src/services/advisor/types.js';

const d = (v: string) => new Decimal(v);
const EMPTY = { EQUITY_DOMESTIC: [], EQUITY_INTERNATIONAL: [], DEBT: [], GOLD: [], REAL_ASSETS: [], CASH_EQUIVALENT: [], OTHER_ALT: [] };

function holding(name: string, value: string, bucket: 'EQUITY_DOMESTIC' | 'DEBT' = 'EQUITY_DOMESTIC') {
  return {
    holdingKey: name,
    portfolioId: 'p1',
    assetName: name,
    assetClass: bucket === 'DEBT' ? 'MUTUAL_FUND' : 'EQUITY',
    bucket,
    fundId: null,
    stockId: null,
    isin: null,
    quantity: d('10'),
    currentPrice: d('1'),
    currentValue: d(value),
    totalCost: d(value).times(0.8),
    unrealisedPnL: d(value).times(0.2),
    priceStale: false,
  };
}

const facts = {
  userId: 'u1',
  asOf: new Date('2026-09-11'),
  riskProfile: { assessmentId: 'r1', category: 'MODERATE', age: 38, taxSlabPct: 30, assessedAt: new Date('2026-01-10') },
  modelPortfolio: { id: 'm1', versionId: 'v1', version: 1, targets: [] },
  totalPortfolioValue: d('1000000'),
  currentAllocation: [],
  holdings: [holding('Small', '100000'), holding('Big', '600000'), holding('Debt fund', '300000', 'DEBT')],
  goals: [
    {
      goalId: 'g1', name: 'Child education', category: 'CHILD_EDUCATION', priority: 'HIGH',
      targetAmount: d('2500000'), currentValue: d('500000'), remaining: d('2000000'), yearsRemaining: 10,
      expectedReturnPct: 10, requiredCagr: 17.5, isOnTrack: false, currentMonthlyContribution: d('5000'),
    },
  ],
  harvestCandidates: [],
  approvedProducts: { ...EMPTY, EQUITY_DOMESTIC: [{ approvedProductId: 'a1', fundId: 'f1', stockId: null, label: 'Nifty 50 Index Fund — Direct', score: null }] },
  fallbackRankings: { ...EMPTY },
  liquidity: { liquidAssets: d('0'), monthlyExpenses: null, emergencyFundTarget: null, surplusOverTarget: null },
  capitalGainsRates: { stcgEquityPct: 20, ltcgEquityPct: 12.5, ltcgOtherNonIndexedPct: 12.5, slabPct: 30 },
  defaultPortfolioId: 'p1',
} as unknown as AdvisorFacts;

const ctx = { userId: 'u1', facts, financialYear: '2026-27' };

beforeEach(() => vi.clearAllMocks());

describe('advisor tools', () => {
  it('offers the tools the persona names, plus insurance and knowledge', () => {
    expect(ADVISOR_TOOLS.map((t) => t.name).sort()).toEqual(
      [
        'compute_sip_for_goal',
        'get_advisor_recommendations',
        'get_approved_products',
        'get_capital_gains_summary',
        'get_goal_projection',
        'get_health_score',
        'get_holdings',
        'get_insurance_overview',
        'get_tax_harvest_candidates',
        'search_knowledge',
      ].sort(),
    );
  });

  it('lists holdings largest first, with money as strings', async () => {
    const out = await runAdvisorTool('get_holdings', { limit: 2 }, ctx);
    expect(out.ok).toBe(true);
    const rows = (out.result as { holdings: Array<{ name: string; value: string; shareOfPortfolioPct: number }> }).holdings;
    expect(rows.map((r) => r.name)).toEqual(['Big', 'Debt fund']);
    expect(rows[0]).toMatchObject({ value: '600000', shareOfPortfolioPct: 60 });
  });

  it('works out the SIP for a goal with the goal maths', async () => {
    const out = await runAdvisorTool('compute_sip_for_goal', { goalName: 'child', annualReturnPct: 10 }, ctx);
    expect(out.ok).toBe(true);
    const r = out.result as { monthlySip: string; years: number; remaining: string };
    expect(r.years).toBe(10);
    expect(r.remaining).toBe('2000000');
    // ₹20 L over 10 years at 10% a year ≈ ₹9,760 a month.
    expect(Number.parseFloat(r.monthlySip)).toBeGreaterThan(9500);
    expect(Number.parseFloat(r.monthlySip)).toBeLessThan(10000);
  });

  it('computes a SIP for figures the user gives, and refuses nonsense', async () => {
    const out = await runAdvisorTool('compute_sip_for_goal', { targetAmount: '1200000', years: 5, annualReturnPct: 0 }, ctx);
    expect((out.result as { monthlySip: string }).monthlySip).toBe('20000');
    const bad = await runAdvisorTool('compute_sip_for_goal', { targetAmount: '-5', years: 5 }, ctx);
    expect(bad.ok).toBe(false);
  });

  it('only ever names products from the approved list', async () => {
    const out = await runAdvisorTool('get_approved_products', {}, ctx);
    expect(out.result).toMatchObject({ byBucket: { EQUITY_DOMESTIC: ['Nifty 50 Index Fund — Direct'] } });
    expect(JSON.stringify(out.result)).not.toMatch(/score/);
  });

  it('summarises open recommendations', async () => {
    svc.listRecommendations.mockResolvedValue([
      { category: 'REBALANCE', priority: 12, rationale: 'Equity is 78% vs a 60% target.', action: [{ direction: 'SELL', instrumentName: 'Big', amountInr: '180000' }], createdAt: '2026-09-01T00:00:00Z' },
    ]);
    const out = await runAdvisorTool('get_advisor_recommendations', {}, ctx);
    expect(svc.listRecommendations).toHaveBeenCalledWith('u1', expect.objectContaining({ status: 'OPEN' }));
    expect(out.result).toMatchObject({ recommendations: [{ category: 'REBALANCE', rationale: 'Equity is 78% vs a 60% target.' }] });
  });

  it('says when a service fails, instead of throwing or guessing', async () => {
    svc.buildTaxSummary.mockRejectedValue(new Error('db down'));
    const out = await runAdvisorTool('get_capital_gains_summary', {}, ctx);
    expect(out).toMatchObject({ ok: false });
    expect(String((out.result as { error: string }).error)).toMatch(/couldn.t load/i);
  });

  it('refuses a tool it does not know', async () => {
    expect((await runAdvisorTool('delete_everything', {}, ctx)).ok).toBe(false);
  });

  it('searches the knowledge library', async () => {
    const out = await runAdvisorTool('search_knowledge', { query: 'index fund costs' }, ctx);
    expect(out.ok).toBe(true);
    expect((out.result as { passages: unknown[] }).passages.length).toBeGreaterThan(0);
  });
});
