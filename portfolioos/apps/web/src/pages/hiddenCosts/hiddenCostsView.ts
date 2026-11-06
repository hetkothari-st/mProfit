import { Decimal, formatINR } from '@everypaisa/shared';

/** Pure helpers for the Hidden costs page. Money arrives as strings; Decimal for any maths. */

/** "₹27.7 L", "₹1.54 Cr", or whole rupees under a lakh. */
export function compactInr(v: string): string {
  const d = new Decimal(v);
  const trim = (x: Decimal, dp: number) => x.toDecimalPlaces(dp).toString();
  if (d.abs().greaterThanOrEqualTo(10_000_000)) return `₹${trim(d.dividedBy(10_000_000), 2)} Cr`;
  if (d.abs().greaterThanOrEqualTo(100_000)) return `₹${trim(d.dividedBy(100_000), 1)} L`;
  return formatINR(d.toDecimalPlaces(0).toFixed(2), { fractionDigits: 0 });
}

/** A bar's length: this source's share (percent) of the largest source. */
export function costShare(value: string, all: string[]): number {
  const max = all.reduce((m, v) => Decimal.max(m, new Decimal(v)), new Decimal(0));
  if (max.isZero()) return 0;
  return Math.min(100, new Decimal(value).dividedBy(max).times(100).toNumber());
}
