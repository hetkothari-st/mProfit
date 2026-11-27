/**
 * When a quoted price may be called "Live", and how its age is said otherwise.
 *
 * Launch review B9: the Gold page read "Live · updated 4241 min ago" — the
 * badge said live whatever the age of the price behind it. A price is live
 * only while it is fresh; past the limit the badge says how old it is and
 * when it was last updated instead.
 */

/** Past this age a price is no longer called live. */
export const LIVE_PRICE_MAX_AGE_HOURS = 6;

export interface PriceFreshness {
  /** Fresh enough to be called "Live". */
  live: boolean;
  /** Seconds since the price was taken; 0 when the timestamp is in the future. */
  ageSeconds: number;
  /** "just now", "42s ago", "12 min ago", "3 h ago", "2 days ago". */
  ageLabel: string;
}

export function priceAgeLabel(ageSeconds: number): string {
  const s = Math.max(0, Math.floor(ageSeconds));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? '1 min ago' : `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d} days ago`;
}

/**
 * `source` is what the server says it served: anything other than a live
 * quote (a stored end-of-day price, a cached fallback) is never called live.
 */
export function priceFreshness(
  asOfIso: string,
  now: Date = new Date(),
  opts: { source?: string; maxAgeHours?: number } = {},
): PriceFreshness {
  const asOf = new Date(asOfIso).getTime();
  const ageSeconds = Number.isFinite(asOf) ? Math.max(0, Math.floor((now.getTime() - asOf) / 1000)) : Number.POSITIVE_INFINITY;
  const maxAge = (opts.maxAgeHours ?? LIVE_PRICE_MAX_AGE_HOURS) * 3600;
  const live = (opts.source === undefined || opts.source === 'live') && ageSeconds <= maxAge;
  return { live, ageSeconds, ageLabel: Number.isFinite(ageSeconds) ? priceAgeLabel(ageSeconds) : 'age unknown' };
}
