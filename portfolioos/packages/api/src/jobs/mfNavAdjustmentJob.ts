/**
 * MF NAV adjustment + quarantine job — `docs/mf-analytics/01-DATA-FOUNDATION.md
 * §5, §6`, `02-METRICS.md §1`, implementation plan Task 1.4.
 *
 * The side-effecting half of a pair. All the arithmetic lives in the two pure
 * modules this file calls (`priceFeeds/navQuarantine.ts`,
 * `priceFeeds/adjustedNav.ts`); everything here is I/O, chunking and bookkeeping.
 *
 * For every mutual fund it:
 *   1. loads the fund's `MFNav` series,
 *   2. applies the `01 §6` validation rules and marks bad rows
 *      `isQuarantined` with a `quarantineReason`,
 *   3. computes `adjustedNav` (IDCW distributions reinvested) over the rows
 *      that survived, and
 *   4. writes one `IngestionFailure` per NEWLY quarantined row (§3.5 — a
 *      failure is recorded, never swallowed).
 *
 * IDEMPOTENCY (`CONTEXT.md §3.3`). Re-running on the same data is a no-op:
 *   - the NAV write is a value-diff — a row whose target `adjustedNav` /
 *     `isQuarantined` / `quarantineReason` already match is not written at all;
 *   - the DLQ write fires only on the clean -> quarantined TRANSITION, which by
 *     definition cannot happen twice for the same row, so a second run adds
 *     zero `IngestionFailure` rows. That transition check is the idempotency
 *     key; `IngestionFailure` has no unique constraint to lean on.
 *   - the >2% alert is deduplicated on (user, type, triggerDate=today).
 *
 * REGISTRATION: this module deliberately does NOT register itself anywhere.
 * `startMfNavAdjustmentJob()` is exported for `index.ts` / `jobs/index.ts` to
 * call; wiring lives with the other job registrations.
 */

import cron from 'node-cron';
import { Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { prisma, runInTransaction } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import { writeIngestionFailure } from '../services/ingestionFailures.service.js';
import {
  quarantineNavSeries,
  utcDayKey,
  type NavQuarantineReason,
} from '../priceFeeds/navQuarantine.js';
import {
  computeAdjustedNavSeries,
  type AdjustedNavBasis,
  type MfOptionKind,
  type NavObservation,
} from '../priceFeeds/adjustedNav.js';
import { parsePlanAndOption } from '../priceFeeds/amfiSchemeMaster.parse.js';

export const MF_NAV_ADJUSTMENT_ADAPTER_ID = 'mf.navAdjustment';
export const MF_NAV_ADJUSTMENT_ADAPTER_VERSION = '1';

const TZ = 'Asia/Kolkata';

/**
 * Bull's `JOB_TIMEOUT_MS` / `LOCK_DURATION_MS` are both 5 minutes
 * (`lib/queue.ts`). This job is cron-driven rather than queued, but it is
 * held to the same ceiling so it can be moved onto the queue unchanged, and so
 * a full-universe run can never sit on a connection for an unbounded time.
 * When the budget runs out the job stops cleanly and reports `truncated: true`;
 * because every step is idempotent the next run simply carries on.
 */
const MAX_RUN_MS = 5 * 60 * 1000;
/** Leave room to finish the fund in flight and write the summary. */
const RUN_BUDGET_MS = MAX_RUN_MS - 20_000;

/** Rows per bulk UPDATE. Keeps the statement (and its parameter list) sane. */
const WRITE_CHUNK = 500;

/** `01 §6` / `06 §7`: alert when more than 2% of the rows seen are quarantined. */
export const QUARANTINE_ALERT_THRESHOLD = new Decimal('0.02');

export interface MfNavAdjustmentOptions {
  /** Restrict to these `MutualFundMaster.id`s. Omit for the whole universe. */
  fundIds?: readonly string[];
  /**
   * Who owns the `IngestionFailure` / `Alert` rows this job writes. Both models
   * are user-scoped and NAV is reference data with no natural owner, so
   * operational rows are attributed to an admin. Defaults to the oldest ADMIN
   * user; if there is none, the DLQ write is skipped and logged at error level
   * (never silently).
   */
  opsUserId?: string;
  /** Override the >2% alert threshold (tests). */
  quarantineAlertThreshold?: Decimal;
  /** Wall-clock budget; the backfill script raises this. */
  maxRunMs?: number;
  /** Injectable clock so the alert's `triggerDate` is deterministic in tests. */
  now?: Date;
}

export interface MfNavAdjustmentResult {
  fundsSeen: number;
  fundsSkippedUnknownOption: number;
  rowsSeen: number;
  /** Rows quarantined in this run's evaluation (not the delta). */
  rowsQuarantined: number;
  /** Rows that flipped clean -> quarantined, i.e. the ones that wrote a DLQ row. */
  rowsNewlyQuarantined: number;
  /** Rows where a non-null `adjustedNav` was computed. */
  rowsAdjusted: number;
  /** Rows left with a null `adjustedNav` (no basis available). */
  rowsLeftNull: number;
  /** Rows actually written (value differed from what was stored). */
  rowsWritten: number;
  /** IDCW funds skipped because no distribution records and no usable sibling. */
  fundsSkippedMissingSibling: number;
  basisCounts: Record<string, number>;
  dlqRowsWritten: number;
  alertRaised: boolean;
  truncated: boolean;
  ms: number;
}

interface NavRow {
  id: string;
  date: Date;
  nav: Prisma.Decimal;
  adjustedNav: Prisma.Decimal | null;
  isQuarantined: boolean;
  quarantineReason: string | null;
}

interface PendingWrite {
  id: string;
  adjustedNav: string | null;
  isQuarantined: boolean;
  quarantineReason: string | null;
}

let running = false;

// ---------------------------------------------------------------------------
// entry points
// ---------------------------------------------------------------------------

/**
 * Run one pass. Wrapped in `runAsSystem` because it reads and writes reference
 * data across every tenant (`CONTEXT.md §5`), and because the `IngestionFailure`
 * and `Alert` writes are on user-scoped tables that would otherwise fail closed.
 */
export async function runMfNavAdjustment(
  options: MfNavAdjustmentOptions = {},
): Promise<MfNavAdjustmentResult> {
  return runAsSystem(() => runMfNavAdjustmentInner(options));
}

/** Cron wrapper with the same single-flight guard the other price jobs use. */
export async function runMfNavAdjustmentJob(): Promise<MfNavAdjustmentResult | null> {
  if (running) {
    logger.warn('[cron] MF NAV adjustment already running — skipping');
    return null;
  }
  running = true;
  try {
    const result = await runMfNavAdjustment();
    logger.info(result, '[cron] MF NAV adjustment done');
    return result;
  } catch (err) {
    logger.error({ err }, '[cron] MF NAV adjustment failed');
    throw err;
  } finally {
    running = false;
  }
}

/**
 * Scheduled at 22:30 IST — half an hour after the AMFI NAV sync at 22:00
 * (`priceJobs.ts`), so the day's rows have landed before they are validated,
 * and before `mfMetricsJob` (22:00 per `01 §5`, which reads `adjustedNav`).
 *
 * NOT self-registering: call this from the job registration site.
 */
export function startMfNavAdjustmentJob(): void {
  if (process.env.ENABLE_PRICE_CRONS === 'false') {
    logger.info('[cron] MF NAV adjustment disabled via ENABLE_PRICE_CRONS=false');
    return;
  }
  cron.schedule('30 22 * * *', () => void runMfNavAdjustmentJob(), { timezone: TZ });
  logger.info('[cron] scheduled: MF NAV adjustment @22:30 IST');
}

// ---------------------------------------------------------------------------
// implementation
// ---------------------------------------------------------------------------

async function runMfNavAdjustmentInner(
  options: MfNavAdjustmentOptions,
): Promise<MfNavAdjustmentResult> {
  const t0 = Date.now();
  const budgetMs = options.maxRunMs ?? RUN_BUDGET_MS;
  const now = options.now ?? new Date();

  const result: MfNavAdjustmentResult = {
    fundsSeen: 0,
    fundsSkippedUnknownOption: 0,
    rowsSeen: 0,
    rowsQuarantined: 0,
    rowsNewlyQuarantined: 0,
    rowsAdjusted: 0,
    rowsLeftNull: 0,
    rowsWritten: 0,
    fundsSkippedMissingSibling: 0,
    basisCounts: {},
    dlqRowsWritten: 0,
    alertRaised: false,
    truncated: false,
    ms: 0,
  };

  const funds = await prisma.mutualFundMaster.findMany({
    where: options.fundIds ? { id: { in: [...options.fundIds] } } : undefined,
    select: { id: true, schemeCode: true, schemeName: true },
    orderBy: { schemeCode: 'asc' },
  });

  // One lookup for the whole run rather than per fund: MfSchemeMeta is small
  // (~15k rows) and the two-hop join (MfSchemeMeta.schemeCode ->
  // MutualFundMaster.schemeCode -> MutualFundMaster.id -> MFNav.fundId) has no
  // FK to let Prisma do it for us. See the comment on MfSchemeMeta.schemeCode.
  const metas = await prisma.mfSchemeMeta.findMany({
    select: { schemeCode: true, optionType: true, growthSiblingSchemeCode: true },
  });
  const metaByCode = new Map(metas.map((m) => [m.schemeCode, m]));

  // schemeCode -> MutualFundMaster.id, needed to resolve a growth sibling's
  // scheme code into the fundId its NAV rows are keyed by.
  const fundIdBySchemeCode = new Map<string, string>();
  for (const f of funds) fundIdBySchemeCode.set(f.schemeCode, f.id);

  const opsUserId = await resolveOpsUserId(options.opsUserId);
  const dlqBacklog: QuarantineDlqEntry[] = [];

  for (const fund of funds) {
    if (Date.now() - t0 > budgetMs) {
      result.truncated = true;
      logger.warn(
        { fundsSeen: result.fundsSeen, budgetMs },
        '[mfNavAdjustment] run budget exhausted — stopping; next run resumes (idempotent)',
      );
      break;
    }

    const perFund = await processFund(fund, {
      metaByCode,
      fundIdBySchemeCode,
      dlqBacklog,
    });
    if (perFund === null) {
      result.fundsSkippedUnknownOption += 1;
      continue;
    }
    result.fundsSeen += 1;
    result.rowsSeen += perFund.rowsSeen;
    result.rowsQuarantined += perFund.rowsQuarantined;
    result.rowsNewlyQuarantined += perFund.rowsNewlyQuarantined;
    result.rowsAdjusted += perFund.rowsAdjusted;
    result.rowsLeftNull += perFund.rowsLeftNull;
    result.rowsWritten += perFund.rowsWritten;
    if (perFund.missingSibling) result.fundsSkippedMissingSibling += 1;
    const basisKey = perFund.basis ?? 'NONE';
    result.basisCounts[basisKey] = (result.basisCounts[basisKey] ?? 0) + 1;
  }

  // DLQ writes are batched to the end so a slow `IngestionFailure` insert never
  // sits inside the NAV write transaction.
  result.dlqRowsWritten = await flushDlq(dlqBacklog, opsUserId);

  result.alertRaised = await maybeRaiseQuarantineAlert({
    rowsSeen: result.rowsSeen,
    rowsQuarantined: result.rowsQuarantined,
    threshold: options.quarantineAlertThreshold ?? QUARANTINE_ALERT_THRESHOLD,
    opsUserId,
    now,
  });

  result.ms = Date.now() - t0;
  return result;
}

interface PerFundResult {
  rowsSeen: number;
  rowsQuarantined: number;
  rowsNewlyQuarantined: number;
  rowsAdjusted: number;
  rowsLeftNull: number;
  rowsWritten: number;
  basis: AdjustedNavBasis | null;
  missingSibling: boolean;
}

interface QuarantineDlqEntry {
  fundId: string;
  schemeCode: string;
  navRowId: string;
  date: Date;
  reason: NavQuarantineReason;
  detail: string;
  rawNav: string;
}

async function processFund(
  fund: { id: string; schemeCode: string; schemeName: string },
  ctx: {
    metaByCode: Map<
      string,
      { schemeCode: string; optionType: string; growthSiblingSchemeCode: string | null }
    >;
    fundIdBySchemeCode: Map<string, string>;
    dlqBacklog: QuarantineDlqEntry[];
  },
): Promise<PerFundResult | null> {
  const rows: NavRow[] = await prisma.mFNav.findMany({
    where: { fundId: fund.id },
    select: {
      id: true,
      date: true,
      nav: true,
      adjustedNav: true,
      isQuarantined: true,
      quarantineReason: true,
    },
    orderBy: { date: 'asc' },
  });
  if (rows.length === 0) return null;

  const optionType = resolveOptionType(fund, ctx.metaByCode);
  if (optionType === null) {
    // No metadata row and an unparseable scheme name: we cannot tell GROWTH
    // from IDCW, and guessing GROWTH would write `adjustedNav = nav` for an
    // IDCW fund — a confidently wrong total-return series. Skip and leave the
    // column null; `MfSchemeMeta` ingestion (Task 1.2) will fix it.
    logger.debug(
      { fundId: fund.id, schemeCode: fund.schemeCode, schemeName: fund.schemeName },
      '[mfNavAdjustment] option type unknown — skipping fund',
    );
    return null;
  }

  // Known IDCW / corporate-action dates, used ONLY to suppress a false
  // `nav_jump`. Sourced from users' own recorded dividend transactions on this
  // fund because there is no MF distribution feed in this repo. Read under
  // system context, cross-tenant, and never used to derive an AMOUNT — a single
  // user's payout amount is their units' share, not the per-unit declaration.
  const dividendDates = await prisma.transaction.findMany({
    where: {
      fundId: fund.id,
      transactionType: { in: ['DIVIDEND_PAYOUT', 'DIVIDEND_REINVEST'] },
    },
    select: { tradeDate: true },
    distinct: ['tradeDate'],
  });

  const { clean, quarantined } = quarantineNavSeries(
    rows.map((r) => ({ ...r, nav: toDec(r.nav) })),
    { knownActionDates: dividendDates.map((d) => d.tradeDate) },
  );

  const observations: NavObservation[] = clean.map((r) => ({ date: r.date, nav: r.nav }));

  let siblingObservations: NavObservation[] | undefined;
  let missingSibling = false;
  if (optionType !== 'GROWTH') {
    const meta = ctx.metaByCode.get(fund.schemeCode);
    const siblingCode = meta?.growthSiblingSchemeCode ?? null;
    const siblingFundId = siblingCode ? ctx.fundIdBySchemeCode.get(siblingCode) : undefined;
    if (siblingFundId) {
      // Only rows the sibling itself has not been quarantined on. On the very
      // first run every row is `isQuarantined: false` because nothing has
      // evaluated them yet; from the second run onward the sibling's own
      // verdicts are in place. That ordering asymmetry is acceptable — a bad
      // sibling NAV shows up as a divergence below the materiality floor or as
      // a spurious inferred distribution, both of which the next run corrects.
      const sibRows = await prisma.mFNav.findMany({
        where: { fundId: siblingFundId, isQuarantined: false },
        select: { date: true, nav: true },
        orderBy: { date: 'asc' },
      });
      if (sibRows.length > 0) {
        siblingObservations = sibRows.map((r) => ({ date: r.date, nav: toDec(r.nav) }));
      }
    }
    if (!siblingObservations) missingSibling = true;
  }

  const adjusted = computeAdjustedNavSeries({
    optionType,
    observations,
    // No distribution feed exists yet; when one lands, pass it here and the
    // basis flips from GROWTH_SIBLING_DERIVED to the authoritative
    // DISTRIBUTION_RECORDS with no other change.
    distributions: [],
    growthSiblingObservations: siblingObservations,
  });

  const adjustedByDay = new Map<number, Decimal | null>();
  for (const p of adjusted.series) adjustedByDay.set(utcDayKey(p.date), p.adjustedNav);

  // Keyed by NAV row id; only the verdict is needed downstream, so the map's
  // value type stays free of the generic row type.
  const quarantinedById = new Map<string, { reason: NavQuarantineReason; detail: string }>();
  for (const q of quarantined) quarantinedById.set(q.row.id, { reason: q.reason, detail: q.detail });

  const writes: PendingWrite[] = [];
  let rowsAdjusted = 0;
  let rowsLeftNull = 0;
  let rowsNewlyQuarantined = 0;

  for (const row of rows) {
    const q = quarantinedById.get(row.id);
    // A quarantined row gets no adjustedNav: we do not trust its `nav`, so any
    // number derived from it would be worse than the null.
    const targetAdjusted = q ? null : (adjustedByDay.get(utcDayKey(row.date)) ?? null);
    const targetQuarantined = q !== undefined;
    const targetReason = q ? q.reason : null;

    if (targetAdjusted === null) rowsLeftNull += 1;
    else rowsAdjusted += 1;

    if (q !== undefined && !row.isQuarantined) {
      rowsNewlyQuarantined += 1;
      ctx.dlqBacklog.push({
        fundId: fund.id,
        schemeCode: fund.schemeCode,
        navRowId: row.id,
        date: row.date,
        reason: q.reason,
        detail: q.detail,
        rawNav: row.nav.toString(),
      });
    }

    // Compare at the column's own precision. `adjustedNav` is Decimal(18,6),
    // so the value that comes back from Postgres is the ROUNDED one; comparing
    // it against the full-precision computed value would differ on every run
    // and rewrite the same rows forever — the idempotency test catches exactly
    // this.
    const targetStored =
      targetAdjusted === null ? null : targetAdjusted.toFixed(6, Decimal.ROUND_HALF_EVEN);
    const currentStored =
      row.adjustedNav === null ? null : toDec(row.adjustedNav).toFixed(6, Decimal.ROUND_HALF_EVEN);
    const adjustedUnchanged = currentStored === targetStored;

    if (
      adjustedUnchanged &&
      row.isQuarantined === targetQuarantined &&
      row.quarantineReason === targetReason
    ) {
      continue; // idempotency: nothing to write
    }

    writes.push({
      id: row.id,
      adjustedNav: targetStored,
      isQuarantined: targetQuarantined,
      quarantineReason: targetReason,
    });
  }

  const rowsWritten = await persistNavRows(writes);

  if (adjusted.basis === null && optionType !== 'GROWTH') {
    logger.debug(
      { fundId: fund.id, schemeCode: fund.schemeCode, reason: adjusted.failureReason },
      '[mfNavAdjustment] no adjustedNav basis available — column left null',
    );
  }

  return {
    rowsSeen: rows.length,
    rowsQuarantined: quarantined.length,
    rowsNewlyQuarantined,
    rowsAdjusted,
    rowsLeftNull,
    rowsWritten,
    basis: adjusted.basis,
    missingSibling,
  };
}

/**
 * Bulk `UPDATE ... FROM (VALUES ...)` in chunks.
 *
 * `runInTransaction`, never `prisma.$transaction` (`CONTEXT.md §5`): the latter
 * re-dispatches each operation onto its own connection for user-scoped models,
 * so an outer rollback does not undo the inner writes. `MFNav` is reference
 * data and would pass through either way, but the rule is unconditional — code
 * that reads as atomic must be atomic.
 */
async function persistNavRows(writes: readonly PendingWrite[]): Promise<number> {
  if (writes.length === 0) return 0;
  let written = 0;
  for (let i = 0; i < writes.length; i += WRITE_CHUNK) {
    const chunk = writes.slice(i, i + WRITE_CHUNK);
    await runInTransaction(async (tx) => {
      const values = Prisma.join(
        chunk.map(
          (w) =>
            Prisma.sql`(${w.id}::text, ${w.adjustedNav}::numeric, ${w.isQuarantined}::boolean, ${w.quarantineReason}::text)`,
        ),
      );
      await tx.$executeRaw`
        UPDATE "MFNav" AS m
        SET "adjustedNav" = v.adj,
            "isQuarantined" = v.q,
            "quarantineReason" = v.reason
        FROM (VALUES ${values}) AS v(id, adj, q, reason)
        WHERE m.id = v.id
      `;
    });
    written += chunk.length;
  }
  return written;
}

/**
 * One `IngestionFailure` per newly quarantined NAV row (`CONTEXT.md §3.5`).
 * `sourceRef` is the NAV row id so an operator at `/ops/ingestion-failures` can
 * go straight to the row, and so a retry has something to address.
 */
async function flushDlq(
  entries: readonly QuarantineDlqEntry[],
  opsUserId: string | null,
): Promise<number> {
  if (entries.length === 0) return 0;
  if (opsUserId === null) {
    logger.error(
      { pendingFailures: entries.length },
      '[mfNavAdjustment] no ops user to attribute IngestionFailure rows to — DLQ writes skipped. ' +
        'Create an ADMIN user or pass opsUserId; quarantine flags were still written to MFNav.',
    );
    return 0;
  }
  let written = 0;
  for (const e of entries) {
    const row = await writeIngestionFailure({
      userId: opsUserId,
      sourceAdapter: MF_NAV_ADJUSTMENT_ADAPTER_ID,
      adapterVersion: MF_NAV_ADJUSTMENT_ADAPTER_VERSION,
      sourceRef: `MFNav:${e.navRowId}`,
      error: `[${e.reason}] ${e.detail}`,
      rawPayload: {
        fundId: e.fundId,
        schemeCode: e.schemeCode,
        date: e.date.toISOString().slice(0, 10),
        nav: e.rawNav,
        reason: e.reason,
      },
    });
    if (row) written += 1;
  }
  return written;
}

/**
 * `01 §6` / `06 §7`: more than 2% of the NAV rows seen quarantined in a run is
 * an upstream problem (AMFI format change, a broken parser, a mis-linked
 * sibling), not a data quirk. Raised through the existing `Alert` mechanism.
 */
async function maybeRaiseQuarantineAlert(input: {
  rowsSeen: number;
  rowsQuarantined: number;
  threshold: Decimal;
  opsUserId: string | null;
  now: Date;
}): Promise<boolean> {
  if (input.rowsSeen === 0 || input.rowsQuarantined === 0) return false;
  const rate = new Decimal(input.rowsQuarantined).div(new Decimal(input.rowsSeen));
  if (rate.lte(input.threshold)) return false;

  if (input.opsUserId === null) {
    logger.error(
      { rowsSeen: input.rowsSeen, rowsQuarantined: input.rowsQuarantined, rate: rate.toString() },
      '[mfNavAdjustment] quarantine rate above threshold but no ops user to alert',
    );
    return false;
  }

  const triggerDate = new Date(
    Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), input.now.getUTCDate()),
  );
  const title = 'MF NAV quarantine rate above threshold';

  // Idempotent: one alert per ops user per day, however many times the job runs.
  const existing = await prisma.alert.findFirst({
    where: { userId: input.opsUserId, type: 'CUSTOM', title, triggerDate },
    select: { id: true },
  });
  if (existing) return true;

  await prisma.alert.create({
    data: {
      userId: input.opsUserId,
      type: 'CUSTOM',
      title,
      description:
        `${input.rowsQuarantined} of ${input.rowsSeen} NAV rows (${rate.times(100).toFixed(2)}%) ` +
        `were quarantined, above the ${input.threshold.times(100).toFixed(2)}% threshold. ` +
        'Check /ops/ingestion-failures for the per-row reasons.',
      triggerDate,
      metadata: {
        rowsSeen: input.rowsSeen,
        rowsQuarantined: input.rowsQuarantined,
        rate: rate.toString(),
        threshold: input.threshold.toString(),
        source: MF_NAV_ADJUSTMENT_ADAPTER_ID,
      },
    },
  });
  logger.warn(
    { rowsSeen: input.rowsSeen, rowsQuarantined: input.rowsQuarantined, rate: rate.toString() },
    '[mfNavAdjustment] quarantine rate above threshold — alert raised',
  );
  return true;
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function toDec(v: Prisma.Decimal): Decimal {
  // Prisma's Decimal is a different class instance from decimal.js's; go via
  // its exact string form, never through a JS number.
  return new Decimal(v.toString());
}

/**
 * `MfSchemeMeta` is authoritative. Where the metadata job has not run yet, fall
 * back to parsing the AMFI scheme name suffix ("… Direct Plan - Growth"), which
 * is the same rule `amfiSchemeMaster.parse.ts` applies. Unknown -> null, and the
 * caller skips the fund rather than assuming GROWTH.
 */
function resolveOptionType(
  fund: { schemeCode: string; schemeName: string },
  metaByCode: Map<string, { optionType: string }>,
): MfOptionKind | null {
  const meta = metaByCode.get(fund.schemeCode);
  if (meta) return meta.optionType as MfOptionKind;
  const parsed = parsePlanAndOption(fund.schemeName);
  return parsed ? (parsed.optionType as MfOptionKind) : null;
}

/**
 * NAV is reference data with no owner, but `IngestionFailure` and `Alert` are
 * user-scoped. Attribute operational rows to the oldest ADMIN user. Cached for
 * the process because it never changes within a run.
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
export function __resetOpsUserCache(): void {
  cachedOpsUserId = undefined;
}
