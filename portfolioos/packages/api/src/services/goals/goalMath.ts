import { Decimal } from 'decimal.js';

/**
 * Pure goal-progress math, extracted from goals.service so the formulas can
 * be unit-tested in isolation (no DB, no Date.now). All inputs are Decimal /
 * plain years; callers supply `years` from their own clock.
 */

const ZERO = new Decimal(0);

/** current / target × 100, capped at 100. 0 when target is non-positive. */
export function progressPct(current: Decimal, target: Decimal): number {
  if (target.lessThanOrEqualTo(0)) return 0;
  return Math.min(100, current.dividedBy(target).times(100).toNumber());
}

/**
 * Future value of the target corpus at the target date:
 *   target × (1 + inflation)^years
 * Returns null when no inflation rate is set. Years clamped at 0 so a past
 * target date doesn't discount the figure.
 */
export function inflationAdjustedTarget(
  target: Decimal,
  inflationRate: Decimal | null,
  years: number,
): Decimal | null {
  if (inflationRate == null) return null;
  return target.times(new Decimal(1).plus(inflationRate).pow(Math.max(years, 0)));
}

/**
 * Annual return needed from today to hit target by the target date:
 *   (target / current)^(1/years) − 1
 * Null when current ≤ 0 or the target date is not in the future. Uses
 * exp/ln since Decimal.js lacks fractional pow.
 */
export function requiredCagr(target: Decimal, current: Decimal, years: number): number | null {
  if (current.lessThanOrEqualTo(ZERO) || years <= 0) return null;
  const ratio = target.dividedBy(current);
  if (ratio.lessThanOrEqualTo(0)) return null;
  const lnAnnualized = Math.log(ratio.toNumber()) / years;
  return Math.exp(lnAnnualized) - 1;
}

/**
 * Asset classes that count toward an EMERGENCY_FUND goal. An emergency fund
 * must be liquid / near-liquid — cash, deposits, post-office savings. Equity,
 * crypto, MFs, gold and real estate are excluded: they're volatile and/or
 * illiquid, so counting a whole equity+crypto portfolio as "emergency fund"
 * overstates readiness. Non-emergency goals count the full linked value.
 */
const LIQUID_EMERGENCY_CLASSES: ReadonlySet<string> = new Set<string>([
  'CASH', 'FIXED_DEPOSIT', 'RECURRING_DEPOSIT',
  'POST_OFFICE_SAVINGS', 'POST_OFFICE_RD', 'POST_OFFICE_TD',
]);

export function isLiquidForEmergencyFund(assetClass: string): boolean {
  return LIQUID_EMERGENCY_CLASSES.has(assetClass);
}

/** Asset classes counted toward a goal of the given category. */
export function eligibleClassesForGoal(category: string): readonly string[] | null {
  // null = count everything (no class restriction).
  if (category === 'EMERGENCY_FUND') return Array.from(LIQUID_EMERGENCY_CLASSES);
  return null;
}

/**
 * Monthly SIP needed to close `remaining` in `years`, at `annualReturnPct`.
 *
 * Future value of an ordinary annuity, inverted:
 *   PMT = FV × r / ((1 + r)^n − 1)
 * with r = the monthly rate (annualReturnPct / 100 / 12) and n = months.
 *
 * Returns null when there is nothing to fund (remaining ≤ 0) or no time to fund
 * it in (years ≤ 0) — an "infinite monthly SIP" is not advice. With no expected
 * return supplied, or a return of exactly zero, it falls back to straight
 * division (remaining / months) rather than assuming a rate nobody chose, which
 * is the same stance riskProfileMath takes on an unknown tax slab.
 *
 * Unrounded on purpose; callers round for display.
 */
export function requiredMonthlySip(
  remaining: Decimal,
  years: number,
  annualReturnPct: number | null,
): Decimal | null {
  if (remaining.lessThanOrEqualTo(ZERO)) return null;
  if (!Number.isFinite(years) || years <= 0) return null;

  const months = Math.round(years * 12);
  if (months <= 0) return null;

  if (annualReturnPct == null || !Number.isFinite(annualReturnPct) || annualReturnPct === 0) {
    return remaining.dividedBy(months);
  }

  const r = new Decimal(annualReturnPct).dividedBy(100).dividedBy(12);
  const denominator = new Decimal(1).plus(r).pow(months).minus(1);
  // Only reachable if r rounds to zero over the horizon; the annuity collapses
  // to the no-growth case rather than dividing by zero.
  if (denominator.isZero()) return remaining.dividedBy(months);

  return remaining.times(r).dividedBy(denominator);
}
