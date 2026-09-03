import { describe, it, expect } from 'vitest';
import { taxLossHarvestRule } from '../../../../src/services/advisor/rules/taxLossHarvest.rule.js';
import {
  IN_HARVEST_WINDOW,
  OUT_OF_HARVEST_WINDOW,
  d,
  emptyPortfolioFacts,
  makeFacts,
  makeHarvestCandidate,
} from './fixtures.js';

function harvestFacts(
  candidateOver: Parameters<typeof makeHarvestCandidate>[0] = {},
  factsOver: Parameters<typeof makeFacts>[0] = {},
) {
  return makeFacts({
    asOf: IN_HARVEST_WINDOW,
    totalPortfolioValue: d(1_000_000),
    harvestCandidates: [makeHarvestCandidate(candidateOver)],
    ...factsOver,
  });
}

describe('taxLossHarvestRule', () => {
  it('sells the whole loss-making position inside the Oct-Mar window', () => {
    const drafts = taxLossHarvestRule.evaluate(harvestFacts());

    expect(drafts).toHaveLength(1);
    const draft = drafts[0]!;

    expect(draft.ruleId).toBe('TAX_LOSS_HARVEST');
    expect(draft.category).toBe('TAX_HARVEST');
    expect(draft.dedupeKey).toBe('TAX_LOSS_HARVEST:pf-1:INE669E01016');
    expect(draft.action).toHaveLength(1);

    const sell = draft.action[0]!;
    expect(sell.direction).toBe('SELL');
    expect(sell.instrumentName).toBe('Vodafone Idea Ltd');
    expect(sell.bucket).toBe('EQUITY_DOMESTIC');
    // The full position, not a slice — a half-harvested loss is a taxable
    // event that only did half a job.
    expect(sell.amountInr).toBe('160000.00');
    expect(sell.units).toBe('400');

    // Deadline-driven band: 1-10.
    expect(draft.priority).toBeGreaterThan(0);
    expect(draft.priority).toBeLessThanOrEqual(10);
    expect(draft.provenance.kind).toBe('NONE');
  });

  it('values an equity loss at the statutory equity rate, not the income slab', () => {
    const draft = taxLossHarvestRule.evaluate(harvestFacts())[0]!;

    expect(draft.rationale).toContain('₹40,000.00'); // loss realised
    expect(draft.rationale).toContain('₹1,60,000.00'); // sale proceeds
    // A loss offsets the GAIN it is set against, so an equity short-term loss
    // saves tax at the statutory 20% — not at this investor's 30% income slab,
    // which would overstate the benefit by half.
    expect(draft.rationale).toContain('short-term equity gains');
    expect(draft.rationale).toContain('20%');
    expect(draft.rationale).toContain('₹8,000.00'); // 20% of ₹40,000
    expect(draft.rationale).not.toContain('₹12,000.00'); // the old slab-based figure
    expect(draft.rationale).toContain('31 March');
    expect(draft.rationale).toContain('2025-26');
  });

  it('says the slab is unknown rather than assuming 30%, for the one case taxed at slab', () => {
    const facts = harvestFacts(
      // Non-equity short-term is the only category genuinely taxed at slab, so
      // it is the only one where an unknown slab should suppress the figure.
      { assetClass: 'BOND', classification: 'STCG_LOSS' },
      {
        riskProfile: {
          assessmentId: 'assessment-1',
          category: 'BALANCED',
          age: 38,
          taxSlabPct: null,
          assessedAt: new Date('2025-10-01T00:00:00.000Z'),
        },
        capitalGainsRates: {
          stcgEquityPct: 20,
          ltcgEquityPct: 12.5,
          ltcgOtherNonIndexedPct: 12.5,
          slabPct: null,
        },
      },
    );

    const draft = taxLossHarvestRule.evaluate(facts)[0]!;
    expect(draft.rationale).toContain('do not have your tax slab');
    expect(draft.rationale).not.toContain('30%');
    expect(draft.rationale).not.toContain('₹12,000.00');
    expect(draft.rationale).toContain('₹40,000.00');
    expect((draft.inputsUsed as Record<string, unknown>).estimatedTaxSavedInr).toBeNull();
  });

  it('is silent outside the Oct 1 - Mar 31 window', () => {
    expect(taxLossHarvestRule.evaluate(harvestFacts({}, { asOf: OUT_OF_HARVEST_WINDOW }))).toEqual([]);
    // Boundary months, computed from facts.asOf and nothing else.
    expect(
      taxLossHarvestRule.evaluate(harvestFacts({}, { asOf: new Date('2025-10-01T00:00:00.000Z') })),
    ).toHaveLength(1);
    expect(
      taxLossHarvestRule.evaluate(harvestFacts({}, { asOf: new Date('2026-03-31T00:00:00.000Z') })),
    ).toHaveLength(1);
    expect(
      taxLossHarvestRule.evaluate(harvestFacts({}, { asOf: new Date('2026-04-01T00:00:00.000Z') })),
    ).toEqual([]);
  });

  it('does not fire on a loss below the harvest floor', () => {
    expect(
      taxLossHarvestRule.evaluate(harvestFacts({ unrealisedPnL: d(-4_999) })),
    ).toEqual([]);
    expect(
      taxLossHarvestRule.evaluate(harvestFacts({ unrealisedPnL: d(-5_000) })),
    ).toHaveLength(1);
  });

  it('never harvests a gain', () => {
    expect(
      taxLossHarvestRule.evaluate(
        harvestFacts({ classification: 'STCG_GAIN', unrealisedPnL: d(40_000) }),
      ),
    ).toEqual([]);
    expect(
      taxLossHarvestRule.evaluate(
        harvestFacts({ classification: 'LTCG_GAIN', unrealisedPnL: d(-40_000) }),
      ),
    ).toEqual([]);
  });

  it('returns [] on an empty portfolio', () => {
    expect(taxLossHarvestRule.evaluate(emptyPortfolioFacts())).toEqual([]);
  });

  it('never emits a unit count when the price is stale', () => {
    const draft = taxLossHarvestRule.evaluate(harvestFacts({ priceStale: true }))[0]!;

    expect(draft.action[0]!.units).toBeNull();
    expect(draft.action[0]!.amountInr).toBe('160000.00');
    expect(draft.rationale).toContain('stale');
    expect(draft.rationale).toContain('₹1,60,000.00');
  });

  it('calls a long-term loss long-term', () => {
    const draft = taxLossHarvestRule.evaluate(
      harvestFacts({ classification: 'LTCG_LOSS', longTermEligible: true }),
    )[0]!;
    expect(draft.rationale).toContain('long-term capital loss');
  });
});
