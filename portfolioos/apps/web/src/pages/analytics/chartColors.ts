/**
 * Editorial chart palette — restrained, never neon. Identical sequence
 * to the one used on DashboardPage so both pages render the same colour
 * for the same asset class.
 */
export const CHART_COLORS = [
  'hsl(213 53% 22%)',   // ink
  'hsl(36 60% 48%)',    // gold
  'hsl(130 35% 34%)',   // forest
  'hsl(12 50% 44%)',    // terracotta
  'hsl(260 28% 42%)',   // plum
  'hsl(195 40% 34%)',   // slate teal
  'hsl(28 70% 54%)',    // amber
  'hsl(340 35% 40%)',   // rosewood
  'hsl(80 28% 38%)',    // moss
  'hsl(220 25% 50%)',   // dust blue
  'hsl(50 55% 45%)',    // mustard
  'hsl(165 30% 36%)',   // pine
];

export function colorFor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length]!;
}

export const POS_COLOR = 'hsl(130 35% 34%)';
export const NEG_COLOR = 'hsl(12 50% 44%)';
export const NEUTRAL_COLOR = 'hsl(220 12% 50%)';

/** "2.0" -> "2", "2.5" -> "2.5". */
function trimZero(n: string): string {
  return n.replace(/\.0$/, '');
}

/**
 * Compact rupees for chart axes. Thousands below ₹10K keep one decimal: axis
 * ticks of 1,500 / 2,000 / 2,500 all rounded to "₹2K" before, so the axis
 * repeated one label.
 */
export function shortInr(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 10_000_000) return `${sign}₹${trimZero((a / 10_000_000).toFixed(1))}Cr`;
  if (a >= 100_000) return `${sign}₹${trimZero((a / 100_000).toFixed(1))}L`;
  if (a >= 10_000) return `${sign}₹${(a / 1_000).toFixed(0)}K`;
  if (a >= 1_000) return `${sign}₹${trimZero((a / 1_000).toFixed(1))}K`;
  return `${sign}₹${a.toFixed(0)}`;
}
