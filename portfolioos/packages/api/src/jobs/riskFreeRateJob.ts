/**
 * Weekly risk-free-rate job — `01-DATA-FOUNDATION.md §5`
 * ("`riskFreeRateJob` | weekly Mon 06:00 IST | `rbiRiskFree` → `RiskFreeRate`"),
 * `07` Task 1.3.
 *
 * Fetches the RBI DBIE 91-day Treasury Bill primary-auction cut-off yield and
 * upserts it on `(series, date)`. The side-effecting half of a pair: all
 * parsing lives in the pure, fixture-tested `rbiRiskFree.parse.ts`, all URLs in
 * `rbiRiskFree.v1.ts`. This file is I/O and failure policy.
 *
 * =============================================================================
 * THE RULE THIS JOB EXISTS TO PROTECT: NEVER FORWARD-FILL INTO STORAGE
 * =============================================================================
 * `01 §3` is explicit: "Forward-fill to daily in the math layer, never in
 * storage." `RiskFreeRate` holds exactly the observations RBI published — one
 * per auction week — and nothing else. This job writes one row per observed
 * row the parser returned, and no others. It does not create a Tuesday.
 *
 * `forwardFillToDates()` in `rbiRiskFree.parse.ts` is a READ-TIME helper. The
 * metrics layer calls it to line a weekly series up against daily NAV dates.
 * It must never be called here, and its output must never be written.
 *
 * Why, concretely — if we stored five synthetic daily rows per real weekly one:
 *
 *   1. We could no longer tell an observation from an interpolation. Six months
 *      later nobody knows which rows RBI actually published, and the
 *      reconciliation in `06 §2` becomes impossible to run.
 *   2. RBI restates DBIE series. A revision would have to chase four derived
 *      rows for every real one, and a single missed row silently contradicts
 *      its neighbours — with no way to tell which is authoritative.
 *   3. A staleness alert could never fire, because the fill would keep
 *      manufacturing fresh-looking rows forever after the feed died. Every
 *      Sharpe, Sortino, alpha and M2 in `02-METRICS.md` would keep computing
 *      confidently against a rate nobody has published in a year.
 *
 * Related, and just as important: a MISSING rate is `null`, never `0`. The
 * parser already rejects `-` / `NA` / blank as `missing_rate` rather than
 * zero, because a zero risk-free rate quietly turns every Sharpe ratio in the
 * system into a plain return/volatility ratio — a wrong number that looks
 * entirely reasonable. This job preserves that by writing only rows the parser
 * accepted, and by DLQ-ing the rest.
 *
 * =============================================================================
 * IDEMPOTENCY
 * =============================================================================
 * Every write is an upsert on `(series, date)` AND a value-diff: a row whose
 * stored rate already equals the fetched one is not written at all. Re-running
 * the job on the same week is a no-op (`CONTEXT.md §3.3`, `01 §5`).
 *
 * REGISTRATION: not self-registering. `startRiskFreeRateJob()` is exported for
 * the boot sequence to call, matching `startMfNavAdjustmentJob`.
 */

import cron from 'node-cron';
import { createHash } from 'node:crypto';
import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import { writeIngestionFailure } from '../services/ingestionFailures.service.js';
import type { RiskFreeParseFailure, RiskFreeRow } from '../priceFeeds/rbiRiskFree.parse.js';
import {
  fetchRbi91DayTbill,
  RBI_RISK_FREE_ADAPTER_ID,
  RBI_RISK_FREE_ADAPTER_VERSION,
  type RiskFreeFetchOutcome,
} from '../priceFeeds/rbiRiskFree.v1.js';
import type { IndexFetchRange } from '../priceFeeds/nseIndices.v1.js';

const TZ = 'Asia/Kolkata';

export const RISK_FREE_JOB_ADAPTER_ID = RBI_RISK_FREE_ADAPTER_ID;
export const RISK_FREE_JOB_ADAPTER_VERSION = RBI_RISK_FREE_ADAPTER_VERSION;

/**
 * The series this job maintains. `RiskFreeRate.series` is a plain string
 * because the schema anticipates a second curve ("MIBOR_ON"); the job takes it
 * as an option so a future feed reuses this shape rather than being copied.
 */
export const DEFAULT_RISK_FREE_SERIES = 'TBILL_91D';

/**
 * Default catch-up window for the weekly run.
 *
 * Ninety days, not seven. A weekly series with a missed run, a skipped auction
 * around a holiday, or a DBIE restatement needs slack; re-fetched rows that
 * already match are skipped by the value-diff, so a wide window costs
 * comparisons, not writes.
 */
const DEFAULT_LOOKBACK_DAYS = 90;

const DAY_MS = 86_400_000;
const MAX_ROW_FAILURES_DLQ = 10;

/** Injectable transport — the test supplies a fixture-backed implementation so
 *  nothing in the suite can reach data.rbi.org.in. */
export type RiskFreeFetcher = (range: IndexFetchRange) => Promise<RiskFreeFetchOutcome>;

export interface RiskFreeRateJobOptions {
  from?: Date;
  to?: Date;
  lookbackDays?: number;
  /** Ignore the resume point and re-fetch the whole window (backfill). */
  fullRange?: boolean;
  /** Series name to store under. See `DEFAULT_RISK_FREE_SERIES`. */
  series?: string;
  /** Owner of `IngestionFailure` rows — `RiskFreeRate` is reference data with
   *  no natural owner, but the DLQ is user-scoped. Defaults to oldest ADMIN. */
  opsUserId?: string;
  now?: Date;
  fetchSeries?: RiskFreeFetcher;
}

export interface RiskFreeRateJobResult {
  series: string;
  status: 'OK' | 'FAILED';
  /** Observed rows the parser accepted. Nothing else is ever written. */
  rowsSeen: number;
  rowsInserted: number;
  /** Present with a different rate — a DBIE restatement. */
  rowsUpdated: number;
  /** Present and identical. The idempotency signal. */
  rowsSkipped: number;
  /** Row-level parser rejections (`missing_rate`, `rate_out_of_range`, …). */
  rowsFailed: number;
  /** Latest stored observation after this run, or `null` if there are none. */
  latestDate: string | null;
  dlqRowsWritten: number;
  failureReason: string | null;
  ms: number;
}

let running = false;

// ---------------------------------------------------------------------------
// entry points
// ---------------------------------------------------------------------------

/**
 * `runAsSystem` because `RiskFreeRate` is cross-tenant reference data, and
 * because `IngestionFailure` and `User` are user-scoped and would otherwise
 * fail closed to zero rows (`CONTEXT.md §5`).
 */
export async function runRiskFreeRates(
  options: RiskFreeRateJobOptions = {},
): Promise<RiskFreeRateJobResult> {
  return runAsSystem(() => runRiskFreeRatesInner(options));
}

/** Cron wrapper with the usual single-flight guard. */
export async function runRiskFreeRateJob(): Promise<RiskFreeRateJobResult | null> {
  if (running) {
    logger.warn('[cron] risk-free rate job already running — skipping');
    return null;
  }
  running = true;
  try {
    const result = await runRiskFreeRates();
    logger.info(result, '[cron] risk-free rates done');
    return result;
  } catch (err) {
    logger.error({ err }, '[cron] risk-free rate job failed');
    throw err;
  } finally {
    running = false;
  }
}

/**
 * Weekly, Monday 06:00 IST per `01 §5`. Monday morning because T-bill auctions
 * settle during the preceding week and DBIE publishes over the weekend; early
 * because everything downstream that needs a risk-free rate runs later in the
 * day.
 *
 * NOT self-registering: call this from the job registration site.
 */
export function startRiskFreeRateJob(): void {
  if (process.env.ENABLE_PRICE_CRONS === 'false') {
    logger.info('[cron] risk-free rate job disabled via ENABLE_PRICE_CRONS=false');
    return;
  }
  cron.schedule('0 6 * * 1', () => void runRiskFreeRateJob(), { timezone: TZ });
  logger.info('[cron] scheduled: risk-free rates @Mon 06:00 IST');
}

// ---------------------------------------------------------------------------
// implementation
// ---------------------------------------------------------------------------

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** `RiskFreeRate.ratePct` is `Decimal(12,6)`. Compare at the column's own
 *  precision or the job rewrites the same rows forever. */
function toStored(v: Decimal): string {
  return v.toFixed(6, Decimal.ROUND_HALF_EVEN);
}

function riskFreeSourceHash(series: string, date: Date, rateFixed: string): string {
  return createHash('sha256')
    .update(`riskfree:${RISK_FREE_JOB_ADAPTER_ID}:${series}:${isoDay(date)}:${rateFixed}`)
    .digest('hex');
}

async function runRiskFreeRatesInner(
  options: RiskFreeRateJobOptions,
): Promise<RiskFreeRateJobResult> {
  const t0 = Date.now();
  const now = options.now ?? new Date();
  const today = utcMidnight(now);
  const series = options.series ?? DEFAULT_RISK_FREE_SERIES;
  const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const windowEnd = options.to ? utcMidnight(options.to) : today;
  const fetchSeries = options.fetchSeries ?? fetchRbi91DayTbill;

  const result: RiskFreeRateJobResult = {
    series,
    status: 'OK',
    rowsSeen: 0,
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsSkipped: 0,
    rowsFailed: 0,
    latestDate: null,
    dlqRowsWritten: 0,
    failureReason: null,
    ms: 0,
  };

  const opsUserId = await resolveOpsUserId(options.opsUserId);
  const latestBefore = await latestStoredDate(series);

  // Resume from the last stored observation (inclusive), so a DBIE restatement
  // of that week is picked up rather than frozen forever.
  const from = options.from
    ? utcMidnight(options.from)
    : options.fullRange || latestBefore === null
      ? new Date(windowEnd.getTime() - lookbackDays * DAY_MS)
      : latestBefore;

  if (from.getTime() <= windowEnd.getTime()) {
    const outcome = await fetchSeries({ from, to: windowEnd });

    if (!outcome.ok) {
      result.status = 'FAILED';
      result.failureReason = `[${outcome.reason}] ${outcome.detail}`;
      result.dlqRowsWritten += await recordFailure(
        opsUserId,
        outcome.sourceRef,
        result.failureReason,
        {
          series,
          reason: outcome.reason,
          httpStatus: outcome.httpStatus ?? null,
          bodySample: outcome.bodySample ?? null,
          from: isoDay(from),
          to: isoDay(windowEnd),
        },
      );
    } else {
      result.rowsSeen = outcome.rows.length;
      result.rowsFailed = outcome.failures.length;

      // ONLY the rows the parser observed and accepted. No fill, no
      // interpolation, no synthesised weeks. See the header.
      const written = await persistRows(series, outcome.rows);
      result.rowsInserted = written.inserted;
      result.rowsUpdated = written.updated;
      result.rowsSkipped = written.skipped;

      result.dlqRowsWritten += await recordRowFailures(
        opsUserId,
        series,
        outcome.failures,
        outcome.sourceRef,
      );
    }
  }

  const latestAfter = await latestStoredDate(series);
  result.latestDate = latestAfter ? isoDay(latestAfter) : null;
  result.ms = Date.now() - t0;
  return result;
}

async function latestStoredDate(series: string): Promise<Date | null> {
  const row = await prisma.riskFreeRate.findFirst({
    where: { series },
    orderBy: { date: 'desc' },
    select: { date: true },
  });
  return row ? utcMidnight(row.date) : null;
}

interface PersistResult {
  inserted: number;
  updated: number;
  skipped: number;
}

/**
 * Upsert observed rows on `(series, date)`.
 *
 * Not wrapped in one long transaction — same reasoning as
 * `benchmarkPriceJob.persistRows`: reference-data upserts, each individually
 * idempotent, so a half-finished run converges on the next pass and atomicity
 * would buy nothing but connection contention. Where a block genuinely must be
 * atomic the tool is `runInTransaction` from `lib/prisma.ts`, never
 * `prisma.$transaction`.
 */
async function persistRows(
  series: string,
  rows: readonly RiskFreeRow[],
): Promise<PersistResult> {
  const out: PersistResult = { inserted: 0, updated: 0, skipped: 0 };
  if (rows.length === 0) return out;

  const times = rows.map((r) => r.date.getTime());
  const existing = await prisma.riskFreeRate.findMany({
    where: {
      series,
      date: { gte: new Date(Math.min(...times)), lte: new Date(Math.max(...times)) },
    },
    select: { id: true, date: true, ratePct: true },
  });
  const byDay = new Map(existing.map((e) => [utcMidnight(e.date).getTime(), e]));

  const toInsert: { series: string; date: Date; ratePct: string; sourceHash: string }[] = [];
  const toUpdate: { id: string; ratePct: string; sourceHash: string }[] = [];

  for (const row of rows) {
    const day = utcMidnight(row.date);
    const stored = toStored(row.ratePct);
    const current = byDay.get(day.getTime());
    if (!current) {
      toInsert.push({
        series,
        date: day,
        ratePct: stored,
        sourceHash: riskFreeSourceHash(series, day, stored),
      });
      continue;
    }
    if (toStored(new Decimal(current.ratePct.toString())) === stored) {
      out.skipped += 1;
      continue;
    }
    toUpdate.push({
      id: current.id,
      ratePct: stored,
      sourceHash: riskFreeSourceHash(series, day, stored),
    });
  }

  if (toInsert.length > 0) {
    const res = await prisma.riskFreeRate.createMany({ data: toInsert, skipDuplicates: true });
    out.inserted += res.count;
    out.skipped += toInsert.length - res.count;
  }

  for (const u of toUpdate) {
    await prisma.riskFreeRate.update({
      where: { id: u.id },
      data: { ratePct: u.ratePct, sourceHash: u.sourceHash },
    });
    out.updated += 1;
  }

  return out;
}

async function recordRowFailures(
  opsUserId: string | null,
  series: string,
  failures: readonly RiskFreeParseFailure[],
  sourceRef: string,
): Promise<number> {
  if (failures.length === 0) return 0;
  const sample = failures.slice(0, MAX_ROW_FAILURES_DLQ);
  const message =
    `${failures.length} row(s) rejected while parsing the ${series} series` +
    (failures.length > sample.length ? ` (first ${sample.length} recorded)` : '') +
    `: ${sample.map((f) => `line ${f.line}: ${f.reason}`).join('; ')}. ` +
    `A rejected rate is stored as no row at all — never as zero.`;
  return recordFailure(opsUserId, sourceRef, message, {
    series,
    rowFailures: sample.map((f) => ({ line: f.line, reason: f.reason, raw: f.raw.slice(0, 200) })),
    totalRowFailures: failures.length,
  });
}

async function recordFailure(
  opsUserId: string | null,
  sourceRef: string,
  error: unknown,
  rawPayload: Record<string, unknown>,
): Promise<number> {
  if (opsUserId === null) {
    logger.error(
      { error },
      '[riskFreeRate] no ADMIN user to attribute the IngestionFailure to — DLQ write skipped',
    );
    return 0;
  }
  const row = await writeIngestionFailure({
    userId: opsUserId,
    sourceAdapter: RISK_FREE_JOB_ADAPTER_ID,
    adapterVersion: RISK_FREE_JOB_ADAPTER_VERSION,
    sourceRef: `RiskFreeRate:${sourceRef}`,
    error: error instanceof Error ? error : String(error),
    rawPayload,
  });
  return row ? 1 : 0;
}

/** Identical to the sibling reference-data jobs, on purpose. */
let cachedOpsUserId: string | null | undefined;

async function resolveOpsUserId(explicit?: string): Promise<string | null> {
  if (explicit) return explicit;
  if (cachedOpsUserId !== undefined) return cachedOpsUserId;
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  cachedOpsUserId = admin?.id ?? null;
  return cachedOpsUserId;
}

/** Test seam — the ops-user cache is process-wide. */
export function __resetRiskFreeOpsUserCache(): void {
  cachedOpsUserId = undefined;
}
