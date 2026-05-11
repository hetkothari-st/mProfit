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

export function shortInr(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000) return `₹${(v / 100_000).toFixed(1)}L`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(0)}K`;
  if (v <= -10_000_000) return `-₹${(Math.abs(v) / 10_000_000).toFixed(1)}Cr`;
  if (v <= -100_000) return `-₹${(Math.abs(v) / 100_000).toFixed(1)}L`;
  if (v <= -1_000) return `-₹${(Math.abs(v) / 1_000).toFixed(0)}K`;
  return `₹${v.toFixed(0)}`;
}
