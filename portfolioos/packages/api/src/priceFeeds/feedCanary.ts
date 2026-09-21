/**
 * The proportionality canary.
 *
 * A feed that throws is easy: something goes red. The failure that hides is a
 * feed that still returns 200, still parses, still writes — just far less than
 * it used to, or almost nothing at all. AMFI's NAVAll gained two columns and
 * our parser read "Direct Plan" where the NAV belonged; every row failed the
 * numeric check, the job reported success, and the NAV sync imported **zero
 * rows** while looking healthy. Nobody noticed for weeks.
 *
 * Two questions catch that on the first night:
 *   1. What share of the rows we fetched did we fail to parse?
 *   2. How does the imported count compare with the last run that worked?
 *
 * Both thresholds live in config (`FEED_MAX_PARSE_FAILURE_PCT`,
 * `FEED_MAX_ROW_DROP_PCT`) because they are calibration, not implementation.
 *
 * On a trip the run FAILS — loudly, via `logger.error` and a `FeedRunLog` row
 * with the reason. It does not silently carry on with a thin dataset, because
 * a thin dataset that looks like a full one is exactly what went wrong before.
 *
 * ── Why not IngestionFailure ─────────────────────────────────────
 * That table is the DLQ for user data and REQUIRES a userId: its RLS policy is
 * `userId = app_current_user_id()`. A market feed belongs to no user, so a feed
 * failure has no row it can legally write there. `FeedRunLog` is the same
 * contract for market-level data — recorded, never swallowed, queryable — and
 * it doubles as the baseline this canary needs.
 */

import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

/** What a feed has to report for its run to be judged. */
export interface FeedRunCounts {
  /** Rows the source gave us, before parsing. */
  rowsParsed: number;
  /** Rows that actually landed in the database. */
  rowsImported: number;
  /** Rows the source gave us that we could not read. */
  parseFailures?: number;
  /**
   * The source published nothing for this period, and says so — an F&O
   * bhavcopy on a trading holiday, not a file we failed to read. Judged as
   * SKIPPED: it cannot trip the canary and it does not become the baseline
   * that the next run is compared against.
   *
   * Only a feed that can actually tell the difference may set this. AMFI
   * never does: "NAVAll had no rows" is the bug, not a holiday.
   */
  sourceEmpty?: boolean;
  /** Anything else worth keeping with the run. */
  details?: Record<string, unknown>;
}

export interface CanaryVerdict {
  ok: boolean;
  /** True when the source had nothing to publish; ok, but not a baseline. */
  skipped: boolean;
  reason: string | null;
  parseFailureRatePct: number;
  rowDropPct: number | null;
  previousImported: number | null;
}

export class FeedCanaryError extends Error {
  constructor(
    readonly feed: string,
    readonly verdict: CanaryVerdict,
  ) {
    super(`[${feed}] ${verdict.reason ?? 'feed canary tripped'}`);
    this.name = 'FeedCanaryError';
  }
}

/**
 * Pure: given this run's counts and the previous successful import count,
 * decide whether the run is proportionate.
 *
 * Kept separate from the database so both trip conditions can be tested
 * without one.
 */
export function judgeFeedRun(
  counts: FeedRunCounts,
  previousImported: number | null,
  thresholds: { maxParseFailurePct: number; maxRowDropPct: number },
): CanaryVerdict {
  const parsed = Math.max(0, counts.rowsParsed);
  const failures = Math.max(0, counts.parseFailures ?? 0);
  const parseFailureRatePct = parsed === 0 ? (failures > 0 ? 100 : 0) : (failures / parsed) * 100;

  const rowDropPct =
    previousImported && previousImported > 0
      ? ((previousImported - counts.rowsImported) / previousImported) * 100
      : null;

  if (counts.sourceEmpty) {
    return {
      ok: true,
      skipped: true,
      reason: 'source published nothing for this period',
      parseFailureRatePct,
      rowDropPct,
      previousImported,
    };
  }

  if (parseFailureRatePct > thresholds.maxParseFailurePct) {
    return {
      ok: false,
      skipped: false,
      reason:
        `${parseFailureRatePct.toFixed(1)}% of ${parsed} rows failed to parse, above the ` +
        `${thresholds.maxParseFailurePct}% limit — the source format has probably changed`,
      parseFailureRatePct,
      rowDropPct,
      previousImported,
    };
  }

  if (rowDropPct != null && rowDropPct > thresholds.maxRowDropPct) {
    return {
      ok: false,
      skipped: false,
      reason:
        `imported ${counts.rowsImported} rows against ${previousImported} last time, ` +
        `a ${rowDropPct.toFixed(1)}% drop, beyond the ${thresholds.maxRowDropPct}% limit`,
      parseFailureRatePct,
      rowDropPct,
      previousImported,
    };
  }

  // A first run with nothing imported is the zero-row case that started all
  // this: there is no baseline to compare against, so it has to be caught on
  // its own terms.
  if (counts.rowsImported === 0 && parsed > 0) {
    return {
      ok: false,
      skipped: false,
      reason: `parsed ${parsed} rows and imported none`,
      parseFailureRatePct,
      rowDropPct,
      previousImported,
    };
  }

  return {
    ok: true,
    skipped: false,
    reason: null,
    parseFailureRatePct,
    rowDropPct,
    previousImported,
  };
}

/**
 * Drop run rows older than the retention window.
 *
 * The crypto feed ticks every two minutes, so this table would otherwise grow
 * by a quarter of a million rows a year to answer a question that only looks
 * back one run. Called once a day from the AMFI job. FAILED rows are kept
 * twice as long as OK ones — the evidence outlives the noise.
 */
export async function pruneFeedRunLogs(): Promise<number> {
  const days = env.FEED_RUN_LOG_RETENTION_DAYS;
  const okCutoff = new Date(Date.now() - days * 86_400_000);
  const failedCutoff = new Date(Date.now() - days * 2 * 86_400_000);
  const { count } = await prisma.feedRunLog.deleteMany({
    where: {
      OR: [
        { status: { not: 'FAILED' }, startedAt: { lt: okCutoff } },
        { status: 'FAILED', startedAt: { lt: failedCutoff } },
      ],
    },
  });
  if (count > 0) logger.info({ count, days }, '[feedCanary] pruned old run logs');
  return count;
}

/** Imported rows on the last run of this feed that passed. */
export async function previousSuccessfulImport(feed: string): Promise<number | null> {
  const row = await prisma.feedRunLog.findFirst({
    where: { feed, status: 'OK', rowsImported: { not: null } },
    orderBy: { startedAt: 'desc' },
    select: { rowsImported: true },
  });
  return row?.rowsImported ?? null;
}

/**
 * Run a feed, judge what it produced, and record the verdict either way.
 *
 * Throws `FeedCanaryError` on a trip, so the caller's existing error handling
 * treats it as the failure it is. The `FeedRunLog` row is written before the
 * throw — a failure that fails to record itself is the original problem again.
 */
export async function runFeedWithCanary<T>(
  feed: string,
  fn: () => Promise<T>,
  /**
   * How to read this feed's own result as rows fetched / rows landed / rows
   * unreadable. Every feed reports something different, so the mapping stays
   * at the call site rather than forcing nine services onto one return type.
   */
  toCounts: (result: T) => FeedRunCounts,
): Promise<T> {
  const thresholds = {
    maxParseFailurePct: env.FEED_MAX_PARSE_FAILURE_PCT,
    maxRowDropPct: env.FEED_MAX_ROW_DROP_PCT,
  };
  const startedAt = new Date();
  const previousImported = await previousSuccessfulImport(feed);

  let result: T;
  try {
    result = await fn();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await prisma.feedRunLog.create({
      data: { feed, startedAt, finishedAt: new Date(), status: 'FAILED', previousImported, reason },
    });
    logger.error({ feed, err: reason }, '[feedCanary] feed run threw');
    throw err;
  }

  const counts = toCounts(result);
  const verdict = judgeFeedRun(counts, previousImported, thresholds);
  await prisma.feedRunLog.create({
    data: {
      feed,
      startedAt,
      finishedAt: new Date(),
      status: verdict.skipped ? 'SKIPPED' : verdict.ok ? 'OK' : 'FAILED',
      rowsParsed: counts.rowsParsed,
      rowsImported: counts.rowsImported,
      parseFailures: counts.parseFailures ?? 0,
      previousImported,
      reason: verdict.reason,
      details: (counts.details ?? {}) as object,
    },
  });

  if (!verdict.ok) {
    logger.error(
      {
        feed,
        rowsParsed: counts.rowsParsed,
        rowsImported: counts.rowsImported,
        parseFailures: counts.parseFailures ?? 0,
        previousImported,
        parseFailureRatePct: Number(verdict.parseFailureRatePct.toFixed(2)),
        rowDropPct: verdict.rowDropPct == null ? null : Number(verdict.rowDropPct.toFixed(2)),
      },
      `[feedCanary] ${verdict.reason}`,
    );
    throw new FeedCanaryError(feed, verdict);
  }

  logger.info(
    {
      feed,
      rowsParsed: counts.rowsParsed,
      rowsImported: counts.rowsImported,
      previousImported,
      rowDropPct: verdict.rowDropPct == null ? null : Number(verdict.rowDropPct.toFixed(2)),
    },
    verdict.skipped
      ? '[feedCanary] source published nothing for this period — not judged'
      : '[feedCanary] run looks proportionate',
  );
  return result;
}
