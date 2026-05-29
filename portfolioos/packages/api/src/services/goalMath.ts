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
