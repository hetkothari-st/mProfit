/**
 * IDCW-reinvested NAV series — `docs/mf-analytics/01-DATA-FOUNDATION.md §2`,
 * `02-METRICS.md §1`, implementation plan Task 1.4.
 *
 * Pure functions. No Prisma, no network, no clock.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every return, volatility, drawdown and alpha number in the analytics layer
 * reads `MFNav.adjustedNav`, never `MFNav.nav`. For a GROWTH option the two are
 * identical. For an IDCW option the published NAV steps DOWN by the full
 * distribution on every ex-date, so a raw-NAV CAGR understates the fund by the
 * sum of its payouts — which is how the IDCW plan of a fund ends up scored as a
 * worse fund than the growth plan of the exact same portfolio. `adjustedNav`
 * is the total-return series that removes that artefact.
 *
 * NOTE ON IDCW_REINVEST: the published NAV of a reinvestment option drops on
 * the ex-date exactly like a payout option — the investor receives extra UNITS,
 * and units are not in the NAV. So both IDCW option types use the same
 * reconstruction. This is a common and expensive misconception.
 */

import { Decimal } from 'decimal.js';

/**
 * A local Decimal constructor at the `02 §1` precision of 28 significant
 * digits. Deliberately a clone rather than a global `Decimal.set(...)`: this
 * module is imported by jobs and by tests, and mutating the shared Decimal
 * config as a side effect of an import would silently change the arithmetic of
 * every other module in the process.
 */
const D = Decimal.clone({ precision: 28 });

/** How `adjustedNav` was arrived at. Persisted meaning; never widen silently. */
export type AdjustedNavBasis =
  /**
   * GROWTH option: `adjustedNav === nav`, exactly. Authoritative.
   */
  | 'IDENTITY'
  /**
   * IDCW option reconstructed from actual per-unit distribution records.
   * Authoritative — this is the real total-return series.
   */
  | 'DISTRIBUTION_RECORDS'
  /**
   * IDCW option reconstructed by INFERRING distributions from the growth
   * sibling's NAV ratio. An APPROXIMATION (see `deriveFactorFromGrowthSibling`).
   * Downstream must be able to tell this apart from the two above; that is the
   * entire reason `basis` is returned rather than just a series.
   */
  | 'GROWTH_SIBLING_DERIVED';

/** Why no series could be produced. Persisted into the caller's log / DLQ text. */
export type AdjustedNavFailureReason =
  | 'no_nav_observations'
  | 'idcw_without_distributions_or_sibling'
  | 'growth_sibling_empty'
  | 'growth_sibling_misaligned'
  | 'growth_sibling_nonpositive_nav';

export type MfOptionKind = 'GROWTH' | 'IDCW_PAYOUT' | 'IDCW_REINVEST';

export interface NavObservation {
  date: Date;
  nav: Decimal;
}

export interface Distribution {
  /** The date the NAV went ex-distribution. */
  exDate: Date;
  /** Per-unit amount declared. Positive. */
  amountPerUnit: Decimal;
}

export interface AdjustedNavPoint {
  date: Date;
  nav: Decimal;
  /**
   * `null` means "could not be computed", NEVER 0 and never a silent fallback
   * to `nav`. A null here makes the metrics layer report INSUFFICIENT_DATA,
   * which is the honest answer.
   */
  adjustedNav: Decimal | null;
}

export interface AdjustedNavSeries {
  series: AdjustedNavPoint[];
  /** `null` when nothing could be computed; then every `adjustedNav` is null too. */
  basis: AdjustedNavBasis | null;
  /** Set iff `basis === null`. */
  failureReason: AdjustedNavFailureReason | null;
  /** How many distributions were used or inferred. Useful for the job's log line. */
  distributionsApplied: number;
  /**
   * True when `basis === 'GROWTH_SIBLING_DERIVED'`. A redundant flag on purpose:
   * a caller that forgets to switch on `basis` still cannot present a derived
   * series as authoritative by accident.
   */
  isApproximate: boolean;
}

/**
 * Minimum fraction of the IDCW series' dates that must also exist in the growth
 * sibling's series before a derived factor is trusted.
 *
 * Below this the two series are not really the same instrument's calendar (a
 * mis-linked sibling, a scheme that changed its NAV publishing frequency, a
 * partially backfilled history) and any inferred distribution is noise. `01 §2`
 * / the task brief are explicit: a null with a reason beats a wrong number.
 */
export const MIN_SIBLING_ALIGNMENT_COVERAGE = new D('0.95');

/**
 * Relative divergence between the growth and IDCW one-day ratios below which we
 * treat the difference as noise rather than a distribution.
 *
 * NAVs are published to 4 decimal places, so a ~1e-5 relative wobble is pure
 * rounding on a NAV around 100. Distributions are orders of magnitude larger
 * (a 10% IDCW is 0.10). 0.1% sits comfortably between the two.
 */
export const MIN_MATERIAL_DIVERGENCE = new D('0.001');

// ---------------------------------------------------------------------------
// GROWTH: identity
// ---------------------------------------------------------------------------

/**
 * `01 §2`: "for GROWTH equals `nav`". Trivial, but written out explicitly
 * rather than left implicit at the call site, because "growth funds don't need
 * adjusting so leave the column null" is the obvious wrong shortcut and it
 * would make every growth fund's metrics report INSUFFICIENT_DATA.
 */
export function identityAdjustedSeries(
  observations: readonly NavObservation[],
): AdjustedNavSeries {
  const sorted = sortByDate(observations);
  if (sorted.length === 0) return nullSeries(sorted, 'no_nav_observations');
  return {
    series: sorted.map((o) => ({ date: o.date, nav: o.nav, adjustedNav: o.nav })),
    basis: 'IDENTITY',
    failureReason: null,
    distributionsApplied: 0,
    isApproximate: false,
  };
}

// ---------------------------------------------------------------------------
// IDCW with real distribution records: authoritative
// ---------------------------------------------------------------------------

/**
 * Reconstruct the total-return series by reinvesting each distribution at the
 * ex-date NAV.
 *
 *   factor starts at 1
 *   on each ex-date d:  factor *= (nav_d + distribution_d) / nav_d
 *   adjustedNav_t = nav_t * factor(as of t, inclusive of an ex-date on t)
 *
 * The ex-date NAV is already NET of the distribution, so multiplying it by
 * `(nav + dist) / nav` restores the cum-distribution value — i.e. it buys
 * `dist / nav` extra units at that day's NAV. Applying the factor from the
 * ex-date onward (inclusive) is what makes the resulting CAGR match the growth
 * option's exactly; applying it from the NEXT day instead leaves a one-day
 * notch and is the classic off-by-one here.
 */
export function adjustFromDistributions(
  observations: readonly NavObservation[],
  distributions: readonly Distribution[],
): AdjustedNavSeries {
  const sorted = sortByDate(observations);
  if (sorted.length === 0) return nullSeries(sorted, 'no_nav_observations');

  // Multiple distributions can share an ex-date (e.g. a regular + a special
  // IDCW declared together); sum them so neither is lost.
  const byDay = new Map<number, Decimal>();
  for (const dist of distributions) {
    if (!dist.amountPerUnit.isFinite() || dist.amountPerUnit.lte(0)) continue;
    const key = utcDayKey(dist.exDate);
    byDay.set(key, (byDay.get(key) ?? new D(0)).plus(dist.amountPerUnit));
  }

  let factor = new D(1);
  let applied = 0;
  const series: AdjustedNavPoint[] = [];

  for (const obs of sorted) {
    const dist = byDay.get(utcDayKey(obs.date));
    if (dist && obs.nav.gt(0)) {
      factor = factor.times(new D(obs.nav.toString()).plus(dist).div(new D(obs.nav.toString())));
      applied += 1;
    }
    const adjusted = obs.nav.gt(0) ? new D(obs.nav.toString()).times(factor) : null;
    series.push({
      date: obs.date,
      nav: obs.nav,
      adjustedNav: adjusted === null ? null : new Decimal(adjusted.toString()),
    });
  }

  return {
    series,
    basis: 'DISTRIBUTION_RECORDS',
    failureReason: null,
    distributionsApplied: applied,
    isApproximate: false,
  };
}

// ---------------------------------------------------------------------------
// IDCW without distribution records: growth-sibling derivation (APPROXIMATION)
// ---------------------------------------------------------------------------

/**
 * ⚠ APPROXIMATION — READ BEFORE TRUSTING THIS OUTPUT.
 *
 * AMFI does not publish per-unit IDCW amounts in the daily NAV file, and this
 * repo has no distribution feed. `01 §2` / Task 1.4 therefore permit deriving
 * the adjustment from the GROWTH sibling of the same scheme: the two options
 * hold one identical portfolio and carry an identical TER, so their NAVs must
 * move by the same proportion on every day EXCEPT an ex-date, where the IDCW
 * NAV additionally drops by the distribution. The residual divergence is
 * therefore the distribution:
 *
 *     step_t = (g_t / g_{t-1}) / (i_t / i_{t-1})
 *     factor_t = factor_{t-1} * step_t      (only when the divergence is material)
 *     adjustedNav_t = i_t * factor_t
 *
 * WHAT THIS GETS WRONG, and why the result is marked `GROWTH_SIBLING_DERIVED`:
 *  - Any genuine tracking difference between the two options (a stale NAV
 *    published for one and not the other, a rounding artefact on a low-NAV
 *    scheme, different unit-rounding on the ex-date) is misread as a
 *    distribution and permanently inflates the factor.
 *  - A distribution smaller than `MIN_MATERIAL_DIVERGENCE` is invisible and is
 *    silently omitted; the derived series then understates the fund slightly.
 *  - A missing growth NAV on the ex-date itself hides the distribution
 *    completely (the divergence is then spread across a multi-day gap and may
 *    fall under the materiality floor).
 *  - The sibling link itself is inferred from scheme names upstream
 *    (`MfSchemeMeta.growthSiblingSchemeCode`); a wrong link produces a
 *    confidently wrong series.
 *
 * Because of all of the above this MUST NOT be presented to a user as the
 * fund's actual total return without the approximation being disclosed, and it
 * must never be mixed into a peer comparison against a series built from real
 * distribution records. That is what `basis` / `isApproximate` are for.
 *
 * Only divergences in the direction "growth outperformed IDCW" are treated as
 * distributions. The opposite direction cannot be a distribution (an IDCW
 * option never gains value relative to its growth sibling) and would produce a
 * factor below 1, i.e. would invent a negative payout.
 */
export function deriveFactorFromGrowthSibling(
  idcwObservations: readonly NavObservation[],
  growthObservations: readonly NavObservation[],
): AdjustedNavSeries {
  const idcw = sortByDate(idcwObservations);
  if (idcw.length === 0) return nullSeries(idcw, 'no_nav_observations');
  const growth = sortByDate(growthObservations);
  if (growth.length === 0) return nullSeries(idcw, 'growth_sibling_empty');

  const growthByDay = new Map<number, Decimal>();
  for (const g of growth) {
    if (!g.nav.isFinite() || g.nav.lte(0)) {
      return nullSeries(idcw, 'growth_sibling_nonpositive_nav');
    }
    growthByDay.set(utcDayKey(g.date), g.nav);
  }

  const alignedCount = idcw.reduce(
    (n, o) => (growthByDay.has(utcDayKey(o.date)) ? n + 1 : n),
    0,
  );
  // Two aligned points is the arithmetic minimum for a single ratio step; the
  // coverage floor is what actually protects against a mis-linked sibling.
  if (alignedCount < 2) return nullSeries(idcw, 'growth_sibling_misaligned');
  const coverage = new D(alignedCount).div(new D(idcw.length));
  if (coverage.lt(MIN_SIBLING_ALIGNMENT_COVERAGE)) {
    return nullSeries(idcw, 'growth_sibling_misaligned');
  }

  let factor = new D(1);
  let inferred = 0;
  let prevIdcw: Decimal | null = null;
  let prevGrowth: Decimal | null = null;
  const series: AdjustedNavPoint[] = [];

  for (const obs of idcw) {
    const g = growthByDay.get(utcDayKey(obs.date)) ?? null;

    if (!obs.nav.isFinite() || obs.nav.lte(0)) {
      // Cannot compute a ratio through a non-positive NAV. Emit null (never 0)
      // and reset the ratio baseline so the next step is not measured across
      // the hole.
      series.push({ date: obs.date, nav: obs.nav, adjustedNav: null });
      prevIdcw = null;
      prevGrowth = null;
      continue;
    }

    if (prevIdcw !== null && prevGrowth !== null && g !== null) {
      const growthRatio = new D(g.toString()).div(new D(prevGrowth.toString()));
      const idcwRatio = new D(obs.nav.toString()).div(new D(prevIdcw.toString()));
      if (idcwRatio.gt(0)) {
        const step = growthRatio.div(idcwRatio);
        // step > 1 + threshold  <=>  growth rose materially more than IDCW.
        if (step.minus(1).gt(MIN_MATERIAL_DIVERGENCE)) {
          factor = factor.times(step);
          inferred += 1;
        }
      }
    }

    series.push({
      date: obs.date,
      nav: obs.nav,
      adjustedNav: new Decimal(new D(obs.nav.toString()).times(factor).toString()),
    });

    // Carry the baseline forward only across dates where BOTH series have a
    // value; otherwise the next ratio would span a gap in one series and not
    // the other, which manufactures a divergence out of nothing.
    if (g !== null) {
      prevIdcw = obs.nav;
      prevGrowth = g;
    }
  }

  return {
    series,
    basis: 'GROWTH_SIBLING_DERIVED',
    failureReason: null,
    distributionsApplied: inferred,
    isApproximate: true,
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export interface ComputeAdjustedNavInput {
  optionType: MfOptionKind;
  observations: readonly NavObservation[];
  /** Real per-unit distributions, when we have them. Preferred over derivation. */
  distributions?: readonly Distribution[];
  /** The GROWTH sibling's NAV series, used only as the fallback derivation. */
  growthSiblingObservations?: readonly NavObservation[];
}

/**
 * Pick the best available basis, most authoritative first:
 *   GROWTH                      -> IDENTITY
 *   IDCW + distribution records -> DISTRIBUTION_RECORDS
 *   IDCW + growth sibling       -> GROWTH_SIBLING_DERIVED  (approximation)
 *   otherwise                   -> basis null, every adjustedNav null
 *
 * The last branch is not a failure of this function — it is the correct answer
 * for an IDCW scheme whose sibling has not been linked yet.
 */
export function computeAdjustedNavSeries(input: ComputeAdjustedNavInput): AdjustedNavSeries {
  if (input.optionType === 'GROWTH') {
    return identityAdjustedSeries(input.observations);
  }

  const dists = (input.distributions ?? []).filter(
    (d) => d.amountPerUnit.isFinite() && d.amountPerUnit.gt(0),
  );
  if (dists.length > 0) {
    return adjustFromDistributions(input.observations, dists);
  }

  const sibling = input.growthSiblingObservations ?? [];
  if (sibling.length > 0) {
    const derived = deriveFactorFromGrowthSibling(input.observations, sibling);
    // A derivation that guarded out (misaligned, empty) must not silently fall
    // through to "no data" with a misleading reason — keep its own reason.
    return derived;
  }

  return nullSeries(sortByDate(input.observations), 'idcw_without_distributions_or_sibling');
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function utcDayKey(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function sortByDate(observations: readonly NavObservation[]): NavObservation[] {
  return [...observations].sort((a, b) => utcDayKey(a.date) - utcDayKey(b.date));
}

/**
 * The honest "cannot compute" answer: every row is still returned (so the
 * caller can persist a null over any stale value it may have written on an
 * earlier run) but `adjustedNav` is null, never 0 and never a fallback to
 * `nav`. `01 §2`: a null means "not yet adjusted" and forces the metric row to
 * degrade to INSUFFICIENT_DATA.
 */
function nullSeries(
  observations: readonly NavObservation[],
  reason: AdjustedNavFailureReason,
): AdjustedNavSeries {
  return {
    series: observations.map((o) => ({ date: o.date, nav: o.nav, adjustedNav: null })),
    basis: null,
    failureReason: reason,
    distributionsApplied: 0,
    isApproximate: false,
  };
}
