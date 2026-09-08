/**
 * Unit tests for the backtest arithmetic (`06-QUALITY-COMPLIANCE.md §3`).
 *
 * Everything here runs against `scripts/mf-backtest.math.ts` — no database, no
 * Prisma, no fixtures in Postgres. That is the point of the pure/shell split:
 * the numbers that decide whether a methodology version ships, and whether a
 * coefficient is emitted at all, must be checkable without standing anything
 * up.
 *
 * The most important test in this file is the last group. The refusal path is
 * the only thing standing between an empty database and a confident-looking
 * `replacementExpectedEdge` wired into a recommendation that moves real money.
 */

import { describe, it, expect } from 'vitest';
import { Decimal, toDecimal } from '@portfolioos/shared';

import {
  ACCEPTANCE,
  PRECONDITIONS,
  aggregate,
  assignQuintiles,
  checkPreconditions,
  forwardOutcome,
  mean,
  median,
  monthOutcome,
  olsSlope,
  regressionPointsFor,
  renderModelReport,
  renderRefusalReport,
  REFUSAL_BANNER,
  type BacktestCoverage,
  type BacktestMember,
  type ReportContext,
  type UniverseMonth,
} from '../../scripts/mf-backtest.math.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function d(v: string | number): Decimal {
  return toDecimal(v);
}

function member(
  schemeCode: string,
  composite: string | number,
  forwardCagr: string | number,
  opts: { drawdown?: string; pillars?: Record<string, Decimal | null> } = {},
): BacktestMember {
  return {
    schemeCode,
    composite: d(composite),
    pillars: opts.pillars ?? {},
    forwardCagr: d(forwardCagr),
    forwardMaxDrawdown: opts.drawdown === undefined ? null : d(opts.drawdown),
  };
}

function universeMonth(members: BacktestMember[], monthEnd = new Date('2018-06-30')): UniverseMonth {
  return {
    monthEnd,
    universeKey: 'Large Cap Fund|DIRECT',
    modelKey: 'ACTIVE_EQUITY',
    methodologyVersion: 'score-active-equity-v1',
    members,
  };
}

/** Coverage that clears every precondition, so a test can spoil exactly one. */
function healthyCoverage(): BacktestCoverage {
  return {
    scoredMonths: PRECONDITIONS.minScoredMonths + 12,
    gateModelMonths: PRECONDITIONS.minGateModelMonths + 12,
    quintileEligibleUniverseMonths: 900,
    tooSmallUniverseMonths: 40,
    distinctSchemes: PRECONDITIONS.minDistinctSchemes + 200,
    gateModelDistinctSchemes: PRECONDITIONS.minGateModelDistinctSchemes + 60,
    regressionObservations: PRECONDITIONS.minRegressionObservations + 5000,
    regressionXVariance: d('4210.5'),
    deadSchemesInWindow: 34,
    deadSchemesRanked: 21,
  };
}

// ---------------------------------------------------------------------------
// 1. Quintile bucketing
// ---------------------------------------------------------------------------

describe('assignQuintiles', () => {
  const value = (m: BacktestMember): Decimal => m.composite;
  const key = (m: BacktestMember): string => m.schemeCode;

  it('puts the best-scored fifth in Q1 (index 0) and the worst in Q5', () => {
    const items = Array.from({ length: 10 }, (_, i) => member(`s${i}`, i, 0));
    const { buckets } = assignQuintiles(items, value, key);

    expect(buckets).toHaveLength(5);
    expect(buckets.map((b) => b.map((m) => m.schemeCode))).toEqual([
      ['s9', 's8'],
      ['s7', 's6'],
      ['s5', 's4'],
      ['s3', 's2'],
      ['s1', 's0'],
    ]);
  });

  it('spreads the remainder deterministically when n is not divisible by 5', () => {
    // 23 = 4/5/5/4/5 under floor(i x n / 5) boundaries: 0,4,9,13,18,23.
    const items = Array.from({ length: 23 }, (_, i) => member(`s${String(i).padStart(2, '0')}`, i, 0));
    const { buckets } = assignQuintiles(items, value, key);
    expect(buckets.map((b) => b.length)).toEqual([4, 5, 4, 5, 5]);
    expect(buckets.flat()).toHaveLength(23);
  });

  it('handles n < 5 by leaving buckets empty rather than duplicating members', () => {
    const items = [member('a', 3, 0), member('b', 2, 0), member('c', 1, 0)];
    const { buckets } = assignQuintiles(items, value, key);
    expect(buckets.flat().map((m) => m.schemeCode)).toEqual(['a', 'b', 'c']);
    expect(buckets.map((b) => b.length).reduce((x, y) => x + y, 0)).toBe(3);
  });

  it('breaks ties by key so two runs on the same data bucket identically', () => {
    const forward = [member('zz', 5, 0), member('aa', 5, 0), member('mm', 5, 0)];
    const reversed = [...forward].reverse();
    const a = assignQuintiles(forward, value, key);
    const b = assignQuintiles(reversed, value, key);
    expect(a.buckets.flat().map((m) => m.schemeCode)).toEqual(['aa', 'mm', 'zz']);
    expect(b.buckets.flat().map((m) => m.schemeCode)).toEqual(['aa', 'mm', 'zz']);
  });

  it('counts a tie that a bucket boundary cut through', () => {
    // 10 items, all identical: every one of the 4 internal boundaries cuts a tie.
    const items = Array.from({ length: 10 }, (_, i) => member(`s${i}`, 50, 0));
    expect(assignQuintiles(items, value, key).boundaryTies).toBe(4);
  });

  it('reports no boundary ties when every boundary separates distinct values', () => {
    const items = Array.from({ length: 10 }, (_, i) => member(`s${i}`, i, 0));
    expect(assignQuintiles(items, value, key).boundaryTies).toBe(0);
  });

  it('is exact on decimals a float would collapse', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE-754; these must stay distinct and ordered.
    const items = [
      member('a', '0.3', 0),
      member('b', d('0.1').plus(d('0.2')).toString(), 0),
      member('c', '0.30000000000000004', 0),
    ];
    const { buckets } = assignQuintiles(items, value, key);
    // 'c' is genuinely the largest; a and b are exactly equal so key ordering wins.
    expect(buckets.flat().map((m) => m.schemeCode)).toEqual(['c', 'a', 'b']);
  });
});

// ---------------------------------------------------------------------------
// 2. Spread / monotonicity / hit rate against a hand-computed fixture
// ---------------------------------------------------------------------------

describe('monthOutcome and aggregate', () => {
  /**
   * 10 funds, composites 100..10 descending, forward CAGRs chosen so each
   * quintile's mean is hand-computable:
   *
   *   Q1: 0.20, 0.18 -> 0.19      Q4: 0.08, 0.06 -> 0.07
   *   Q2: 0.16, 0.14 -> 0.15      Q5: 0.04, 0.02 -> 0.03
   *   Q3: 0.12, 0.10 -> 0.11
   *
   * Spread = 0.19 - 0.03 = 0.16 exactly.
   */
  function monotonicMonth(): UniverseMonth {
    const forwards = ['0.20', '0.18', '0.16', '0.14', '0.12', '0.10', '0.08', '0.06', '0.04', '0.02'];
    return universeMonth(
      forwards.map((f, i) =>
        member(`s${String(i).padStart(2, '0')}`, 100 - i * 10, f, {
          drawdown: `-0.${10 + i * 2}`,
        }),
      ),
    );
  }

  it('computes quintile means and the Q1-Q5 spread exactly', () => {
    const out = monthOutcome(monotonicMonth());
    expect(out.n).toBe(10);
    expect(out.quintiles.map((q) => q.meanForwardCagr?.toString())).toEqual([
      '0.19',
      '0.15',
      '0.11',
      '0.07',
      '0.03',
    ]);
    expect(out.spread?.toString()).toBe('0.16');
    expect(out.monotonic).toBe(true);
    expect(out.adjacentPairsInOrder).toBe(4);
    expect(out.adjacentPairsComparable).toBe(4);
  });

  it('detects a non-monotonic month and counts the ordered pairs', () => {
    // Swap Q2 and Q3 outcomes: Q1 > Q3 < Q2 breaks one adjacent pair... two,
    // in fact: (Q2,Q3) is inverted and (Q1,Q2) still holds.
    const forwards = ['0.20', '0.18', '0.08', '0.06', '0.16', '0.14', '0.12', '0.10', '0.04', '0.02'];
    const month = universeMonth(
      forwards.map((f, i) => member(`s${String(i).padStart(2, '0')}`, 100 - i * 10, f)),
    );
    const out = monthOutcome(month);
    expect(out.quintiles.map((q) => q.meanForwardCagr?.toString())).toEqual([
      '0.19',
      '0.07',
      '0.15',
      '0.11',
      '0.03',
    ]);
    expect(out.monotonic).toBe(false);
    // (Q1 >= Q2) and (Q3 >= Q4) and (Q4 >= Q5) hold; only (Q2 >= Q3) is inverted.
    expect(out.adjacentPairsInOrder).toBe(3);
    expect(out.spread?.toString()).toBe('0.16');
  });

  it('ranks by a pillar in isolation when asked, dropping unscoreable members', () => {
    // PERFORMANCE is deliberately the *inverse* of the composite ordering, so
    // a pillar view that silently reused the composite ranking would produce
    // the composite's answer and pass unnoticed.
    const forwards = ['0.20', '0.18', '0.16', '0.14', '0.12', '0.10', '0.08', '0.06', '0.04', '0.02'];
    const ranked = forwards.map((f, i) =>
      member(`s${String(i).padStart(2, '0')}`, 100 - i * 10, f, {
        pillars: { PERFORMANCE: d((i + 1) / 10) },
      }),
    );
    const unscoreable = member('znull', 5, '0.99', { pillars: { PERFORMANCE: null } });
    const month = universeMonth([...ranked, unscoreable]);

    const byComposite = monthOutcome(month);
    expect(byComposite.n).toBe(11);
    expect(byComposite.quintiles[0]?.meanForwardCagr?.toString()).toBe('0.19');

    const byPillar = monthOutcome(month, (m) => m.pillars.PERFORMANCE ?? null);
    // 'znull' has no PERFORMANCE score: dropped, never defaulted to the median.
    expect(byPillar.n).toBe(10);
    // Top pillar scores are s09 (1.0) and s08 (0.9) — the composite's worst.
    expect(byPillar.quintiles[0]?.meanForwardCagr?.toString()).toBe('0.03');
  });

  it('computes hit rate as the share of months with a positive spread', () => {
    const good = monthOutcome(monotonicMonth());
    const flipped = monthOutcome(
      universeMonth(
        ['0.02', '0.04', '0.06', '0.08', '0.10', '0.12', '0.14', '0.16', '0.18', '0.20'].map(
          (f, i) => member(`s${String(i).padStart(2, '0')}`, 100 - i * 10, f),
        ),
      ),
    );

    const agg = aggregate([good, good, good, flipped]);
    expect(agg.months).toBe(4);
    expect(agg.hitRate?.toString()).toBe('0.75');
    expect(agg.monotonicMonthRate?.toString()).toBe('0.75');
    // Mean of 0.16, 0.16, 0.16, -0.16 = 0.08.
    expect(agg.meanSpread?.toString()).toBe('0.08');
  });

  it('reports the drawdown criterion as Q1 not worse than Q5, and null when unknown', () => {
    // Drawdowns are negative; Q1 mean is -0.11, Q5 mean is -0.27, so Q1 is
    // *better* and the criterion passes.
    const agg = aggregate([monthOutcome(monotonicMonth())]);
    expect(agg.q1MeanForwardDrawdown?.toString()).toBe('-0.11');
    expect(agg.q5MeanForwardDrawdown?.toString()).toBe('-0.27');
    expect(agg.drawdownAcceptable).toBe(true);

    const noDrawdowns = aggregate([
      monthOutcome(
        universeMonth(
          Array.from({ length: 10 }, (_, i) => member(`s${i}`, 100 - i * 10, '0.10')),
        ),
      ),
    ]);
    // Unknown is never a pass.
    expect(noDrawdowns.drawdownAcceptable).toBeNull();
  });

  it('returns nulls rather than zeros for an empty run', () => {
    const agg = aggregate([]);
    expect(agg.months).toBe(0);
    expect(agg.hitRate).toBeNull();
    expect(agg.meanSpread).toBeNull();
    expect(agg.drawdownAcceptable).toBeNull();
  });

  it('exposes the 65% acceptance threshold as a comparable Decimal', () => {
    const at65 = aggregate(
      Array.from({ length: 20 }, (_, i) =>
        monthOutcome(
          universeMonth(
            Array.from({ length: 10 }, (_, j) =>
              member(`s${j}`, 100 - j * 10, i < 13 ? `0.${20 - j}` : `0.${10 + j}`),
            ),
          ),
        ),
      ),
    );
    expect(at65.hitRate?.toString()).toBe('0.65');
    expect(at65.hitRate?.greaterThanOrEqualTo(ACCEPTANCE.minHitRate)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Regression
// ---------------------------------------------------------------------------

describe('olsSlope', () => {
  it('recovers a known slope and intercept exactly on a noiseless line', () => {
    // y = 0.0025x + 0.01
    const points = [-40, -20, 0, 20, 40].map((x) => ({
      x: d(x),
      y: d(x).times('0.0025').plus('0.01'),
    }));
    const r = olsSlope(points);
    expect(r.n).toBe(5);
    expect(r.slope?.toString()).toBe('0.0025');
    expect(r.intercept?.toString()).toBe('0.01');
    expect(r.r2?.toString()).toBe('1');
  });

  it('recovers the least-squares slope on a scatter with a hand-checked answer', () => {
    // x centred at 0: Sxy / Sxx = ((-2)(-3) + (-1)(-1) + 0 + 1*2 + 2*4) / 10
    //                            = (6 + 1 + 0 + 2 + 8) / 10 = 1.7
    const xs = [-2, -1, 0, 1, 2];
    const ys = [-3, -1, 0, 2, 4];
    const r = olsSlope(xs.map((x, i) => ({ x: d(x), y: d(ys[i]!) })));
    expect(r.slope?.toString()).toBe('1.7');
    expect(r.n).toBe(5);
  });

  it('refuses a slope when every composite gap is identical', () => {
    const r = olsSlope([
      { x: d(0), y: d('0.1') },
      { x: d(0), y: d('0.2') },
      { x: d(0), y: d('0.3') },
    ]);
    // Not 0 — "the score does not predict returns" and "this run never varied
    // the score" are different statements.
    expect(r.slope).toBeNull();
    expect(r.xVariance?.isZero()).toBe(true);
  });

  it('refuses a slope from fewer than two points', () => {
    expect(olsSlope([]).slope).toBeNull();
    expect(olsSlope([{ x: d(1), y: d(1) }]).slope).toBeNull();
  });

  it('differences both axes against the universe-month median', () => {
    const month = universeMonth([
      member('a', 80, '0.20'),
      member('b', 60, '0.14'),
      member('c', 40, '0.08'),
    ]);
    // Medians: composite 60, forward 0.14.
    expect(regressionPointsFor(month).map((p) => [p.x.toString(), p.y.toString()])).toEqual([
      ['20', '0.06'],
      ['0', '0'],
      ['-20', '-0.06'],
    ]);
    // The slope of that is 0.06/20 = 0.003 per composite point.
    expect(olsSlope(regressionPointsFor(month)).slope?.toString()).toBe('0.003');
  });

  it('produces no regression points for a universe of one', () => {
    expect(regressionPointsFor(universeMonth([member('a', 50, '0.1')]))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Forward outcome
// ---------------------------------------------------------------------------

describe('forwardOutcome', () => {
  function series(points: Array<[string, string]>) {
    return points.map(([date, value]) => ({ date: new Date(`${date}T00:00:00.000Z`), value: d(value) }));
  }

  it('annualises a complete forward window', () => {
    // 100 -> 133.1 over 3 years is exactly 10% a year.
    const s = series([
      ['2018-06-30', '100'],
      ['2019-06-30', '110'],
      ['2020-06-30', '121'],
      ['2021-06-30', '133.1'],
    ]);
    const out = forwardOutcome(s, new Date('2018-06-30T00:00:00.000Z'), 3);
    expect(out.reason).toBe('ok');
    expect(out.forwardCagr?.toFixed(10)).toBe(d('0.1').toFixed(10));
  });

  it('refuses to annualise a truncated window instead of using the last NAV', () => {
    // Series stops 14 months in — the shape of a fund that wound up. Using its
    // last NAV would delete the worst outcomes from the backtest.
    const s = series([
      ['2018-06-30', '100'],
      ['2019-08-31', '60'],
    ]);
    const out = forwardOutcome(s, new Date('2018-06-30T00:00:00.000Z'), 3);
    expect(out.reason).toBe('no_end_point');
    expect(out.forwardCagr).toBeNull();
  });

  it('refuses when the window start has no NAV within tolerance', () => {
    const s = series([
      ['2018-04-01', '100'],
      ['2021-06-30', '133.1'],
    ]);
    const out = forwardOutcome(s, new Date('2018-06-30T00:00:00.000Z'), 3);
    expect(out.reason).toBe('no_start_point');
  });

  it('measures the drawdown inside the forward window from the daily series', () => {
    const s = series([
      ['2018-06-30', '100'],
      ['2019-03-31', '60'],
      ['2020-06-30', '110'],
      ['2021-06-30', '133.1'],
    ]);
    const out = forwardOutcome(s, new Date('2018-06-30T00:00:00.000Z'), 3);
    expect(out.forwardMaxDrawdown?.toFixed(4)).toBe('-0.4000');
  });
});

// ---------------------------------------------------------------------------
// 5. Small statistics
// ---------------------------------------------------------------------------

describe('mean and median', () => {
  it('return null, never zero, for an empty set', () => {
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
  });

  it('average the two middle values for an even-length set', () => {
    expect(median([d(1), d(2), d(3), d(4)])?.toString()).toBe('2.5');
  });

  it('are exact where a float mean would drift', () => {
    expect(mean([d('0.1'), d('0.2'), d('0.3')])?.toString()).toBe('0.2');
  });
});

// ---------------------------------------------------------------------------
// 6. THE REFUSAL PATH
// ---------------------------------------------------------------------------

describe('checkPreconditions — refusal on thin data', () => {
  it('refuses an empty database with every reason named at once', () => {
    const empty: BacktestCoverage = {
      scoredMonths: 0,
      gateModelMonths: 0,
      quintileEligibleUniverseMonths: 0,
      tooSmallUniverseMonths: 0,
      distinctSchemes: 0,
      gateModelDistinctSchemes: 0,
      regressionObservations: 0,
      regressionXVariance: null,
      deadSchemesInWindow: 0,
      deadSchemesRanked: 0,
    };
    const report = checkPreconditions(empty);
    expect(report.ok).toBe(false);

    const codes = report.failures.map((f) => f.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'INSUFFICIENT_MONTHS',
        'INSUFFICIENT_GATE_MODEL_MONTHS',
        'NO_QUINTILE_ELIGIBLE_UNIVERSE',
        'INSUFFICIENT_DISTINCT_SCHEMES',
        'INSUFFICIENT_GATE_MODEL_SCHEMES',
        'INSUFFICIENT_REGRESSION_OBSERVATIONS',
      ]),
    );

    // Every failure must be actionable: what was required, what was seen, and
    // what would fix it. A refusal the operator cannot act on is just a crash.
    for (const f of report.failures) {
      expect(f.requirement.length).toBeGreaterThan(0);
      expect(f.observed.length).toBeGreaterThan(0);
      expect(f.remedy.length).toBeGreaterThan(0);
    }
  });

  it('refuses eight months of history even when everything else looks healthy', () => {
    // The scenario the script header names: a confident number from a handful
    // of months would be worse than no number.
    const thin: BacktestCoverage = { ...healthyCoverage(), scoredMonths: 8, gateModelMonths: 8 };
    const report = checkPreconditions(thin);
    expect(report.ok).toBe(false);
    expect(report.failures.map((f) => f.code)).toEqual([
      'INSUFFICIENT_MONTHS',
      'INSUFFICIENT_GATE_MODEL_MONTHS',
    ]);
    expect(report.failures[0]?.observed).toBe('8');
  });

  it('refuses when only non-gate models have history', () => {
    // 72 months, but none of them ACTIVE_EQUITY: the 06 §3 acceptance
    // threshold is written for that model and has not been tested.
    const report = checkPreconditions({
      ...healthyCoverage(),
      gateModelMonths: 0,
      gateModelDistinctSchemes: 0,
    });
    expect(report.ok).toBe(false);
    expect(report.failures.map((f) => f.code)).toEqual([
      'INSUFFICIENT_GATE_MODEL_MONTHS',
      'INSUFFICIENT_GATE_MODEL_SCHEMES',
    ]);
  });

  it('refuses a cross-section too narrow to be a cross-section', () => {
    const report = checkPreconditions({ ...healthyCoverage(), distinctSchemes: 15 });
    expect(report.failures.map((f) => f.code)).toEqual(['INSUFFICIENT_DISTINCT_SCHEMES']);
  });

  it('refuses a regression built from too few observations', () => {
    const report = checkPreconditions({ ...healthyCoverage(), regressionObservations: 40 });
    expect(report.failures.map((f) => f.code)).toEqual(['INSUFFICIENT_REGRESSION_OBSERVATIONS']);
    expect(report.failures[0]?.remedy).toMatch(/sell a real fund/);
  });

  it('refuses a degenerate regression where every composite was identical', () => {
    const report = checkPreconditions({ ...healthyCoverage(), regressionXVariance: d(0) });
    expect(report.failures.map((f) => f.code)).toEqual(['DEGENERATE_REGRESSION']);
  });

  it('refuses a survivorship-biased run: dead funds exist but were never ranked', () => {
    const report = checkPreconditions({ ...healthyCoverage(), deadSchemesRanked: 0 });
    expect(report.ok).toBe(false);
    expect(report.failures.map((f) => f.code)).toEqual(['SURVIVORSHIP_BIAS']);
    expect(report.failures[0]?.observed).toMatch(/34 such schemes/);
  });

  it('does not flag survivorship when the metadata knows of no dead funds', () => {
    const report = checkPreconditions({
      ...healthyCoverage(),
      deadSchemesInWindow: 0,
      deadSchemesRanked: 0,
    });
    expect(report.ok).toBe(true);
  });

  it('passes only when every precondition is met', () => {
    expect(checkPreconditions(healthyCoverage())).toEqual({ ok: true, failures: [] });
  });

  it('is boundary-exact: one short refuses, exactly at the threshold passes', () => {
    const atThreshold: BacktestCoverage = {
      ...healthyCoverage(),
      scoredMonths: PRECONDITIONS.minScoredMonths,
      gateModelMonths: PRECONDITIONS.minGateModelMonths,
      distinctSchemes: PRECONDITIONS.minDistinctSchemes,
      gateModelDistinctSchemes: PRECONDITIONS.minGateModelDistinctSchemes,
      regressionObservations: PRECONDITIONS.minRegressionObservations,
    };
    expect(checkPreconditions(atThreshold).ok).toBe(true);

    expect(
      checkPreconditions({ ...atThreshold, scoredMonths: PRECONDITIONS.minScoredMonths - 1 }).ok,
    ).toBe(false);
    expect(
      checkPreconditions({
        ...atThreshold,
        regressionObservations: PRECONDITIONS.minRegressionObservations - 1,
      }).ok,
    ).toBe(false);
  });

  it('lets a caller tighten thresholds without touching production calibration', () => {
    const stricter = { ...PRECONDITIONS, minScoredMonths: 500 };
    expect(checkPreconditions(healthyCoverage(), stricter).ok).toBe(false);
    expect(checkPreconditions(healthyCoverage()).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. Report rendering
// ---------------------------------------------------------------------------

describe('report rendering', () => {
  const ctx: ReportContext = {
    runDate: new Date('2026-09-07T00:00:00.000Z'),
    firstMonth: new Date('2016-01-31T00:00:00.000Z'),
    lastMonth: new Date('2023-06-30T00:00:00.000Z'),
    monthsAttempted: 90,
    forwardYears: 3,
    metricStalenessDays: 10,
    gateVersionLabel: 'score-active-equity-v1',
  };

  function monotonicMonth(): UniverseMonth {
    const forwards = ['0.20', '0.18', '0.16', '0.14', '0.12', '0.10', '0.08', '0.06', '0.04', '0.02'];
    return universeMonth(
      forwards.map((f, i) =>
        member(`s${String(i).padStart(2, '0')}`, 100 - i * 10, f, {
          drawdown: `-0.${10 + i * 2}`,
          pillars: { PERFORMANCE: d((10 - i) / 10) },
        }),
      ),
    );
  }

  it('renders a refusal with the banner and no coefficient anywhere in it', () => {
    const coverage: BacktestCoverage = {
      ...healthyCoverage(),
      scoredMonths: 0,
      gateModelMonths: 0,
      quintileEligibleUniverseMonths: 0,
      distinctSchemes: 0,
      gateModelDistinctSchemes: 0,
      regressionObservations: 0,
      regressionXVariance: null,
    };
    const gate = checkPreconditions(coverage);
    const md = renderRefusalReport({ ...ctx, lastMonth: null }, coverage, gate);

    expect(md).toContain(REFUSAL_BANNER);
    expect(md.indexOf(REFUSAL_BANNER)).toBeLessThan(120); // banner is at the top, not buried
    expect(md).toContain('INSUFFICIENT_MONTHS');
    expect(md).toContain('(no NAV history)');

    // The whole point of refusing: no slope, no edit, nothing a reader could
    // mistake for a shippable number.
    expect(md).not.toContain('REPLACEMENT_EXPECTED_EDGE: Decimal');
    expect(md).not.toContain('Slope (annual return per composite point)');
    expect(md).not.toMatch(/Hit rate/);
  });

  it('renders every precondition failure as an actionable row', () => {
    const coverage = { ...healthyCoverage(), deadSchemesRanked: 0 };
    const gate = checkPreconditions(coverage);
    const md = renderRefusalReport(ctx, coverage, gate);
    expect(md).toContain('`SURVIVORSHIP_BIAS`');
    expect(md).toContain('34 such schemes');
    expect(md.split('\n').filter((l) => l.startsWith('| 1 |'))).toHaveLength(1);
  });

  it('renders a passing model report with the acceptance verdict and the exact edit', () => {
    const outcomes = Array.from({ length: 70 }, () => monthOutcome(monotonicMonth()));
    const regression = olsSlope(
      [-40, -20, 0, 20, 40].map((x) => ({ x: d(x), y: d(x).times('0.0025') })),
    );
    const md = renderModelReport(ctx, {
      modelKey: 'ACTIVE_EQUITY',
      methodologyVersion: 'score-active-equity-v1',
      universeMonths: 70,
      compositeOutcomes: outcomes,
      pillarOutcomes: new Map([
        [
          'PERFORMANCE',
          Array.from({ length: 70 }, () =>
            monthOutcome(monotonicMonth(), (m) => m.pillars.PERFORMANCE ?? null),
          ),
        ],
      ]),
      regression,
      missingInputs: ['amcQualitativeScore'],
      coverage: healthyCoverage(),
      preconditionsOk: true,
    });

    expect(md).toContain('# MF score backtest — score-active-equity-v1');
    expect(md).toContain('**Acceptance met.**');
    expect(md).toContain('| Q1 − Q5 spread > 0 | ≥ 65% of months | 100.00% | YES |');
    expect(md).toContain("new Decimal('0.00250000')");
    expect(md).toContain('NOT applied by the script');
    expect(md).toContain('`amcQualitativeScore`');
    expect(md).not.toContain(REFUSAL_BANNER);
  });

  it('says acceptance was NOT met rather than shipping a non-discriminating score', () => {
    const flipped = monthOutcome(
      universeMonth(
        ['0.02', '0.04', '0.06', '0.08', '0.10', '0.12', '0.14', '0.16', '0.18', '0.20'].map(
          (f, i) => member(`s${String(i).padStart(2, '0')}`, 100 - i * 10, f, { drawdown: '-0.2' }),
        ),
      ),
    );
    const md = renderModelReport(ctx, {
      modelKey: 'ACTIVE_EQUITY',
      methodologyVersion: 'score-active-equity-v1',
      universeMonths: 60,
      compositeOutcomes: Array.from({ length: 60 }, () => flipped),
      pillarOutcomes: new Map(),
      regression: olsSlope([
        { x: d(-10), y: d('0.01') },
        { x: d(10), y: d('-0.01') },
      ]),
      missingInputs: [],
      coverage: healthyCoverage(),
      preconditionsOk: true,
    });
    expect(md).toContain('**Acceptance NOT met.**');
    expect(md).toContain('do not ship a score that does not discriminate');
  });

  it('withholds the constants.ts edit when the preconditions did not pass', () => {
    const md = renderModelReport(ctx, {
      modelKey: 'ACTIVE_EQUITY',
      methodologyVersion: 'score-active-equity-v1',
      universeMonths: 3,
      compositeOutcomes: [monthOutcome(monotonicMonth())],
      pillarOutcomes: new Map(),
      regression: olsSlope([
        { x: d(-10), y: d('-0.01') },
        { x: d(10), y: d('0.01') },
      ]),
      missingInputs: [],
      coverage: healthyCoverage(),
      preconditionsOk: false,
    });
    expect(md).not.toContain('REPLACEMENT_EXPECTED_EDGE: Decimal');
  });

  it('marks a non-gate model as informational, never as a shipping gate', () => {
    const md = renderModelReport(ctx, {
      modelKey: 'DEBT_DURATION',
      methodologyVersion: 'score-debt-duration-v1',
      universeMonths: 40,
      compositeOutcomes: [monthOutcome(monotonicMonth())],
      pillarOutcomes: new Map(),
      regression: olsSlope([]),
      missingInputs: [],
      coverage: healthyCoverage(),
      preconditionsOk: true,
    });
    expect(md).toContain('not as a shipping gate');
    expect(md).not.toContain('**Acceptance met.**');
    // A null slope must render as an em dash, never as 0.
    expect(md).toContain('| Slope (annual return per composite point) | — |');
  });
});
