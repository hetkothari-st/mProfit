import { describe, it, expect } from 'vitest';
import {
  percentileOf,
  rankBucket,
  scoreBucket,
  type ScoringInput,
} from '../../../../src/services/advisor/fundRanking/scoring.js';
import type {
  FundMetrics,
  MethodologyConfig,
} from '../../../../src/services/advisor/fundRanking/types.js';

/**
 * The two claims this file exists to defend:
 *   - a tracker is ranked on cost and fidelity, never on how much it returned;
 *   - a missing metric costs a fund nothing except that metric's influence.
 */

const CONFIG: MethodologyConfig = {
  eligibility: {
    minTrackRecordYearsActive: 3,
    minTrackRecordYearsPassive: 1,
    minAumInr: 0,
    requireDirectPlan: true,
    requireGrowthOption: true,
    requireOpenEnded: true,
    maxNavStalenessDays: 10,
  },
  metrics: { rollingReturnYears: 3, rollingStepMonths: 1, minRollingWindows: 12, riskFreeRatePct: 6.5 },
  scoringActive: {
    rollingOutperformanceConsistency: 30,
    downsideCapture: 25,
    sortino: 20,
    ter: 15,
    managerTenure: 10,
  },
  scoringPassive: { ter: 40, trackingDifference: 30, trackingError: 20, aum: 10 },
  selection: {
    incumbentRankBand: 5,
    hysteresisMarginPct: 5,
    hysteresisSnapshots: 3,
    maxAmcSharePct: 40,
    overlapPenaltyPerPct: 0.5,
    maxOverlapPct: 40,
  },
  snapshotMaxAgeDays: 3,
};

function metrics(over: Partial<FundMetrics> = {}): FundMetrics {
  return {
    rollingReturnsPct: [],
    outperformanceConsistencyPct: null,
    downsideCapturePct: null,
    sortino: null,
    maxDrawdownPct: null,
    trackingDifferencePct: null,
    trackingErrorPct: null,
    trackingIsPeerRelative: false,
    observations: 36,
    ...over,
  };
}

function passive(schemeCode: string, over: Partial<ScoringInput> = {}): ScoringInput {
  return {
    schemeCode,
    passive: true,
    terPct: 0.2,
    aumInr: 10_000_000_000,
    managerTenureYears: null,
    metrics: metrics({ trackingDifferencePct: -0.3, trackingErrorPct: 0.15 }),
    ...over,
  };
}

function active(schemeCode: string, over: Partial<ScoringInput> = {}): ScoringInput {
  return {
    schemeCode,
    passive: false,
    terPct: 1.0,
    aumInr: 10_000_000_000,
    managerTenureYears: 5,
    metrics: metrics({ outperformanceConsistencyPct: 60, downsideCapturePct: 85, sortino: 1.2 }),
    ...over,
  };
}

describe('percentileOf', () => {
  it('orients so higher is better for both directions', () => {
    expect(percentileOf(10, [10, 5, 1], true)).toBe(100);
    expect(percentileOf(10, [10, 5, 1], false)).toBe(0);
  });

  it('gives tied values the same percentile', () => {
    const pop = [5, 5, 1];
    expect(percentileOf(5, pop, true)).toBe(percentileOf(5, pop, true));
  });

  it('is neutral when there is nothing to compare against', () => {
    expect(percentileOf(1, [1], true)).toBe(50);
  });
});

describe('passive scoring', () => {
  // The claim: a tracker that returned more is not a better tracker. Two funds
  // identical on cost and fidelity must tie however different their returns.
  it('ignores past returns entirely', () => {
    const cheapHighReturn = passive('A', {
      metrics: metrics({
        trackingDifferencePct: -0.3,
        trackingErrorPct: 0.15,
        rollingReturnsPct: [22, 24, 26],
      }),
    });
    const cheapLowReturn = passive('B', {
      metrics: metrics({
        trackingDifferencePct: -0.3,
        trackingErrorPct: 0.15,
        rollingReturnsPct: [4, 3, 2],
      }),
    });
    const [a, b] = scoreBucket([cheapHighReturn, cheapLowReturn], 'EQUITY_DOMESTIC', CONFIG);
    expect(a!.score).toBe(b!.score);
  });

  it('prefers the cheaper, closer tracker', () => {
    const good = passive('GOOD', { terPct: 0.1 });
    const dear = passive('DEAR', { terPct: 0.9, metrics: metrics({ trackingDifferencePct: -1.4, trackingErrorPct: 0.9 }) });
    const ranked = rankBucket(scoreBucket([good, dear], 'EQUITY_DOMESTIC', CONFIG));
    expect(ranked.find((r) => r.schemeCode === 'GOOD')!.rankInBucket).toBe(1);
  });

  // Drift in either direction is a tracking failure: "beating" the index by
  // 2% means it is not tracking it.
  it('penalises overshoot as much as undershoot', () => {
    const under = passive('UNDER', { metrics: metrics({ trackingDifferencePct: -2, trackingErrorPct: 0.2 }) });
    const over = passive('OVER', { metrics: metrics({ trackingDifferencePct: 2, trackingErrorPct: 0.2 }) });
    const [u, o] = scoreBucket([under, over], 'EQUITY_DOMESTIC', CONFIG);
    expect(u!.score).toBe(o!.score);
  });
});

describe('active scoring', () => {
  it('rewards consistency and downside protection', () => {
    const steady = active('STEADY', {
      metrics: metrics({ outperformanceConsistencyPct: 80, downsideCapturePct: 70, sortino: 1.5 }),
    });
    const erratic = active('ERRATIC', {
      metrics: metrics({ outperformanceConsistencyPct: 35, downsideCapturePct: 115, sortino: 0.4 }),
    });
    const ranked = rankBucket(scoreBucket([steady, erratic], 'EQUITY_DOMESTIC', CONFIG));
    expect(ranked.find((r) => r.schemeCode === 'STEADY')!.rankInBucket).toBe(1);
  });

  it('never lets a trailing one-year number in — there is no such input', () => {
    const inputs = [active('A'), active('B')];
    const scored = scoreBucket(inputs, 'EQUITY_DOMESTIC', CONFIG);
    for (const s of scored) {
      expect(s.components.map((c) => c.metric)).not.toContain('trailingOneYear');
      expect(s.components.map((c) => c.metric)).not.toContain('rollingReturns');
    }
  });
});

describe('data gaps', () => {
  it('redistributes a missing metric rather than scoring it zero', () => {
    // Both funds are identical except one has no TER on file. If the gap were
    // treated as zero the unknown fund would rank last; it must instead be
    // scored on what is known.
    const known = active('KNOWN');
    const unknown = active('UNKNOWN', { terPct: null });
    const scored = scoreBucket([known, unknown], 'EQUITY_DOMESTIC', CONFIG);
    const gapFund = scored.find((s) => s.schemeCode === 'UNKNOWN')!;

    expect(gapFund.dataGaps.map((g) => g.metric)).toContain('ter');
    expect(gapFund.dataGaps.find((g) => g.metric === 'ter')!.weightReleased).toBe(15);
    expect(gapFund.components.map((c) => c.metric)).not.toContain('ter');
    // Scored on the surviving metrics, where it is identical to its peer.
    expect(gapFund.score).toBe(scored.find((s) => s.schemeCode === 'KNOWN')!.score);
  });

  it('records every absent metric as a gap', () => {
    const bare = active('BARE', {
      terPct: null,
      managerTenureYears: null,
      metrics: metrics({ outperformanceConsistencyPct: 55, downsideCapturePct: null, sortino: null }),
    });
    const [scored] = scoreBucket([bare, active('OTHER')], 'EQUITY_DOMESTIC', CONFIG);
    expect(scored!.dataGaps.map((g) => g.metric).sort()).toEqual([
      'downsideCapture',
      'managerTenure',
      'sortino',
      'ter',
    ]);
  });

  it('scores nothing when every metric is missing', () => {
    const empty = active('EMPTY', {
      terPct: null,
      managerTenureYears: null,
      metrics: metrics(),
    });
    const [scored] = scoreBucket([empty], 'EQUITY_DOMESTIC', CONFIG);
    expect(scored!.score).toBeNull();
  });
});

describe('ranking', () => {
  it('ranks best first and leaves the unscoreable unranked', () => {
    const ranked = rankBucket(
      scoreBucket(
        [
          active('BEST', { metrics: metrics({ outperformanceConsistencyPct: 90, downsideCapturePct: 60, sortino: 2 }) }),
          active('WORST', { metrics: metrics({ outperformanceConsistencyPct: 20, downsideCapturePct: 130, sortino: 0.1 }) }),
          active('NOTHING', { terPct: null, managerTenureYears: null, metrics: metrics() }),
        ],
        'EQUITY_DOMESTIC',
        CONFIG,
      ),
    );
    expect(ranked.find((r) => r.schemeCode === 'BEST')!.rankInBucket).toBe(1);
    expect(ranked.find((r) => r.schemeCode === 'WORST')!.rankInBucket).toBe(2);
    expect(ranked.find((r) => r.schemeCode === 'NOTHING')!.rankInBucket).toBeNull();
  });

  it('breaks ties deterministically, so two runs rank identically', () => {
    const first = rankBucket(scoreBucket([active('BBB'), active('AAA')], 'EQUITY_DOMESTIC', CONFIG));
    const second = rankBucket(scoreBucket([active('AAA'), active('BBB')], 'EQUITY_DOMESTIC', CONFIG));
    const rankOf = (rows: typeof first, code: string) =>
      rows.find((r) => r.schemeCode === code)!.rankInBucket;
    expect(rankOf(first, 'AAA')).toBe(rankOf(second, 'AAA'));
    expect(rankOf(first, 'BBB')).toBe(rankOf(second, 'BBB'));
  });
});
