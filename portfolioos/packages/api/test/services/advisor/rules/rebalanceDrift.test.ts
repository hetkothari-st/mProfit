import { describe, it, expect } from 'vitest';
import { rebalanceDriftRule } from '../../../../src/services/advisor/rules/rebalanceDrift.rule.js';
import {
  allocation,
  approvedIn,
  d,
  driftedPortfolioFacts,
  emptyPortfolioFacts,
  emptyProductMap,
  makeFacts,
  makeHolding,
  makeProduct,
  targets,
} from './fixtures.js';

describe('rebalanceDriftRule', () => {
  it('pairs the overweight bucket with the underweight one into a single funded switch', () => {
    const drafts = rebalanceDriftRule.evaluate(driftedPortfolioFacts());

    expect(drafts).toHaveLength(1);
    const draft = drafts[0]!;

    expect(draft.ruleId).toBe('REBALANCE_DRIFT');
    expect(draft.category).toBe('REBALANCE');
    expect(draft.dedupeKey).toBe('REBALANCE_DRIFT:EQUITY_DOMESTIC->DEBT');
    expect(draft.action).toHaveLength(2);

    const sell = draft.action.find((a) => a.direction === 'SELL')!;
    const buy = draft.action.find((a) => a.direction === 'BUY')!;

    // Sell leg is sourced from the LARGEST holding in the overweight bucket
    // (HDFC ₹4L), not the first one or the Reliance ₹2L position.
    expect(sell.instrumentName).toBe('HDFC Top 100 Fund');
    expect(sell.holdingKey).toBe('hk-hdfc');
    expect(sell.bucket).toBe('EQUITY_DOMESTIC');

    // Sized to the smaller of the two drifts: ₹1.7L of debt shortfall, not the
    // ₹2L of equity excess — the switch never sells more than it deploys.
    expect(sell.amountInr).toBe('170000.00');
    expect(buy.amountInr).toBe('170000.00');
    expect(sell.units).toBe('212.5'); // 170000 / 800

    expect(buy.bucket).toBe('DEBT');
    expect(buy.instrumentName).toBe('ICICI Prudential Corporate Bond Fund');
    expect(buy.fundId).toBe('fund-icici-cb');
    expect(draft.provenance.kind).toBe('APPROVED_LIST');
  });

  it('states both rupee figures and both drifts in the rationale', () => {
    const draft = rebalanceDriftRule.evaluate(driftedPortfolioFacts())[0]!;

    expect(draft.rationale).toContain('₹1,70,000.00');
    expect(draft.rationale).toContain('20.0pp');
    expect(draft.rationale).toContain('17.0pp');
    expect(draft.rationale).toContain('HDFC Top 100 Fund');
    expect(draft.rationale).toContain('ICICI Prudential Corporate Bond Fund');
    expect(draft.rationale).toContain('212.5');
  });

  it('records every fact it consumed in inputsUsed', () => {
    const draft = rebalanceDriftRule.evaluate(driftedPortfolioFacts())[0]!;
    const used = draft.inputsUsed as Record<string, unknown>;

    expect(used.totalPortfolioValue).toBe('1000000');
    expect(used.rebalanceBandPp).toBe(5);
    expect(used.modelPortfolioVersionId).toBe('mpv-1');
    expect(Array.isArray(used.driftRows)).toBe(true);
    expect((used.driftRows as unknown[]).length).toBe(2);
    expect(used.sourceHolding).toMatchObject({ holdingKey: 'hk-hdfc', priceStale: false });
    expect(used.resolvedProduct).toMatchObject({ provenance: 'APPROVED_LIST' });
  });

  it('sorts a bigger rupee switch ahead of a smaller one inside the rebalance band', () => {
    const big = rebalanceDriftRule.evaluate(driftedPortfolioFacts())[0]!;

    // Same shape, 100x smaller portfolio: ₹1,700 of drift on ₹10,000 is the
    // same percentage but is not the same amount of money.
    const small = rebalanceDriftRule.evaluate(
      driftedPortfolioFacts({
        totalPortfolioValue: d(1_000_000),
        currentAllocation: allocation({
          EQUITY_DOMESTIC: [46, 460_000],
          DEBT: [31, 310_000],
          GOLD: [8, 80_000],
          CASH_EQUIVALENT: [10, 100_000],
          EQUITY_INTERNATIONAL: [5, 50_000],
        }),
      }),
    )[0]!;

    expect(big.priority).toBeLessThan(small.priority);
    expect(Number.isInteger(big.priority)).toBe(true);
    expect(big.priority).toBeGreaterThan(0);
  });

  it('does not fire when every bucket is inside the rebalance band', () => {
    const facts = driftedPortfolioFacts({
      currentAllocation: allocation({
        EQUITY_DOMESTIC: [43, 430_000],
        EQUITY_INTERNATIONAL: [5, 50_000],
        DEBT: [34, 340_000],
        GOLD: [8, 80_000],
        CASH_EQUIVALENT: [10, 100_000],
      }),
    });

    expect(rebalanceDriftRule.evaluate(facts)).toEqual([]);
  });

  it('returns [] on an empty portfolio', () => {
    expect(rebalanceDriftRule.evaluate(emptyPortfolioFacts())).toEqual([]);
  });

  it('returns [] when there is no model portfolio to drift from', () => {
    const facts = driftedPortfolioFacts({
      modelPortfolio: { id: null, versionId: null, version: null, targets: [] },
    });
    expect(rebalanceDriftRule.evaluate(facts)).toEqual([]);
  });

  it('never emits a unit count when the source holding has a stale price', () => {
    const facts = driftedPortfolioFacts({
      holdings: [
        makeHolding({
          holdingKey: 'hk-hdfc',
          currentValue: d(400_000),
          currentPrice: d(800),
          priceStale: true,
        }),
      ],
    });

    const draft = rebalanceDriftRule.evaluate(facts)[0]!;
    const sell = draft.action.find((a) => a.direction === 'SELL')!;

    expect(sell.units).toBeNull();
    // The rupee amount is still there, so the instruction stays actionable.
    expect(sell.amountInr).toBe('170000.00');
    expect(draft.rationale).toContain('stale');
    expect(draft.rationale).toContain('₹1,70,000.00');
  });

  it('degrades to a sell-only draft with NONE provenance when nothing is approved to buy', () => {
    const facts = driftedPortfolioFacts({
      approvedProducts: emptyProductMap(),
      fallbackRankings: emptyProductMap(),
    });

    const drafts = rebalanceDriftRule.evaluate(facts);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.action).toHaveLength(1);
    expect(drafts[0]!.action[0]!.direction).toBe('SELL');
    expect(drafts[0]!.provenance.kind).toBe('NONE');
    expect(drafts[0]!.dedupeKey).toBe('REBALANCE_DRIFT:EQUITY_DOMESTIC->NONE');
  });

  it('falls back to the NAV ranking, never to no provenance, when nothing is adviser-approved', () => {
    const facts = driftedPortfolioFacts({
      approvedProducts: emptyProductMap(),
      fallbackRankings: approvedIn({
        DEBT: makeProduct({
          approvedProductId: null,
          label: 'Nippon India Short Duration Fund',
          fundId: 'fund-nippon-sd',
          score: 0.71,
        }),
      }),
    });

    const draft = rebalanceDriftRule.evaluate(facts)[0]!;
    expect(draft.provenance.kind).toBe('FALLBACK_RANKING');
    expect(draft.action.some((a) => a.direction === 'BUY')).toBe(true);
  });

  it('emits a buy-only draft when a bucket is short and nothing investable is overweight', () => {
    // 100% cash against a 40/37/8/10/5 model: debt and equity are both short,
    // but cash is only 10pp over, so there is one sell and several buys.
    const facts = makeFacts({
      totalPortfolioValue: d(1_000_000),
      modelPortfolio: {
        id: 'mp-1',
        versionId: 'mpv-1',
        version: 1,
        targets: targets({ EQUITY_DOMESTIC: 60, DEBT: 40 }),
      },
      currentAllocation: allocation({ DEBT: [100, 1_000_000] }),
      holdings: [],
      approvedProducts: approvedIn({
        EQUITY_DOMESTIC: makeProduct({ label: 'UTI Nifty 50 Index Fund', fundId: 'fund-uti-n50' }),
      }),
    });

    const drafts = rebalanceDriftRule.evaluate(facts);
    // No holdings means the DEBT overweight cannot be sourced, so only the
    // equity shortfall survives — as a buy-only instruction.
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.action).toHaveLength(1);
    expect(drafts[0]!.action[0]!.direction).toBe('BUY');
    expect(drafts[0]!.dedupeKey).toBe('REBALANCE_DRIFT:NONE->EQUITY_DOMESTIC');
    expect(drafts[0]!.provenance.kind).toBe('APPROVED_LIST');
  });

  it('will not tell anyone to sell property or crypto to hit a weight', () => {
    const facts = makeFacts({
      totalPortfolioValue: d(1_000_000),
      modelPortfolio: {
        id: 'mp-1',
        versionId: 'mpv-1',
        version: 1,
        targets: targets({ EQUITY_DOMESTIC: 40, DEBT: 60 }),
      },
      currentAllocation: allocation({
        REAL_ASSETS: [70, 700_000],
        OTHER_ALT: [30, 300_000],
      }),
      holdings: [
        makeHolding({
          holdingKey: 'hk-flat',
          assetName: 'Pune flat',
          assetClass: 'REAL_ESTATE',
          bucket: 'REAL_ASSETS',
          fundId: null,
          currentValue: d(700_000),
          currentPrice: null,
          priceStale: true,
        }),
      ],
      approvedProducts: approvedIn({
        EQUITY_DOMESTIC: makeProduct({ label: 'UTI Nifty 50 Index Fund' }),
        DEBT: makeProduct({ label: 'ICICI Prudential Corporate Bond Fund' }),
      }),
    });

    const drafts = rebalanceDriftRule.evaluate(facts);
    expect(drafts.every((dr) => dr.action.every((a) => a.direction !== 'SELL'))).toBe(true);
    expect(
      drafts.every((dr) => dr.action.every((a) => a.bucket !== 'REAL_ASSETS' && a.bucket !== 'OTHER_ALT')),
    ).toBe(true);
  });
});
