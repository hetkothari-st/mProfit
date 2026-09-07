/**
 * `02-METRICS.md §10` — synthetic-fixture tests for the pure metric math.
 *
 * Every series here is constructed so the answer is known in closed form and
 * can be re-derived by hand from the doc, which is the point: a golden file
 * captured from the implementation would pass forever regardless of whether the
 * implementation is right. Tolerance is 1e-9 except where a formula is
 * genuinely approximate, and each of those carries a comment saying why.
 *
 * No database, no `scope.runAs` — `mfMetricsMath.ts` is pure by contract
 * (`06-QUALITY-COMPLIANCE.md §1`), so a test that needed a fixture DB would be
 * evidence the module had grown a dependency it is not allowed to have.
 */

import { describe, it, expect } from 'vitest';
import { Decimal, toDecimal } from '@portfolioos/shared';

import {
  // series builders
  toDailySeries,
  toMonthEndSeries,
  toMonthlyReturns,
  forwardFillRiskFree,
  annualisedRiskFreeToMonthly,
  annualisedRiskFreeSeriesToMonthly,
  maxGapBusinessDays,
  assessBenchmarkSeries,
  alignReturns,
  returnValues,
  windowStartPoint,
  // returns
  cagr,
  absoluteReturn,
  horizonCagr,
  rollingReturns,
  calendarYearReturns,
  worstCalendarYear,
  hypotheticalSipXirr,
  periodSetCagr,
  // risk
  stdDevAnn,
  downsideDevAnn,
  maxDrawdown,
  worstMonth,
  bestMonth,
  var95Monthly,
  cvar95Monthly,
  pctNegativeMonths,
  // risk-adjusted
  sharpe,
  sortino,
  beta,
  jensenAlphaAnn,
  treynor,
  trackingErrorAnn,
  informationRatio,
  calmar,
  omega,
  m2,
  // relative
  upCapture,
  downCapture,
  captureRatio,
  battingAverage,
  outperformanceAnn,
  // credit scale
  CREDIT_RATING_SCALE,
  creditRatingOrdinal,
  compareCreditRating,
  normaliseCreditRating,
  // portfolio characteristics
  top10Weight,
  hhi,
  effectiveHoldings,
  activeShare,
  marketCapSplit,
  creditQualitySplit,
  belowAAPct,
  topIssuerPct,
  weightedModifiedDuration,
  weightedAverageMaturity,
  weightedYtm,
  styleDrift,
  turnoverPct,
  // structural
  managerTenureYears,
  fundAgeYears,
  aumGrowth12mPct,
  // constants
  MIN_MONTHLY_OBSERVATIONS,
  MIN_RISK_ADJUSTED_OBSERVATIONS,
  type SeriesPoint,
  type MetricResult,
  type HoldingWeightRow,
} from '../../../src/services/mfAnalytics/mfMetricsMath.js';

// ---------------------------------------------------------------------------
// Fixture and assertion helpers
// ---------------------------------------------------------------------------

const D = (x: string | number): Decimal => toDecimal(x);
const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));

function expectClose(
  actual: Decimal | null | undefined,
  expected: Decimal | string,
  tol = '1e-9',
): void {
  expect(actual ?? null, 'expected a value, got null').not.toBeNull();
  const diff = actual!.minus(toDecimal(expected)).abs();
  expect(
    diff.lessThanOrEqualTo(new Decimal(tol)),
    `expected ${actual!.toString()} ≈ ${toDecimal(expected).toString()} (diff ${diff.toString()} > ${tol})`,
  ).toBe(true);
}

function expectUnavailable(result: MetricResult, reason: string): void {
  expect(result.value, `expected null, got ${result.value?.toString()}`).toBeNull();
  expect(result.reason).toBe(reason);
}

/** Consecutive calendar days from `start`. */
function calendarDays(start: Date, count: number): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    out.push(new Date(start.getTime() + i * 86_400_000));
  }
  return out;
}

/** Weekdays only, `count` of them, starting at or after `start`. */
function businessDays(start: Date, count: number): Date[] {
  const out: Date[] = [];
  const cursor = new Date(start.getTime());
  while (out.length < count) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(new Date(cursor.getTime()));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** NAV path from a repeating return pattern. Deterministic by construction. */
function navPath(dates: readonly Date[], startNav: Decimal, pattern: readonly Decimal[]): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  let nav = startNav;
  for (let i = 0; i < dates.length; i++) {
    if (i > 0) nav = nav.times(new Decimal(1).plus(pattern[(i - 1) % pattern.length]!));
    out.push({ date: dates[i]!, value: nav });
  }
  return out;
}

/** Month-end points carrying a compounding NAV — for tests that bypass the daily layer. */
function monthEndPath(
  startYear: number,
  startMonth: number,
  count: number,
  navAt: (i: number) => Decimal,
): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let i = 0; i < count; i++) {
    const monthIndex = startMonth - 1 + i;
    const year = startYear + Math.floor(monthIndex / 12);
    const month = monthIndex % 12;
    out.push({ date: new Date(Date.UTC(year, month + 1, 0)), value: navAt(i) });
  }
  return out;
}

const zeros = (n: number): Decimal[] => Array.from({ length: n }, () => new Decimal(0));

// ---------------------------------------------------------------------------
// §10.1 — Synthetic series with closed-form answers
// ---------------------------------------------------------------------------

describe('§10.1 synthetic series with closed-form answers', () => {
  // 61 month-end NAVs compounding at exactly 1%/month ⇒ 60 monthly returns.
  const constant = monthEndPath(2019, 1, 61, (i) => D('100').times(D('1.01').pow(i)));
  const constantReturns = returnValues(toMonthlyReturns(constant));

  it('derives 60 monthly returns of exactly 1% from a 1%/month NAV path', () => {
    expect(constantReturns).toHaveLength(60);
    for (const r of constantReturns) expectClose(r, '0.01');
  });

  it('CAGR of a 1%/month series over 5 years is 1.01^12 - 1', () => {
    const result = cagr(constant[0]!.value, constant[60]!.value, D(5));
    expectClose(result.value, D('1.01').pow(12).minus(1));
  });

  it('absolute return over the same window is 1.01^60 - 1', () => {
    const result = absoluteReturn(constant[0]!.value, constant[60]!.value);
    expectClose(result.value, D('1.01').pow(60).minus(1));
  });

  it('standard deviation of a constant series is zero, and Sharpe is therefore null', () => {
    expectClose(stdDevAnn(constantReturns).value, '0');
    // Not a Sharpe of infinity and not a Sharpe of zero: the denominator is
    // degenerate, so the ratio is unmeasurable (`02 §4`).
    expectUnavailable(sharpe(constantReturns, zeros(60)), 'degenerate_denominator');
  });

  // A two-state series gives every §3/§4 metric a closed form. 30 months at
  // +3%, 30 at −1%, alternating, risk-free flat at zero.
  const twoState = Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? D('0.03') : D('-0.01')));
  const rfZero = zeros(60);

  // mean = 0.01; Σ(r − mean)² = 60 × 0.02² = 0.024; sample variance = 0.024/59.
  const expectedStdDevAnn = D('0.024').dividedBy(59).sqrt().times(D(12).sqrt());
  // downside: 30 months of −0.01 ⇒ Σ min(e,0)² = 0.003, divided by ALL 60 obs.
  const expectedDownsideAnn = D('0.003').dividedBy(60).sqrt().times(D(12).sqrt());

  it('annualised standard deviation matches the hand-computed sample σ × √12', () => {
    expectClose(stdDevAnn(twoState).value, expectedStdDevAnn);
  });

  it('downside deviation divides by all observations, not just the negative ones', () => {
    expectClose(downsideDevAnn(twoState, rfZero).value, expectedDownsideAnn);
  });

  it('Sharpe and Sortino equal annualised mean excess over their own denominators', () => {
    expectClose(sharpe(twoState, rfZero).value, D('0.12').dividedBy(expectedStdDevAnn));
    expectClose(sortino(twoState, rfZero).value, D('0.12').dividedBy(expectedDownsideAnn));
  });

  it('worst/best month, VaR, CVaR and negative-month share are the order statistics', () => {
    expectClose(worstMonth(twoState).value, '-0.01');
    expectClose(bestMonth(twoState).value, '0.03');
    // 5th percentile of 60 observations sits between order stats 3 and 4, both
    // −0.01, so the historical VaR is exactly −0.01. A parametric VaR
    // (mean − 1.645σ) would give ≈ −0.0925 here — a loss that never happened.
    expectClose(var95Monthly(twoState).value, '-0.01');
    expectClose(cvar95Monthly(twoState).value, '-0.01');
    expectClose(pctNegativeMonths(twoState).value, '0.5');
  });

  it('omega is the ratio of summed gains to summed losses above/below the risk-free rate', () => {
    // 30 × 0.03 = 0.9 up, 30 × 0.01 = 0.3 down ⇒ exactly 3.
    expectClose(omega(twoState, rfZero).value, '3');
  });

  it('calmar, treynor and m2 compose from already-computed inputs', () => {
    expectClose(calmar(D('0.12'), D('-0.30')).value, D('0.12').dividedBy(D('0.30')));
    // Suppressed, not degenerate: a shallow drawdown makes Calmar meaningless
    // rather than uncomputable.
    expectUnavailable(calmar(D('0.12'), D('-0.005')), 'not_applicable');
    expectClose(treynor(twoState, rfZero, D('1.2')).value, D('0.12').dividedBy(D('1.2')));
    expectUnavailable(treynor(twoState, rfZero, D('0.05')), 'not_applicable');
    expectClose(m2(D('0.8'), D('0.15'), D('0.07')).value, '0.19');
  });

  it('de-annualises the risk-free rate geometrically, not by dividing by 12', () => {
    const monthly = annualisedRiskFreeToMonthly(D('0.07'));
    expectClose(monthly, D('1.07').pow(D(1).dividedBy(12)).minus(1));
    // The arithmetic shortcut would be 0.00583333…; the geometric answer is
    // lower, and the gap is what an unreconcilable Sharpe is made of.
    expect(monthly!.lessThan(D('0.07').dividedBy(12))).toBe(true);
    expect(annualisedRiskFreeToMonthly(D('-1'))).toBeNull();
  });

  it('rolling 1y returns over a constant-growth daily series are all the same number', () => {
    // 2021 and 2022 are both non-leap, so every "t minus one year" is exactly
    // 365 days back and the closed form holds for every window.
    const dates = calendarDays(utc(2021, 1, 1), 730);
    const daily = navPath(dates, D('100'), [D('0.0002')]);
    const stats = rollingReturns(daily, 1);
    const expected = D('1.0002').pow(365).minus(1);

    expect(stats.observations).toBe(365);
    expect(stats.reason).toBeUndefined();
    for (const field of ['mean', 'median', 'min', 'max', 'p10', 'p25', 'p75', 'p90'] as const) {
      expectClose(stats[field], expected);
    }
    expectClose(stats.pctNegative, '0');
    expect(stats.pctBelowBenchmark).toBeNull();
  });

  it('calendar-year returns skip the incomplete first year and price the complete one', () => {
    const dates = calendarDays(utc(2021, 1, 1), 730);
    const daily = navPath(dates, D('100'), [D('0.0002')]);
    const years = calendarYearReturns(daily);
    // 2021 has no 31-Dec-2020 opening level in the series, so it is not a
    // calendar-year return — it is a stub, and stubs are the numbers readers
    // scan fastest and question least.
    expect(years.map((y) => y.year)).toEqual([2022]);
    expectClose(years[0]!.value, D('1.0002').pow(365).minus(1));
    expectClose(worstCalendarYear(years).value, D('1.0002').pow(365).minus(1));
  });

  it('hypothetical SIP XIRR on a steadily compounding fund lands on its growth rate', () => {
    const dates = calendarDays(utc(2021, 1, 1), 730);
    const daily = navPath(dates, D('100'), [D('0.0002')]);
    const result = hypotheticalSipXirr(daily);
    // Approximate on purpose: XIRR is a transcendental root solved to 1e-8 by
    // `sipXirr`, and a SIP's money-weighted rate only equals the fund's CAGR in
    // the limit of a perfectly smooth NAV path. Within 50 bp is the honest claim.
    expectClose(result.value, D('1.0002').pow(365).minus(1), '0.005');
  });

  it('series builders take the last NAV on or before each month end and drop partial months', () => {
    // 15 Jan → 12 Mar. Jan and Feb are complete; March is not.
    const dates = calendarDays(utc(2023, 1, 15), 57);
    const daily = navPath(dates, D('100'), [D('0.001')]);
    const monthEnds = toMonthEndSeries(daily);

    expect(monthEnds.map((p) => p.date.toISOString().slice(0, 10))).toEqual([
      '2023-01-31',
      '2023-02-28',
    ]);
    // The point is stamped with the calendar month end but carries the NAV
    // observed on or before it — that is what lets a fund and its benchmark
    // align even when their last trading days differ.
    const jan31 = daily.find((p) => p.date.getTime() === utc(2023, 1, 31).getTime())!;
    expectClose(monthEnds[0]!.value, jan31.value);
  });

  it('toDailySeries sorts, de-duplicates last-wins, and drops non-positive NAVs', () => {
    const raw: SeriesPoint[] = [
      { date: utc(2023, 1, 3), value: D('102') },
      { date: utc(2023, 1, 1), value: D('100') },
      { date: utc(2023, 1, 2), value: D('0') },
      { date: utc(2023, 1, 3), value: D('103') },
    ];
    const daily = toDailySeries(raw);
    expect(daily).toHaveLength(2);
    expect(daily[0]!.date.getTime()).toBe(utc(2023, 1, 1).getTime());
    // A zero NAV is always a feed error; kept, it would become a −100% day and
    // then the fund's maximum drawdown of record.
    expectClose(daily[1]!.value, '103');
  });

  it('forward-fills the risk-free series onto month ends and refuses to back-fill', () => {
    const weekly: SeriesPoint[] = [
      { date: utc(2023, 2, 6), value: D('0.068') },
      { date: utc(2023, 3, 6), value: D('0.070') },
    ];
    const monthEnds = [utc(2023, 1, 31), utc(2023, 2, 28), utc(2023, 3, 31)];
    const filled = forwardFillRiskFree(weekly, monthEnds);

    // January predates the first published rate. Borrowing February's would be
    // computing a 2023 Sharpe against a rate that did not exist yet.
    expect(filled[0]).toBeNull();
    expectClose(filled[1], '0.068');
    expectClose(filled[2], '0.070');

    const monthly = annualisedRiskFreeSeriesToMonthly(filled);
    expect(monthly[0]).toBeNull();
    expectClose(monthly[1], D('1.068').pow(D(1).dividedBy(12)).minus(1));
  });

  it('windowStartPoint honours the 7-day tolerance and refuses beyond it', () => {
    const daily = toDailySeries([
      { date: utc(2020, 1, 2), value: D('100') },
      { date: utc(2023, 1, 1), value: D('150') },
    ]);
    // asOf − 3y = 2020-01-01; nearest prior is 2019-12-… absent, so nothing at
    // or before the target ⇒ null.
    expect(windowStartPoint(daily, utc(2023, 1, 1), 3)).toBeNull();
    // asOf − 3y = 2020-01-05, nearest prior 2020-01-02 is 3 days early: inside
    // tolerance, because rejecting a horizon over a market holiday is worse
    // than starting it three days early.
    expect(windowStartPoint(daily, utc(2023, 1, 5), 3)?.value.toString()).toBe('100');
  });
});

// ---------------------------------------------------------------------------
// §10.2 — Benchmark-relative synthetics
// ---------------------------------------------------------------------------

describe('§10.2 benchmark-relative synthetics', () => {
  // A varying benchmark is mandatory: a constant one has zero variance and beta
  // is legitimately undefined there.
  const benchPattern = [D('0.02'), D('-0.01'), D('0.03'), D('0'), D('-0.02'), D('0.015')];
  const bench = Array.from({ length: 60 }, (_, i) => benchPattern[i % 6]!);
  const rfZero = zeros(60);

  describe('fund = 1.2 x benchmark', () => {
    const fund = bench.map((b) => b.times(D('1.2')));

    it('beta is 1.2 and Jensen alpha is 0', () => {
      expectClose(beta(fund, bench, rfZero).value, '1.2');
      expectClose(jensenAlphaAnn(fund, bench, rfZero).value, '0');
    });

    it('up and down capture are ~1.2 under the geometric (Morningstar) definition', () => {
      // §10.2 states "up/down capture = 1.2". That identity is exact only under
      // an ARITHMETIC capture definition. §5 mandates geometric compounding over
      // the selected months, under which a 1.2x-levered fund captures slightly
      // MORE than 1.2 on the upside (compounding is convex) and the small-return
      // series below keeps the gap to ~0.3%. The exact geometric value is
      // re-derived independently underneath, so the formula is pinned as well as
      // the economics.
      const smallBench = bench.map((b) => b.dividedBy(10));
      const smallFund = smallBench.map((b) => b.times(D('1.2')));

      const up = upCapture(smallFund, smallBench);
      const down = downCapture(smallFund, smallBench);
      expectClose(up.value, '1.2', '0.005');
      expectClose(down.value, '1.2', '0.005');

      // Independent re-derivation of the §5 formula from first principles.
      const upIdx = smallBench.map((b, i) => (b.greaterThan(0) ? i : -1)).filter((i) => i >= 0);
      const geo = (xs: Decimal[]): Decimal =>
        xs
          .reduce((acc, r) => acc.times(D(1).plus(r)), D(1))
          .pow(D(12).dividedBy(xs.length))
          .minus(1);
      const expectedUp = geo(upIdx.map((i) => smallFund[i]!)).dividedBy(
        geo(upIdx.map((i) => smallBench[i]!)),
      );
      expectClose(up.value, expectedUp);

      expectClose(captureRatio(up.value, down.value).value, up.value!.dividedBy(down.value!));
    });

    it('periodSetCagr annualises by the count of SELECTED months, not the window', () => {
      // Six months at 1% compounded, annualised as though six months were the
      // whole elapsed period: 1.01^6 raised to 12/6.
      const six = Array.from({ length: 6 }, () => D('0.01'));
      expectClose(periodSetCagr(six), D('1.01').pow(6).pow(2).minus(1));
    });
  });

  describe('fund = benchmark + 0.5%/month', () => {
    const fund = bench.map((b) => b.plus(D('0.005')));

    it('beta is 1 and Jensen alpha is 6%/yr', () => {
      expectClose(beta(fund, bench, rfZero).value, '1');
      expectClose(jensenAlphaAnn(fund, bench, rfZero).value, '0.06');
    });

    it('tracking error is zero, so the information ratio is null rather than infinite', () => {
      expectClose(trackingErrorAnn(fund, bench).value, '0');
      // The fund beats the index by the same margin every month. That is a
      // synthetic input, not a perfect manager, and an "∞" on a screen would be
      // read as the latter.
      expectUnavailable(informationRatio(fund, bench), 'degenerate_denominator');
    });

    it('batting average is 1 and annualised outperformance is the CAGR gap', () => {
      expectClose(battingAverage(fund, bench).value, '1');
      expectClose(outperformanceAnn(D('0.14'), D('0.11')).value, '0.03');
    });
  });

  it('down capture is unavailable, not zero, when the benchmark never fell', () => {
    const risingBench = Array.from({ length: 60 }, () => D('0.01'));
    const fund = risingBench.map((b) => b.times(D('1.1')));
    expectUnavailable(downCapture(fund, risingBench), 'insufficient_observations');
  });

  it('mismatched series lengths report misalignment instead of silently truncating', () => {
    expectUnavailable(beta(bench, bench.slice(0, 59), rfZero), 'misaligned_series');
    expectUnavailable(trackingErrorAnn(bench, bench.slice(0, 10)), 'misaligned_series');
  });
});

// ---------------------------------------------------------------------------
// §10.3 — Drawdown
// ---------------------------------------------------------------------------

describe('§10.3 drawdown', () => {
  // Rise to a unique peak of 100, fall to a unique trough of 70, recover.
  const rise = [D('90'), D('95'), D('100')];
  const fall = [D('96'), D('92'), D('88'), D('84'), D('80'), D('76'), D('73'), D('71'), D('70')];
  const recover = [D('72'), D('76'), D('82'), D('88'), D('94'), D('99'), D('101'), D('104')];

  function seriesFrom(values: readonly Decimal[]): SeriesPoint[] {
    const dates = calendarDays(utc(2022, 1, 1), values.length);
    return values.map((value, i) => ({ date: dates[i]!, value }));
  }

  it('reports -0.30 with the peak, trough, duration and recovery days', () => {
    const daily = seriesFrom([...rise, ...fall, ...recover]);
    const dd = maxDrawdown(daily);

    expectClose(dd.maxDrawdown.value, '-0.30');
    // Peak is index 2 (1 Jan + 2 days), trough index 11.
    expect(dd.peakDate?.toISOString().slice(0, 10)).toBe('2022-01-03');
    expect(dd.troughDate?.toISOString().slice(0, 10)).toBe('2022-01-12');
    expect(dd.maxDrawdownDurationDays).toBe(9);
    // First close at or above 100 is index 18 (2022-01-19), 7 days after trough.
    expect(dd.recovered).toBe(true);
    expect(dd.recoveryDays).toBe(7);
  });

  it('reports recoveryDays null — not 0 — when the fund never regained its peak', () => {
    const daily = seriesFrom([...rise, ...fall, D('72'), D('75'), D('78')]);
    const dd = maxDrawdown(daily);

    expectClose(dd.maxDrawdown.value, '-0.30');
    // Null means "has not recovered". Zero would mean "recovered the same day",
    // which is the opposite claim.
    expect(dd.recoveryDays).toBeNull();
    expect(dd.recovered).toBe(false);
  });

  it('a monotonically rising series has a genuine zero drawdown, not a null one', () => {
    const daily = seriesFrom([D('100'), D('101'), D('102'), D('103')]);
    const dd = maxDrawdown(daily);
    expectClose(dd.maxDrawdown.value, '0');
    expect(dd.recoveryDays).toBe(0);
  });

  it('is uncomputable, not zero, from a single observation', () => {
    expectUnavailable(maxDrawdown(seriesFrom([D('100')])).maxDrawdown, 'insufficient_observations');
  });

  it('uses the daily series: the same path sampled monthly understates the fall', () => {
    // The whole justification for §3 sampling drawdown daily while sampling
    // volatility monthly. Month-end sampling of this path misses the trough
    // entirely.
    const daily = seriesFrom([...rise, ...fall, ...recover]);
    const monthEndOnly = seriesFrom([rise[2]!, recover[recover.length - 1]!]);
    const deep = maxDrawdown(daily).maxDrawdown.value!;
    const shallow = maxDrawdown(monthEndOnly).maxDrawdown.value!;
    expect(deep.lessThan(shallow)).toBe(true);
    expectClose(shallow, '0');
  });
});

// ---------------------------------------------------------------------------
// §10.4 — lives in its own file; §10.7 — deferred, named so the gap stays visible
// ---------------------------------------------------------------------------

// §10.4 (real-fund fixtures with published reference figures) is
// `mfRealFunds.golden.test.ts` in this directory: three schemes (Mirae Asset
// Large Cap 118825, HDFC Flexi Cap 118955, Nippon India Growth Mid Cap 118668),
// ~13 years of MFAPI NAV each, NSE TRI benchmarks and the FBIL 3M T-bill series
// from `test/fixtures/mf/real-funds/`, checked at asOf 2026-07-31 against the
// AMCs' own factsheet figures at the doc tolerances. It is separate because it
// is the one suite whose expected values were NOT derived from the doc's
// formulas, and the figures that miss are `it.fails` with the delta and cause —
// see that file's header and the fixture README before touching either.

// `it.todo` rather than `describe.todo`: an empty todo suite is reported by
// nothing and counted by nothing, which is exactly the invisibility this block
// exists to prevent. This shows in the summary as todo on every run.
describe('§10.7 deferred to a later task', () => {
  it.todo(
    '§10.7 IDCW adjustment: a scheme with a 10% payout gives the same CAGR from its adjustedNav series as the growth option (±0.1 pp) — needs an IDCW payout fixture',
  );
});

// ---------------------------------------------------------------------------
// §10.5 — Insufficient data
// ---------------------------------------------------------------------------

describe('§10.5 insufficient data', () => {
  // Exactly 24 months of daily NAVs, calendar days so December is complete.
  const dates = calendarDays(utc(2022, 1, 1), 730);
  const daily = navPath(dates, D('100'), [D('0.0003'), D('-0.0001'), D('0.0004')]);
  const asOf = dates[dates.length - 1]!;

  it('computes the 1-year horizon and refuses the 3-year one, without throwing', () => {
    expect(horizonCagr(daily, asOf, 1).value).not.toBeNull();
    expectUnavailable(horizonCagr(daily, asOf, 3), 'insufficient_observations');
  });

  it('returns an empty rolling-3y block with a reason rather than a one-observation distribution', () => {
    const stats = rollingReturns(daily, 3);
    expect(stats.observations).toBe(0);
    expect(stats.reason).toBe('insufficient_observations');
    for (const field of ['mean', 'median', 'min', 'max', 'p10', 'p25', 'p75', 'p90'] as const) {
      expect(stats[field]).toBeNull();
    }
  });

  it('computes monthly risk metrics at 23 observations but refuses risk-adjusted ones', () => {
    const monthly = returnValues(toMonthlyReturns(toMonthEndSeries(daily)));
    expect(monthly.length).toBeGreaterThanOrEqual(MIN_MONTHLY_OBSERVATIONS);
    expect(monthly.length).toBeLessThan(MIN_RISK_ADJUSTED_OBSERVATIONS);

    expect(stdDevAnn(monthly).value).not.toBeNull();
    expect(pctNegativeMonths(monthly).value).not.toBeNull();
    expect(var95Monthly(monthly).value).not.toBeNull();

    const rf = zeros(monthly.length);
    expectUnavailable(sharpe(monthly, rf), 'insufficient_observations');
    expectUnavailable(sortino(monthly, rf), 'insufficient_observations');
    expectUnavailable(beta(monthly, monthly, rf), 'insufficient_observations');
    expectUnavailable(jensenAlphaAnn(monthly, monthly, rf), 'insufficient_observations');
  });

  it('refuses every monthly metric below 12 observations', () => {
    const tooShort = Array.from({ length: 11 }, () => D('0.01'));
    expectUnavailable(stdDevAnn(tooShort), 'insufficient_observations');
    expectUnavailable(worstMonth(tooShort), 'insufficient_observations');
    expectUnavailable(var95Monthly(tooShort), 'insufficient_observations');
    expectUnavailable(pctNegativeMonths(tooShort), 'insufficient_observations');
  });
});

// ---------------------------------------------------------------------------
// §10.6 — Benchmark gap
// ---------------------------------------------------------------------------

describe('§10.6 benchmark gap', () => {
  const fundDates = businessDays(utc(2019, 1, 1), 1300);
  const fundDaily = navPath(fundDates, D('100'), [D('0.0006'), D('-0.0003'), D('0.0009')]);
  const benchDaily = navPath(fundDates, D('1000'), [D('0.0005'), D('-0.0002'), D('0.0007')]);

  // Remove 10 consecutive business days from the middle of the index.
  const gapStart = 400;
  const gappedBench = benchDaily.filter((_, i) => i < gapStart || i >= gapStart + 10);

  it('detects the 10-business-day hole and marks the benchmark unusable', () => {
    expect(maxGapBusinessDays(benchDaily)).toBe(0);
    expect(maxGapBusinessDays(gappedBench)).toBe(10);

    expect(assessBenchmarkSeries(benchDaily).usable).toBe(true);

    const assessment = assessBenchmarkSeries(gappedBench);
    expect(assessment.usable).toBe(false);
    expect(assessment.reason).toBe('benchmark_unavailable');
    expect(assessment.maxGapBusinessDays).toBe(10);
  });

  it('needs the explicit gap check, because month-end carry-forward hides the hole', () => {
    // This is why `assessBenchmarkSeries` exists as a separate gate rather than
    // being inferred from observation counts: the month-end builder happily
    // carries the last pre-gap level forward, so the gapped index yields the
    // SAME number of monthly observations as the intact one, and every
    // relative metric would compute — against a month of manufactured 0%.
    const intactMonths = toMonthEndSeries(benchDaily).length;
    const gappedMonths = toMonthEndSeries(gappedBench).length;
    expect(gappedMonths).toBe(intactMonths);
  });

  it('leaves absolute metrics intact while relative metrics are withheld', () => {
    const fundMonthly = returnValues(toMonthlyReturns(toMonthEndSeries(fundDaily)));
    const rf = zeros(fundMonthly.length);

    // Absolute: unaffected by anything the index did.
    expect(stdDevAnn(fundMonthly).value).not.toBeNull();
    expect(maxDrawdown(fundDaily).maxDrawdown.value).not.toBeNull();
    expect(hypotheticalSipXirr(fundDaily).value).not.toBeNull();

    // Relative: the service layer gates on the assessment. Modelled here so the
    // contract between this module and `mfMetrics.service.ts` is pinned by a
    // test rather than by convention.
    const assessment = assessBenchmarkSeries(gappedBench);
    const relativeBeta: MetricResult = assessment.usable
      ? beta(
          fundMonthly,
          returnValues(toMonthlyReturns(toMonthEndSeries(gappedBench))),
          rf,
        )
      : { value: null, reason: assessment.reason };
    expectUnavailable(relativeBeta, 'benchmark_unavailable');
  });

  it('treats a missing benchmark the same as a gapped one', () => {
    expect(assessBenchmarkSeries(null).usable).toBe(false);
    expect(assessBenchmarkSeries([]).reason).toBe('benchmark_unavailable');
    expectUnavailable(treynor([], [], null), 'benchmark_unavailable');
  });

  it('alignReturns inner-joins rather than substituting a 0% index month', () => {
    const fundReturns = toMonthlyReturns(toMonthEndSeries(fundDaily));
    const benchReturns = toMonthlyReturns(toMonthEndSeries(benchDaily)).slice(5);
    const aligned = alignReturns(fundReturns, benchReturns);
    expect(aligned.a).toHaveLength(benchReturns.length);
    expect(aligned.b).toHaveLength(benchReturns.length);
    expect(aligned.dates[0]!.getTime()).toBe(benchReturns[0]!.date.getTime());
  });
});

// ---------------------------------------------------------------------------
// §10.8 — Decimal invariant: no `number` leaks
// ---------------------------------------------------------------------------

/**
 * The only output fields allowed to be JS numbers are genuine integer counts —
 * observation counts, day differences and window sizes. Everything with a unit
 * must be a `Decimal` (CONTEXT.md §3.1). The allowlist is spelled out so adding
 * a new numeric field forces a decision rather than sliding through.
 */
const ALLOWED_NUMBER_FIELDS = new Set([
  'observations',
  'windowYears',
  'year',
  'maxDrawdownDurationDays',
  'recoveryDays',
]);

function collectNumberPaths(node: unknown, path: string, out: string[]): void {
  if (node === null || node === undefined) return;
  if (node instanceof Decimal || node instanceof Date) return;
  if (typeof node === 'number') {
    out.push(path);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child, i) => collectNumberPaths(child, `${path}[${i}]`, out));
    return;
  }
  if (typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      collectNumberPaths(value, path ? `${path}.${key}` : key, out);
    }
  }
}

function buildFullBundle() {
  const dates = calendarDays(utc(2018, 1, 1), 2190);
  const fundDaily = navPath(dates, D('100'), [D('0.0006'), D('-0.0004'), D('0.0009')]);
  const benchDaily = navPath(dates, D('1000'), [D('0.0005'), D('-0.0003'), D('0.0007')]);
  const asOf = dates[dates.length - 1]!;

  const fundMonthEnds = toMonthEndSeries(fundDaily);
  const benchMonthEnds = toMonthEndSeries(benchDaily);
  const aligned = alignReturns(toMonthlyReturns(fundMonthEnds), toMonthlyReturns(benchMonthEnds));
  const rf = aligned.a.map(() => D('0.0055'));

  const fundCagr = horizonCagr(fundDaily, asOf, 5);
  const benchCagr = horizonCagr(benchDaily, asOf, 5);
  const dd = maxDrawdown(fundDaily);
  const betaResult = beta(aligned.a, aligned.b, rf);
  const sharpeResult = sharpe(aligned.a, rf);
  const up = upCapture(aligned.a, aligned.b);
  const down = downCapture(aligned.a, aligned.b);
  const calendar = calendarYearReturns(fundDaily);

  return {
    returns: {
      cagr: fundCagr,
      absolute: absoluteReturn(fundDaily[0]!.value, fundDaily[fundDaily.length - 1]!.value),
      benchmarkCagr: benchCagr,
      rolling1y: rollingReturns(fundDaily, 1, benchDaily),
      rolling3y: rollingReturns(fundDaily, 3, benchDaily),
      calendarYears: calendar,
      sipXirr: hypotheticalSipXirr(fundDaily),
    },
    risk: {
      stdDevAnn: stdDevAnn(aligned.a),
      downsideDevAnn: downsideDevAnn(aligned.a, rf),
      drawdown: dd,
      worstMonth: worstMonth(aligned.a),
      bestMonth: bestMonth(aligned.a),
      worstCalendarYear: worstCalendarYear(calendar),
      var95Monthly: var95Monthly(aligned.a),
      cvar95Monthly: cvar95Monthly(aligned.a),
      pctNegativeMonths: pctNegativeMonths(aligned.a),
    },
    riskAdjusted: {
      sharpe: sharpeResult,
      sortino: sortino(aligned.a, rf),
      beta: betaResult,
      jensenAlphaAnn: jensenAlphaAnn(aligned.a, aligned.b, rf),
      treynor: treynor(aligned.a, rf, betaResult.value),
      trackingErrorAnn: trackingErrorAnn(aligned.a, aligned.b),
      informationRatio: informationRatio(aligned.a, aligned.b),
      calmar: calmar(fundCagr.value, dd.maxDrawdown.value),
      omega: omega(aligned.a, rf),
      m2: m2(sharpeResult.value, stdDevAnn(aligned.b).value, D('0.0675')),
    },
    relative: {
      upCapture: up,
      downCapture: down,
      captureRatio: captureRatio(up.value, down.value),
      battingAverage: battingAverage(aligned.a, aligned.b),
      outperformanceAnn: outperformanceAnn(fundCagr.value, benchCagr.value),
    },
  };
}

describe('§10.8 decimal invariant', () => {
  it('leaks no JS numbers outside the allowlisted integer counts', () => {
    const bundle = buildFullBundle();
    const numberPaths: string[] = [];
    collectNumberPaths(bundle, '', numberPaths);

    const offenders = numberPaths.filter((p) => {
      const leaf = p.replace(/\[\d+\]$/, '').split('.').pop()!;
      return !ALLOWED_NUMBER_FIELDS.has(leaf);
    });
    expect(offenders, `unexpected JS numbers at: ${offenders.join(', ')}`).toEqual([]);
    // And the allowlisted ones really are present, so the test would notice if
    // the walker silently stopped finding anything.
    expect(numberPaths.length).toBeGreaterThan(0);
  });

  it('returns Decimal instances, never strings or numbers, for every non-null metric', () => {
    const bundle = buildFullBundle();
    const check = (r: MetricResult): void => {
      if (r.value === null) {
        expect(typeof r.reason).toBe('string');
      } else {
        expect(r.value instanceof Decimal).toBe(true);
        expect(typeof r.value).not.toBe('number');
      }
    };
    check(bundle.returns.cagr);
    check(bundle.risk.stdDevAnn);
    check(bundle.risk.drawdown.maxDrawdown);
    check(bundle.riskAdjusted.sharpe);
    check(bundle.riskAdjusted.beta);
    check(bundle.relative.upCapture);
  });

  it('portfolio and structural helpers are Decimal-typed too', () => {
    const rows: HoldingWeightRow[] = [
      { isin: 'INE001A01001', weightPct: D('60'), marketCapBucket: 'LARGE' },
      { isin: 'INE002A01002', weightPct: D('40'), marketCapBucket: 'MID' },
    ];
    const split = marketCapSplit(rows);
    const paths: string[] = [];
    collectNumberPaths({ split, hhi: hhi(rows), top10: top10Weight(rows) }, '', paths);
    expect(paths).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §10.9 — Determinism
// ---------------------------------------------------------------------------

describe('§10.9 determinism', () => {
  it('produces byte-identical JSON for the same inputs computed twice', () => {
    // decimal.js serialises via toJSON → toString, and Dates via toISOString,
    // so a stringify comparison is a genuine byte comparison of the outputs.
    const first = JSON.stringify(buildFullBundle());
    const second = JSON.stringify(buildFullBundle());
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(100);
  });

  it('is insensitive to input row order, because every ordering step is total', () => {
    const rows: HoldingWeightRow[] = [
      { isin: 'A', weightPct: D('2.5') },
      { isin: 'B', weightPct: D('2.5') },
      { isin: 'C', weightPct: D('2.5') },
      { isin: 'D', weightPct: D('1') },
    ];
    const forwards = top10Weight(rows, 2).value!.toString();
    const backwards = top10Weight([...rows].reverse(), 2).value!.toString();
    // Ties broken on the holding key, not on array position — the same snapshot
    // read in a different row order must give the same top-N.
    expect(forwards).toBe(backwards);
  });

  it('re-sorts unordered daily NAV rows into the same series every time', () => {
    const base: SeriesPoint[] = calendarDays(utc(2023, 1, 1), 40).map((date, i) => ({
      date,
      value: D('100').plus(i),
    }));
    const shuffled = [...base].reverse();
    expect(JSON.stringify(toDailySeries(shuffled))).toBe(JSON.stringify(toDailySeries(base)));
  });
});

// ---------------------------------------------------------------------------
// §7 / §8 — portfolio and structural helpers
// ---------------------------------------------------------------------------

describe('§7 portfolio characteristics', () => {
  it('sums the ten largest weights', () => {
    const rows: HoldingWeightRow[] = Array.from({ length: 12 }, (_, i) => ({
      isin: `INE${i}`,
      weightPct: D(12 - i),
    }));
    // 12 + 11 + … + 3 = 75.
    expectClose(top10Weight(rows).value, '75');
    expectUnavailable(top10Weight([]), 'no_data');
  });

  it('computes HHI on fractions and inverts it into effective holdings', () => {
    const rows: HoldingWeightRow[] = Array.from({ length: 4 }, (_, i) => ({
      isin: `INE${i}`,
      weightPct: D('25'),
    }));
    expectClose(hhi(rows).value, '0.25');
    expectClose(effectiveHoldings(hhi(rows).value).value, '4');
    expectUnavailable(effectiveHoldings(D('0')), 'degenerate_denominator');
  });

  it('computes active share over the union of fund and benchmark holdings', () => {
    const fund: HoldingWeightRow[] = [
      { isin: 'A', weightPct: D('60') },
      { isin: 'B', weightPct: D('40') },
    ];
    const bench: HoldingWeightRow[] = [
      { isin: 'A', weightPct: D('50') },
      { isin: 'C', weightPct: D('50') },
    ];
    // (|60-50| + |40-0| + |0-50|) / 100 / 2 = 0.5.
    expectClose(activeShare(fund, bench).value, '0.5');
    expectUnavailable(activeShare(fund, []), 'benchmark_unavailable');
  });

  it('splits by market cap and keeps unclassified weight visible', () => {
    const rows: HoldingWeightRow[] = [
      { isin: 'A', weightPct: D('50'), marketCapBucket: 'LARGE' },
      { isin: 'B', weightPct: D('30'), marketCapBucket: 'MID' },
      { isin: 'C', weightPct: D('12'), marketCapBucket: 'SMALL' },
      { isin: 'D', weightPct: D('8'), marketCapBucket: null },
    ];
    const split = marketCapSplit(rows);
    expectClose(split.large, '50');
    expectClose(split.mid, '30');
    expectClose(split.small, '12');
    // Reported, never hidden: a dropped 8% makes the other three add to 92 and
    // the reader assumes cash.
    expectClose(split.unclassified, '8');
  });

  it('splits by credit bucket, counts unrated as risky, and excludes sovereigns from issuer concentration', () => {
    const rows: HoldingWeightRow[] = [
      { securityName: '7.26 GOI 2033', issuer: 'GOVERNMENT OF INDIA', weightPct: D('40'), creditRating: 'SOV' },
      { securityName: 'HDFC Bank NCD', issuer: 'HDFC BANK', weightPct: D('25'), creditRating: 'CRISIL AAA' },
      { securityName: 'Tata Cap NCD', issuer: 'TATA CAPITAL', weightPct: D('15'), creditRating: '[ICRA]AA+(CE)' },
      { securityName: 'Some NCD', issuer: 'SOME CO', weightPct: D('12'), creditRating: 'IND AA- /Stable' },
      { securityName: 'Other NCD', issuer: 'OTHER CO', weightPct: D('8'), creditRating: null },
    ];
    const split = creditQualitySplit(rows);
    expectClose(split.sov, '40');
    expectClose(split.aaa, '25');
    expectClose(split.aaPlus, '15');
    expectClose(split.aaMinus, '12');
    expectClose(split.unrated, '8');
    // AA− (12) + unrated (8) = 20.
    expectClose(belowAAPct(rows).value, '20');
    // The 40% GOI position is excluded, so the largest issuer is HDFC at 25 —
    // otherwise every gilt fund would fail a concentration rule.
    expectClose(topIssuerPct(rows).value, '25');
  });

  it('weights debt attributes by the disclosing rows only', () => {
    const rows: HoldingWeightRow[] = [
      { isin: 'A', weightPct: D('60'), modifiedDuration: D('2'), maturityYears: D('3'), ytmPct: D('7.5') },
      { isin: 'B', weightPct: D('20'), modifiedDuration: D('5'), maturityYears: D('8'), ytmPct: D('8.5') },
      // Undisclosed: must not be treated as a zero-duration sleeve.
      { isin: 'C', weightPct: D('20') },
    ];
    expectClose(weightedModifiedDuration(rows).value, D('220').dividedBy(80));
    expectClose(weightedAverageMaturity(rows).value, D('340').dividedBy(80));
    expectClose(weightedYtm(rows).value, D('620').dividedBy(80));
  });

  it('measures style drift only outside the mandated band', () => {
    const band = { bucket: 'LARGE' as const, minPct: D('80'), maxPct: D('100') };
    const inside = [{ large: D('95'), mid: D('5'), small: null, unclassified: null }];
    const outside = [
      { large: D('95'), mid: D('5'), small: null, unclassified: null },
      { large: D('71'), mid: D('29'), small: null, unclassified: null },
    ];
    // 95% large-cap in a ≥80% mandate is not drift; only the part outside counts.
    expectClose(styleDrift(inside, band).value, '0');
    expectClose(styleDrift(outside, band).value, '9');
    expectUnavailable(styleDrift([], band), 'no_data');
  });

  it('estimates turnover from weight x AUM deltas as min(buys, sells) over average AUM', () => {
    const snapshots = [
      {
        asOf: utc(2023, 1, 31),
        aum: D('1000'),
        holdings: [
          { isin: 'A', weightPct: D('50') },
          { isin: 'B', weightPct: D('50') },
        ],
      },
      {
        asOf: utc(2023, 2, 28),
        aum: D('1000'),
        holdings: [
          { isin: 'A', weightPct: D('30') },
          { isin: 'B', weightPct: D('70') },
        ],
      },
    ];
    // buys 200 (B), sells 200 (A), average AUM 1000 ⇒ 20%.
    expectClose(turnoverPct(snapshots).value, '20');
    expectUnavailable(turnoverPct(snapshots.slice(0, 1)), 'insufficient_observations');
  });

  it('orders the credit scale from sovereign to unrated', () => {
    expect(CREDIT_RATING_SCALE[0]).toBe('SOV');
    expect(CREDIT_RATING_SCALE[CREDIT_RATING_SCALE.length - 1]).toBe('UNRATED');
    expect(creditRatingOrdinal('SOV')).toBeLessThan(creditRatingOrdinal('AAA'));
    expect(creditRatingOrdinal('AA_PLUS')).toBeLessThan(creditRatingOrdinal('AA'));
    expect(creditRatingOrdinal('BELOW_IG')).toBeLessThan(creditRatingOrdinal('UNRATED'));
    expect(compareCreditRating('AAA', 'BBB')).toBeLessThan(0);
    expect(compareCreditRating('AA', 'AA')).toBe(0);
  });

  it('normalises the six ways an AMC writes the same rating', () => {
    expect(normaliseCreditRating('CRISIL AAA')).toBe('AAA');
    expect(normaliseCreditRating('[ICRA]AA+(CE)')).toBe('AA_PLUS');
    expect(normaliseCreditRating('IND AA- /Stable')).toBe('AA_MINUS');
    expect(normaliseCreditRating('CARE A1+')).toBe('AAA');
    expect(normaliseCreditRating('SOVEREIGN')).toBe('SOV');
    expect(normaliseCreditRating('BB+')).toBe('BELOW_IG');
    expect(normaliseCreditRating('D')).toBe('BELOW_IG');
    // Unrecognised is UNRATED — the conservative bucket, so a parsing miss can
    // only ever make a fund look worse, never better.
    expect(normaliseCreditRating('WHO KNOWS')).toBe('UNRATED');
    expect(normaliseCreditRating(null)).toBe('UNRATED');
    expect(normaliseCreditRating('')).toBe('UNRATED');
  });
});

describe('§8 structural metrics', () => {
  it('computes tenure and fund age in years, and refuses a future start date', () => {
    expectClose(managerTenureYears(utc(2019, 1, 1), utc(2024, 1, 1)).value, D('1826').dividedBy('365.25'));
    expectClose(fundAgeYears(utc(2014, 1, 1), utc(2024, 1, 1)).value, D('3652').dividedBy('365.25'));
    expectUnavailable(managerTenureYears(utc(2025, 1, 1), utc(2024, 1, 1)), 'out_of_range');
  });

  it('computes 12-month AUM growth and guards a zero base', () => {
    expectClose(aumGrowth12mPct(D('1200'), D('1000')).value, '20');
    expectUnavailable(aumGrowth12mPct(D('1200'), D('0')), 'degenerate_denominator');
    expectUnavailable(aumGrowth12mPct(null, D('1000')), 'no_data');
  });
});
