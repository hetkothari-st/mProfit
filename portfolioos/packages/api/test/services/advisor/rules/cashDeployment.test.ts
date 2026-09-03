import { describe, it, expect } from 'vitest';
import { cashDeploymentRule } from '../../../../src/services/advisor/rules/cashDeployment.rule.js';
import {
  allocation,
  approvedIn,
  d,
  driftedPortfolioFacts,
  emptyPortfolioFacts,
  emptyProductMap,
  makeFacts,
  makeProduct,
  targets,
} from './fixtures.js';

/** ₹20L portfolio, ₹3L emergency-fund target, ₹5L of cash sitting above it. */
function surplusFacts(over: Parameters<typeof driftedPortfolioFacts>[0] = {}) {
  return driftedPortfolioFacts({
    totalPortfolioValue: d(2_000_000),
    liquidity: {
      liquidAssets: d(800_000),
      monthlyExpenses: d(50_000),
      emergencyFundTarget: d(300_000),
      surplusOverTarget: d(500_000),
    },
    ...over,
  });
}

describe('cashDeploymentRule', () => {
  it('deploys the surplus into the most underweight investable bucket', () => {
    const drafts = cashDeploymentRule.evaluate(surplusFacts());

    expect(drafts).toHaveLength(1);
    const draft = drafts[0]!;

    expect(draft.ruleId).toBe('CASH_DEPLOYMENT');
    expect(draft.category).toBe('CASH_DEPLOYMENT');
    expect(draft.dedupeKey).toBe('CASH_DEPLOYMENT:DEBT');
    expect(draft.action).toHaveLength(1);

    const buy = draft.action[0]!;
    expect(buy.direction).toBe('BUY');
    expect(buy.bucket).toBe('DEBT');
    expect(buy.instrumentName).toBe('ICICI Prudential Corporate Bond Fund');
    expect(buy.amountInr).toBe('500000.00');
    expect(buy.units).toBeNull();
    expect(draft.provenance.kind).toBe('APPROVED_LIST');
  });

  it('states the buffer, the surplus and the amount being deployed', () => {
    const draft = cashDeploymentRule.evaluate(surplusFacts())[0]!;

    expect(draft.rationale).toContain('₹50,000.00'); // monthly expenses
    expect(draft.rationale).toContain('₹3,00,000.00'); // 6-month target
    expect(draft.rationale).toContain('₹8,00,000.00'); // liquid assets
    expect(draft.rationale).toContain('₹5,00,000.00'); // surplus and deployed amount
    expect(draft.rationale).toContain('ICICI Prudential Corporate Bond Fund');
  });

  it('never fires when the emergency-fund target is unknown', () => {
    // The most important negative in the engine: unknown expenses means there
    // is no such thing as surplus cash, and calling a bank balance idle is how
    // someone ends up selling equity to cover rent.
    const facts = surplusFacts({
      liquidity: {
        liquidAssets: d(800_000),
        monthlyExpenses: null,
        emergencyFundTarget: null,
        surplusOverTarget: d(500_000),
      },
    });

    expect(cashDeploymentRule.evaluate(facts)).toEqual([]);
  });

  it('does not fire on a surplus at or below the minimum', () => {
    const at = surplusFacts({
      liquidity: {
        liquidAssets: d(325_000),
        monthlyExpenses: d(50_000),
        emergencyFundTarget: d(300_000),
        surplusOverTarget: d(25_000),
      },
    });
    const below = surplusFacts({
      liquidity: {
        liquidAssets: d(310_000),
        monthlyExpenses: d(50_000),
        emergencyFundTarget: d(300_000),
        surplusOverTarget: d(10_000),
      },
    });
    const negative = surplusFacts({
      liquidity: {
        liquidAssets: d(100_000),
        monthlyExpenses: d(50_000),
        emergencyFundTarget: d(300_000),
        surplusOverTarget: d(-200_000),
      },
    });

    expect(cashDeploymentRule.evaluate(at)).toEqual([]);
    expect(cashDeploymentRule.evaluate(below)).toEqual([]);
    expect(cashDeploymentRule.evaluate(negative)).toEqual([]);
  });

  it('returns [] on an empty portfolio', () => {
    expect(cashDeploymentRule.evaluate(emptyPortfolioFacts())).toEqual([]);
  });

  it('never deploys cash into more cash', () => {
    // CASH_EQUIVALENT is the most underweight bucket here; the rule must skip
    // it and pick the next one rather than recommend a no-op.
    const facts = makeFacts({
      totalPortfolioValue: d(2_000_000),
      modelPortfolio: {
        id: 'mp-1',
        versionId: 'mpv-1',
        version: 1,
        targets: targets({ EQUITY_DOMESTIC: 50, DEBT: 20, CASH_EQUIVALENT: 30 }),
      },
      currentAllocation: allocation({
        EQUITY_DOMESTIC: [40, 800_000],
        DEBT: [60, 1_200_000],
      }),
      approvedProducts: approvedIn({
        EQUITY_DOMESTIC: makeProduct({ label: 'UTI Nifty 50 Index Fund' }),
        CASH_EQUIVALENT: makeProduct({ label: 'HDFC Liquid Fund' }),
      }),
      liquidity: {
        liquidAssets: d(500_000),
        monthlyExpenses: d(20_000),
        emergencyFundTarget: d(120_000),
        surplusOverTarget: d(380_000),
      },
    });

    const draft = cashDeploymentRule.evaluate(facts)[0]!;
    expect(draft.action[0]!.bucket).not.toBe('CASH_EQUIVALENT');
    expect(draft.action[0]!.instrumentName).toBe('UTI Nifty 50 Index Fund');
  });

  it('caps a single deployment at MAX_SINGLE_TRADE_PCT and says the rest follows', () => {
    const facts = surplusFacts({
      totalPortfolioValue: d(1_000_000),
      liquidity: {
        liquidAssets: d(900_000),
        monthlyExpenses: d(50_000),
        emergencyFundTarget: d(300_000),
        surplusOverTarget: d(600_000),
      },
    });

    const draft = cashDeploymentRule.evaluate(facts)[0]!;
    expect(draft.action[0]!.amountInr).toBe('250000.00');
    expect(draft.rationale).toContain('₹2,50,000.00');
    expect(draft.rationale).toContain('₹3,50,000.00'); // the remainder
    expect((draft.inputsUsed as Record<string, unknown>).cappedByMaxSingleTrade).toBe(true);
  });

  it('still states the idle rupees when no product can be named, with NONE provenance', () => {
    const draft = cashDeploymentRule.evaluate(
      surplusFacts({ approvedProducts: emptyProductMap(), fallbackRankings: emptyProductMap() }),
    )[0]!;

    expect(draft.action).toEqual([]);
    expect(draft.provenance.kind).toBe('NONE');
    // Keyed on the destination bucket, not on whether we could name a fund for
    // it — so once a product is approved, the next run supersedes this draft
    // instead of standing beside it.
    expect(draft.dedupeKey).toBe('CASH_DEPLOYMENT:DEBT');
    expect(draft.rationale).toContain('₹5,00,000.00');
  });

  it('falls back to an UNRESOLVED key when there is no model portfolio to aim at', () => {
    const draft = cashDeploymentRule.evaluate(
      surplusFacts({ modelPortfolio: { id: null, versionId: null, version: null, targets: [] } }),
    )[0]!;

    expect(draft.action).toEqual([]);
    expect(draft.provenance.kind).toBe('NONE');
    expect(draft.dedupeKey).toBe('CASH_DEPLOYMENT:UNRESOLVED');
    expect(draft.rationale).toContain('complete your risk profile');
  });

  it('emits no unit count, stale prices or not, and keeps priority a positive integer', () => {
    const draft = cashDeploymentRule.evaluate(surplusFacts())[0]!;
    expect(draft.action.every((a) => a.units === null)).toBe(true);
    expect(Number.isInteger(draft.priority)).toBe(true);
    expect(draft.priority).toBeGreaterThanOrEqual(35);
    expect(draft.priority).toBeLessThanOrEqual(60);
  });
});
