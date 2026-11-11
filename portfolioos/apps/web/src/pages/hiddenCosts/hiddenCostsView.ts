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

/** A source's share of this year's total, in percent. Bar length and the % label use the same denominator. */
export function shareOfTotal(value: string, total: string): number {
  const t = new Decimal(total);
  if (t.isZero()) return 0;
  return Math.min(100, new Decimal(value).dividedBy(t).times(100).toNumber());
}

/** "49%", "5%", "<1%" — never "0%" for a cost that exists. */
export function formatShare(pct: number): string {
  if (pct > 0 && pct < 1) return '<1%';
  return `${Math.round(pct)}%`;
}
