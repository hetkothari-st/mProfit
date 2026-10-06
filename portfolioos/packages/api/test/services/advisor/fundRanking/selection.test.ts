import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  selectFund,
  switchIsWorthIt,
  type SelectionCandidate,
  type SelectionContext,
} from '../../../../src/services/advisor/fundRanking/selection.js';
import type { SelectionConfig } from '../../../../src/services/advisor/fundRanking/types.js';

/**
 * Selection is where a good ranking becomes bad advice if it is applied
 * naively: switching someone out of a fine fund for two percentile points, or
 * changing the recommendation every time a NAV moves.
 */

const SELECTION: SelectionConfig = {
  incumbentRankBand: 5,
  hysteresisMarginPct: 5,
  hysteresisSnapshots: 3,
  maxAmcSharePct: 40,
  overlapPenaltyPerPct: 0.5,
  maxOverlapPct: 40,
};

function candidate(over: Partial<SelectionCandidate> & { schemeCode: string }): SelectionCandidate {
  return {
    schemeName: `${over.schemeCode} Fund - Direct Plan - Growth`,
    amcName: 'Acme',
    fundId: `fund-${over.schemeCode}`,
    score: 80,
    rankInBucket: 1,
    overlapPct: null,
    ...over,
  };
}

function context(over: Partial<SelectionContext> = {}): SelectionContext {
  return {
    heldSchemeCodes: [],
    valueByAmc: {},
    totalPortfolioValue: new Decimal(1_000_000),
    incumbentSchemeCode: null,
    challengerStreak: 0,
    ...over,
  };
}

describe('selectFund basics', () => {
  it('picks the top-ranked candidate when nothing else applies', () => {
    const r = selectFund(
      [
        candidate({ schemeCode: 'TOP', score: 90, rankInBucket: 1 }),
        candidate({ schemeCode: 'SECOND', score: 70, rankInBucket: 2 }),
      ],
      context(),
      SELECTION,
    );
    expect(r.chosen?.schemeCode).toBe('TOP');
    expect(r.runnerUp?.schemeCode).toBe('SECOND');
    expect(r.runnerUpReason).toContain('#2');
  });

  it('names nothing when there are no candidates', () => {
    const r = selectFund([], context(), SELECTION);
    expect(r.chosen).toBeNull();
  });

  it('is deterministic: identical inputs give identical picks', () => {
    const cands = [
      candidate({ schemeCode: 'A', score: 80, rankInBucket: 1 }),
      candidate({ schemeCode: 'B', score: 80, rankInBucket: 2 }),
    ];
    const first = selectFund(cands, context(), SELECTION);
    const second = selectFund([...cands].reverse(), context(), SELECTION);
    expect(first.chosen?.schemeCode).toBe(second.chosen?.schemeCode);
  });
});

describe('held-fund preference', () => {
  // Moving someone from #3 to #1 buys a rounding error and costs a taxable
  // event, so a held fund inside the band keeps the recommendation.
  it('tops up a held fund inside the rank band instead of switching', () => {
    const r = selectFund(
      [
        candidate({ schemeCode: 'NEW', score: 92, rankInBucket: 1 }),
        candidate({ schemeCode: 'HELD', score: 85, rankInBucket: 3 }),
      ],
      context({ heldSchemeCodes: ['HELD'] }),
      SELECTION,
    );
    expect(r.chosen?.schemeCode).toBe('HELD');
    expect(r.runnerUp?.schemeCode).toBe('NEW');
    expect(r.adjustments.map((a) => a.kind)).toContain('HELD_PREFERENCE');
  });

  it('abandons a held fund that has fallen outside the band', () => {
    const r = selectFund(
      [
        candidate({ schemeCode: 'NEW', score: 92, rankInBucket: 1 }),
        candidate({ schemeCode: 'HELD', score: 40, rankInBucket: 9 }),
      ],
      context({ heldSchemeCodes: ['HELD'] }),
      SELECTION,
    );
    expect(r.chosen?.schemeCode).toBe('NEW');
  });
});

describe('overlap penalty', () => {
  it('costs a heavily overlapping candidate its lead', () => {
    const r = selectFund(
      [
        candidate({ schemeCode: 'CLONE', score: 90, rankInBucket: 1, overlapPct: 100 }),
        candidate({ schemeCode: 'DIFFERENT', score: 75, rankInBucket: 2 }),
      ],
      context(),
      SELECTION,
    );
    // 100% overlap is 60 points past the 40% threshold → 30-point penalty.
    expect(r.chosen?.schemeCode).toBe('DIFFERENT');
    expect(r.adjustments.map((a) => a.kind)).toContain('OVERLAP_PENALTY');
  });

  it('leaves a modest overlap alone', () => {
    const r = selectFund(
      [
        candidate({ schemeCode: 'SOME', score: 90, rankInBucket: 1, overlapPct: 35 }),
        candidate({ schemeCode: 'OTHER', score: 80, rankInBucket: 2 }),
      ],
      context(),
      SELECTION,
    );
    expect(r.chosen?.schemeCode).toBe('SOME');
  });

  // Unknown overlap is not zero overlap, but it is also not a reason to
  // penalise: the penalty needs a number to apply.
  it('does not penalise an unknown overlap', () => {
    const r = selectFund(
      [candidate({ schemeCode: 'UNKNOWN', score: 90, rankInBucket: 1, overlapPct: null })],
      context(),
      SELECTION,
    );
    expect(r.chosen?.schemeCode).toBe('UNKNOWN');
    expect(r.adjustments).toEqual([]);
  });
});

describe('AMC concentration cap', () => {
  it('skips a candidate whose AMC is already at the cap', () => {
    const r = selectFund(
      [
        candidate({ schemeCode: 'BIGAMC', score: 95, rankInBucket: 1, amcName: 'Big' }),
        candidate({ schemeCode: 'SMALLAMC', score: 70, rankInBucket: 2, amcName: 'Small' }),
      ],
      context({
        valueByAmc: { Big: new Decimal(450_000) }, // 45% of 10 lakh
        totalPortfolioValue: new Decimal(1_000_000),
      }),
      SELECTION,
    );
    expect(r.chosen?.schemeCode).toBe('SMALLAMC');
    expect(r.adjustments.map((a) => a.kind)).toContain('AMC_CAP');
  });

  it('still names a fund when the cap would exclude everything', () => {
    const r = selectFund(
      [candidate({ schemeCode: 'ONLY', score: 95, rankInBucket: 1, amcName: 'Big' })],
      context({
        valueByAmc: { Big: new Decimal(900_000) },
        totalPortfolioValue: new Decimal(1_000_000),
      }),
      SELECTION,
    );
    expect(r.chosen?.schemeCode).toBe('ONLY');
  });
});

describe('hysteresis', () => {
  // Without this the top of the list changes on nightly NAV noise and the
  // client is told to switch again every week.
  it('holds the incumbent when the challenger leads by less than the margin', () => {
    const r = selectFund(
      [
        candidate({ schemeCode: 'CHALLENGER', score: 82, rankInBucket: 1 }),
        candidate({ schemeCode: 'INCUMBENT', score: 80, rankInBucket: 2 }),
      ],
      context({ incumbentSchemeCode: 'INCUMBENT', challengerStreak: 9 }),
      SELECTION,
    );
    expect(r.chosen?.schemeCode).toBe('INCUMBENT');
    expect(r.adjustments.map((a) => a.kind)).toContain('HYSTERESIS_HOLD');
  });

  it('holds the incumbent when a big lead has not lasted long enough', () => {
    const r = selectFund(
      [
        candidate({ schemeCode: 'CHALLENGER', score: 95, rankInBucket: 1 }),
        candidate({ schemeCode: 'INCUMBENT', score: 70, rankInBucket: 2 }),
      ],
      context({ incumbentSchemeCode: 'INCUMBENT', challengerStreak: 1 }),
      SELECTION,
    );
    expect(r.chosen?.schemeCode).toBe('INCUMBENT');
  });

  it('releases the incumbent once the lead is both big and sustained', () => {
    const r = selectFund(
      [
        candidate({ schemeCode: 'CHALLENGER', score: 95, rankInBucket: 1 }),
        candidate({ schemeCode: 'INCUMBENT', score: 70, rankInBucket: 2 }),
      ],
      context({ incumbentSchemeCode: 'INCUMBENT', challengerStreak: 3 }),
      SELECTION,
    );
    expect(r.chosen?.schemeCode).toBe('CHALLENGER');
    expect(r.adjustments.map((a) => a.kind)).not.toContain('HYSTERESIS_HOLD');
  });
});

describe('switchIsWorthIt', () => {
  // The cost is certain and today; the advantage is a probability spread over
  // a year. A switch that cannot repay its tax bill inside that year is churn.
  it('suppresses a switch whose tax cost swamps the advantage', () => {
    const r = switchIsWorthIt({
      holdingValue: new Decimal(500_000),
      unrealisedGain: new Decimal(200_000),
      capitalGainsRatePct: 12.5, // statutory LTCG on equity, never the slab
      exitLoadPct: 1,
      expectedAnnualAdvantagePct: 0.3,
      materialityTolerance: 0.1,
    });
    expect(r.worthIt).toBe(false);
    // 200,000 × 12.5% = 25,000 tax + 500,000 × 1% = 5,000 load
    expect(r.costInr.toNumber()).toBeCloseTo(30_000, 6);
  });

  it('allows a switch that clears its cost comfortably', () => {
    const r = switchIsWorthIt({
      holdingValue: new Decimal(500_000),
      unrealisedGain: new Decimal(1_000),
      capitalGainsRatePct: 12.5,
      exitLoadPct: 0,
      expectedAnnualAdvantagePct: 2,
      materialityTolerance: 0.1,
    });
    expect(r.worthIt).toBe(true);
  });

  it('uses the statutory rate it is given, not a slab rate', () => {
    const equity = switchIsWorthIt({
      holdingValue: new Decimal(100_000),
      unrealisedGain: new Decimal(50_000),
      capitalGainsRatePct: 12.5,
      exitLoadPct: null,
      expectedAnnualAdvantagePct: 1,
      materialityTolerance: 0.1,
    });
    expect(equity.costInr.toNumber()).toBeCloseTo(6_250, 6);
  });

  it('flags that an unknown exit load was assumed to be zero', () => {
    const r = switchIsWorthIt({
      holdingValue: new Decimal(100_000),
      unrealisedGain: new Decimal(0),
      capitalGainsRatePct: 12.5,
      exitLoadPct: null,
      expectedAnnualAdvantagePct: 1,
      materialityTolerance: 0.1,
    });
    expect(r.exitLoadAssumedZero).toBe(true);
    expect(r.costInr.toNumber()).toBe(0);
  });

  it('charges no tax on a loss-making holding', () => {
    const r = switchIsWorthIt({
      holdingValue: new Decimal(100_000),
      unrealisedGain: new Decimal(-20_000),
      capitalGainsRatePct: 12.5,
      exitLoadPct: 0,
      expectedAnnualAdvantagePct: 1,
      materialityTolerance: 0.1,
    });
    expect(r.costInr.toNumber()).toBe(0);
    expect(r.worthIt).toBe(true);
  });
});
