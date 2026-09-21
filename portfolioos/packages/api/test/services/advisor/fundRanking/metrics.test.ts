import { describe, it, expect } from 'vitest';
import {
  annualisedReturnPct,
  downsideCapturePct,
  maxDrawdownPct,
  monthlyReturnsPct,
  outperformanceConsistencyPct,
  rollingReturnsPct,
  sortino,
  toMonthEnds,
  trackingMetrics,
} from '../../../../src/services/advisor/fundRanking/metrics.js';
import type { NavObservation } from '../../../../src/services/advisor/fundRanking/types.js';

const ASOF = new Date('2026-09-21T00:00:00Z');

/** Month-end NAVs compounding at a fixed monthly rate, so every derived figure
 *  can be checked by hand rather than against a previous run of this code. */
function compounding(months: number, monthlyPct: number, start = 100): NavObservation[] {
  const out: NavObservation[] = [];
  let nav = start;
  for (let i = months; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(2026, 8 - i, 20));
    out.push({ date: d.toISOString().slice(0, 10), nav: Number(nav.toFixed(6)) });
    nav *= 1 + monthlyPct / 100;
  }
  return out;
}

describe('toMonthEnds', () => {
  it('keeps the last observation of each month and drops bad points', () => {
    const months = toMonthEnds(
      [
        { date: '2026-07-01', nav: 10 },
        { date: '2026-07-31', nav: 11 },
        { date: '2026-08-31', nav: 12 },
        { date: '2026-08-15', nav: 99 },
        { date: 'not-a-date', nav: 5 },
        { date: '2026-09-30', nav: 0 },
      ],
      ASOF,
    );
    expect(months.map((m) => m.nav)).toEqual([11, 12]);
  });

  it('ignores anything after asOf — no looking into the future', () => {
    const months = toMonthEnds(
      [
        { date: '2026-08-31', nav: 12 },
        { date: '2026-12-31', nav: 20 },
      ],
      ASOF,
    );
    expect(months).toHaveLength(1);
  });
});

describe('returns', () => {
  it('annualises a 1%-a-month series to about 12.68%', () => {
    // (1.01^12 − 1) = 12.6825%
    const r = annualisedReturnPct(compounding(36, 1), ASOF);
    expect(r).toBeCloseTo(12.68, 1);
  });

  it('gives one rolling window per month once the window fits', () => {
    // 48 months of history, 3-year window → 13 windows (months 36..48).
    const windows = rollingReturnsPct(compounding(48, 1), ASOF, 3, 1);
    expect(windows).toHaveLength(13);
    for (const w of windows) expect(w).toBeCloseTo(12.68, 1);
  });

  it('returns nothing when the history is shorter than the window', () => {
    expect(rollingReturnsPct(compounding(20, 1), ASOF, 3, 1)).toEqual([]);
  });

  it('computes monthly returns', () => {
    const m = monthlyReturnsPct(compounding(6, 2), ASOF);
    expect(m).toHaveLength(6);
    for (const r of m) expect(r).toBeCloseTo(2, 6);
  });
});

describe('risk', () => {
  it('measures the worst peak-to-trough fall', () => {
    const series: NavObservation[] = [
      { date: '2026-01-31', nav: 100 },
      { date: '2026-02-28', nav: 120 },
      { date: '2026-03-31', nav: 90 }, // −25% from the 120 peak
      { date: '2026-04-30', nav: 110 },
    ];
    expect(maxDrawdownPct(series, ASOF)).toBeCloseTo(25, 6);
  });

  it('has no Sortino when nothing fell below the target', () => {
    // A perfectly smooth 2%/month series never dips under the monthly
    // risk-free target, so downside deviation is undefined — not zero.
    expect(sortino(monthlyReturnsPct(compounding(24, 2), ASOF), 6.5)).toBeNull();
  });

  it('scores a fund that falls less than its peers below 100', () => {
    const fund = [-1, -2, 1, -3, 2, -1, -2, -1, 3, -2, -1, -2];
    const peers = [-2, -4, 1, -6, 2, -2, -4, -2, 3, -4, -2, -4];
    const capture = downsideCapturePct(fund, peers);
    expect(capture).not.toBeNull();
    expect(capture!).toBeLessThan(100);
    expect(capture!).toBeCloseTo(50, 0);
  });

  it('refuses a capture ratio on too few down months', () => {
    expect(downsideCapturePct([-1, -1, 1], [-2, -2, 1])).toBeNull();
  });
});

describe('consistency', () => {
  it('counts the share of windows that beat the comparator', () => {
    const fund = [10, 12, 8, 14, 9, 11];
    const peers = [9, 13, 9, 13, 10, 10];
    // Wins in windows 1, 4 and 6 → 3 of 6.
    expect(outperformanceConsistencyPct(fund, peers)).toBeCloseTo(50, 6);
  });

  it('refuses a verdict on fewer than six windows', () => {
    expect(outperformanceConsistencyPct([1, 2, 3], [0, 1, 2])).toBeNull();
  });
});

describe('tracking', () => {
  it('reports a tracker that lags by a constant amount', () => {
    // Fund earns 0.9%/month, index 1.0%/month → −1.2% a year, no variance.
    const fundMonthly = new Array(24).fill(0.9);
    const indexMonthly = new Array(24).fill(1.0);
    const { trackingDifferencePct, trackingErrorPct } = trackingMetrics(fundMonthly, indexMonthly);
    expect(trackingDifferencePct).toBeCloseTo(-1.2, 6);
    expect(trackingErrorPct).toBeCloseTo(0, 6);
  });

  it('measures how erratic the gap is', () => {
    const fundMonthly = [1.2, 0.8, 1.2, 0.8, 1.2, 0.8, 1.2, 0.8, 1.2, 0.8, 1.2, 0.8];
    const indexMonthly = new Array(12).fill(1.0);
    const { trackingDifferencePct, trackingErrorPct } = trackingMetrics(fundMonthly, indexMonthly);
    expect(trackingDifferencePct).toBeCloseTo(0, 6);
    // ±0.2 each month, sample sd ≈ 0.2089 → ×√12 ≈ 0.724
    expect(trackingErrorPct).toBeCloseTo(0.724, 2);
  });

  it('refuses tracking numbers on under a year of overlap', () => {
    const { trackingDifferencePct, trackingErrorPct } = trackingMetrics([1, 1, 1], [1, 1, 1]);
    expect(trackingDifferencePct).toBeNull();
    expect(trackingErrorPct).toBeNull();
  });
});
