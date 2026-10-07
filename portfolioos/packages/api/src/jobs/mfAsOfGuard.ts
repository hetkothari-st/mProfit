/**
 * One guard, shared by the three MF analytics jobs, against the single most
 * expensive way to run this pipeline wrong.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 *
 * Run the pipeline at a mid-month `asOf` and it produces **zero ratings**,
 * silently, with every input correct.
 *
 * The chain is long enough that the symptom points nowhere near the cause. A
 * 3-year window ending mid-month yields 35 monthly returns against
 * `MIN_RISK_ADJUSTED_OBSERVATIONS = 36` (`mfMetricsMath.ts`). That nulls
 * Sortino, Jensen alpha and information ratio; those are the whole of the
 * PERFORMANCE pillar; PERFORMANCE is a `RATING_REQUIRED_PILLAR`, so
 * `ratingStatusFor` returns `INSUFFICIENT_HISTORY` for every scheme in every
 * category — including categories holding forty-plus healthy peers with ten
 * years of NAV each.
 *
 * What you see is `INSUFFICIENT_HISTORY` on funds that visibly have the
 * history, next to `CATEGORY_TOO_SMALL` on universes that visibly have the
 * peers. Both readings send you to look for more data. More data does not fix
 * it; the date does.
 *
 * The monthly cron never hits this — it fires on the 15th for the month that
 * ended, so its `asOf` is always a month-end. Only manual invocations hit it:
 * a backfill, a test run, a `tsx scripts/...` during development. Those are
 * exactly the runs with nobody watching a dashboard to notice that the rating
 * count went to zero.
 *
 * So this warns rather than throws. A mid-month `asOf` is legitimate for the
 * metrics job on its own (the 5- and 10-year horizons still compute, and
 * `MfSchemeMetrics` is useful without a rating). It is only ever wrong when
 * you expected ratings out of the far end. Refusing to run would break the
 * legitimate case to protect the mistaken one.
 */

import { logger } from '../lib/logger.js';

/** True when `asOf` is the last calendar day of its own month, in UTC. */
export function isMonthEnd(asOf: Date): boolean {
  const next = new Date(asOf.getTime());
  next.setUTCDate(next.getUTCDate() + 1);
  return next.getUTCMonth() !== asOf.getUTCMonth();
}

/**
 * Log a warning when `asOf` is not a month-end. Call at the top of a job's
 * entry point, before any work — the point is that the operator sees it in the
 * first lines of output, not buried after a ten-minute run.
 *
 * @param asOf    the date the job was asked to run for
 * @param jobName appears in the message so the warning is attributable when
 *                three jobs run in sequence
 */
export function warnIfNotMonthEnd(asOf: Date, jobName: string): void {
  if (isMonthEnd(asOf)) return;

  const iso = asOf.toISOString().slice(0, 10);
  const monthEnd = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 0),
  )
    .toISOString()
    .slice(0, 10);

  logger.warn(
    { job: jobName, asOf: iso, suggestedAsOf: monthEnd },
    `[mf] ${jobName}: asOf ${iso} is not a month-end. A 3-year window ending ` +
      `mid-month yields 35 monthly returns against MIN_RISK_ADJUSTED_OBSERVATIONS=36, ` +
      `which nulls the PERFORMANCE pillar and makes every scheme INSUFFICIENT_HISTORY — ` +
      `zero ratings, with no other symptom. Use asOf=${monthEnd} if you expect ratings.`,
  );
}
