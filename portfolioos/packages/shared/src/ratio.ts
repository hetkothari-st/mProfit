import { Decimal } from 'decimal.js';
import { toDecimal } from './decimal.js';

/**
 * Branded string types for the non-money numerics the MF analytics layer
 * moves across the API boundary. They exist for the same reason `Money`
 * does (§3.1): a Sharpe of 1.234567 or a percentile of 0.785000 that makes
 * a round trip through `JSON.parse` is an IEEE-754 double, and every
 * downstream comparison against a threshold then depends on binary
 * representation rather than on the number we computed.
 *
 * `Ratio` is a dimensionless fraction: 0.0725 is 7.25%, a Sharpe is 1.12,
 * a percentile is 0.78. `Pct` is the same Decimal string carrying *percent*
 * units: 0.45 is 0.45%, a TER. They are kept apart because the single most
 * common analytics bug is multiplying by 100 twice, and a type that cannot
 * be assigned to the other makes that a compile error rather than a chart
 * that reads 4500%.
 *
 * Both serialise at 6 decimal places, matching `Decimal(12,6)` in schema —
 * enough for a 0.0001% expense ratio.
 */
export type Ratio = string & { readonly __brand: 'Ratio' };
export type Pct = string & { readonly __brand: 'Pct' };

type DecimalInput = Decimal | Decimal.Value | { toString(): string };

/** Fractional digits for both types. Mirrors `Decimal(12,6)` in schema. */
export const RATIO_SCALE = 6;

/**
 * Produce the canonical on-wire ratio string. Banker's rounding, matching
 * `serializeMoney` (§14.3) so a ratio and a money value rounded from the
 * same Decimal never disagree on the half-way case.
 */
export function serializeRatio(x: DecimalInput): Ratio {
  return toDecimal(x).toFixed(RATIO_SCALE, Decimal.ROUND_HALF_EVEN) as Ratio;
}

/** Same, for percent-unit values. */
export function serializePct(x: DecimalInput): Pct {
  return toDecimal(x).toFixed(RATIO_SCALE, Decimal.ROUND_HALF_EVEN) as Pct;
}

/**
 * Null-tolerant serialisers. Almost every metric in this layer is
 * `Ratio | null` (a metric that could not be computed is null with a
 * status beside it, never 0 — see `02-METRICS.md §1`), so the call sites
 * would otherwise all be the same ternary.
 */
export function serializeRatioOrNull(x: DecimalInput | null | undefined): Ratio | null {
  return x === null || x === undefined ? null : serializeRatio(x);
}

export function serializePctOrNull(x: DecimalInput | null | undefined): Pct | null {
  return x === null || x === undefined ? null : serializePct(x);
}

/** Rehydrate before arithmetic. The inverse of `serializeRatio`. */
export function toRatioDecimal(r: Ratio | string): Decimal {
  return toDecimal(r);
}

export function toPctDecimal(p: Pct | string): Decimal {
  return toDecimal(p);
}

/**
 * Unit conversions. A `Ratio` of 0.0725 is a `Pct` of 7.25. Having these
 * named means the ×100 appears exactly twice in the codebase instead of at
 * every display site, which is where the double-multiply bug comes from.
 */
export function ratioToPct(r: Ratio | string): Pct {
  return serializePct(toDecimal(r).times(100));
}

export function pctToRatio(p: Pct | string): Ratio {
  return serializeRatio(toDecimal(p).dividedBy(100));
}
