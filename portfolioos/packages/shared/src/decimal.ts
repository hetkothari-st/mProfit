import { Decimal } from 'decimal.js';

export { Decimal };

/**
 * Branded string type for monetary values crossing the API boundary.
 * All money fields in DTOs are typed as `Money` (serialized as strings so
 * IEEE-754 can never touch them in transit). Producers must emit via
 * `serializeMoney`; consumers must `toDecimal` before any arithmetic.
 */
export type Money = string & { readonly __brand: 'Money' };

/**
 * Same idea for quantities (share counts, MF units). Kept separate from
 * Money so we can evolve quantity precision independently (quantities are
 * Decimal(18,6) in schema; money is Decimal(18,4)).
 */
export type Quantity = string & { readonly __brand: 'Quantity' };

type DecimalInput = Decimal | Decimal.Value | { toString(): string };

/**
 * Coerce any of the well-formed money representations (Decimal object,
 * string, finite number, Prisma Decimal) into a Decimal. Throws on
 * null/undefined/non-finite inputs. Use this at every function boundary
 * that consumes money from an untrusted source (request bodies, Prisma
 * query results, parsed CSV/PDF values).
 */
export function toDecimal(x: DecimalInput | null | undefined): Decimal {
  if (x === null || x === undefined) {
    throw new TypeError('toDecimal: received null/undefined');
  }
  if (x instanceof Decimal) return x;
  if (typeof x === 'number') {
    if (!Number.isFinite(x)) {
      throw new TypeError(`toDecimal: non-finite number ${x}`);
    }
    return new Decimal(x);
  }
  if (typeof x === 'string') {
    if (x.length === 0) throw new TypeError('toDecimal: empty string');
    return new Decimal(x);
  }
  // Prisma.Decimal and anything else with a stable toString()
  return new Decimal(x.toString());
}

/**
 * Runtime guard that throws if `x` is a JS number. Use at the top of
 * functions that handle money to catch upstream drift before it reaches
 * arithmetic.
 */
export function assertDecimal(x: unknown): asserts x is Decimal {
  if (typeof x === 'number') {
    throw new TypeError(
      `assertDecimal: refusing JS number (${x}) — money must be Decimal`,
    );
  }
  if (!(x instanceof Decimal)) {
    throw new TypeError(`assertDecimal: expected Decimal, got ${typeof x}`);
  }
}

/**
 * Produce the canonical on-wire money string. `Decimal(18,4)` in DB →
 * 4 fractional digits on the wire (banker's rounding). Callers who need
 * tighter precision for intermediate calcs should stay in Decimal until
 * the final serialization step.
 */
export function serializeMoney(x: DecimalInput): Money {
  // ROUND_HALF_EVEN = banker's rounding (per §14.3). Decimal.js constant is 6.
  const s = toDecimal(x).toFixed(4, Decimal.ROUND_HALF_EVEN);
  return s as Money;
}

/**
 * Canonical on-wire quantity string. Decimal(18,6) in schema → 6 digits.
 */
export function serializeQuantity(x: DecimalInput): Quantity {
  const s = toDecimal(x).toFixed(6, Decimal.ROUND_HALF_EVEN);
  return s as Quantity;
}

/**
 * Sum an iterable of money-ish values exactly. IEEE-754 never touches
 * the accumulator. Use for totals, aggregates, reductions.
 */
export function sumDecimal(values: Iterable<DecimalInput>): Decimal {
  let total = new Decimal(0);
  for (const v of values) total = total.plus(toDecimal(v));
  return total;
}
