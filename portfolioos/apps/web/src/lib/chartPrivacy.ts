// Chart axis ticks and tooltips draw numbers as plain SVG/text, outside the
// `.money-digits` spans the privacy CSS masks, so "Hide values" has to be
// applied where each label is formatted. Same "•••" the dashboard's
// portfolio-value chart already uses.
export const HIDDEN_VALUE = '•••';

/** Compact rupee axis tick (₹1.2Cr / ₹4.5L / ₹12K / ₹800), or the mask. */
export function compactRupeeTick(v: number, hidden: boolean): string {
  if (hidden) return HIDDEN_VALUE;
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000) return `₹${(v / 100_000).toFixed(1)}L`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(0)}K`;
  return `₹${v.toFixed(0)}`;
}

/** A value shown in a chart tooltip or caption, or the mask. */
export function maskedValue(formatted: string, hidden: boolean): string {
  return hidden ? HIDDEN_VALUE : formatted;
}
