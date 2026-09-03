import { describe, it, expect } from 'vitest';
import {
  scoreNavSeries,
  MIN_MONTHLY_OBSERVATIONS,
  type NavPoint,
} from '../../../src/services/advisor/fallbackRankingMath.js';

const AS_OF = new Date('2025-01-31T00:00:00Z');

/** `count` month-end points on the 15th, ending 2025-01-15. */
function monthlySeries(count: number, navAt: (i: number) => number): NavPoint[] {
  const points: NavPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const monthsBack = count - 1 - i;
    const d = new Date(Date.UTC(2025, 0 - monthsBack, 15));
    points.push({ date: d.toISOString().slice(0, 10), nav: navAt(i) });
  }
  return points;
}

/** Compounding at 12% a year, evenly, month by month. */
const steady = (i: number) => 100 * Math.pow(1.12, i / 12);

describe('scoreNavSeries — refusing to rank without a basis', () => {
  it('returns null for an empty series', () => {
    expect(scoreNavSeries([], AS_OF)).toBeNull();
  });

  it(`returns null below ${MIN_MONTHLY_OBSERVATIONS} monthly observations`, () => {
    expect(scoreNavSeries(monthlySeries(MIN_MONTHLY_OBSERVATIONS - 1, steady), AS_OF)).toBeNull();
  });

  it(`scores at exactly ${MIN_MONTHLY_OBSERVATIONS} observations`, () => {
    const result = scoreNavSeries(monthlySeries(MIN_MONTHLY_OBSERVATIONS, steady), AS_OF);
    expect(result).not.toBeNull();
    expect(result!.observations).toBe(MIN_MONTHLY_OBSERVATIONS);
  });

  it('returns null when enough points exist but too few are valid', () => {
    const series = monthlySeries(14, steady).map((p, i) =>
      i < 4 ? { ...p, nav: 0 } : p,
    );
    expect(scoreNavSeries(series, AS_OF)).toBeNull();
  });

  it('returns null when the window would be empty', () => {
    expect(scoreNavSeries(monthlySeries(36, steady), AS_OF, 0.5)).toBeNull();
  });
});

describe('scoreNavSeries — the numbers', () => {
  const result = scoreNavSeries(monthlySeries(35, steady), AS_OF)!;

  it('recovers the CAGR of a steadily compounding series', () => {
    expect(result.cagrPct).toBeCloseTo(12, 1);
  });

  it('reports no volatility for a series with no variation in its returns', () => {
    expect(Math.abs(result.volatilityPct!)).toBeLessThan(0.01);
  });

  it('reports no drawdown for a monotonically rising series', () => {
    expect(result.maxDrawdownPct).toBe(0);
  });

  it('scores a riskless riser at its CAGR', () => {
    expect(result.score).toBeCloseTo(result.cagrPct!, 2);
  });

  it('measures peak-to-trough drawdown', () => {
    const navs = [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 180, 170, 160];
    const scored = scoreNavSeries(monthlySeries(navs.length, (i) => navs[i]!), AS_OF)!;
    expect(scored.maxDrawdownPct).toBeCloseTo(20, 4);
  });
});

describe('scoreNavSeries — risk penalties', () => {
  // Same first NAV, same last NAV, same span: identical CAGR, so the only thing
  // that can separate them is the path taken between the two.
  const smooth = scoreNavSeries(monthlySeries(35, steady), AS_OF)!;
  const jagged = scoreNavSeries(
    monthlySeries(35, (i) => steady(i) * (i % 2 === 1 ? 1.08 : 1)),
    AS_OF,
  )!;

  it('gives both paths the same CAGR', () => {
    expect(jagged.cagrPct).toBeCloseTo(smooth.cagrPct!, 6);
  });

  it('charges the jagged path for its volatility', () => {
    expect(jagged.volatilityPct!).toBeGreaterThan(smooth.volatilityPct!);
    expect(jagged.maxDrawdownPct).toBeGreaterThan(0);
  });

  it('ranks the smooth path above the jagged one on equal returns', () => {
    expect(jagged.score).toBeLessThan(smooth.score);
  });

  it('ranks a higher-return fund above a lower-return one at equal risk', () => {
    const slow = scoreNavSeries(monthlySeries(35, (i) => 100 * Math.pow(1.06, i / 12)), AS_OF)!;
    expect(slow.score).toBeLessThan(smooth.score);
  });
});

describe('scoreNavSeries — window handling', () => {
  it('ignores points after asOf', () => {
    const base = monthlySeries(14, steady);
    const withFuture = [
      ...base,
      { date: '2025-06-15', nav: 9_999 },
      { date: '2026-01-15', nav: 12_345 },
    ];
    expect(scoreNavSeries(withFuture, AS_OF)!.observations).toBe(14);
    expect(scoreNavSeries(withFuture, AS_OF)!.score).toBeCloseTo(
      scoreNavSeries(base, AS_OF)!.score,
      6,
    );
  });

  it('ignores points older than the window', () => {
    const withAncient = [
      { date: '2011-04-15', nav: 5 },
      { date: '2012-04-15', nav: 6 },
      ...monthlySeries(14, steady),
    ];
    expect(scoreNavSeries(withAncient, AS_OF)!.observations).toBe(14);
  });

  it('collapses several points in one month into a single observation', () => {
    const series = [
      ...monthlySeries(12, steady),
      { date: '2025-01-05', nav: 111 },
      { date: '2025-01-10', nav: 112 },
    ];
    expect(scoreNavSeries(series, AS_OF)!.observations).toBe(12);
  });

  it('drops unparseable dates and non-positive NAVs without failing', () => {
    const series: NavPoint[] = [
      ...monthlySeries(14, steady),
      { date: 'not-a-date', nav: 100 },
      { date: '2024-06-20', nav: -3 },
    ];
    expect(scoreNavSeries(series, AS_OF)!.observations).toBe(14);
  });

  it('honours a longer requested window', () => {
    const long = monthlySeries(48, steady);
    expect(scoreNavSeries(long, AS_OF)!.observations).toBeLessThanOrEqual(37);
    expect(scoreNavSeries(long, AS_OF, 5)!.observations).toBe(48);
  });
});
