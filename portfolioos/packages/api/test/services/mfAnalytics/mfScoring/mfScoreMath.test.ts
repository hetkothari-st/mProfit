/**
 * `docs/mf-analytics/03-SCORING.md §11` items 1-7, plus the two structural
 * checks the doc does not name but that a transcription bug would otherwise
 * pass silently: pillar/input weight sums, and determinism.
 *
 * A wrong weight in a model file is the most dangerous defect in this whole
 * layer. It does not throw, it does not look wrong in a code review, and it
 * mis-scores every fund in a category consistently enough that nothing
 * downstream flags it. The weight-sum tests exist for exactly that.
 */

import { describe, it, expect } from 'vitest';
import { Decimal, MIN_RATING_HISTORY_MONTHS, MIN_UNIVERSE_SIZE } from '@portfolioos/shared';
import type { MfMetricStatus } from '@portfolioos/shared';

import {
  percentileRank,
  percentileRankForMetric,
  directionFor,
  METRIC_DIRECTION,
  METRIC_PLATEAU_CAP,
  MODEL_SCOPED_METRICS,
  AUM_PLATEAU_CAP_INR,
  blendHorizons,
  pillarScore,
  composite,
  ratingFromComposite,
  ratingStatusFor,
  amcQualitativeScore,
  type PillarInputValue,
  type PillarForComposite,
  type ScoringModel,
} from '../../../../src/services/mfAnalytics/mfScoring/mfScoreMath.js';
import {
  MF_SCORING_MODELS,
  modelForKey,
  ACTIVE_EQUITY_MODEL,
  INDEX_MODEL,
  HYBRID_MODEL,
  FOF_MODEL,
} from '../../../../src/services/mfAnalytics/mfScoring/models/registry.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const d = (x: string | number): Decimal => new Decimal(x);

/** Compare at 12 dp: enough to catch a wrong weight, loose enough for 1/7. */
function expectDec(actual: Decimal | null, expected: string): void {
  expect(actual).not.toBeNull();
  expect((actual as Decimal).toFixed(12)).toBe(new Decimal(expected).toFixed(12));
}

function input(
  metric: string,
  weight: number,
  percentile: string | null,
  status: MfMetricStatus = 'OK',
): PillarInputValue {
  return { metric, weight, percentile: percentile === null ? null : d(percentile), status };
}

function sumDec(values: readonly Decimal[]): Decimal {
  return values.reduce((a, b) => a.plus(b), new Decimal(0));
}

/** Distinct models only — SOLUTION and HYBRID are deliberately the same object. */
const DISTINCT_MODELS: ScoringModel[] = Array.from(new Set(Object.values(MF_SCORING_MODELS)));

// ---------------------------------------------------------------------------
// §11.1 — percentile math, with ties
// ---------------------------------------------------------------------------

describe('percentileRank (`03 §1`)', () => {
  const values = [d(1), d(2), d(2), d(2), d(5)];

  it('splits a tie group across its midpoint via the 0.5 term', () => {
    // worse = 1 (the value 1), equal = 3  →  (1 + 1.5) / 5 = 0.5
    expectDec(percentileRank(values, d(2), 'HIGHER_IS_BETTER'), '0.5');
  });

  it('gives the worst value half a step above the floor, not 0', () => {
    // worse = 0, equal = 1  →  0.5 / 5 = 0.1. A percentile of exactly 0 would
    // claim the fund is worse than itself.
    expectDec(percentileRank(values, d(1), 'HIGHER_IS_BETTER'), '0.1');
  });

  it('gives the best value half a step below the ceiling, not 1', () => {
    expectDec(percentileRank(values, d(5), 'HIGHER_IS_BETTER'), '0.9');
  });

  it('is symmetric under direction inversion', () => {
    expectDec(percentileRank(values, d(1), 'LOWER_IS_BETTER'), '0.9');
    expectDec(percentileRank(values, d(5), 'LOWER_IS_BETTER'), '0.1');
    // The tie group sits at the midpoint under either direction.
    expectDec(percentileRank(values, d(2), 'LOWER_IS_BETTER'), '0.5');
  });

  it('puts a fully tied universe at 0.5, not at an extreme', () => {
    // This is the case the 0.5 term exists for: thirty index funds on the same
    // TER must not all be ranked best (or all worst) in their category.
    const allSame = [d(3), d(3), d(3), d(3)];
    expectDec(percentileRank(allSame, d(3), 'HIGHER_IS_BETTER'), '0.5');
    expectDec(percentileRank(allSame, d(3), 'LOWER_IS_BETTER'), '0.5');
  });

  it('returns null for an empty universe rather than a plausible 0.5', () => {
    expect(percentileRank([], d(1))).toBeNull();
  });

  it('refuses to rank a RAW_SCORE metric', () => {
    expect(() => percentileRank(values, d(2), 'RAW_SCORE')).toThrow(/RAW_SCORE/);
  });

  it('plateaus above the AUM cap instead of rewarding size without limit', () => {
    const cap = AUM_PLATEAU_CAP_INR;
    const universe = [
      d('1000000000'), // ₹100cr
      d('50000000000'), // ₹5,000cr
      cap, // ₹10,000cr — at the plateau
      cap.times(2), // ₹20,000cr
      cap.times(6), // ₹60,000cr
    ];
    // Clamped universe is [100cr, 5000cr, cap, cap, cap]:
    // worse = 2, equal = 3 → (2 + 1.5) / 5 = 0.7
    expectDec(percentileRank(universe, cap.times(2), 'HIGHER_IS_BETTER_TO_CAP'), '0.7');
    // The ₹60,000cr fund scores identically to the ₹20,000cr one. Uncapped it
    // would have been (4 + 0.5)/5 = 0.9, i.e. rewarded for the very size that
    // makes a small-cap mandate harder to run.
    expectDec(percentileRank(universe, cap.times(6), 'HIGHER_IS_BETTER_TO_CAP'), '0.7');
    expectDec(percentileRank(universe, cap.times(6), 'HIGHER_IS_BETTER'), '0.9');
    // Below the cap, size still counts.
    expectDec(percentileRank(universe, d('50000000000'), 'HIGHER_IS_BETTER_TO_CAP'), '0.3');
  });

  it('resolves cap and direction by metric name', () => {
    const universe = [d('1000000000'), d('50000000000'), AUM_PLATEAU_CAP_INR.times(4)];
    // clamped universe: [100cr, 5000cr, cap]; the target clamps to cap too, so
    // worse = 2, equal = 1 → (2 + 0.5) / 3.
    expectDec(
      percentileRankForMetric('aum', universe, AUM_PLATEAU_CAP_INR.times(9)),
      '0.833333333333333333',
    );
    // A RAW_SCORE metric passes through untouched (`03 §4`).
    expect(
      percentileRankForMetric('amcQualitativeScore', [d('1'), d('0.5')], d('0.5'))?.toString(),
    ).toBe('0.5');
  });
});

// ---------------------------------------------------------------------------
// §11.2 — direction coverage, driven by the registry
// ---------------------------------------------------------------------------

describe('direction table (`03 §1`, `03 §11.2`)', () => {
  it('has a direction for every input named in every registered model', () => {
    // Written as a loop over the registry, not a hardcoded list: a new input
    // added to a model file with no direction entry must fail here rather than
    // throw for the first fund that has the metric.
    const missing: string[] = [];
    for (const [key, model] of Object.entries(MF_SCORING_MODELS)) {
      for (const pillar of model.pillars) {
        for (const spec of pillar.inputs) {
          try {
            directionFor(spec.metric, model.modelKey);
          } catch {
            missing.push(`${key}/${pillar.key}/${spec.metric}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('scopes tracking error to the INDEX model only', () => {
    expect(directionFor('trackingErrorAnn', 'INDEX')).toBe('LOWER_IS_BETTER');
    // An active manager with low tracking error is a closet indexer — a
    // finding, not a better score. Asking an active model for the direction is
    // a bug in the model file, so it throws.
    expect(() => directionFor('trackingErrorAnn', 'ACTIVE_EQUITY')).toThrow(/only scored in/);
    expect(() => directionFor('trackingErrorAnn', 'HYBRID')).toThrow(/only scored in/);
    // And no non-INDEX model actually names it.
    for (const model of DISTINCT_MODELS) {
      if (model.modelKey === 'INDEX') continue;
      const named = model.pillars.flatMap((p) => p.inputs.map((i) => i.metric));
      for (const scoped of Object.keys(MODEL_SCOPED_METRICS)) {
        expect(named).not.toContain(scoped);
      }
    }
  });

  it('throws for an unknown metric rather than defaulting a direction', () => {
    expect(() => directionFor('notAMetric')).toThrow(/no direction entry/);
  });

  it('gives every capped metric a cap', () => {
    for (const [metric, direction] of Object.entries(METRIC_DIRECTION)) {
      if (direction === 'HIGHER_IS_BETTER_TO_CAP') {
        expect(METRIC_PLATEAU_CAP[metric], `no cap for ${metric}`).toBeDefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// §11.3 — weight re-normalisation
// ---------------------------------------------------------------------------

describe('weight re-normalisation (`03 §4`, `03 §11.3`)', () => {
  it('re-normalises across the surviving inputs when one drops out', () => {
    // ACTIVE_EQUITY PERFORMANCE: sortino 40 / IR 30 / alpha 30, IR unavailable.
    const result = pillarScore([
      input('sortino', 40, '0.80'),
      input('informationRatio', 30, null, 'BENCHMARK_UNAVAILABLE'),
      input('jensenAlphaAnn', 30, '0.60'),
    ]);
    const used = result.usedMetrics.map((m) => result.appliedWeights[m]);
    expectDec(sumDec(used), '1');
    expectDec(result.appliedWeights.sortino, '0.571428571428571429'); // 40/70
    expectDec(result.appliedWeights.jensenAlphaAnn, '0.428571428571428571'); // 30/70
    // The dropped input's applied weight is exactly 0, not its declared 0.30 —
    // publishing the declared weight would misexplain the score.
    expect(result.appliedWeights.informationRatio.isZero()).toBe(true);
    // 40/70 × 0.8 + 30/70 × 0.6 = 0.714285714…
    expectDec(result.score, '0.714285714285714286');
  });

  it('scores a pillar null when no input is OK, and never as 0', () => {
    const result = pillarScore([
      input('activeShare', 40, null, 'INSUFFICIENT_DATA'),
      input('hhi', 30, '0.7', 'STALE'),
      input('styleDrift', 30, null, 'INSUFFICIENT_DATA'),
    ]);
    expect(result.score).toBeNull();
    expect(result.usedMetrics).toEqual([]);
  });

  it('ignores a non-OK status even when a value is present', () => {
    // A STALE percentile is a number we no longer stand behind. Averaging it in
    // would be indistinguishable from a fresh one in the output.
    const result = pillarScore([input('sortino', 40, '0.9', 'QUARANTINED')]);
    expect(result.score).toBeNull();
  });

  it('redistributes a dropped pillar proportionally and stays in [0,100]', () => {
    const pillars: PillarForComposite[] = ACTIVE_EQUITY_MODEL.pillars.map((p) => ({
      key: p.key,
      score: p.key === 'PORTFOLIO' ? null : d('0.5'),
      weight: p.weight,
    }));
    const { composite: value, weights } = composite(pillars);

    expectDec(sumDec(Object.values(weights)), '1');
    expect(weights.PORTFOLIO.isZero()).toBe(true);
    // 90 declared points survive; PERFORMANCE takes 30/90.
    expectDec(weights.PERFORMANCE, '0.333333333333333333');
    // Proportional, not equal: the 30:5 ratio between PERFORMANCE and
    // PEOPLE_PARENT is preserved, so the model's stated priorities survive a
    // data gap.
    expectDec(weights.PERFORMANCE.dividedBy(weights.PEOPLE_PARENT), '6');
    expectDec(value, '50');
    expect((value as Decimal).greaterThanOrEqualTo(0)).toBe(true);
    expect((value as Decimal).lessThanOrEqualTo(100)).toBe(true);
  });

  it('stays inside [0,100] at both extremes after redistribution', () => {
    const worst = composite([
      { key: 'A', score: d(0), weight: 30 },
      { key: 'B', score: null, weight: 70 },
    ]);
    expectDec(worst.composite, '0');
    const best = composite([
      { key: 'A', score: d(1), weight: 30 },
      { key: 'B', score: null, weight: 70 },
    ]);
    expectDec(best.composite, '100');
  });

  it('returns a null composite when every pillar is null', () => {
    const { composite: value, weights } = composite([
      { key: 'A', score: null, weight: 60 },
      { key: 'B', score: null, weight: 40 },
    ]);
    expect(value).toBeNull();
    expect(weights.A.isZero()).toBe(true);
  });

  it('throws rather than publishing a composite outside [0,100]', () => {
    // Guards the case where a raw metric reaches the composite unranked.
    expect(() => composite([{ key: 'A', score: d('1.4'), weight: 100 }])).toThrow(/outside/);
  });
});

// ---------------------------------------------------------------------------
// §11.4 — horizon blend
// ---------------------------------------------------------------------------

describe('blendHorizons (`03 §3`)', () => {
  it('applies 20/30/50 when 3, 5 and 10 are available', () => {
    const r = blendHorizons({ 3: d('0.2'), 5: d('0.4'), 10: d('0.6') });
    expect(r.reason).toBe('ok');
    expectDec(r.weights[3] as Decimal, '0.2');
    expectDec(r.weights[5] as Decimal, '0.3');
    expectDec(r.weights[10] as Decimal, '0.5');
    expectDec(r.value, '0.46');
  });

  it('applies 40/60 when only 3 and 5 are available', () => {
    const r = blendHorizons({ 3: d('0.2'), 5: d('0.4') });
    expectDec(r.weights[3] as Decimal, '0.4');
    expectDec(r.weights[5] as Decimal, '0.6');
    expectDec(r.value, '0.32');
  });

  it('applies 100 when only 3 is available', () => {
    const r = blendHorizons({ 3: d('0.2') });
    expectDec(r.weights[3] as Decimal, '1');
    expectDec(r.value, '0.2');
  });

  it('renormalises over a 5y gap instead of discarding the 10y record', () => {
    // Not in the doc's three-row table; falls out of implementing the table as
    // renormalisation of 20/30/50.
    const r = blendHorizons({ 3: d('0.2'), 10: d('0.6') });
    expectDec(r.weights[3] as Decimal, '0.285714285714285714'); // 20/70
    expectDec(r.weights[10] as Decimal, '0.714285714285714286'); // 50/70
    expectDec(r.value, '0.485714285714285714');
  });

  it('refuses to blend without a 3-year percentile', () => {
    const r = blendHorizons({ 5: d('0.4'), 10: d('0.6') });
    expect(r.value).toBeNull();
    expect(r.reason).toBe('no_3y_history');
    expect(r.weights).toEqual({});
  });

  it('treats no horizons and all-null horizons alike', () => {
    expect(blendHorizons({}).reason).toBe('no_horizons');
    expect(blendHorizons({ 3: null, 5: undefined }).reason).toBe('no_horizons');
  });
});

// ---------------------------------------------------------------------------
// §11.5 — rating buckets
// ---------------------------------------------------------------------------

describe('ratingFromComposite (`03 §8`)', () => {
  it('splits a universe of 40 into 4 / 9 / 14 / 9 / 4', () => {
    const universe = Array.from({ length: 40 }, (_, i) => d(i)); // 0..39, distinct
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const c of universe) {
      const rating = ratingFromComposite(c, universe);
      expect(rating).not.toBeNull();
      counts[rating as number] += 1;
    }
    expect(counts).toEqual({ 5: 4, 4: 9, 3: 14, 2: 9, 1: 4 });
  });

  it('gives a tie at a boundary the higher rating', () => {
    // 40 funds, but the top five all tie. Strictly-better count is 0 for all
    // five, so all five clear the 10% cut-off and are 5s — nobody is demoted
    // on a tiebreak the numbers do not support.
    const tied = [d(99), d(99), d(99), d(99), d(99)];
    const rest = Array.from({ length: 35 }, (_, i) => d(i));
    const universe = [...tied, ...rest];
    for (const c of tied) expect(ratingFromComposite(c, universe)).toBe(5);
  });

  it('rates the whole universe 5 when every composite is identical', () => {
    const universe = Array.from({ length: 20 }, () => d('60'));
    for (const c of universe) expect(ratingFromComposite(c, universe)).toBe(5);
  });

  it('returns null for an empty universe', () => {
    expect(ratingFromComposite(d(50), [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §11.6 / §11.7 — rating status gates
// ---------------------------------------------------------------------------

describe('ratingStatusFor (`00-README` invariant 2, `03 §1`, `03 §4`)', () => {
  const goodPillars = {
    PERFORMANCE: { score: d('0.6') },
    CONSISTENCY: { score: d('0.5') },
  };

  it('withholds a rating below 36 months of history', () => {
    expect(
      ratingStatusFor({ historyMonths: 30, universeSize: 40, pillars: goodPillars }),
    ).toBe('INSUFFICIENT_HISTORY');
    // The composite is still computable — the gate is on the rating, not on the
    // arithmetic, so `03 §11.6`'s "pillars still reported where computable"
    // holds.
    const { composite: value } = composite([
      { key: 'PERFORMANCE', score: d('0.6'), weight: 30 },
      { key: 'CONSISTENCY', score: d('0.5'), weight: 20 },
    ]);
    expect(value).not.toBeNull();
  });

  it('rates at exactly the history threshold', () => {
    expect(
      ratingStatusFor({
        historyMonths: MIN_RATING_HISTORY_MONTHS,
        universeSize: 40,
        pillars: goodPillars,
      }),
    ).toBe('RATED');
  });

  it('withholds a rating in a universe of 8', () => {
    expect(
      ratingStatusFor({ historyMonths: 120, universeSize: 8, pillars: goodPillars }),
    ).toBe('CATEGORY_TOO_SMALL');
    expect(
      ratingStatusFor({
        historyMonths: 120,
        universeSize: MIN_UNIVERSE_SIZE,
        pillars: goodPillars,
      }),
    ).toBe('RATED');
  });

  it('withholds a rating when PERFORMANCE or CONSISTENCY is null', () => {
    expect(
      ratingStatusFor({
        historyMonths: 120,
        universeSize: 40,
        pillars: { PERFORMANCE: { score: null }, CONSISTENCY: { score: d('0.5') } },
      }),
    ).toBe('INSUFFICIENT_HISTORY');
    expect(
      ratingStatusFor({
        historyMonths: 120,
        universeSize: 40,
        pillars: { PERFORMANCE: { score: d('0.6') }, CONSISTENCY: { score: null } },
      }),
    ).toBe('INSUFFICIENT_HISTORY');
  });

  it('does not impose the PERFORMANCE/CONSISTENCY gate on a model without them', () => {
    // INDEX has TRACKING / COST / SCALE / STRUCTURE. A tracker's job is not to
    // perform, so the absent pillars must not be read as a missing input.
    const indexPillars = Object.fromEntries(
      INDEX_MODEL.pillars.map((p) => [p.key, { score: d('0.5') }]),
    );
    expect(
      ratingStatusFor({ historyMonths: 120, universeSize: 40, pillars: indexPillars }),
    ).toBe('RATED');
  });

  it('reports insufficient history before category size when both fail', () => {
    expect(
      ratingStatusFor({ historyMonths: 12, universeSize: 3, pillars: goodPillars }),
    ).toBe('INSUFFICIENT_HISTORY');
  });
});

// ---------------------------------------------------------------------------
// Model weight sums — the transcription guard
// ---------------------------------------------------------------------------

describe('model weight tables (`03 §4-§7`)', () => {
  it('every model has pillar weights summing to 100', () => {
    for (const model of DISTINCT_MODELS) {
      const total = sumDec(model.pillars.map((p) => new Decimal(p.weight)));
      expect(total.toFixed(6), `${model.methodologyVersion} pillar weights`).toBe(
        new Decimal(100).toFixed(6),
      );
    }
  });

  it('every pillar has input weights summing to 100', () => {
    for (const model of DISTINCT_MODELS) {
      for (const pillar of model.pillars) {
        const total = sumDec(pillar.inputs.map((i) => new Decimal(i.weight)));
        expect(
          total.toFixed(6),
          `${model.methodologyVersion} / ${pillar.key} input weights`,
        ).toBe(new Decimal(100).toFixed(6));
      }
    }
  });

  it('no model declares a duplicate pillar key or duplicate input metric', () => {
    for (const model of DISTINCT_MODELS) {
      const keys = model.pillars.map((p) => p.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const pillar of model.pillars) {
        const metrics = pillar.inputs.map((i) => i.metric);
        expect(new Set(metrics).size).toBe(metrics.length);
      }
    }
  });

  it('routes SOLUTION through the HYBRID model (`03 §2`)', () => {
    expect(modelForKey('SOLUTION')).toBe(HYBRID_MODEL);
    expect(modelForKey('SOLUTION').methodologyVersion).toBe('score-hybrid-v1');
  });

  it('doubles the FoF cost pillar and renormalises the rest (`03 §2`)', () => {
    const cost = FOF_MODEL.pillars.find((p) => p.key === 'COST');
    const equityCost = ACTIVE_EQUITY_MODEL.pillars.find((p) => p.key === 'COST');
    expect(cost?.weight).toBe(2 * (equityCost?.weight as number));
    // The other five keep their relative proportions from ACTIVE_EQUITY, to one
    // decimal place of rounding.
    const fofPerf = FOF_MODEL.pillars.find((p) => p.key === 'PERFORMANCE')?.weight as number;
    const fofPeople = FOF_MODEL.pillars.find((p) => p.key === 'PEOPLE_PARENT')
      ?.weight as number;
    expect(new Decimal(fofPerf).dividedBy(fofPeople).toFixed(1)).toBe('6.0');
  });

  it('raises hybrid DOWNSIDE and lowers hybrid PERFORMANCE (`03 §7`)', () => {
    expect(HYBRID_MODEL.pillars.find((p) => p.key === 'PERFORMANCE')?.weight).toBe(25);
    expect(HYBRID_MODEL.pillars.find((p) => p.key === 'DOWNSIDE')?.weight).toBe(25);
    const portfolio = HYBRID_MODEL.pillars.find((p) => p.key === 'PORTFOLIO');
    expect(portfolio?.inputs.map((i) => i.metric)).toContain('equityAllocationDrift');
  });

  it('freezes every model against accidental mutation', () => {
    expect(Object.isFrozen(ACTIVE_EQUITY_MODEL)).toBe(true);
    expect(Object.isFrozen(ACTIVE_EQUITY_MODEL.pillars)).toBe(true);
    expect(Object.isFrozen(MF_SCORING_MODELS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// amcQualitativeScore (`03 §4`)
// ---------------------------------------------------------------------------

describe('amcQualitativeScore (`03 §4`)', () => {
  const asOf = new Date('2026-03-31T00:00:00Z');

  it('defaults to 1.0 with no facts', () => {
    expectDec(amcQualitativeScore([], asOf), '1');
  });

  it('deducts 0.5 for a regulatory action inside three years', () => {
    expectDec(
      amcQualitativeScore(
        [{ factType: 'AMC_REGULATORY_ACTION', validFrom: '2024-06-01' }],
        asOf,
      ),
      '0.5',
    );
  });

  it('lets a regulatory action age out of the three-year window', () => {
    expectDec(
      amcQualitativeScore(
        [{ factType: 'AMC_REGULATORY_ACTION', validFrom: '2015-01-01' }],
        asOf,
      ),
      '1',
    );
  });

  it('deducts 0.5 for front-running with no age window', () => {
    expectDec(
      amcQualitativeScore([{ factType: 'AMC_FRONT_RUNNING', validFrom: '2012-01-01' }], asOf),
      '0.5',
    );
  });

  it('clamps at 0 rather than going negative', () => {
    // Three penalties would arithmetically reach -0.5, which would drag the
    // whole PEOPLE_PARENT pillar below the floor its other inputs are bounded
    // by.
    expectDec(
      amcQualitativeScore(
        [
          { factType: 'AMC_REGULATORY_ACTION', validFrom: '2024-01-01' },
          { factType: 'AMC_REGULATORY_ACTION', validFrom: '2025-01-01' },
          { factType: 'AMC_FRONT_RUNNING', validFrom: '2023-01-01' },
        ],
        asOf,
      ),
      '0',
    );
  });

  it('ignores facts not yet in force, expired facts, and unrelated types', () => {
    expectDec(
      amcQualitativeScore(
        [
          { factType: 'AMC_REGULATORY_ACTION', validFrom: '2027-01-01' }, // future
          { factType: 'AMC_FRONT_RUNNING', validFrom: '2020-01-01', validTo: '2021-01-01' },
          { factType: 'MANAGER_DEPARTURE', validFrom: '2025-01-01' }, // unrelated
        ],
        asOf,
      ),
      '1',
    );
  });

  it('is a raw score, never percentiled', () => {
    expect(directionFor('amcQualitativeScore')).toBe('RAW_SCORE');
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('produces byte-identical output for identical input, twice', () => {
    // `00-README` invariant 7 makes score rows append-only, and `03 §9` makes a
    // re-run for the same asOf and version a no-op. Both depend on this
    // arithmetic having no hidden state — no clock, no iteration-order
    // dependence, no accumulated decimal.js configuration.
    const run = (): string => {
      const perf = pillarScore([
        input('sortino', 40, '0.8123456789'),
        input('informationRatio', 30, null, 'BENCHMARK_UNAVAILABLE'),
        input('jensenAlphaAnn', 30, '0.6111111111'),
      ]);
      const cons = pillarScore([
        input('rollingBeatBenchPct', 40, '0.3333333333'),
        input('rollingBeatCategoryPct', 40, '0.7777777777'),
        input('quartileConsistency', 20, null, 'INSUFFICIENT_DATA'),
      ]);
      const port = pillarScore([
        input('activeShare', 40, null, 'INSUFFICIENT_DATA'),
        input('hhi', 30, null, 'INSUFFICIENT_DATA'),
        input('styleDrift', 30, null, 'INSUFFICIENT_DATA'),
      ]);
      const { composite: value, weights } = composite([
        { key: 'PERFORMANCE', score: perf.score, weight: 30 },
        { key: 'CONSISTENCY', score: cons.score, weight: 20 },
        { key: 'PORTFOLIO', score: port.score, weight: 10 },
      ]);
      const blended = blendHorizons({ 3: d('0.2'), 5: d('0.4'), 10: d('0.6') });
      return JSON.stringify({
        perf: perf.score?.toFixed(18),
        cons: cons.score?.toFixed(18),
        port: port.score,
        composite: value?.toFixed(18),
        weights: Object.fromEntries(
          Object.entries(weights).map(([k, w]) => [k, w.toFixed(18)]),
        ),
        blended: blended.value?.toFixed(18),
      });
    };
    expect(run()).toBe(run());
  });
});

// ---------------------------------------------------------------------------
// §11.8 / §11.9 — the behavioural proofs need a database and live in
// `mfScore.service.test.ts` beside this file. What is asserted here is the
// part that must hold *statically*, so a refactor of the service cannot
// quietly reopen either gap while this sterile suite stays green.
// ---------------------------------------------------------------------------

describe('score persistence (`03 §11.8-9`) — static guarantees on mfScore.service', () => {
  const serviceUrl = new URL(
    '../../../../src/services/mfAnalytics/mfScoring/mfScore.service.ts',
    import.meta.url,
  );

  it('§11.8 append-only: the service exposes no update path on MfSchemeScore', async () => {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const source = await readFile(fileURLToPath(serviceUrl), 'utf8');
    // `06 §1` (mf-score-append-only): "service exposes no update path". The
    // only write verb allowed on the delegate is an insert.
    for (const verb of ['update', 'updateMany', 'upsert', 'delete', 'deleteMany']) {
      expect(source, `mfSchemeScore.${verb}( must not exist`).not.toMatch(
        new RegExp(`mfSchemeScore\\s*\\.\\s*${verb}\\s*\\(`),
      );
    }
    expect(source).toMatch(/mfSchemeScore\s*\.\s*createMany\s*\(/);
    // A raw transaction would bypass the RLS hook's atomicity guarantee.
    expect(source).not.toMatch(/prisma\.\$transaction\s*\(/);
  });

  it('§11.9 IDCW mapping: the service resolves through the growth sibling, never its own NAV', async () => {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const source = await readFile(fileURLToPath(serviceUrl), 'utf8');
    // The hop is `mfPeerRank.service.resolveRankableSchemeCode`, shared with
    // the peer-rank read path so the two cannot disagree about which code a
    // held IDCW option resolves to.
    expect(source).toMatch(/resolveRankableSchemeCode\(/);
    expect(source).toMatch(/growthSiblingSchemeCode/);
    // The universe query is GROWTH-only; an IDCW option is never a member.
    expect(source).toMatch(/optionType:\s*'GROWTH'/);
  });
});

describe('ratingStatusFor gate precedence', () => {
  /**
   * Regression for the first real-data run: 123 of 138 scores came back
   * CATEGORY_TOO_SMALL in categories holding six scored funds, because every
   * fund failed the PERFORMANCE-pillar gate and the pool therefore collapsed
   * to zero. `06 §6` renders that status as "only {n} peers in category", so
   * each fund was told it had no peers when the real cause was its own
   * unscoreable pillar.
   */
  it('blames the fund own null pillar, not the peer count, when both fail', () => {
    const status = ratingStatusFor({
      historyMonths: 120,
      universeSize: 0,
      pillars: {
        PERFORMANCE: { score: null },
        CONSISTENCY: { score: new Decimal('0.5') },
      },
    });
    expect(status).toBe('INSUFFICIENT_HISTORY');
  });

  it('still reports CATEGORY_TOO_SMALL when the fund itself is rateable', () => {
    const status = ratingStatusFor({
      historyMonths: 120,
      universeSize: 3,
      pillars: {
        PERFORMANCE: { score: new Decimal('0.6') },
        CONSISTENCY: { score: new Decimal('0.5') },
      },
    });
    expect(status).toBe('CATEGORY_TOO_SMALL');
  });

  it('history still outranks both', () => {
    expect(
      ratingStatusFor({ historyMonths: 12, universeSize: 0, pillars: {} }),
    ).toBe('INSUFFICIENT_HISTORY');
  });
});

