import { toDecimal } from '@everypaisa/shared';

type Amount = string | number | { toString(): string } | null | undefined;

/**
 * -1, 0 or 1 for an amount; 0 for nothing or something unparseable.
 * Decimal-based, so "0.00", "-0" and 1e-12 round-trips all read as zero.
 */
export function signOf(value: Amount): -1 | 0 | 1 {
  if (value == null || value === '') return 0;
  try {
    const d = toDecimal(typeof value === 'number' || typeof value === 'string' ? value : value.toString());
    if (d.isZero()) return 0;
    return d.isNegative() ? -1 : 1;
  } catch {
    return 0;
  }
}

/**
 * Text colour for a gain/loss: green above zero, red below, neutral at zero.
 * Zero is not good news — ₹0.00 in green reads as a profit that isn't there.
 */
export function signTone(value: Amount): 'text-positive' | 'text-negative' | 'text-muted-foreground' {
  const s = signOf(value);
  return s > 0 ? 'text-positive' : s < 0 ? 'text-negative' : 'text-muted-foreground';
}

/**
 * Colour for an amount whose direction is known (money in / money out) but
 * which is shown unsigned: in green, out red — and nothing at all neutral.
 */
export function flowTone(amount: Amount, direction: 'in' | 'out'): 'text-positive' | 'text-negative' | 'text-muted-foreground' {
  if (signOf(amount) === 0) return 'text-muted-foreground';
  return direction === 'in' ? 'text-positive' : 'text-negative';
}
