import { describe, it, expect } from 'vitest';
import { concentrationTrimRule } from '../../../../src/services/advisor/rules/concentrationTrim.rule.js';
import { d, emptyPortfolioFacts, makeFacts, makeHolding } from './fixtures.js';

/** ₹10L portfolio holding one named position of `value`. */
function withHolding(value: number, over: Parameters<typeof makeHolding>[0] = {}) {
  return makeFacts({
    totalPortfolioValue: d(1_000_000),
    holdings: [
      makeHolding({
        holdingKey: 'hk-ril',
        assetName: 'Reliance Industries',
        assetClass: 'EQUITY',
        fundId: null,
        stockId: 'stock-ril',
        quantity: d(120),
        currentPrice: d(2_500),
        currentValue: d(value),
        ...over,
      }),
    ],
  });
}

describe('concentrationTrimRule', () => {
  it('trims a holding above the 15% cap back down to exactly the cap', () => {
    const drafts = concentrationTrimRule.evaluate(withHolding(300_000));

    expect(drafts).toHaveLength(1);
    const draft = drafts[0]!;

    expect(draft.ruleId).toBe('CONCENTRATION_TRIM');
    expect(draft.category).toBe('CONCENTRATION_TRIM');
    expect(draft.dedupeKey).toBe('CONCENTRATION_TRIM:hk-ril');
    expect(draft.action).toHaveLength(1);

    const sell = draft.action[0]!;
    expect(sell.direction).toBe('SELL');
    expect(sell.holdingKey).toBe('hk-ril');
    // 30% of ₹10L is ₹3L; the 15% cap is ₹1.5L; sell the ₹1.5L excess.
    expect(sell.amountInr).toBe('150000.00');
    expect(sell.units).toBe('60'); // 150000 / 2500

    // Nothing is being bought, so there is no product to attribute.
    expect(draft.provenance.kind).toBe('NONE');
  });

  it('states the position size, the cap and the sale amount in the rationale', () => {
    const draft = concentrationTrimRule.evaluate(withHolding(300_000))[0]!;

    expect(draft.rationale).toContain('Reliance Industries');
    expect(draft.rationale).toContain('30.0%');
    expect(draft.rationale).toContain('₹1,50,000.00');
    expect(draft.rationale).toContain('₹3,00,000.00');
    expect(draft.rationale).toContain('15%');
    expect(draft.rationale).toContain('60 units');
  });

  it('does not fire on a holding at or below the cap', () => {
    expect(concentrationTrimRule.evaluate(withHolding(150_000))).toEqual([]);
    expect(concentrationTrimRule.evaluate(withHolding(140_000))).toEqual([]);
  });

  it('does not fire when the excess is below the minimum trade size', () => {
    // ₹1,53,000 is 15.3% — over the cap, but the ₹3,000 excess is not worth a trade.
    expect(concentrationTrimRule.evaluate(withHolding(153_000))).toEqual([]);
  });

  it('returns [] on an empty portfolio', () => {
    expect(concentrationTrimRule.evaluate(emptyPortfolioFacts())).toEqual([]);
    expect(
      concentrationTrimRule.evaluate(makeFacts({ totalPortfolioValue: d(0), holdings: [makeHolding()] })),
    ).toEqual([]);
  });

  it('never emits a unit count when the price is stale', () => {
    const draft = concentrationTrimRule.evaluate(withHolding(300_000, { priceStale: true }))[0]!;
    const sell = draft.action[0]!;

    expect(sell.units).toBeNull();
    expect(sell.amountInr).toBe('150000.00');
    expect(draft.rationale).toContain('stale');
    expect(draft.rationale).toContain('₹1,50,000.00');
  });

  it('caps a monstrous trim at MAX_SINGLE_TRADE_PCT and says how far is left to go', () => {
    const draft = concentrationTrimRule.evaluate(withHolding(900_000))[0]!;
    const sell = draft.action[0]!;

    // Excess is ₹7.5L, but no single instruction moves more than 25% of ₹10L.
    expect(sell.amountInr).toBe('250000.00');
    expect(draft.rationale).toContain('₹2,50,000.00');
    expect(draft.rationale).toContain('₹5,00,000.00'); // the residual still to come out
    expect((draft.inputsUsed as Record<string, unknown>).cappedByMaxSingleTrade).toBe(true);
  });

  it('raises one draft per over-cap holding, largest first', () => {
    const facts = makeFacts({
      totalPortfolioValue: d(1_000_000),
      holdings: [
        makeHolding({ holdingKey: 'hk-small', assetName: 'Small Co', currentValue: d(180_000) }),
        makeHolding({ holdingKey: 'hk-big', assetName: 'Big Co', currentValue: d(400_000) }),
        makeHolding({ holdingKey: 'hk-fine', assetName: 'Fine Co', currentValue: d(100_000) }),
      ],
    });

    const drafts = concentrationTrimRule.evaluate(facts);
    expect(drafts.map((x) => x.dedupeKey)).toEqual([
      'CONCENTRATION_TRIM:hk-big',
      'CONCENTRATION_TRIM:hk-small',
    ]);
    expect(drafts[0]!.priority).toBeLessThanOrEqual(drafts[1]!.priority);
    expect(drafts.every((x) => Number.isInteger(x.priority) && x.priority > 0)).toBe(true);
  });
});
