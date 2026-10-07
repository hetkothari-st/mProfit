/**
 * IDCW-reinvested NAV series — `docs/mf-analytics/01-DATA-FOUNDATION.md §2`,
 * `02-METRICS.md §1`.
 *
 * The load-bearing case is `02 §10.7`:
 *
 *   "IDCW adjustment. A scheme with a 10% payout: `adjustedNav` series gives
 *    the same CAGR as the growth option of the same scheme (±0.1 pp)."
 *
 * It is asserted twice — once against real distribution records
 * (`DISTRIBUTION_RECORDS`) and once against the growth-sibling derivation
 * (`GROWTH_SIBLING_DERIVED`), because the second is the path production will
 * actually take until a distribution feed exists.
 *
 * Everything under test is pure — no DB, no `scope.runAs`, no network.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';

import {
  computeAdjustedNavSeries,
  adjustFromDistributions,
  deriveFactorFromGrowthSibling,
  identityAdjustedSeries,
  MIN_MATERIAL_DIVERGENCE,
  type AdjustedNavSeries,
  type Distribution,
  type NavObservation,
} from '../../src/priceFeeds/adjustedNav.js';

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

// ---------------------------------------------------------------------------
// The 02 §10.7 fixture
// ---------------------------------------------------------------------------

/**
 * One scheme, two options, five years of month-end NAVs.
 *
 * The growth option compounds at a flat 1%/month from 100. The IDCW option
 * holds the identical portfolio, so it tracks the growth NAV exactly until
 * month 24, where a 10% IDCW is declared: the NAV goes ex-distribution and
 * drops to 90% of its cum value, then continues tracking growth at 0.9× for
 * the rest of the series.
 *
 * A raw-NAV CAGR on the IDCW series therefore understates the fund by the
 * whole payout. `adjustedNav` must put it back.
 */
const MONTHS = 60;
const MONTHLY_RATE = new Decimal('0.01');
const PAYOUT_MONTH = 24;
const PAYOUT_FRACTION = new Decimal('0.10');

function monthEnd(index: number): Date {
  // 2020-01-31 + index months, always the last day of the month, in UTC.
  const dt = new Date(Date.UTC(2020, index + 1, 0));
  return dt;
}

interface Fixture {
  growth: NavObservation[];
  idcw: NavObservation[];
  distributions: Distribution[];
}

function buildIdcwFixture(): Fixture {
  const growth: NavObservation[] = [];
  const idcw: NavObservation[] = [];
  const distributions: Distribution[] = [];

  let g = new Decimal('100');
  for (let i = 0; i < MONTHS; i += 1) {
    if (i > 0) g = g.times(new Decimal(1).plus(MONTHLY_RATE));
    const date = monthEnd(i);
    growth.push({ date, nav: g });

    // Before the ex-date the two options are the same NAV; from the ex-date
    // onward the IDCW NAV is permanently 90% of the growth NAV.
    const idcwNav = i < PAYOUT_MONTH ? g : g.times(new Decimal(1).minus(PAYOUT_FRACTION));
    idcw.push({ date, nav: idcwNav });

    if (i === PAYOUT_MONTH) {
      // Declared per unit, out of the cum-distribution NAV `g`.
      distributions.push({ exDate: date, amountPerUnit: g.times(PAYOUT_FRACTION) });
    }
  }
  return { growth, idcw, distributions };
}

/** `(end / start)^(1/years) − 1` on the adjusted series. */
function cagr(series: readonly { adjustedNav: Decimal | null }[], years: Decimal): Decimal {
  const first = series[0]?.adjustedNav;
  const last = series[series.length - 1]?.adjustedNav;
  if (!first || !last) throw new Error('fixture produced a null endpoint');
  return last.div(first).pow(new Decimal(1).div(years)).minus(1);
}

const YEARS = new Decimal(MONTHS - 1).div(12);
/** ±0.1 percentage point, per `02 §10.7`. */
const TOLERANCE_PP = new Decimal('0.001');

function assertSameCagr(a: AdjustedNavSeries, b: AdjustedNavSeries): void {
  const diff = cagr(a.series, YEARS).minus(cagr(b.series, YEARS)).abs();
  expect(
    diff.lte(TOLERANCE_PP),
    `CAGR differs by ${diff.times(100).toFixed(6)} pp, tolerance 0.1 pp`,
  ).toBe(true);
}

describe('02 §10.7 — a 10% IDCW payout must not change the fund’s CAGR', () => {
  const fixture = buildIdcwFixture();

  it('the raw IDCW NAV series understates the CAGR (the bug this exists to fix)', () => {
    const growthCagr = cagr(
      fixture.growth.map((o) => ({ adjustedNav: o.nav })),
      YEARS,
    );
    const rawIdcwCagr = cagr(
      fixture.idcw.map((o) => ({ adjustedNav: o.nav })),
      YEARS,
    );
    // ~2.2 pp of annualised return silently lost over five years.
    expect(rawIdcwCagr.lt(growthCagr)).toBe(true);
    expect(growthCagr.minus(rawIdcwCagr).gt(TOLERANCE_PP)).toBe(true);
  });

  it('DISTRIBUTION_RECORDS: adjustedNav gives the growth option’s CAGR', () => {
    const growth = identityAdjustedSeries(fixture.growth);
    const adjusted = adjustFromDistributions(fixture.idcw, fixture.distributions);

    expect(adjusted.basis).toBe('DISTRIBUTION_RECORDS');
    expect(adjusted.isApproximate).toBe(false);
    expect(adjusted.distributionsApplied).toBe(1);
    assertSameCagr(adjusted, growth);
  });

  it('GROWTH_SIBLING_DERIVED: adjustedNav gives the growth option’s CAGR', () => {
    const growth = identityAdjustedSeries(fixture.growth);
    const adjusted = deriveFactorFromGrowthSibling(fixture.idcw, fixture.growth);

    expect(adjusted.basis).toBe('GROWTH_SIBLING_DERIVED');
    expect(adjusted.isApproximate).toBe(true);
    expect(adjusted.distributionsApplied).toBe(1);
    assertSameCagr(adjusted, growth);
  });

  it('both bases agree with each other to well inside the tolerance', () => {
    assertSameCagr(
      adjustFromDistributions(fixture.idcw, fixture.distributions),
      deriveFactorFromGrowthSibling(fixture.idcw, fixture.growth),
    );
  });

  it('reconstructs the growth NAV point-for-point, not just at the endpoints', () => {
    const adjusted = adjustFromDistributions(fixture.idcw, fixture.distributions);
    // Endpoint-only checks would pass even if the payout were applied on the
    // wrong date. Every point must land back on the growth NAV.
    //
    // Relative, not absolute, tolerance: the fixture itself is built with the
    // ambient decimal.js precision (20 significant digits) while the module
    // computes at 28, so the two disagree in the ~1e-20 relative digit. That is
    // fixture noise, not a defect in the reconstruction.
    for (let i = 0; i < MONTHS; i += 1) {
      const adj = adjusted.series[i]?.adjustedNav;
      const g = fixture.growth[i]?.nav;
      if (!adj || !g) throw new Error('missing point');
      expect(adj.minus(g).abs().div(g).lt(new Decimal('1e-18'))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// basis semantics
// ---------------------------------------------------------------------------

describe('computeAdjustedNavSeries — basis selection', () => {
  const fixture = buildIdcwFixture();

  it('GROWTH → IDENTITY, adjustedNav === nav exactly', () => {
    const r = computeAdjustedNavSeries({
      optionType: 'GROWTH',
      observations: fixture.growth,
    });
    expect(r.basis).toBe('IDENTITY');
    expect(r.isApproximate).toBe(false);
    for (const p of r.series) expect(p.adjustedNav?.eq(p.nav)).toBe(true);
  });

  it('prefers real distribution records over the sibling derivation', () => {
    const r = computeAdjustedNavSeries({
      optionType: 'IDCW_PAYOUT',
      observations: fixture.idcw,
      distributions: fixture.distributions,
      growthSiblingObservations: fixture.growth,
    });
    expect(r.basis).toBe('DISTRIBUTION_RECORDS');
  });

  it('falls back to the sibling derivation when no distributions are known', () => {
    const r = computeAdjustedNavSeries({
      optionType: 'IDCW_REINVEST',
      observations: fixture.idcw,
      growthSiblingObservations: fixture.growth,
    });
    expect(r.basis).toBe('GROWTH_SIBLING_DERIVED');
    expect(r.isApproximate).toBe(true);
  });

  it('treats IDCW_REINVEST exactly like IDCW_PAYOUT (the NAV drops for both)', () => {
    const payout = computeAdjustedNavSeries({
      optionType: 'IDCW_PAYOUT',
      observations: fixture.idcw,
      distributions: fixture.distributions,
    });
    const reinvest = computeAdjustedNavSeries({
      optionType: 'IDCW_REINVEST',
      observations: fixture.idcw,
      distributions: fixture.distributions,
    });
    expect(reinvest.series.map((p) => p.adjustedNav?.toString())).toEqual(
      payout.series.map((p) => p.adjustedNav?.toString()),
    );
  });

  it('IDCW with neither distributions nor a sibling → basis null, every value null', () => {
    const r = computeAdjustedNavSeries({
      optionType: 'IDCW_PAYOUT',
      observations: fixture.idcw,
    });
    expect(r.basis).toBeNull();
    expect(r.failureReason).toBe('idcw_without_distributions_or_sibling');
    expect(r.series).toHaveLength(MONTHS);
    // Never 0, never a silent fallback to `nav`.
    for (const p of r.series) expect(p.adjustedNav).toBeNull();
  });

  it('no observations at all → basis null with no_nav_observations', () => {
    const r = computeAdjustedNavSeries({ optionType: 'GROWTH', observations: [] });
    expect(r.basis).toBeNull();
    expect(r.failureReason).toBe('no_nav_observations');
    expect(r.series).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// the approximation's guard rails
// ---------------------------------------------------------------------------

describe('deriveFactorFromGrowthSibling — guards', () => {
  const fixture = buildIdcwFixture();

  it('refuses a misaligned sibling rather than fabricating a factor', () => {
    // Only the first 10 of 60 IDCW dates exist in the sibling series: coverage
    // 17%, far below the 95% floor.
    const r = deriveFactorFromGrowthSibling(fixture.idcw, fixture.growth.slice(0, 10));
    expect(r.basis).toBeNull();
    expect(r.failureReason).toBe('growth_sibling_misaligned');
    expect(r.series).toHaveLength(MONTHS);
    for (const p of r.series) expect(p.adjustedNav).toBeNull();
  });

  it('refuses an empty sibling series', () => {
    const r = deriveFactorFromGrowthSibling(fixture.idcw, []);
    expect(r.basis).toBeNull();
    expect(r.failureReason).toBe('growth_sibling_empty');
  });

  it('refuses a sibling series with a non-positive NAV', () => {
    const broken = fixture.growth.map((o, i) =>
      i === 5 ? { date: o.date, nav: new Decimal(0) } : o,
    );
    const r = deriveFactorFromGrowthSibling(fixture.idcw, broken);
    expect(r.basis).toBeNull();
    expect(r.failureReason).toBe('growth_sibling_nonpositive_nav');
  });

  it('ignores sub-materiality tracking noise instead of inventing distributions', () => {
    // The IDCW option lags the growth option by 0.05%/month — an order of
    // magnitude below MIN_MATERIAL_DIVERGENCE and therefore rounding, not a
    // payout. Nothing may be inferred.
    const noise = new Decimal('0.0005');
    expect(noise.lt(MIN_MATERIAL_DIVERGENCE)).toBe(true);
    const idcw = fixture.growth.map((o, i) => ({
      date: o.date,
      nav: o.nav.times(new Decimal(1).minus(noise).pow(i)),
    }));
    const r = deriveFactorFromGrowthSibling(idcw, fixture.growth);
    expect(r.basis).toBe('GROWTH_SIBLING_DERIVED');
    expect(r.distributionsApplied).toBe(0);
  });

  it('never infers a negative distribution when the IDCW option outpaces growth', () => {
    // Physically impossible, so it is data error, not a payout. The factor must
    // stay at 1 rather than dropping below it.
    const idcw = fixture.growth.map((o, i) =>
      i >= 10 ? { date: o.date, nav: o.nav.times('1.5') } : o,
    );
    const r = deriveFactorFromGrowthSibling(idcw, fixture.growth);
    expect(r.distributionsApplied).toBe(0);
    for (let i = 0; i < r.series.length; i += 1) {
      const p = r.series[i];
      expect(p?.adjustedNav?.eq(p.nav)).toBe(true);
    }
  });

  it('handles multiple payouts', () => {
    const growth: NavObservation[] = [];
    const idcw: NavObservation[] = [];
    let g = new Decimal('100');
    let scale = new Decimal(1);
    for (let i = 0; i < 40; i += 1) {
      if (i > 0) g = g.times('1.01');
      if (i === 10 || i === 25) scale = scale.times('0.95'); // two 5% payouts
      growth.push({ date: monthEnd(i), nav: g });
      idcw.push({ date: monthEnd(i), nav: g.times(scale) });
    }
    const derived = deriveFactorFromGrowthSibling(idcw, growth);
    expect(derived.distributionsApplied).toBe(2);
    const years = new Decimal(39).div(12);
    const diff = cagr(derived.series, years)
      .minus(cagr(growth.map((o) => ({ adjustedNav: o.nav })), years))
      .abs();
    expect(diff.lte(TOLERANCE_PP)).toBe(true);
  });
});

describe('adjustFromDistributions', () => {
  it('sums distributions sharing one ex-date', () => {
    const obs: NavObservation[] = [
      { date: d('2026-01-05'), nav: new Decimal('100') },
      { date: d('2026-01-06'), nav: new Decimal('90') },
    ];
    const r = adjustFromDistributions(obs, [
      { exDate: d('2026-01-06'), amountPerUnit: new Decimal('6') },
      { exDate: d('2026-01-06'), amountPerUnit: new Decimal('4') },
    ]);
    // factor = (90 + 10) / 90; adjusted = 90 * 100/90 = 100.
    expect(r.distributionsApplied).toBe(1);
    expect(r.series[1]?.adjustedNav?.toFixed(6)).toBe('100.000000');
  });

  it('applies the factor on the ex-date itself, not the day after', () => {
    const obs: NavObservation[] = [
      { date: d('2026-01-05'), nav: new Decimal('100') },
      { date: d('2026-01-06'), nav: new Decimal('90') },
      { date: d('2026-01-07'), nav: new Decimal('90') },
    ];
    const r = adjustFromDistributions(obs, [
      { exDate: d('2026-01-06'), amountPerUnit: new Decimal('10') },
    ]);
    // No notch: the ex-date is already restored to 100.
    expect(r.series.map((p) => p.adjustedNav?.toFixed(4))).toEqual([
      '100.0000',
      '100.0000',
      '100.0000',
    ]);
  });

  it('ignores non-positive or non-finite declared amounts', () => {
    const obs: NavObservation[] = [{ date: d('2026-01-05'), nav: new Decimal('100') }];
    const r = adjustFromDistributions(obs, [
      { exDate: d('2026-01-05'), amountPerUnit: new Decimal('0') },
      { exDate: d('2026-01-05'), amountPerUnit: new Decimal('-1') },
    ]);
    expect(r.distributionsApplied).toBe(0);
    expect(r.series[0]?.adjustedNav?.toFixed(4)).toBe('100.0000');
  });
});

describe('determinism', () => {
  it('same inputs twice → identical output strings', () => {
    const fixture = buildIdcwFixture();
    const a = computeAdjustedNavSeries({
      optionType: 'IDCW_PAYOUT',
      observations: fixture.idcw,
      growthSiblingObservations: fixture.growth,
    });
    const b = computeAdjustedNavSeries({
      optionType: 'IDCW_PAYOUT',
      observations: fixture.idcw,
      growthSiblingObservations: fixture.growth,
    });
    expect(a.series.map((p) => p.adjustedNav?.toString() ?? null)).toEqual(
      b.series.map((p) => p.adjustedNav?.toString() ?? null),
    );
    expect(a.basis).toBe(b.basis);
  });
});
