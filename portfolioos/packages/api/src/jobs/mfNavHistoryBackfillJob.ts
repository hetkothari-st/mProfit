/**
 * MF NAV history backfill — `docs/mf-analytics/01-DATA-FOUNDATION.md §2`,
 * `07-IMPLEMENTATION-PLAN.md` Task 1.4.
 *
 * Walks the scheme master, pulls each scheme's full daily NAV history from
 * MFAPI through `priceFeeds/mfapiNavHistory.v1.ts`, and writes it into
 * `MFNav`.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS THE BINDING CONSTRAINT ON THE WHOLE ANALYTICS LAYER
 * ---------------------------------------------------------------------------
 *
 * `amfi.service.ts` ingests one day at a time, so `MFNav` starts on the day the
 * daily cron first ran. Everything above it needs years:
 *
 *   - `mfMetricsJob` computes 1/3/5/7/10-year return, volatility, Sharpe and
 *     max-drawdown from `MFNav.adjustedNav`. With one day of history every
 *     horizon returns `INSUFFICIENT_DATA`, so every scheme is unscored and the
 *     entire scoring, peer-rank and verdict stack has nothing to run on.
 *   - The Task 2.7 backtest needs monthly `MfSchemeMetrics` rows from 2016
 *     with 3-year forward windows — that is 10+ years of daily NAV before a
 *     single coefficient can be produced.
 *
 * ---------------------------------------------------------------------------
 * WHERE THIS SITS IN THE CHAIN — it is step 1 of 3, and it is not enough alone
 * ---------------------------------------------------------------------------
 *
 *   1. THIS JOB              -> `MFNav.nav`           (published NAV)
 *   2. `mfNavAdjustmentJob`  -> `MFNav.adjustedNav`   (+ quarantine flags)
 *   3. `mfMetricsJob`        -> `MfSchemeMetrics`
 *
 * Step 2 is NOT optional and this job deliberately does not do it. Every
 * metric reads `adjustedNav`, never `nav` (see the column comment on `MFNav`),
 * and a row written here has `adjustedNav = NULL` until the adjustment job
 * runs. So a backfill that stops after this job produces a database that looks
 * full of NAV history and still reports `INSUFFICIENT_DATA` everywhere. The
 * driver script `scripts/backfill-mf-nav-history.ts` chains 1 -> 2 for exactly
 * this reason.
 *
 * Keeping them separate rather than folding the adjustment in here is not
 * tidiness: `adjustedNav` for an IDCW option is derived from its GROWTH
 * sibling's series, so it can only be computed once BOTH siblings' histories
 * are on disk. A per-scheme "ingest then adjust" would compute the IDCW option
 * against whatever partial growth series existed at that moment.
 *
 * ---------------------------------------------------------------------------
 * IDEMPOTENCY: `createMany({ skipDuplicates })` on `(fundId, date)`
 * ---------------------------------------------------------------------------
 *
 * `MFNav` is `@@unique([fundId, date])`, so re-running writes zero rows and
 * changes zero values (`CONTEXT.md §3.3`). The insert is deliberately
 * skip-on-conflict rather than update-on-conflict, and that choice is
 * load-bearing:
 *
 *   - `nav` is published history. AMFI does not revise a NAV from 2015, so
 *     there is nothing to update, and re-ingesting is a genuine no-op rather
 *     than an unconditional rewrite of a million rows.
 *   - `adjustedNav` and `isQuarantined` sit on the SAME ROW and are owned by
 *     `mfNavAdjustmentJob`. An `ON CONFLICT DO UPDATE SET nav = …` here would
 *     move `nav` out from under an `adjustedNav` derived from the old value,
 *     leaving a row that is internally inconsistent and that nothing would
 *     ever recompute — the two columns would silently disagree forever.
 *
 * A corrected NAV therefore has to be a deliberate act (delete the row, re-run
 * both jobs), not a side effect of a backfill. That is the right default for a
 * column every return in the product is computed from.
 *
 * ---------------------------------------------------------------------------
 * OTHER PROPERTIES
 * ---------------------------------------------------------------------------
 *
 * - **One scheme's failure is one scheme's failure.** Every scheme is fetched
 *   and written inside its own try/catch; failures go to `IngestionFailure`
 *   and the loop continues (`CONTEXT.md §3.5`).
 * - **`MutualFundMaster` rows are created on demand.** AMFI publishes schemes
 *   we hold no master row for, and `MFNav.fundId` is a hard FK to it, so
 *   without this the backfill would silently skip exactly the schemes it
 *   exists to discover.
 * - **No long transaction.** Each scheme is thousands of independent NAV rows
 *   with no cross-row invariant; wrapping a 500-scheme run in one transaction
 *   would hold a connection for an hour and buy atomicity nobody needs. A
 *   partial run is a correct intermediate state the next run converges from,
 *   which is only true *because* of the idempotency above. Where an atomic
 *   commit is ever needed here it must be `runInTransaction` from
 *   `lib/prisma.ts`, never `prisma.$transaction`, which is not atomic under
 *   the RLS hook.
 *
 * Registration is deliberately absent: no import in `src/index.ts`. Export
 * `startMfNavHistoryBackfillJob` and let the boot sequence wire it, matching
 * `startMfMetadataJob` / `startMfPeerRankJob`.
 */

import cron from 'node-cron';
import { Prisma, type MFCategory, type MfSebiCategory } from '@prisma/client';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import { writeIngestionFailure } from '../services/ingestionFailures.service.js';
import {
  fetchMfapiNavHistoryBatch,
  DEFAULT_CONCURRENCY,
  DEFAULT_DELAY_MS,
  MFAPI_NAV_HISTORY_ADAPTER_ID,
  MFAPI_NAV_HISTORY_ADAPTER_VERSION,
  type FetchMfapiOptions,
  type MfapiNavHistoryOutcome,
} from '../priceFeeds/mfapiNavHistory.v1.js';
import type { NavPointFailure, ParsedNavPoint } from '../priceFeeds/mfapiNavHistory.parse.js';

const TZ = 'Asia/Kolkata';

/**
 * NAV rows per `createMany`.
 *
 * A full-history scheme is ~3,400 rows and Postgres parameter limits bite well
 * before that in a multi-row insert, so it has to be chunked regardless. 1,000
 * keeps a single statement comfortably inside those limits while making a
 * typical scheme 3-4 statements rather than 34.
 */
const NAV_CHUNK_SIZE = 1_000;

/** Schemes per progress log line. Purely cosmetic. */
const PROGRESS_EVERY = 25;

/**
 * Cap on DLQ rows from one run.
 *
 * A run over 5,000 schemes where MFAPI is down would otherwise write 5,000
 * near-identical failure rows, which is the same as having no DLQ because
 * nobody reads 5,000 rows. Past the cap the failures are still COUNTED in the
 * result and logged; they just stop being written individually.
 */
const MAX_DLQ_ROWS_PER_RUN = 200;

export interface MfNavHistoryBackfillOptions {
  /**
   * Explicit scheme codes. When absent, the universe is selected from
   * `MfSchemeMeta` by `filter`/`limit` below.
   */
  schemeCodes?: readonly string[];
  /**
   * Restricts the `MfSchemeMeta` selection. Production passes nothing (or an
   * ACTIVE filter); tests pass a reserved scheme-code band so a run against a
   * shared development database cannot touch rows another suite owns.
   */
  filter?: Prisma.MfSchemeMetaWhereInput;
  /** Cap the universe size. Applied after `filter`, ordered by scheme code. */
  limit?: number;
  /**
   * Skip schemes that already have at least this many `MFNav` rows.
   *
   * This is what makes a re-run cheap in NETWORK terms rather than only in
   * database terms. Without it, the second run still downloads ~130 KB per
   * scheme from a free host to discover it has nothing to insert — the writes
   * are idempotent but the traffic is not. Set to 0 to force a re-fetch.
   */
  skipIfNavRowsAtLeast?: number;
  concurrency?: number;
  delayMs?: number;
  /** Owner of `IngestionFailure` rows. Default: the oldest active ADMIN. */
  opsUserId?: string;
  /** Wall-clock ceiling. The run stops cleanly and reports `budgetExhausted`. */
  maxRunMs?: number;
  /** Injection seam for tests; forwarded to the fetcher. */
  transport?: FetchMfapiOptions['transport'];
  baseUrl?: string;
  retries?: number;
  retryDelayMs?: number;
}

export interface MfNavHistoryBackfillResult {
  /** Schemes in the selected universe. */
  selected: number;
  /** Schemes skipped by `skipIfNavRowsAtLeast` without a fetch. */
  skipped: number;
  /** Schemes fetched and written (possibly 0 new rows on a re-run). */
  ingested: number;
  /** `MutualFundMaster` rows created because none existed. */
  mastersCreated: number;
  /** NAV rows actually inserted (excludes ones skipped as duplicates). */
  navRowsInserted: number;
  /** Valid points offered to the database, inserted or already present. */
  navPointsSeen: number;
  /** Schemes MFAPI has no history for (200 + empty data). Not errors. */
  notFound: number;
  /** Schemes whose fetch or write failed. Each is counted in the DLQ budget. */
  failed: number;
  /** Point-level rejects across all schemes, by reason. */
  pointFailuresByReason: Record<string, number>;
  /** Scheme-level failures by reason. */
  schemeFailuresByReason: Record<string, number>;
  dlqWritten: number;
  /** Earliest and latest NAV date written this run. `null` if none. */
  earliestDate: Date | null;
  latestDate: Date | null;
  budgetExhausted: boolean;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// DLQ ownership — identical to mfMetadataJob / mfMetricsJob on purpose
// ---------------------------------------------------------------------------

/**
 * `IngestionFailure` needs a `userId` but reference-data ingestion is owned by
 * nobody. Attribute it to the oldest active ADMIN so it surfaces at
 * `/ops/ingestion-failures`; with no admin present, log at `error` and drop
 * rather than fabricate a user. Same resolution as the sibling reference-data
 * jobs — two of them disagreeing is how half the DLQ ends up unwatched.
 */
let opsUserIdCache: string | null | undefined;

async function resolveOpsUserId(override?: string): Promise<string | null> {
  if (override !== undefined) return override;
  if (opsUserIdCache !== undefined) return opsUserIdCache;
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  opsUserIdCache = admin?.id ?? null;
  return opsUserIdCache;
}

/** Exported for tests, which create an admin after this module is first loaded. */
export function resetOpsUserCache(): void {
  opsUserIdCache = undefined;
}

// ---------------------------------------------------------------------------
// MutualFundMaster
// ---------------------------------------------------------------------------

/**
 * `MfSchemeMeta.sebiCategory` -> the older, coarser `MutualFundMaster.category`.
 *
 * Two enums exist because they answer different questions and predate each
 * other: `MFCategory` is the holdings-side bucket the rest of the app has
 * always used, `MfSebiCategory` is the analytics-side SEBI classification.
 * Four of the five names coincide; the interesting case is OTHER, SEBI's
 * residual bucket for index funds, ETFs and FoFs, which `MFCategory` splits
 * into ETF / INDEX_FUND. `isEtf` (a real column, set by the metadata job from
 * the scheme name) resolves that split — which is precisely why it is stored
 * rather than re-derived here.
 *
 * This runs only when CREATING a master row. An existing row's category is
 * left alone: it is the holdings side's, and transactions and the FIFO
 * projection are keyed off it.
 */
function toMfCategory(sebiCategory: MfSebiCategory, isEtf: boolean, schemeName: string): MFCategory {
  switch (sebiCategory) {
    case 'EQUITY':
      // ELSS is an equity sub-category to SEBI but its own `MFCategory`,
      // because it carries a 3-year lock-in the capital-gains code needs to
      // know about.
      return /\bELSS\b|tax\s*saver|tax\s*saving/i.test(schemeName) ? 'ELSS' : 'EQUITY';
    case 'DEBT':
      return /\bliquid\b/i.test(schemeName) ? 'LIQUID' : 'DEBT';
    case 'HYBRID':
      return 'HYBRID';
    case 'SOLUTION_ORIENTED':
      return 'SOLUTION_ORIENTED';
    case 'OTHER':
      return isEtf ? 'ETF' : 'INDEX_FUND';
    default:
      return 'OTHER';
  }
}

interface SchemeUniverseRow {
  schemeCode: string;
  schemeName: string;
  amcName: string;
  isin: string | null;
  sebiCategory: MfSebiCategory;
  sebiSubCategory: string;
  isEtf: boolean;
}

/**
 * Resolve `schemeCode -> MutualFundMaster.id`, creating the row if absent.
 *
 * The create is `createMany({ skipDuplicates })` of one rather than `create`
 * so a concurrent run (the daily `loadAmfiNavToDb`, another backfill worker)
 * that inserted the same scheme a millisecond earlier is a no-op instead of a
 * unique-constraint throw that would DLQ a perfectly good scheme.
 */
async function ensureMaster(
  scheme: SchemeUniverseRow,
  meta: { schemeName: string | null; fundHouse: string | null },
): Promise<{ fundId: string; created: boolean }> {
  const existing = await prisma.mutualFundMaster.findUnique({
    where: { schemeCode: scheme.schemeCode },
    select: { id: true },
  });
  if (existing) return { fundId: existing.id, created: false };

  await prisma.mutualFundMaster.createMany({
    data: [
      {
        schemeCode: scheme.schemeCode,
        // `MfSchemeMeta` is the authority — it came from AMFI's own file and
        // has been through the plan/option parser. MFAPI's name is only the
        // fallback for a scheme we somehow have no meta row for.
        schemeName: scheme.schemeName || meta.schemeName || `Scheme ${scheme.schemeCode}`,
        amcName: scheme.amcName || meta.fundHouse || 'Unknown',
        category: toMfCategory(scheme.sebiCategory, scheme.isEtf, scheme.schemeName),
        subCategory: scheme.sebiSubCategory,
        isin: scheme.isin,
      },
    ],
    skipDuplicates: true,
  });

  const created = await prisma.mutualFundMaster.findUnique({
    where: { schemeCode: scheme.schemeCode },
    select: { id: true },
  });
  if (!created) {
    // Neither found nor creatable. Genuinely exceptional — the throw is caught
    // by the per-scheme handler and routed to the DLQ, never swallowed.
    throw new Error(`MutualFundMaster for scheme ${scheme.schemeCode} could not be created or found`);
  }
  return { fundId: created.id, created: true };
}

// ---------------------------------------------------------------------------
// NAV writing
// ---------------------------------------------------------------------------

async function insertNavPoints(
  fundId: string,
  points: readonly ParsedNavPoint[],
): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < points.length; i += NAV_CHUNK_SIZE) {
    const chunk = points.slice(i, i + NAV_CHUNK_SIZE);
    const res = await prisma.mFNav.createMany({
      data: chunk.map((p) => ({
        fundId,
        date: p.date,
        // `nav` is a `Money` string. Prisma parses it into `Decimal(18,4)`
        // without any IEEE-754 step, which is the whole reason the parser
        // hands over strings rather than numbers (`CONTEXT.md §3.1`).
        nav: p.nav,
        // `adjustedNav` and `isQuarantined` are left at their defaults on
        // purpose — `mfNavAdjustmentJob` owns them. See the header.
      })),
      skipDuplicates: true,
    });
    inserted += res.count;
  }
  return inserted;
}

// ---------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------

let running = false;

export async function runMfNavHistoryBackfill(
  options: MfNavHistoryBackfillOptions = {},
): Promise<MfNavHistoryBackfillResult> {
  const t0 = Date.now();
  const maxRunMs = options.maxRunMs ?? Number.POSITIVE_INFINITY;
  const skipThreshold = options.skipIfNavRowsAtLeast ?? 1;

  return runAsSystem(async () => {
    const result: MfNavHistoryBackfillResult = {
      selected: 0,
      skipped: 0,
      ingested: 0,
      mastersCreated: 0,
      navRowsInserted: 0,
      navPointsSeen: 0,
      notFound: 0,
      failed: 0,
      pointFailuresByReason: {},
      schemeFailuresByReason: {},
      dlqWritten: 0,
      earliestDate: null,
      latestDate: null,
      budgetExhausted: false,
      durationMs: 0,
    };

    const bumpPoint = (reason: string): void => {
      result.pointFailuresByReason[reason] = (result.pointFailuresByReason[reason] ?? 0) + 1;
    };
    const bumpScheme = (reason: string): void => {
      result.schemeFailuresByReason[reason] = (result.schemeFailuresByReason[reason] ?? 0) + 1;
    };

    // --- universe ----------------------------------------------------------
    const where: Prisma.MfSchemeMetaWhereInput = options.schemeCodes
      ? { schemeCode: { in: [...options.schemeCodes] } }
      : (options.filter ?? {});

    const universe = (await prisma.mfSchemeMeta.findMany({
      where,
      select: {
        schemeCode: true,
        schemeName: true,
        amcName: true,
        isin: true,
        sebiCategory: true,
        sebiSubCategory: true,
        isEtf: true,
      },
      orderBy: { schemeCode: 'asc' },
      ...(options.limit !== undefined ? { take: options.limit } : {}),
    })) as SchemeUniverseRow[];

    result.selected = universe.length;
    if (universe.length === 0) {
      result.durationMs = Date.now() - t0;
      logger.warn({ where }, '[mfNavHistory] no schemes selected — nothing to do');
      return result;
    }

    const bySchemeCode = new Map(universe.map((s) => [s.schemeCode, s]));

    // --- pre-skip ----------------------------------------------------------
    // One grouped count over the whole universe rather than a point read per
    // scheme inside the loop: on a re-run this is the query that saves several
    // hundred needless HTTP requests, so it must not itself cost N queries.
    const toFetch: string[] = [];
    if (skipThreshold > 0) {
      const masters = await prisma.mutualFundMaster.findMany({
        where: { schemeCode: { in: universe.map((s) => s.schemeCode) } },
        select: { id: true, schemeCode: true },
      });
      const codeByFundId = new Map(masters.map((m) => [m.id, m.schemeCode]));
      const counts = new Map<string, number>();
      if (masters.length > 0) {
        const grouped = await prisma.mFNav.groupBy({
          by: ['fundId'],
          where: { fundId: { in: masters.map((m) => m.id) } },
          _count: { _all: true },
        });
        for (const g of grouped) {
          const code = codeByFundId.get(g.fundId);
          if (code) counts.set(code, g._count._all);
        }
      }
      for (const s of universe) {
        if ((counts.get(s.schemeCode) ?? 0) >= skipThreshold) result.skipped += 1;
        else toFetch.push(s.schemeCode);
      }
    } else {
      for (const s of universe) toFetch.push(s.schemeCode);
    }

    logger.info(
      { selected: result.selected, skipped: result.skipped, toFetch: toFetch.length },
      '[mfNavHistory] universe resolved',
    );

    const opsUserId = await resolveOpsUserId(options.opsUserId);

    // --- fetch + write -----------------------------------------------------
    const pendingDlq: Array<{ sourceRef: string; message: string; payload: Record<string, unknown> }> =
      [];

    let processed = 0;

    const handle = async (outcome: MfapiNavHistoryOutcome): Promise<void> => {
      processed += 1;
      const scheme = bySchemeCode.get(outcome.schemeCode);

      if (!outcome.ok) {
        if (outcome.reason === 'not_found') {
          // Expected and common: MFAPI's archive does not cover every scheme
          // AMFI lists (very new schemes, some closed-ended ones). Counted, not
          // DLQ'd — a few hundred of these on a full run is normal and putting
          // them in the ops queue would bury the real failures.
          result.notFound += 1;
          bumpScheme('not_found');
          return;
        }
        result.failed += 1;
        bumpScheme(outcome.reason);
        pendingDlq.push({
          sourceRef: `mfapi:scheme:${outcome.schemeCode}`,
          message: `${outcome.reason}: ${outcome.detail}`,
          payload: {
            reason: outcome.reason,
            schemeCode: outcome.schemeCode,
            httpStatus: outcome.httpStatus,
            detail: outcome.detail,
          },
        });
        return;
      }

      const { result: parsed } = outcome;
      for (const f of parsed.failures) bumpPoint(f.reason);

      if (!scheme) {
        // Only reachable if the universe query and the fetch list disagree,
        // which would be a bug here rather than bad data. Surfaced rather than
        // ignored.
        result.failed += 1;
        bumpScheme('scheme_not_in_universe');
        logger.error(
          { schemeCode: outcome.schemeCode },
          '[mfNavHistory] fetched a scheme that is not in the universe map',
        );
        return;
      }

      try {
        const { fundId, created } = await ensureMaster(scheme, parsed.meta);
        if (created) result.mastersCreated += 1;

        const inserted = await insertNavPoints(fundId, parsed.points);
        result.navRowsInserted += inserted;
        result.navPointsSeen += parsed.points.length;
        result.ingested += 1;

        const first = parsed.points[0];
        const last = parsed.points[parsed.points.length - 1];
        if (first && (result.earliestDate === null || first.date < result.earliestDate)) {
          result.earliestDate = first.date;
        }
        if (last && (result.latestDate === null || last.date > result.latestDate)) {
          result.latestDate = last.date;
        }

        // Point-level rejects are reported per scheme, once, with the reasons
        // rolled up — not one DLQ row per bad point. A scheme with 40 zero
        // NAVs is one thing a human needs to look at, not 40.
        if (parsed.failures.length > 0) {
          pendingDlq.push({
            sourceRef: `mfapi:scheme:${outcome.schemeCode}:points`,
            message:
              `rejected_points: ${parsed.failures.length} of ` +
              `${parsed.failures.length + parsed.points.length} points rejected ` +
              `(${summariseReasons(parsed.failures)})`,
            payload: {
              reason: 'rejected_points',
              schemeCode: outcome.schemeCode,
              rejected: parsed.failures.length,
              accepted: parsed.points.length,
              // Bounded: the first few are enough to diagnose the pattern, and
              // the DLQ is not a place to store a megabyte of public NAV data.
              samples: parsed.failures.slice(0, 10),
            },
          });
        }
      } catch (err) {
        result.failed += 1;
        bumpScheme('write_failed');
        logger.error(
          { err, schemeCode: outcome.schemeCode },
          '[mfNavHistory] scheme write failed — continuing',
        );
        pendingDlq.push({
          sourceRef: `mfapi:scheme:${outcome.schemeCode}`,
          message: `write_failed: ${err instanceof Error ? err.message : String(err)}`,
          payload: {
            reason: 'write_failed',
            schemeCode: outcome.schemeCode,
            points: parsed.points.length,
          },
        });
      }

      if (processed % PROGRESS_EVERY === 0) {
        logger.info(
          {
            processed,
            total: toFetch.length,
            ingested: result.ingested,
            navRowsInserted: result.navRowsInserted,
            notFound: result.notFound,
            failed: result.failed,
          },
          '[mfNavHistory] progress',
        );
      }
    };

    await fetchMfapiNavHistoryBatch(toFetch, {
      concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
      delayMs: options.delayMs ?? DEFAULT_DELAY_MS,
      ...(options.transport !== undefined ? { transport: options.transport } : {}),
      ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
      ...(options.retries !== undefined ? { retries: options.retries } : {}),
      ...(options.retryDelayMs !== undefined ? { retryDelayMs: options.retryDelayMs } : {}),
      onResult: handle,
      shouldStop: () => {
        // Checked between schemes so the run stops on a scheme boundary with
        // everything written, rather than being killed mid-scheme.
        if (Date.now() - t0 <= maxRunMs) return false;
        if (!result.budgetExhausted) {
          result.budgetExhausted = true;
          logger.warn(
            { processed, total: toFetch.length, maxRunMs },
            '[mfNavHistory] run budget exhausted — remaining schemes deferred to the next run',
          );
        }
        return true;
      },
    });

    // --- DLQ ---------------------------------------------------------------
    if (opsUserId === null) {
      if (pendingDlq.length > 0) {
        logger.error(
          { pending: pendingDlq.length, reasons: result.schemeFailuresByReason },
          '[mfNavHistory] no active ADMIN to own the DLQ rows — failures logged only',
        );
      }
    } else {
      result.dlqWritten = await writeFailures(opsUserId, pendingDlq);
    }

    result.durationMs = Date.now() - t0;
    logger.info(
      {
        ...result,
        earliestDate: result.earliestDate?.toISOString().slice(0, 10) ?? null,
        latestDate: result.latestDate?.toISOString().slice(0, 10) ?? null,
      },
      '[cron] mf nav history backfill done',
    );
    return result;
  });
}

function summariseReasons(failures: readonly NavPointFailure[]): string {
  const counts = new Map<string, number>();
  for (const f of failures) counts.set(f.reason, (counts.get(f.reason) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([reason, n]) => `${reason}×${n}`)
    .join(', ');
}

/**
 * Write failures, skipping any that already have an unresolved row with the
 * same `(sourceRef, errorMessage)`.
 *
 * The de-duplication is not a nicety. A scheme that MFAPI permanently does not
 * have, or that permanently publishes one bad point, would otherwise deposit a
 * fresh DLQ row on every run until the ops queue was unusable and nobody read
 * it — the same outcome as not having a DLQ.
 */
async function writeFailures(
  opsUserId: string,
  pending: ReadonlyArray<{ sourceRef: string; message: string; payload: Record<string, unknown> }>,
): Promise<number> {
  if (pending.length === 0) return 0;

  const seen = new Set<string>();
  const refs = pending.map((p) => p.sourceRef);
  for (let i = 0; i < refs.length; i += 500) {
    const existing = await prisma.ingestionFailure.findMany({
      where: {
        userId: opsUserId,
        sourceAdapter: MFAPI_NAV_HISTORY_ADAPTER_ID,
        resolvedAt: null,
        sourceRef: { in: refs.slice(i, i + 500) },
      },
      select: { sourceRef: true, errorMessage: true },
    });
    for (const e of existing) seen.add(`${e.sourceRef} ${e.errorMessage}`);
  }

  let written = 0;
  for (const p of pending) {
    if (written >= MAX_DLQ_ROWS_PER_RUN) {
      logger.error(
        { cap: MAX_DLQ_ROWS_PER_RUN, pending: pending.length },
        '[mfNavHistory] DLQ cap reached — remaining failures are counted and logged only',
      );
      break;
    }
    const key = `${p.sourceRef} ${p.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = await writeIngestionFailure({
      userId: opsUserId,
      sourceAdapter: MFAPI_NAV_HISTORY_ADAPTER_ID,
      adapterVersion: MFAPI_NAV_HISTORY_ADAPTER_VERSION,
      sourceRef: p.sourceRef,
      error: p.message,
      // Public AMFI-derived data and scheme codes only — no PII.
      rawPayload: p.payload,
    });
    if (row) written += 1;
  }
  return written;
}

/**
 * Scheduler. Weekly, Sunday 03:00 IST.
 *
 * NOT daily: the daily NAV is already `amfi.service.ts`'s job via
 * `NAVAll.txt`, and re-downloading every scheme's full history every night to
 * discover one new row each would be an absurd amount of traffic to put on a
 * free community host for data we already have. This job's purpose is to catch
 * schemes newly added to `MfSchemeMeta` (which the monthly metadata job
 * discovers) and to repair gaps left by a daily run that failed — weekly is
 * the right cadence for both, and `skipIfNavRowsAtLeast` means a scheme
 * already backfilled costs zero requests.
 *
 * 03:00 Sunday puts it after the monthly metadata job's 02:00 slot, so a run
 * on the 1st sees that month's newly discovered schemes rather than last
 * month's list.
 *
 * Registration is the boot sequence's business — this is exported, not called.
 */
export function startMfNavHistoryBackfillJob(): void {
  if (process.env.ENABLE_MF_NAV_HISTORY_CRON === 'false') {
    logger.info('[cron] mf nav history backfill disabled via ENABLE_MF_NAV_HISTORY_CRON=false');
    return;
  }
  cron.schedule(
    '0 3 * * 0',
    () => {
      if (running) {
        logger.warn('[cron] mf nav history backfill already running — skipping this tick');
        return;
      }
      running = true;
      void runMfNavHistoryBackfill({ filter: { status: 'ACTIVE' }, maxRunMs: 3_600_000 })
        .catch((err: unknown) => {
          // Per-scheme failures are already in the DLQ; reaching here means the
          // run itself failed (the universe query, or the DLQ owner lookup).
          // There is no scheme to attribute it to, so it is logged, never
          // swallowed.
          logger.error({ err }, '[cron] mf nav history backfill failed');
        })
        .finally(() => {
          running = false;
        });
    },
    { timezone: TZ },
  );
  logger.info('[cron] scheduled: mf nav history backfill @03:00 IST on Sundays');
}
