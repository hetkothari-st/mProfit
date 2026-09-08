/**
 * Monthly MF metadata job — scheme-master half
 * (`docs/mf-analytics/01-DATA-FOUNDATION.md §5`, `07-IMPLEMENTATION-PLAN.md`
 * Task 1.2).
 *
 * Reads AMFI's `NAVAll.txt` through `priceFeeds/amfiSchemeMaster.v1.ts` and
 * reconciles `MfSchemeMeta` against it. The TER / AUM / manager / exit-load
 * half of this job (`01 §5`, `07` Task 1.5) is a separate entry point owned by
 * the factsheet adapters and deliberately writes disjoint columns, so the two
 * halves can run and fail independently.
 *
 * ---------------------------------------------------------------------------
 * The four properties this job guarantees
 * ---------------------------------------------------------------------------
 *
 * 1. **A re-run is a true no-op.** `01 §5` requires it and `CONTEXT.md §3.3`
 *    is the invariant behind it. Every row carries `sourceHash`; a row whose
 *    hash and derived columns already match is not written at all — not
 *    "written with the same values". The difference matters: an unconditional
 *    upsert would move `updatedAt` on ~12,000 rows every month, which is how
 *    you lose the ability to answer "what actually changed in the master this
 *    month?" and how a downstream cache keyed on `updatedAt` invalidates
 *    everything for nothing. The idempotency test asserts on `updatedAt`
 *    precisely because that is the observable an upsert-always would break.
 *
 * 2. **A scheme's failure is that scheme's failure.** Per-row writes inside a
 *    bounded chunk, each in its own try/catch, each failure to the DLQ, loop
 *    continues (`CONTEXT.md §3.5`). This is why the write is a per-row
 *    `upsert` and not a `createMany` of 1,000: `createMany` fails as a unit on
 *    one duplicate ISIN and takes 999 good schemes with it.
 *
 * 3. **Nothing is deleted.** A scheme that vanishes from the file is marked,
 *    never removed. See `sweepVanishedSchemes` for why, and for why the mark
 *    is `SUSPENDED` rather than `MERGED`.
 *
 * 4. **No long transaction.** These are reference-data upserts with no
 *    cross-row invariant — nothing is true of the set that is not true of each
 *    row — so wrapping 12,000 of them in one `runInTransaction` would buy no
 *    atomicity anyone needs while holding a connection and its locks for the
 *    whole run. Same reasoning as `mfPeerRankJob`. A partial run is a correct
 *    intermediate state that the next run converges from, which is only true
 *    *because* of property 1.
 *
 * Registration is deliberately absent: no import in `src/index.ts` or
 * `jobs/index.ts`. Export `startMfMetadataJob` and let the boot sequence wire
 * it, matching `startMfPeerRankJob` / `startNetWorthSnapshotJob`.
 */

import cron from 'node-cron';
import { createHash } from 'node:crypto';
import { Prisma, type MfSchemeStatus } from '@prisma/client';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import { writeIngestionFailure } from '../services/ingestionFailures.service.js';
import {
  fetchAmfiSchemeMaster,
  parseAmfiSchemeMasterText,
  mapSchemeMaster,
  AMFI_SCHEME_MASTER_ADAPTER_ID,
  AMFI_SCHEME_MASTER_ADAPTER_VERSION,
  type MappedSchemeMeta,
} from '../priceFeeds/amfiSchemeMaster.v1.js';
import type { SchemeParseFailure } from '../priceFeeds/amfiSchemeMaster.parse.js';

const TZ = 'Asia/Kolkata';

/**
 * Schemes written per slice.
 *
 * The binding constraint is `lib/queue.ts`'s 5-minute `JOB_TIMEOUT_MS` /
 * `LOCK_DURATION_MS`. AMFI ships ~12,000 rows. Each write is a single-row
 * `upsert` on the primary key — one round trip, ~1-3 ms against a warm pool —
 * so 200 rows is roughly 0.3-0.6 s of wall clock and a worst-case first run
 * (every row a create) is ~20-40 s. That is an order of magnitude inside the
 * lock, which is the margin you want on a job whose slow path is somebody
 * else's database being busy.
 *
 * Why not larger: a bigger chunk does not go faster (the writes are serial
 * either way) and it widens the window in which a mid-chunk crash leaves work
 * unreported. Why not smaller: the progress log would tick 1,200 times.
 *
 * Why not `createMany` at all: see property 2 in the header comment —
 * per-scheme DLQ granularity is the requirement, and a bulk insert cannot give
 * it.
 */
export const SCHEME_CHUNK_SIZE = 200;

/** Rows read per query when resolving inception dates for newly-seen schemes. */
const LOOKUP_CHUNK_SIZE = 500;

/**
 * Wall-clock ceiling for the whole run, at 80% of the 5-minute lock. Hitting
 * it stops the loop and returns `budgetExhausted: true` rather than being
 * declared stalled and re-enqueued mid-flight. Stopping early is safe here
 * only because a re-run skips everything already written (property 1), so the
 * next invocation resumes at the first unwritten row for free.
 */
const RUN_BUDGET_MS = 240_000;

/** Logged, not enforced — a slice slower than this means the pool is degraded. */
const SLICE_BUDGET_MS = 30_000;

/**
 * Guard on the vanished-scheme sweep. AMFI occasionally serves a truncated
 * `NAVAll.txt`; without this, one bad fetch would suspend thousands of live
 * schemes and every one of them would drop out of its peer universe.
 *
 * The ratio is only meaningful with a real corpus behind it, so it is applied
 * only when there are at least `VANISH_RATIO_MIN_SAMPLE` active rows to
 * compare against — below that we are on a first run, a dev box or a fixture,
 * where "3 of 5 schemes vanished" is the fixture doing its job.
 */
const MAX_VANISH_RATIO = 0.05;
const VANISH_RATIO_MIN_SAMPLE = 100;

export interface MfMetadataJobOptions {
  /**
   * Pre-fetched AMFI text. Production omits it and the feed fetches. Tests and
   * `scripts/backfill-mf-scheme-meta.ts` pass a fixture or a saved file so they
   * exercise the identical parse/map/write path rather than a copy of it.
   */
  text?: string;
  /** Clock injection so `statusChangedAt` / `fetchedAt` are assertable. */
  now?: Date;
  /**
   * Owner of any `IngestionFailure` row. Defaults to the oldest active ADMIN.
   * Passed explicitly by tests, which must not attribute their DLQ rows to
   * whichever admin happens to be oldest in a shared development database.
   */
  opsUserId?: string;
  /**
   * Restricts BOTH the existing-row load and the vanished-scheme sweep.
   *
   * Production passes nothing: the whole table is this job's to reconcile.
   * Tests pass a reserved scheme-code band so a run against a database shared
   * with other suites cannot suspend rows they own. It must be a superset of
   * the scheme codes present in `text`, or in-scope creates would collide with
   * out-of-scope rows the job could not see.
   */
  scope?: Prisma.MfSchemeMetaWhereInput;
}

export interface MfMetadataJobResult {
  /** Distinct scheme codes in the file after duplicate collapsing. */
  seen: number;
  inserted: number;
  updated: number;
  unchanged: number;
  /** ACTIVE rows absent from the file, marked SUSPENDED by this run. */
  suspended: number;
  /** SUSPENDED rows that reappeared in the file. */
  reactivated: number;
  /** Schemes whose write threw. Each has a DLQ row. */
  failed: number;
  /** Parser failures by reason, plus job-level pseudo-reasons. */
  failuresByReason: Record<string, number>;
  /** DLQ rows actually created (existing unresolved duplicates are skipped). */
  dlqWritten: number;
  budgetExhausted: boolean;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// DLQ ownership — identical to mfMetricsJob / mfPeerRankJob on purpose
// ---------------------------------------------------------------------------

/**
 * `IngestionFailure` requires a `userId` (it is a user-facing DLQ) but this is
 * reference-data work owned by nobody. Attribute it to the oldest active ADMIN
 * so it surfaces at `/ops/ingestion-failures`; with no admin present, log at
 * `error` and drop rather than fabricate a user.
 *
 * Deliberately the same resolution as the sibling reference-data jobs — two of
 * them disagreeing about who owns a failure is how half the DLQ ends up
 * somewhere nobody is looking.
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

/**
 * Stable identity for a DLQ row.
 *
 * Prefers the scheme code, which survives AMFI reordering the file. Falls back
 * to a hash of the raw line rather than its line number for exactly that
 * reason: a line number changes every time a scheme is inserted above it, so
 * a line-numbered `sourceRef` would create a fresh "new" DLQ row every month
 * for the same never-changing malformed line, and the monthly run would stop
 * being a no-op.
 */
function failureSourceRef(failure: SchemeParseFailure): string {
  const code = /^\s*(\d+)\s*;/.exec(failure.raw)?.[1];
  if (code) return `navall:scheme:${code}`;
  return `navall:raw:${createHash('sha256').update(failure.raw, 'utf8').digest('hex').slice(0, 16)}`;
}

interface PendingFailure {
  sourceRef: string;
  errorMessage: string;
  rawPayload: Record<string, unknown>;
}

/**
 * Write parse failures to the DLQ, skipping any that already have an
 * unresolved row with the same `(sourceRef, errorMessage)`.
 *
 * The de-duplication is not a nicety. `01 §5` requires the monthly re-run to
 * be a no-op, and a file with 300 permanently-unmapped categories would
 * otherwise deposit 300 fresh DLQ rows every month until the ops queue was
 * unusable and nobody read it any more — which is the same outcome as not
 * having a DLQ.
 */
async function writeFailures(
  opsUserId: string,
  pending: readonly PendingFailure[],
): Promise<number> {
  if (pending.length === 0) return 0;

  const seen = new Set<string>();
  for (let i = 0; i < pending.length; i += LOOKUP_CHUNK_SIZE) {
    const refs = pending.slice(i, i + LOOKUP_CHUNK_SIZE).map((p) => p.sourceRef);
    const existing = await prisma.ingestionFailure.findMany({
      where: {
        userId: opsUserId,
        sourceAdapter: AMFI_SCHEME_MASTER_ADAPTER_ID,
        resolvedAt: null,
        sourceRef: { in: refs },
      },
      select: { sourceRef: true, errorMessage: true },
    });
    for (const e of existing) seen.add(`${e.sourceRef} ${e.errorMessage}`);
  }

  let written = 0;
  for (const p of pending) {
    if (seen.has(`${p.sourceRef} ${p.errorMessage}`)) continue;
    // Guards against the same ref appearing twice within one run.
    seen.add(`${p.sourceRef} ${p.errorMessage}`);
    const row = await writeIngestionFailure({
      userId: opsUserId,
      sourceAdapter: AMFI_SCHEME_MASTER_ADAPTER_ID,
      adapterVersion: AMFI_SCHEME_MASTER_ADAPTER_VERSION,
      sourceRef: p.sourceRef,
      error: p.errorMessage,
      rawPayload: p.rawPayload,
    });
    if (row) written += 1;
  }
  return written;
}

// ---------------------------------------------------------------------------
// Inception date
// ---------------------------------------------------------------------------

/**
 * `MfSchemeMeta.inceptionDate` is NOT NULL but `NAVAll.txt` does not contain
 * it — AMFI publishes it only on factsheets. So it is seeded, once, at insert:
 *
 *   1. the earliest `MFNav` date we already hold for the scheme, if any;
 *   2. otherwise the NAV date on the row we are inserting from.
 *
 * Both are "the first day we can prove the fund existed", never a guess at the
 * real launch date, and both err *late*. That direction is the safe one: a
 * later inception date means the metrics layer finds less history than the
 * fund really has and returns `INSUFFICIENT_DATA` (`02 §1`), which is visibly
 * missing. An invented early date would instead make a 6-month-old fund look
 * like it had a 10-year track record — a confidently wrong number.
 *
 * It is create-only. Re-deriving it on every run would walk the date forward
 * as old NAV rows aged out, quietly shortening every fund's apparent history.
 *
 * The join is the documented two-hop one from the `MfSchemeMeta.schemeCode`
 * schema comment: schemeCode -> MutualFundMaster.id -> MFNav.fundId.
 */
async function resolveInceptionDates(schemeCodes: readonly string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (schemeCodes.length === 0) return out;

  for (let i = 0; i < schemeCodes.length; i += LOOKUP_CHUNK_SIZE) {
    const codes = schemeCodes.slice(i, i + LOOKUP_CHUNK_SIZE);
    const masters = await prisma.mutualFundMaster.findMany({
      where: { schemeCode: { in: [...codes] } },
      select: { id: true, schemeCode: true },
    });
    if (masters.length === 0) continue;

    const codeByFundId = new Map(masters.map((m) => [m.id, m.schemeCode]));
    const grouped = await prisma.mFNav.groupBy({
      by: ['fundId'],
      where: { fundId: { in: masters.map((m) => m.id) } },
      _min: { date: true },
    });
    for (const g of grouped) {
      const code = codeByFundId.get(g.fundId);
      const min = g._min.date;
      if (code && min) out.set(code, min);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Diffing
// ---------------------------------------------------------------------------

/** The columns this job compares before deciding to write. */
interface ExistingRow {
  schemeCode: string;
  sourceHash: string;
  amcCode: string;
  benchmarkIndexCode: string | null;
  growthSiblingSchemeCode: string | null;
  isEtf: boolean;
  status: MfSchemeStatus;
}

/**
 * Status this run wants the row to have.
 *
 * Only ever SUSPENDED -> ACTIVE. `MERGED` and `WOUND_UP` are set from AMFI
 * notices and manual curation (`01 §7`); they carry a `predecessorSchemeCode`
 * chain that an ingest heuristic has no business overwriting because a scheme
 * lingering in the NAV file for a few days after its merger is normal.
 */
function nextStatusFor(existing: ExistingRow): MfSchemeStatus {
  return existing.status === 'SUSPENDED' ? 'ACTIVE' : existing.status;
}

/**
 * The no-op gate.
 *
 * `sourceHash` is the primary test, exactly as Task 1.2 specifies. The other
 * three comparisons exist because those columns are NOT inputs to the hash and
 * cannot be:
 *
 *   - `growthSiblingSchemeCode` is derived from *other rows* in the same file.
 *     An IDCW option whose growth sibling only appears in next month's file has
 *     an unchanged hash but a link that must now be written. Gating on the hash
 *     alone would leave that fund permanently unrated (`03 §1`).
 *   - `benchmarkIndexCode` comes from `SEBI_SUBCATEGORY_MAP`, which is code, not
 *     data. Adding a `defaultBenchmarkCode` to a sub-category must propagate on
 *     the next run without AMFI having changed a byte.
 *   - `amcCode` likewise comes from the adapter registry: registering an AMC's
 *     factsheet adapter must re-point its existing schemes at it.
 *
 * All three still compare *equal* on an unchanged second run, so the no-op
 * guarantee holds. This widens what counts as "changed"; it does not weaken it.
 */
function needsUpdate(existing: ExistingRow, mapped: MappedSchemeMeta): boolean {
  return (
    existing.sourceHash !== mapped.sourceHash ||
    existing.amcCode !== mapped.amcCode ||
    existing.benchmarkIndexCode !== mapped.benchmarkIndexCode ||
    existing.growthSiblingSchemeCode !== mapped.growthSiblingSchemeCode ||
    // Not a parser-hash input either: `isEtf` is derived from the scheme name
    // by `isEtfName`, so a change to that recogniser (adding a brand like
    // BeES) must be able to re-classify existing rows on the next run.
    existing.isEtf !== mapped.isEtf ||
    nextStatusFor(existing) !== existing.status
  );
}

// ---------------------------------------------------------------------------
// Vanished schemes
// ---------------------------------------------------------------------------

export interface VanishSweepResult {
  suspended: number;
  /** Set when the ratio guard tripped; nothing was suspended. */
  skippedReason: string | null;
}

/**
 * A scheme present in an earlier run and absent from this file is marked, not
 * deleted (`01 §7`): users hold it, its NAV history stays queryable, and its
 * `MfSchemeMetrics` rows remain valid as at their own `asOf`.
 *
 * The mark is `SUSPENDED`, not `MERGED`. Absence from `NAVAll.txt` says only
 * "this scheme stopped publishing a NAV". It does not say *why*, and the three
 * whys have different downstream meanings: a merger needs the surviving
 * scheme's code, a wind-up does not, and a transient AMFI omission needs
 * neither. Recording `MERGED` here would be inventing the one fact — the
 * successor — that makes a merger a merger.
 *
 * And note what this function does NOT do: it never touches NAV history and
 * never sets `predecessorSchemeCode`. `01 §7` is explicit that a successor's
 * NAV series is its own and a predecessor's history is not spliced in, because
 * splicing rewrites the fund's risk history — a 2018 drawdown from a fund that
 * no longer exists would show up as the surviving fund's drawdown, and every
 * volatility and max-drawdown number computed from it would be a fiction.
 */
export async function sweepVanishedSchemes(
  existing: readonly ExistingRow[],
  presentCodes: ReadonlySet<string>,
  now: Date,
): Promise<VanishSweepResult> {
  const active = existing.filter((e) => e.status === 'ACTIVE');
  const vanished = active.filter((e) => !presentCodes.has(e.schemeCode));
  if (vanished.length === 0) return { suspended: 0, skippedReason: null };

  if (active.length >= VANISH_RATIO_MIN_SAMPLE) {
    const ratio = vanished.length / active.length;
    if (ratio > MAX_VANISH_RATIO) {
      const reason =
        `${vanished.length} of ${active.length} active schemes (${(ratio * 100).toFixed(1)}%) ` +
        `are absent from this AMFI file, over the ${(MAX_VANISH_RATIO * 100).toFixed(0)}% guard. ` +
        `Treating the file as truncated and suspending nothing.`;
      logger.error({ vanished: vanished.length, active: active.length }, `[mfMetadata] ${reason}`);
      return { suspended: 0, skippedReason: reason };
    }
  }

  let suspended = 0;
  for (let i = 0; i < vanished.length; i += SCHEME_CHUNK_SIZE) {
    const codes = vanished.slice(i, i + SCHEME_CHUNK_SIZE).map((v) => v.schemeCode);
    const res = await prisma.mfSchemeMeta.updateMany({
      // `status: ACTIVE` is re-asserted in the predicate so a concurrent
      // curation run that marked one of these MERGED wins over this sweep.
      where: { schemeCode: { in: codes }, status: 'ACTIVE' },
      data: { status: 'SUSPENDED', statusChangedAt: now },
    });
    suspended += res.count;
  }
  return { suspended, skippedReason: null };
}

// ---------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------

let running = false;

export async function runMfMetadataJob(
  options: MfMetadataJobOptions = {},
): Promise<MfMetadataJobResult> {
  const t0 = Date.now();
  const now = options.now ?? new Date();

  return runAsSystem(async () => {
    const parsed =
      options.text === undefined
        ? await fetchAmfiSchemeMaster()
        : parseAmfiSchemeMasterText(options.text);
    const { schemes, duplicateSchemeCodes, failures } = mapSchemeMaster(parsed);

    const result: MfMetadataJobResult = {
      seen: schemes.length,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      suspended: 0,
      reactivated: 0,
      failed: 0,
      failuresByReason: {},
      dlqWritten: 0,
      budgetExhausted: false,
      durationMs: 0,
    };
    const bump = (reason: string): void => {
      result.failuresByReason[reason] = (result.failuresByReason[reason] ?? 0) + 1;
    };

    const pendingFailures: PendingFailure[] = [];
    for (const f of failures) {
      bump(f.reason);
      pendingFailures.push({
        sourceRef: failureSourceRef(f),
        errorMessage: `${f.reason}: ${f.detail ?? '(no detail)'}`,
        // The raw line is the whole payload a human needs to fix the parser or
        // the SEBI map. It carries no PII — AMFI's file is a public document.
        rawPayload: { reason: f.reason, line: f.line, raw: f.raw, detail: f.detail ?? null },
      });
    }
    for (const code of duplicateSchemeCodes) {
      bump('duplicate_scheme_code');
      pendingFailures.push({
        sourceRef: `navall:scheme:${code}`,
        errorMessage: `duplicate_scheme_code: scheme ${code} appears more than once in this file; the last occurrence was written`,
        rawPayload: { reason: 'duplicate_scheme_code', schemeCode: code },
      });
    }

    // Existing state, one query. 12,000 narrow rows is well under a megabyte
    // and cheaper than 12,000 point reads inside the write loop.
    const existingRows = (await prisma.mfSchemeMeta.findMany({
      where: options.scope,
      select: {
        schemeCode: true,
        sourceHash: true,
        amcCode: true,
        benchmarkIndexCode: true,
        growthSiblingSchemeCode: true,
        isEtf: true,
        status: true,
      },
    })) as ExistingRow[];
    const existingByCode = new Map(existingRows.map((r) => [r.schemeCode, r]));

    const newCodes = schemes.filter((s) => !existingByCode.has(s.schemeCode)).map((s) => s.schemeCode);
    const inceptionByCode = await resolveInceptionDates(newCodes);

    for (let i = 0; i < schemes.length; i += SCHEME_CHUNK_SIZE) {
      if (Date.now() - t0 > RUN_BUDGET_MS) {
        // Safe to abandon mid-list only because the next run re-reads the file
        // and skips everything already written (header property 1).
        result.budgetExhausted = true;
        logger.warn(
          { processed: i, total: schemes.length, budgetMs: RUN_BUDGET_MS },
          '[mfMetadata] run budget exhausted — remaining schemes deferred to the next run',
        );
        break;
      }

      const slice = schemes.slice(i, i + SCHEME_CHUNK_SIZE);
      const sliceStart = Date.now();

      for (const mapped of slice) {
        const existing = existingByCode.get(mapped.schemeCode);
        try {
          if (existing === undefined) {
            await prisma.mfSchemeMeta.create({
              data: {
                schemeCode: mapped.schemeCode,
                isin: mapped.isin,
                schemeName: mapped.schemeName,
                amcCode: mapped.amcCode,
                amcName: mapped.amcName,
                sebiCategory: mapped.sebiCategory,
                sebiSubCategory: mapped.sebiSubCategory,
                planType: mapped.planType,
                optionType: mapped.optionType,
                isEtf: mapped.isEtf,
                benchmarkIndexCode: mapped.benchmarkIndexCode,
                growthSiblingSchemeCode: mapped.growthSiblingSchemeCode,
                inceptionDate:
                  inceptionByCode.get(mapped.schemeCode) ?? mapped.navDate ?? now,
                status: 'ACTIVE',
                sourceHash: mapped.sourceHash,
                fetchedAt: now,
              },
            });
            result.inserted += 1;
            continue;
          }

          if (!needsUpdate(existing, mapped)) {
            result.unchanged += 1;
            continue;
          }

          const status = nextStatusFor(existing);
          const reactivating = status !== existing.status;
          await prisma.mfSchemeMeta.update({
            where: { schemeCode: mapped.schemeCode },
            data: {
              isin: mapped.isin,
              schemeName: mapped.schemeName,
              amcCode: mapped.amcCode,
              amcName: mapped.amcName,
              sebiCategory: mapped.sebiCategory,
              sebiSubCategory: mapped.sebiSubCategory,
              planType: mapped.planType,
              optionType: mapped.optionType,
              isEtf: mapped.isEtf,
              benchmarkIndexCode: mapped.benchmarkIndexCode,
              growthSiblingSchemeCode: mapped.growthSiblingSchemeCode,
              sourceHash: mapped.sourceHash,
              // `fetchedAt` moves only when something changed, not on every run
              // that merely looked. Bumping it unconditionally would rewrite
              // all ~12,000 rows monthly and destroy the no-op guarantee.
              fetchedAt: now,
              ...(reactivating ? { status, statusChangedAt: now } : {}),
              // `inceptionDate` is create-only — see resolveInceptionDates.
            },
          });
          result.updated += 1;
          if (reactivating) result.reactivated += 1;
        } catch (err) {
          result.failed += 1;
          bump('write_failed');
          logger.error(
            { err, schemeCode: mapped.schemeCode },
            '[mfMetadata] scheme write failed — continuing',
          );
          pendingFailures.push({
            sourceRef: `navall:scheme:${mapped.schemeCode}`,
            errorMessage: `write_failed: ${err instanceof Error ? err.message : String(err)}`,
            rawPayload: {
              reason: 'write_failed',
              schemeCode: mapped.schemeCode,
              schemeName: mapped.schemeName,
              isin: mapped.isin,
            },
          });
        }
      }

      const elapsed = Date.now() - sliceStart;
      if (elapsed > SLICE_BUDGET_MS) {
        logger.warn(
          { elapsed, budgetMs: SLICE_BUDGET_MS, sliceSize: slice.length },
          '[mfMetadata] slice exceeded its budget — reduce SCHEME_CHUNK_SIZE if this persists',
        );
      }
    }

    // The sweep reads the *file*, not what this run managed to write, so a
    // budget-exhausted write loop does not make it unsafe. A truncated *file*
    // is the real risk, and the ratio guard inside handles that one.
    const presentCodes = new Set(schemes.map((s) => s.schemeCode));
    const sweep = await sweepVanishedSchemes(existingRows, presentCodes, now);
    result.suspended = sweep.suspended;
    if (sweep.skippedReason !== null) {
      bump('vanish_sweep_skipped');
      pendingFailures.push({
        sourceRef: 'navall:vanish-sweep',
        errorMessage: `vanish_sweep_skipped: ${sweep.skippedReason}`,
        rawPayload: { reason: 'vanish_sweep_skipped', seen: schemes.length },
      });
    }

    const opsUserId = await resolveOpsUserId(options.opsUserId);
    if (opsUserId === null) {
      if (pendingFailures.length > 0) {
        logger.error(
          { pending: pendingFailures.length, reasons: result.failuresByReason },
          '[mfMetadata] no active ADMIN to own the DLQ rows — failures logged only',
        );
      }
    } else {
      result.dlqWritten = await writeFailures(opsUserId, pendingFailures);
    }

    result.durationMs = Date.now() - t0;
    logger.info({ ...result }, '[cron] mf metadata job done');
    return result;
  });
}

/**
 * Scheduler. 1st of the month, 02:00 IST, per `01 §5`.
 *
 * 02:00 and not the more obvious 22:00-23:00 band because that band is already
 * the daily chain — mfNavAdjustment 22:30, mfMetrics 23:15, mfPeerRank 00:30 —
 * and this job rewrites the very rows those read (`sebiSubCategory` and
 * `planType` decide a scheme's peer universe). Landing at 02:00 puts it after
 * peer-rank has finished rather than underneath it, so no daily run ever sees
 * a category change halfway applied. The AMFI file is a full-day snapshot, so
 * there is nothing to gain from running it earlier.
 */
export function startMfMetadataJob(): void {
  if (process.env.ENABLE_MF_METADATA_CRON === 'false') {
    logger.info('[cron] mf metadata job disabled via ENABLE_MF_METADATA_CRON=false');
    return;
  }
  cron.schedule(
    '0 2 1 * *',
    () => {
      if (running) {
        logger.warn('[cron] mf metadata job already running — skipping this tick');
        return;
      }
      running = true;
      void runMfMetadataJob()
        .catch((err: unknown) => {
          // Per-scheme failures are already in the DLQ; reaching here means the
          // run itself failed (fetch, or the existing-row query). There is no
          // scheme to attribute it to, so it is logged, never swallowed.
          logger.error({ err }, '[cron] mf metadata job failed');
        })
        .finally(() => {
          running = false;
        });
    },
    { timezone: TZ },
  );
  logger.info('[cron] scheduled: mf metadata @02:00 IST on the 1st');
}
