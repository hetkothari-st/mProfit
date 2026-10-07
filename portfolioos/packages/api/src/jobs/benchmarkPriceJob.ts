/**
 * Daily benchmark-index price job — `01-DATA-FOUNDATION.md §5`
 * ("`benchmarkPriceJob` | daily 20:00 IST | `nseIndices` + `bseIndices` →
 * `BenchmarkIndexPrice`"), `06 §7` (staleness alert), `07` Task 1.3.
 *
 * The side-effecting half of a pair, like `mfNavAdjustmentJob`: every byte of
 * parsing lives in the pure, fixture-tested `nseIndices.parse.ts` /
 * `bseIndices.parse.ts`, every URL in the `.v1.ts` fetchers. This file is I/O,
 * bookkeeping and failure policy.
 *
 * =============================================================================
 * THE FOUR PROPERTIES THIS JOB GUARANTEES
 * =============================================================================
 *
 * 1. **A same-day re-run is a no-op** (`CONTEXT.md §3.3`, `01 §5`). Every write
 *    is an upsert on `(indexCode, date)` AND a value-diff: a row whose stored
 *    value already equals the fetched one is not written at all. Both halves
 *    matter — the unique key stops duplicates, the value-diff stops the job
 *    rewriting 2,500 identical rows every night and makes `rowsInserted: 0` a
 *    meaningful assertion in the idempotency test.
 *
 * 2. **One index's failure is one index's failure** (`CONTEXT.md §3.5`). A
 *    broken feed writes an `IngestionFailure` and the loop continues; it does
 *    not take the other thirteen down.
 *
 * 3. **Nothing is fabricated.** A fetch that returns no usable text is a
 *    failure outcome, never zero rows reported as success. A benchmark that
 *    silently stops updating is worse than one that visibly breaks: every
 *    metric computed against a stale series still produces a confident number.
 *
 * 4. **Only Total Return Indices are ever priced** (`00-README` invariant 9,
 *    `01 §6`). The `BenchmarkIndex_isTotalReturn_check` constraint added by
 *    `20260904180000_benchmark_index_seed` makes a price-return row
 *    unstorable, and `assertTotalReturnIndex` is called again here before a
 *    single request is made. That is deliberate duplication: the reason a PRI
 *    benchmark is catastrophic (roughly the market's dividend yield, ~1.2-1.5%
 *    p.a. in India, showing up as invented alpha in every metric and every
 *    rating, undetectably) is exactly the reason one layer of enforcement is
 *    not enough.
 *
 * =============================================================================
 * THE STALENESS ALERT, AND WHY IT IS SUPPRESSED FOR SOME INDICES
 * =============================================================================
 * `06 §7`: alert when an index has had no new row for more than 3 business
 * days. Business days come from `countBusinessDaysBetween` in the parser
 * module — the same arithmetic `detectGaps` uses, so "a gap" and "stale" can
 * never disagree about what a weekend is. An ordinary Fri→Mon gap counts zero
 * business days and never alerts.
 *
 * Codes in `BENCHMARK_TRI_NOT_FREELY_AVAILABLE` are exempt. We already know we
 * have no free daily feed for CRISIL and for NSE's fixed-income and hybrid
 * series; alerting on them would fire every single day, forever, for a
 * condition no operator can fix from an alert. An alert that always fires is an
 * alert everyone learns to close without reading — and the next one it hides is
 * the real one. Their absence is instead surfaced honestly downstream as
 * `BENCHMARK_UNAVAILABLE` (`02-METRICS.md §1`) on the affected schemes.
 *
 * For the same reason a `NOT_CONFIGURED` fetch outcome does NOT write a DLQ
 * row: a permanent, known, documented gap is configuration, not a failure. The
 * DLQ is for things a human can act on.
 *
 * REGISTRATION: this module deliberately does not register itself.
 * `startBenchmarkPriceJob()` is exported for the boot sequence to call, exactly
 * as `startMfNavAdjustmentJob` / `startMfPeerRankJob` do.
 */

import cron from 'node-cron';
import { createHash } from 'node:crypto';
import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import { writeIngestionFailure } from '../services/ingestionFailures.service.js';
import {
  countBusinessDaysBetween,
  type IndexParseFailure,
  type IndexPriceRow,
} from '../priceFeeds/nseIndices.parse.js';
import {
  assertTotalReturnIndex,
  BENCHMARK_TRI_NOT_FREELY_AVAILABLE,
} from '../priceFeeds/benchmarkIndexSeed.js';
import {
  fetchNiftyIndexHistory,
  type IndexFetchOutcome,
  type IndexFetchRange,
} from '../priceFeeds/nseIndices.v1.js';
import { fetchBseIndexHistory } from '../priceFeeds/bseIndices.v1.js';

const TZ = 'Asia/Kolkata';

export const BENCHMARK_PRICE_ADAPTER_ID = 'mf.benchmarkPrice';
export const BENCHMARK_PRICE_ADAPTER_VERSION = '1';

/** `06 §7`. More than this many business days without a row is an alert. */
export const STALE_BUSINESS_DAY_THRESHOLD = 3;

/**
 * Default catch-up window for the nightly run.
 *
 * Wide enough that a week of failed runs, a long holiday stretch, or a late
 * restatement is picked up automatically without anyone running the backfill.
 * Costs nothing: re-fetched rows that already match are skipped by the
 * value-diff, so the extra range is a handful of comparisons, not writes.
 */
const DEFAULT_LOOKBACK_DAYS = 45;

/** Rows per `createMany`. Keeps the statement and its parameter list sane. */
const WRITE_CHUNK = 500;

/**
 * Wall-clock ceiling, matching `lib/queue.ts`'s 5-minute `JOB_TIMEOUT_MS` /
 * `LOCK_DURATION_MS`. This job is cron-driven, not queued, but is sized as
 * though it were: a job that only fits outside the lock window is a job that
 * gets re-enqueued mid-flight. Overrun stops cleanly with `truncated: true`,
 * and because every step is idempotent the next run simply carries on.
 */
const MAX_RUN_MS = 5 * 60 * 1000;
const RUN_BUDGET_MS = MAX_RUN_MS - 20_000;

const DAY_MS = 86_400_000;

/** Fetcher seam. The job and backfill leave this unset; tests supply a
 *  fixture-backed implementation so no test in this repo can reach NSE/BSE. */
export type BenchmarkFetcher = (
  index: { code: string; provider: string },
  range: IndexFetchRange,
) => Promise<IndexFetchOutcome>;

export interface BenchmarkPriceJobOptions {
  /** Restrict to these index codes. Omit for every seeded index. */
  indexCodes?: readonly string[];
  /** Explicit window start. Overrides the resume point and `lookbackDays`. */
  from?: Date;
  /** Explicit window end. Defaults to today (UTC date of `now`). */
  to?: Date;
  /** Catch-up window when an index has no stored rows. */
  lookbackDays?: number;
  /** Ignore the per-index resume point and re-fetch the whole window. The
   *  backfill sets this; the nightly run must not, or it would re-request a
   *  decade every night. */
  fullRange?: boolean;
  /**
   * Who owns the `IngestionFailure` / `Alert` rows. Both models are
   * user-scoped; benchmark prices are reference data with no natural owner, so
   * operational rows are attributed to an admin. Defaults to the oldest active
   * ADMIN; with none present the DLQ write is logged at `error` and skipped
   * rather than fabricating a user.
   */
  opsUserId?: string;
  /** `06 §7` threshold, in business days. */
  staleBusinessDayThreshold?: number;
  /** Codes exempt from the staleness alert. Defaults to
   *  `BENCHMARK_TRI_NOT_FREELY_AVAILABLE` — see the header. */
  suppressStaleAlertFor?: readonly string[];
  /** Injectable clock, so a test's `triggerDate` and staleness maths are
   *  deterministic. */
  now?: Date;
  /** Injectable transport. */
  fetchIndex?: BenchmarkFetcher;
  /** Wall-clock budget; the backfill raises this. */
  maxRunMs?: number;
}

export type BenchmarkIndexRunStatus =
  | 'OK'
  /** Provider/code has no configured request mapping. Known gap, not a fault. */
  | 'SKIPPED_NOT_CONFIGURED'
  /** Fetch or parse failed. A DLQ row was written. */
  | 'FAILED'
  /** Belt-and-braces: a price-return row somehow exists in `BenchmarkIndex`. */
  | 'REJECTED_PRI';

export interface BenchmarkIndexRunSummary {
  code: string;
  provider: string;
  status: BenchmarkIndexRunStatus;
  /** Rows the parser accepted from the source. */
  rowsSeen: number;
  rowsInserted: number;
  /** Present with a different value — a restatement by the source. */
  rowsUpdated: number;
  /** Present and identical. The idempotency signal. */
  rowsSkipped: number;
  /** Row-level parser rejections (bad date, non-positive value, …). */
  rowsFailed: number;
  /** Latest stored observation AFTER this run. ISO date, or null if the index
   *  has never had a single row — `null`, never a zero or an epoch. */
  latestDate: string | null;
  /** Business days since `latestDate`. `null` when there is no observation at
   *  all: "we have never had data" is not "we are 0 days stale". */
  staleBusinessDays: number | null;
  staleAlertRaised: boolean;
  staleAlertSuppressed: boolean;
  failureReason: string | null;
}

export interface BenchmarkPriceJobResult {
  indices: BenchmarkIndexRunSummary[];
  rowsSeen: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsFailed: number;
  indicesFailed: number;
  indicesSkipped: number;
  alertsRaised: number;
  dlqRowsWritten: number;
  truncated: boolean;
  ms: number;
}

let running = false;

// ---------------------------------------------------------------------------
// entry points
// ---------------------------------------------------------------------------

/**
 * Run one pass. `runAsSystem` because it reads and writes reference data across
 * every tenant, and because `IngestionFailure`, `Alert` and `User` are
 * user-scoped and would otherwise fail closed to zero rows (`CONTEXT.md §5`).
 */
export async function runBenchmarkPrices(
  options: BenchmarkPriceJobOptions = {},
): Promise<BenchmarkPriceJobResult> {
  return runAsSystem(() => runBenchmarkPricesInner(options));
}

/** Cron wrapper with the single-flight guard the other price jobs use. */
export async function runBenchmarkPriceJob(): Promise<BenchmarkPriceJobResult | null> {
  if (running) {
    logger.warn('[cron] benchmark price job already running — skipping');
    return null;
  }
  running = true;
  try {
    const result = await runBenchmarkPrices();
    logger.info(
      {
        rowsInserted: result.rowsInserted,
        rowsUpdated: result.rowsUpdated,
        indicesFailed: result.indicesFailed,
        alertsRaised: result.alertsRaised,
        ms: result.ms,
      },
      '[cron] benchmark prices done',
    );
    return result;
  } catch (err) {
    logger.error({ err }, '[cron] benchmark price job failed');
    throw err;
  } finally {
    running = false;
  }
}

/**
 * Daily 20:00 IST per `01 §5` — after the Indian market close and after the
 * index providers publish their EOD files, and comfortably before
 * `mfMetricsJob` at 22:00, which reads what this writes.
 *
 * NOT self-registering: call this from the job registration site.
 */
export function startBenchmarkPriceJob(): void {
  if (process.env.ENABLE_PRICE_CRONS === 'false') {
    logger.info('[cron] benchmark price job disabled via ENABLE_PRICE_CRONS=false');
    return;
  }
  cron.schedule('0 20 * * *', () => void runBenchmarkPriceJob(), { timezone: TZ });
  logger.info('[cron] scheduled: benchmark prices @20:00 IST');
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

/**
 * Idempotency key for one observation (`§6.2` style, scope-prefixed).
 *
 * The value is part of the hash so a restatement by the source is visibly a
 * different artefact. Deduplication is done by the `(indexCode, date)` unique
 * key, not by this hash — so including the value cannot cause a duplicate row,
 * only an honest record of which bytes produced the stored number.
 */
function benchmarkSourceHash(indexCode: string, date: Date, valueFixed: string): string {
  return createHash('sha256')
    .update(`benchmark:${BENCHMARK_PRICE_ADAPTER_ID}:${indexCode}:${isoDay(date)}:${valueFixed}`)
    .digest('hex');
}

/**
 * Store at the column's own precision, `Decimal(18,6)`.
 *
 * Comparing a full-precision computed value against the ROUNDED value Postgres
 * hands back would differ on every run and rewrite the same rows forever —
 * exactly the trap `mfNavAdjustmentJob` documents. Banker's rounding matches
 * `CLAUDE.md §14.3`.
 */
function toStored(v: Decimal): string {
  return v.toFixed(6, Decimal.ROUND_HALF_EVEN);
}

function defaultFetcher(
  index: { code: string; provider: string },
  range: IndexFetchRange,
): Promise<IndexFetchOutcome> {
  switch (index.provider) {
    case 'NSE':
      return fetchNiftyIndexHistory(index.code, range);
    case 'BSE':
      return fetchBseIndexHistory(index.code, range);
    default:
      // CRISIL and anything else added later. Not a failure — a documented,
      // permanent gap (`benchmarkIndexSeed.ts`). Reported as NOT_CONFIGURED so
      // the caller skips it without a DLQ row.
      return Promise.resolve({
        ok: false,
        reason: 'NOT_CONFIGURED',
        detail:
          `No price feed exists for provider "${index.provider}" (index ` +
          `"${index.code}"). CRISIL licenses its index history; there is no ` +
          `free daily download. Schemes benchmarked here must degrade to ` +
          `BENCHMARK_UNAVAILABLE rather than compare against nothing.`,
        sourceRef: index.code,
      });
  }
}

async function runBenchmarkPricesInner(
  options: BenchmarkPriceJobOptions,
): Promise<BenchmarkPriceJobResult> {
  const t0 = Date.now();
  const now = options.now ?? new Date();
  const today = utcMidnight(now);
  const budgetMs = options.maxRunMs ?? RUN_BUDGET_MS;
  const threshold = options.staleBusinessDayThreshold ?? STALE_BUSINESS_DAY_THRESHOLD;
  const suppressed = new Set(options.suppressStaleAlertFor ?? BENCHMARK_TRI_NOT_FREELY_AVAILABLE);
  const fetchIndex = options.fetchIndex ?? defaultFetcher;
  const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const windowEnd = options.to ? utcMidnight(options.to) : today;

  const opsUserId = await resolveOpsUserId(options.opsUserId);

  const indices = await prisma.benchmarkIndex.findMany({
    where: options.indexCodes ? { code: { in: [...options.indexCodes] } } : undefined,
    orderBy: { code: 'asc' },
  });

  const result: BenchmarkPriceJobResult = {
    indices: [],
    rowsSeen: 0,
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsSkipped: 0,
    rowsFailed: 0,
    indicesFailed: 0,
    indicesSkipped: 0,
    alertsRaised: 0,
    dlqRowsWritten: 0,
    truncated: false,
    ms: 0,
  };

  for (const index of indices) {
    if (Date.now() - t0 > budgetMs) {
      result.truncated = true;
      logger.warn(
        { processed: result.indices.length, budgetMs },
        '[benchmarkPrice] run budget exhausted — stopping; next run resumes (idempotent)',
      );
      break;
    }

    const summary: BenchmarkIndexRunSummary = {
      code: index.code,
      provider: index.provider,
      status: 'OK',
      rowsSeen: 0,
      rowsInserted: 0,
      rowsUpdated: 0,
      rowsSkipped: 0,
      rowsFailed: 0,
      latestDate: null,
      staleBusinessDays: null,
      staleAlertRaised: false,
      staleAlertSuppressed: suppressed.has(index.code),
      failureReason: null,
    };

    // Belt-and-braces TRI gate. The CHECK constraint should make this
    // unreachable; if it is ever reached, something bypassed the database and
    // the correct response is to refuse to price the index and say so loudly,
    // not to fetch it and hope.
    try {
      assertTotalReturnIndex(index);
    } catch (err) {
      summary.status = 'REJECTED_PRI';
      summary.failureReason = err instanceof Error ? err.message : String(err);
      result.indicesFailed += 1;
      result.dlqRowsWritten += await recordFailure(opsUserId, index.code, index.code, err, {
        provider: index.provider,
        isTotalReturn: index.isTotalReturn,
      });
      result.indices.push(summary);
      continue;
    }

    const latestBefore = await latestStoredDate(index.code);
    // Resume point: re-fetch from the last stored day (inclusive) so a same-day
    // restatement is picked up, rather than from the day after, which would
    // freeze the last row's value forever.
    const from = options.from
      ? utcMidnight(options.from)
      : options.fullRange || latestBefore === null
        ? new Date(windowEnd.getTime() - lookbackDays * DAY_MS)
        : latestBefore;

    if (from.getTime() > windowEnd.getTime()) {
      // Nothing to ask for. Still fall through to the staleness check below.
      summary.rowsSkipped = 0;
    } else {
      const outcome = await fetchIndex(
        { code: index.code, provider: index.provider },
        { from, to: windowEnd },
      );

      if (!outcome.ok) {
        if (outcome.reason === 'NOT_CONFIGURED') {
          summary.status = 'SKIPPED_NOT_CONFIGURED';
          summary.failureReason = outcome.detail;
          result.indicesSkipped += 1;
          logger.debug(
            { code: index.code, detail: outcome.detail },
            '[benchmarkPrice] no feed configured — skipping (not a failure)',
          );
        } else {
          summary.status = 'FAILED';
          summary.failureReason = `[${outcome.reason}] ${outcome.detail}`;
          result.indicesFailed += 1;
          result.dlqRowsWritten += await recordFailure(
            opsUserId,
            index.code,
            outcome.sourceRef,
            `[${outcome.reason}] ${outcome.detail}`,
            {
              provider: index.provider,
              reason: outcome.reason,
              httpStatus: outcome.httpStatus ?? null,
              bodySample: outcome.bodySample ?? null,
              from: isoDay(from),
              to: isoDay(windowEnd),
            },
          );
        }
      } else {
        summary.rowsSeen = outcome.rows.length;
        summary.rowsFailed = outcome.failures.length;
        const written = await persistRows(index.code, outcome.rows);
        summary.rowsInserted = written.inserted;
        summary.rowsUpdated = written.updated;
        summary.rowsSkipped = written.skipped;

        result.dlqRowsWritten += await recordRowFailures(
          opsUserId,
          index.code,
          outcome.failures,
          outcome.sourceRef,
        );
      }
    }

    // ---- staleness (`06 §7`) --------------------------------------------
    const latestAfter = await latestStoredDate(index.code);
    summary.latestDate = latestAfter ? isoDay(latestAfter) : null;
    // `null`, not 0, when there has never been an observation: "we have never
    // had this data" and "we are bang up to date" must not look the same.
    summary.staleBusinessDays =
      latestAfter === null ? null : countBusinessDaysBetween(latestAfter, today);

    const isStale =
      latestAfter === null || (summary.staleBusinessDays ?? 0) > threshold;

    if (isStale && !summary.staleAlertSuppressed) {
      const raised = await raiseStaleAlert({
        opsUserId,
        code: index.code,
        provider: index.provider,
        latestDate: summary.latestDate,
        staleBusinessDays: summary.staleBusinessDays,
        threshold,
        today,
      });
      summary.staleAlertRaised = raised;
      if (raised) result.alertsRaised += 1;
    }

    result.rowsSeen += summary.rowsSeen;
    result.rowsInserted += summary.rowsInserted;
    result.rowsUpdated += summary.rowsUpdated;
    result.rowsSkipped += summary.rowsSkipped;
    result.rowsFailed += summary.rowsFailed;
    result.indices.push(summary);
  }

  result.ms = Date.now() - t0;
  return result;
}

async function latestStoredDate(indexCode: string): Promise<Date | null> {
  const row = await prisma.benchmarkIndexPrice.findFirst({
    where: { indexCode },
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
 * Upsert observations on `(indexCode, date)`.
 *
 * NOT wrapped in one long transaction, on purpose. These are reference-data
 * upserts over a range that can reach several thousand rows on a backfill;
 * holding a single transaction across all of them would pin a connection and
 * serialise unrelated work for minutes (`CLAUDE.md` BUG-011, and the sizing
 * reasoning in `mfPeerRankJob.ts`). Atomicity buys nothing here because every
 * write is individually idempotent: a run that dies halfway leaves a prefix of
 * correct rows, and the next run converges on exactly the same state. Where a
 * multi-row block genuinely must be atomic, the tool is `runInTransaction`
 * from `lib/prisma.ts` — never `prisma.$transaction`, which re-dispatches
 * user-scoped operations onto separate connections and is not atomic
 * (`CONTEXT.md §5`).
 */
async function persistRows(
  indexCode: string,
  rows: readonly IndexPriceRow[],
): Promise<PersistResult> {
  const out: PersistResult = { inserted: 0, updated: 0, skipped: 0 };
  if (rows.length === 0) return out;

  const dates = rows.map((r) => r.date);
  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime())));

  const existing = await prisma.benchmarkIndexPrice.findMany({
    where: { indexCode, date: { gte: min, lte: max } },
    select: { id: true, date: true, value: true },
  });
  const byDay = new Map(
    existing.map((e) => [utcMidnight(e.date).getTime(), e]),
  );

  const toInsert: { indexCode: string; date: Date; value: string; sourceHash: string }[] = [];
  const toUpdate: { id: string; value: string; sourceHash: string }[] = [];

  for (const row of rows) {
    const day = utcMidnight(row.date);
    const stored = toStored(row.value);
    const current = byDay.get(day.getTime());
    if (!current) {
      toInsert.push({
        indexCode,
        date: day,
        value: stored,
        sourceHash: benchmarkSourceHash(indexCode, day, stored),
      });
      continue;
    }
    if (toStored(new Decimal(current.value.toString())) === stored) {
      out.skipped += 1; // idempotency: identical, nothing to write
      continue;
    }
    toUpdate.push({
      id: current.id,
      value: stored,
      sourceHash: benchmarkSourceHash(indexCode, day, stored),
    });
  }

  for (let i = 0; i < toInsert.length; i += WRITE_CHUNK) {
    const chunk = toInsert.slice(i, i + WRITE_CHUNK);
    // `skipDuplicates` guards the narrow race where two runs overlap: the
    // unique key rejects the loser rather than the whole batch failing.
    const res = await prisma.benchmarkIndexPrice.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    out.inserted += res.count;
    out.skipped += chunk.length - res.count;
  }

  for (const u of toUpdate) {
    await prisma.benchmarkIndexPrice.update({
      where: { id: u.id },
      data: { value: u.value, sourceHash: u.sourceHash },
    });
    out.updated += 1;
  }

  return out;
}

/**
 * Row-level parser rejections. Capped: a wholesale format change can reject
 * every row of a decade, and 2,500 near-identical DLQ rows would bury the
 * `/ops/ingestion-failures` queue for everyone else. The cap is reported in
 * the summary row so nothing is silently dropped.
 */
const MAX_ROW_FAILURES_DLQ = 10;

async function recordRowFailures(
  opsUserId: string | null,
  indexCode: string,
  failures: readonly IndexParseFailure[],
  sourceRef: string,
): Promise<number> {
  if (failures.length === 0) return 0;
  const sample = failures.slice(0, MAX_ROW_FAILURES_DLQ);
  const message =
    `${failures.length} row(s) rejected while parsing ${indexCode}` +
    (failures.length > sample.length ? ` (first ${sample.length} recorded)` : '') +
    `: ${sample.map((f) => `line ${f.line}: ${f.reason}`).join('; ')}`;
  return recordFailure(opsUserId, indexCode, sourceRef, message, {
    rowFailures: sample.map((f) => ({ line: f.line, reason: f.reason, raw: f.raw.slice(0, 200) })),
    totalRowFailures: failures.length,
  });
}

/** One `IngestionFailure` (`CONTEXT.md §3.5`). Returns how many rows written. */
async function recordFailure(
  opsUserId: string | null,
  indexCode: string,
  sourceRef: string,
  error: unknown,
  rawPayload: Record<string, unknown>,
): Promise<number> {
  if (opsUserId === null) {
    logger.error(
      { indexCode, error },
      '[benchmarkPrice] no ADMIN user to attribute the IngestionFailure to — DLQ write skipped',
    );
    return 0;
  }
  const row = await writeIngestionFailure({
    userId: opsUserId,
    sourceAdapter: BENCHMARK_PRICE_ADAPTER_ID,
    adapterVersion: BENCHMARK_PRICE_ADAPTER_VERSION,
    sourceRef: `BenchmarkIndex:${sourceRef}`,
    error: error instanceof Error ? error : String(error),
    rawPayload: { indexCode, ...rawPayload },
  });
  return row ? 1 : 0;
}

/**
 * `06 §7`. One alert per index per ops user per day, however many times the job
 * runs — the dedup key is `(userId, type, title, triggerDate)`, the same shape
 * `mfNavAdjustmentJob` uses, so two reference-data jobs cannot disagree about
 * what "already alerted today" means.
 */
async function raiseStaleAlert(input: {
  opsUserId: string | null;
  code: string;
  provider: string;
  latestDate: string | null;
  staleBusinessDays: number | null;
  threshold: number;
  today: Date;
}): Promise<boolean> {
  if (input.opsUserId === null) {
    logger.error(
      { code: input.code, latestDate: input.latestDate },
      '[benchmarkPrice] benchmark stale but no ADMIN user to alert',
    );
    return false;
  }

  const title = `Benchmark index stale: ${input.code}`;
  const existing = await prisma.alert.findFirst({
    where: { userId: input.opsUserId, type: 'CUSTOM', title, triggerDate: input.today },
    select: { id: true },
  });
  if (existing) return true;

  const description =
    input.latestDate === null
      ? `${input.code} (${input.provider}) has no stored observations at all. Either the feed has never succeeded or the index has no free daily source. Check /ops/ingestion-failures.`
      : `${input.code} (${input.provider}) has had no new observation since ${input.latestDate} — ${input.staleBusinessDays} business days, above the ${input.threshold}-day threshold. Every benchmark-relative metric computed over this window is measured against a stale series. Check /ops/ingestion-failures.`;

  await prisma.alert.create({
    data: {
      userId: input.opsUserId,
      type: 'CUSTOM',
      title,
      description,
      triggerDate: input.today,
      metadata: {
        indexCode: input.code,
        provider: input.provider,
        latestDate: input.latestDate,
        staleBusinessDays: input.staleBusinessDays,
        thresholdBusinessDays: input.threshold,
        source: BENCHMARK_PRICE_ADAPTER_ID,
      },
    },
  });
  logger.warn(
    { code: input.code, latestDate: input.latestDate, staleBusinessDays: input.staleBusinessDays },
    '[benchmarkPrice] benchmark stale — alert raised',
  );
  return true;
}

/**
 * Deliberately identical to `mfNavAdjustmentJob.resolveOpsUserId` and
 * `mfPeerRankJob.resolveOpsUserId` — sibling reference-data jobs resolving
 * "who owns this failure" differently is how half the DLQ ends up somewhere
 * nobody is looking.
 */
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
export function __resetBenchmarkOpsUserCache(): void {
  cachedOpsUserId = undefined;
}
