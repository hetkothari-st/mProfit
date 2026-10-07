import { MIN_RATING_HISTORY_MONTHS } from './mfAnalytics.constants.js';
import type { MfRatingStatus } from './mfAnalytics.types.js';

/**
 * The two figures `06-QUALITY-COMPLIANCE.md §6` needs to render an unrated
 * scheme honestly: "Unrated — {N} months of history (rated from {date})".
 *
 * It lives in `shared`, and is a single function, because three places need
 * the same answer — the read API, the portfolio analysis service, and the
 * fund page — and "months of history" is the kind of quantity that silently
 * acquires three slightly different definitions (calendar months vs 30-day
 * blocks vs whole months elapsed) if each caller derives it. A user seeing
 * "34 months" on one page and "35 months" on another has no way to tell which
 * is wrong, and the answer decides whether they wait or switch.
 *
 * Whole calendar months elapsed, floored: a fund launched on 15 Jan has
 * completed 1 month on 15 Feb, not on 1 Feb.
 */
export interface MfRatingHistory {
  /** Whole months of NAV history at `asOf`. Null once the scheme is RATED. */
  historyMonths: number | null;
  /** ISO date the scheme reaches the rating threshold. Null once RATED. */
  ratedFrom: string | null;
}

/** Whole calendar months between two dates, floored. Never negative. */
export function wholeMonthsBetween(from: Date, to: Date): number {
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  // Not yet past the day-of-month anniversary, so the final month is partial.
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return months < 0 ? 0 : months;
}

/**
 * `historyMonths` / `ratedFrom` for a score.
 *
 * Both are null when `ratingStatus === 'RATED'` — the copy they support only
 * exists for the unrated case, and returning a stale "36 months" beside a live
 * rating invites a reader to think the rating is provisional.
 *
 * `CATEGORY_TOO_SMALL` also returns nulls: that scheme has enough history and
 * is unrated for an unrelated reason (too few peers), so a months figure would
 * be answering a question nobody asked. Its copy uses `universeSize` instead.
 */
export function ratingHistoryFor(
  inceptionDate: Date,
  asOf: Date,
  ratingStatus: MfRatingStatus,
): MfRatingHistory {
  if (ratingStatus !== 'INSUFFICIENT_HISTORY') {
    return { historyMonths: null, ratedFrom: null };
  }
  const historyMonths = wholeMonthsBetween(inceptionDate, asOf);
  const ratedFrom = new Date(
    Date.UTC(
      inceptionDate.getUTCFullYear(),
      inceptionDate.getUTCMonth() + MIN_RATING_HISTORY_MONTHS,
      inceptionDate.getUTCDate(),
    ),
  );
  return {
    historyMonths,
    ratedFrom: ratedFrom.toISOString().slice(0, 10),
  };
}
