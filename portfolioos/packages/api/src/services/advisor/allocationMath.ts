/**
 * Pure allocation / drift math. No DB, no I/O, no clock — every input arrives
 * as an argument, matching the convention set by healthScoreMath.ts,
 * goalMath.ts and riskProfileMath.ts.
 *
 * This is where "your portfolio is 18pp overweight equity" becomes "sell
 * ₹3,20,000 of it", so the two rules that matter most live here:
 *
 *   1. A bucket that is missing from one side of the comparison is still a
 *      drift. A portfolio holding 0% debt against a 40% debt target is the
 *      single most important row the engine can produce; dropping it because
 *      no holding carries that bucket would silently delete the advice.
 *   2. A unit count is never derived from a stale price. `unitsFor` returns
 *      null instead — an amount the user has to convert themselves is a minor
 *      inconvenience, a confidently wrong "sell 412 units" is a real loss.
 */

import { Decimal } from 'decimal.js';
import { MAX_SINGLE_TRADE_PCT, MIN_TRADE_INR, REBALANCE_BAND_PP } from './constants.js';
import {
  ADVISOR_ASSET_BUCKETS,
  type AdvisorAllocationFact,
  type AdvisorAssetBucketValue,
  type AdvisorTargetFact,
} from './types.js';

const ZERO = new Decimal(0);

/** Decimal places kept on a unit count. Four covers mutual-fund unit
 *  conventions (3-4 dp) and is more than enough for shares. */
const UNIT_DECIMALS = 4;

/** Canonical ordering, used only to break ties so the output of computeDrift is
 *  deterministic for identical input. */
const BUCKET_ORDER = new Map<AdvisorAssetBucketValue, number>(
  ADVISOR_ASSET_BUCKETS.map((b, i) => [b, i]),
);

export interface DriftRow {
  bucket: AdvisorAssetBucketValue;
  currentPct: number;
  targetPct: number;
  /** currentPct − targetPct; positive = overweight. */
  driftPp: number;
  /** Signed rupee distance from target; positive = too much money here. */
  driftValue: Decimal;
}

/**
 * One row per bucket appearing in EITHER list, sorted by absolute drift
 * (largest first), ties broken by the canonical bucket order.
 *
 * `driftValue` is measured against the bucket's real rupee value rather than
 * re-derived from `currentPct`, because currentPct may have been rounded by the
 * facts builder and a rounded percentage is not something to size a trade
 * from. For a bucket present only in the targets, current value is zero.
 *
 * Duplicate current rows for one bucket are summed (a bucket can be spread
 * across portfolios). Duplicate targets are a configuration error caught by
 * validateTargetWeights; here the last one wins rather than throwing, so a bad
 * model portfolio degrades the advice instead of killing the whole run.
 */
export function computeDrift(
  current: AdvisorAllocationFact[],
  targets: AdvisorTargetFact[],
  totalValue: Decimal,
): DriftRow[] {
  const currentPctByBucket = new Map<AdvisorAssetBucketValue, number>();
  const currentValueByBucket = new Map<AdvisorAssetBucketValue, Decimal>();
  for (const row of current ?? []) {
    if (!row) continue;
    const pct = Number.isFinite(row.currentPct) ? row.currentPct : 0;
    currentPctByBucket.set(row.bucket, (currentPctByBucket.get(row.bucket) ?? 0) + pct);
    currentValueByBucket.set(
      row.bucket,
      (currentValueByBucket.get(row.bucket) ?? ZERO).plus(row.currentValue ?? ZERO),
    );
  }

  const targetPctByBucket = new Map<AdvisorAssetBucketValue, number>();
  for (const row of targets ?? []) {
    if (!row) continue;
    targetPctByBucket.set(row.bucket, Number.isFinite(row.targetPct) ? row.targetPct : 0);
  }

  const buckets = new Set<AdvisorAssetBucketValue>([
    ...currentPctByBucket.keys(),
    ...targetPctByBucket.keys(),
  ]);

  const total = totalValue ?? ZERO;

  const rows: DriftRow[] = [];
  for (const bucket of buckets) {
    const currentPct = currentPctByBucket.get(bucket) ?? 0;
    const targetPct = targetPctByBucket.get(bucket) ?? 0;
    const currentValue = currentValueByBucket.get(bucket) ?? ZERO;
    const targetValue = total.times(targetPct).dividedBy(100);
    rows.push({
      bucket,
      currentPct,
      targetPct,
      driftPp: currentPct - targetPct,
      driftValue: currentValue.minus(targetValue),
    });
  }

  rows.sort((a, b) => {
    const byDrift = Math.abs(b.driftPp) - Math.abs(a.driftPp);
    if (byDrift !== 0) return byDrift;
    return (BUCKET_ORDER.get(a.bucket) ?? 99) - (BUCKET_ORDER.get(b.bucket) ?? 99);
  });

  return rows;
}

/**
 * Turn a drift row into a sized instruction, or null when it is not worth one.
 *
 * Null when any of:
 *   • |driftPp| < REBALANCE_BAND_PP — inside the tolerance band, this is noise;
 *   • |driftValue| < MIN_TRADE_INR — the friction costs more than the fix;
 *   • the cap (MAX_SINGLE_TRADE_PCT of the portfolio) drags the amount back
 *     under MIN_TRADE_INR, which happens on tiny portfolios;
 *   • totalValue is non-positive — there is nothing to rebalance.
 *
 * Direction comes from the sign of driftValue rather than driftPp because
 * driftValue is the money actually being moved. Both gates must pass, so the
 * two can never be read as disagreeing about whether to act.
 */
export function sizeRebalanceTrade(
  drift: DriftRow,
  totalValue: Decimal,
): { direction: 'BUY' | 'SELL'; amountInr: Decimal } | null {
  if (!drift) return null;
  if (!totalValue || totalValue.lessThanOrEqualTo(ZERO)) return null;
  if (!Number.isFinite(drift.driftPp)) return null;
  if (Math.abs(drift.driftPp) < REBALANCE_BAND_PP) return null;

  const magnitude = drift.driftValue.abs();
  if (magnitude.lessThan(MIN_TRADE_INR)) return null;

  const cap = totalValue.times(MAX_SINGLE_TRADE_PCT);
  const amountInr = Decimal.min(magnitude, cap);
  if (amountInr.lessThan(MIN_TRADE_INR)) return null;

  // Overweight (driftValue > 0) means there is too much money in the bucket,
  // so the instruction is to sell out of it.
  const direction = drift.driftValue.greaterThan(ZERO) ? 'SELL' : 'BUY';
  return { direction, amountInr };
}

/**
 * Units implied by a rupee amount at a given price, or null.
 *
 * Null when the price is missing, non-positive, or STALE. That last case is the
 * one output this engine must never produce: a unit count derived from a price
 * that no longer holds looks precise and is wrong, and the person reading it
 * has no way to tell. The rupee amount is always available instead, so the
 * recommendation stays actionable.
 *
 * Rounded DOWN so the instruction never covers more units than the amount pays
 * for; a count that rounds away to zero returns null rather than "0".
 */
export function unitsFor(
  amountInr: Decimal,
  price: Decimal | null,
  priceStale: boolean,
): string | null {
  if (priceStale) return null;
  if (price == null) return null;
  if (!price.isFinite() || price.lessThanOrEqualTo(ZERO)) return null;
  if (amountInr == null || !amountInr.isFinite() || amountInr.lessThanOrEqualTo(ZERO)) return null;

  const units = amountInr.dividedBy(price).toDecimalPlaces(UNIT_DECIMALS, Decimal.ROUND_DOWN);
  if (units.lessThanOrEqualTo(ZERO)) return null;
  return units.toString();
}
