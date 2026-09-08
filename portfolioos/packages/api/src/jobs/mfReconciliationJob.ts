/**
 * Monthly reconciliation job (`docs/mf-analytics/06-QUALITY-COMPLIANCE.md §2`,
 * `01-DATA-FOUNDATION.md §5`, `07-IMPLEMENTATION-PLAN.md` Task 2.6).
 *
 * Takes a fixed 30-scheme panel, pulls OUR 1y/3y/5y return, TER and AUM at
 * month-end, pulls the SAME figures from an external publisher, and reports
 * every disagreement above tolerance to the DLQ and to the admin alert inbox.
 *
 * -----------------------------------------------------------------------------
 * The one property this job exists to have
 * -----------------------------------------------------------------------------
 * **A run that compared nothing must never look like a run that agreed.**
 *
 * Every other job in this directory degrades gracefully towards "we have less
 * data than we wanted", and that is fine, because a missing NAV shows up
 * downstream as `INSUFFICIENT_DATA`. This one degrades towards *assurance* if
 * you let it: a feed that 404s produces zero breaches, zero breaches reads as
 * "our numbers check out", and the operator stops looking. That is worse than
 * having no reconciliation job at all, because now there is a green light on
 * the dashboard that nothing is behind.
 *
 * So the result carries two independent axes and both are reported:
 *
 *   - `coverage`  — FULL / PARTIAL / NONE. How much we managed to compare.
 *   - `outcome`   — MATCHED / DRIFT_DETECTED / COULD_NOT_RECONCILE. What the
 *                   comparisons we *did* make said.
 *
 * `COULD_NOT_RECONCILE` (coverage NONE) raises its own admin alert and its own
 * DLQ row, with its own reason string. It is not a quiet pass, it is not folded
 * into "0 breaches", and no caller can mistake one for the other.
 *
 * -----------------------------------------------------------------------------
 * Decisions
 * -----------------------------------------------------------------------------
 * 1. **Every comparison is in `Decimal`.** A ±0.10 pp gate decided by IEEE-754
 *    is the wrong tool for a job whose entire purpose is detecting small
 *    numeric drift: `18.52 - 18.42 > 0.10` is *true* in binary floating point,
 *    and the job would invent a breach out of its own arithmetic on the one
 *    boundary case it most needs to get right (`CONTEXT.md §3.1`).
 *
 * 2. **The breach reason names the scheme.** `06 §2` is explicit, and Task 2.6's
 *    acceptance criterion is exactly that. `sourceRef` also carries it, so the
 *    DLQ is greppable by scheme.
 *
 * 3. **The breach reason names a suspected cause.** `06 §2` observes drift is
 *    nearly always one of four things. Three of them are visible in our own
 *    tables and one is provable by probing a neighbouring `asOf`, so the job
 *    classifies rather than leaving the operator to re-derive what it already
 *    knows. See `classifyDrift`.
 *
 * 4. **One alert per run, not one per breach.** The per-breach detail belongs
 *    in the DLQ, which is where `06 §2` puts it. Thirty schemes times three
 *    horizons is up to 90 rows; ninety alerts is an alert nobody reads.
 *
 * 5. **No long transaction.** This job's only writes are independent DLQ rows
 *    and alerts, with no cross-row invariant — same reasoning as
 *    `mfPeerRankJob` and `mfMetadataJob`. Were an atomic commit ever needed it
 *    must be `runInTransaction` from `lib/prisma.ts`, never `prisma.$transaction`
 *    (`CONTEXT.md §5`).
 *
 * Registration is deliberately absent: no import in `src/index.ts` or
 * `jobs/index.ts`. Export `startMfReconciliationJob` and let the boot sequence
 * wire it, matching `startMfMetadataJob` / `startMfPeerRankJob`.
 */

import cron from 'node-cron';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Decimal } from 'decimal.js';
import { toDecimal } from '@portfolioos/shared';
import type { MfHorizonMetrics } from '@portfolioos/shared';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import { writeIngestionFailure } from '../services/ingestionFailures.service.js';
import {
  fetchMfPublishedReturns,
  MF_PUBLISHED_RETURNS_ADAPTER_VERSION,
  type MfPublishedReturnsFetchOutcome,
  type PublishedReturnsFetcher,
} from '../priceFeeds/mfPublishedReturns.v1.js';
import {
  PUBLISHED_HORIZONS,
  type MfPublishedReturns,
  type PublishedFigure,
  type PublishedHorizon,
} from '../priceFeeds/mfPublishedReturns.parse.js';

const TZ = 'Asia/Kolkata';

export const MF_RECONCILIATION_ADAPTER_ID = 'mf.reconciliation';
export const MF_RECONCILIATION_ADAPTER_VERSION = '1';

// ---------------------------------------------------------------------------
// Tolerances
// ---------------------------------------------------------------------------

/**
 * `06 §2`: "Tolerance: ±0.10 pp on returns."
 *
 * **Boundary decision: 0.10 pp exactly does NOT fire.** A breach requires
 * `|ours − theirs| > 0.10`, strictly. Two reasons, both deliberate:
 *
 *   - "±0.10 pp" describes the closed band [−0.10, +0.10]; a value sitting on
 *     the edge is inside the band, not outside it. Reading the same words the
 *     other way would make the spec's own tolerance one ULP narrower than it
 *     says.
 *   - The published figure is itself rounded (typically to 2dp), so a *true*
 *     difference of exactly 0.10 is within the publisher's own quantisation.
 *     Firing there would generate breaches that no change to our engine can
 *     ever clear.
 *
 * The comparison is `Decimal.gt`, so this boundary is exact and testable —
 * which is the whole reason the tolerance is a `Decimal` literal and not
 * `0.10` (`CONTEXT.md §3.1`).
 */
export const RETURN_TOLERANCE_PP = new Decimal('0.10');

/**
 * How far before month-end we will accept a published as-at date, and how far
 * back we will look for our own metrics row.
 *
 * Month-ends land on weekends and holidays; 31 May 2026 is a Sunday, and both
 * the publisher and our own daily `mfMetricsJob` will have their last usable
 * observation on the Friday. Four days covers a weekend plus a holiday. Anything
 * older than that is not "the month-end figure" and is reported as
 * un-reconciled rather than compared — comparing August's number against July's
 * would produce a drift that is entirely our own fault.
 */
export const ASOF_MAX_LAG_DAYS = 4;

/**
 * Radius, in days, of the neighbouring-`asOf` probe used to recognise an
 * off-by-a-day window (see `classifyDrift`). Three days, so a Friday/Monday
 * pair across a weekend is reachable in both directions.
 */
const WINDOW_PROBE_DAYS = 3;

/** Schemes per progress slice. See `SLICE_BUDGET_MS`. */
const SCHEME_CHUNK_SIZE = 10;

/**
 * Wall-clock ceiling for the run, at 80% of `lib/queue.ts`'s 5-minute
 * `LOCK_DURATION_MS` / `JOB_TIMEOUT_MS`.
 *
 * This bound is not theoretical here the way it is in the sibling jobs. This
 * job makes one *external* HTTP call per panel scheme, and the shared transport
 * allows 30 s per request — thirty schemes against a hanging endpoint is 15
 * minutes, three lock windows, and Bull would re-enqueue the job on top of
 * itself. So the budget is enforced, and — crucially — a run that hits it is
 * marked `budgetExhausted` and can never report `coverage: FULL`. Stopping
 * early is safe; stopping early and calling it a clean reconciliation is not.
 */
const RUN_BUDGET_MS = 240_000;

/** Logged, not enforced. A slice slower than this means the feed is degraded. */
const SLICE_BUDGET_MS = 60_000;

/** Schemes named inline in the alert body before it says "and N more". */
const ALERT_SCHEME_SAMPLE = 5;

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

export interface ReconciliationPanelEntry {
  schemeCode: string;
  schemeName: string;
  sebiSubCategory: string;
  /**
   * False until a human has checked the code against a live AMFI file. A wrong
   * code does not fail loudly — it reconciles one fund's published numbers
   * against another fund's metrics and reports a drift no amount of debugging
   * the metrics engine will explain. The loader logs the unverified ones.
   */
  codeVerified: boolean;
}

/**
 * `06 §2` names this exact path, and it is a seed list rather than test-only
 * data, so the job reads it at run time rather than duplicating it in `src/`.
 *
 * The relative path resolves identically from `src/jobs/` and from
 * `dist/jobs/`, so a compiled deploy finds the same file — provided `test/` is
 * shipped. When it is not, `loadReconciliationPanel` returns a typed failure
 * and the run is `COULD_NOT_RECONCILE`, which is the honest answer: a
 * reconciliation with no panel has reconciled nothing.
 */
export const PANEL_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../test/fixtures/mf/reconciliation-panel.json',
);

export type PanelLoadOutcome =
  | { ok: true; entries: ReconciliationPanelEntry[] }
  | { ok: false; detail: string };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export async function loadReconciliationPanel(path = PANEL_PATH): Promise<PanelLoadOutcome> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    // Typed failure, not a throw: a missing panel is an operational state the
    // job must report, not an exception that kills the scheduler tick.
    return {
      ok: false,
      detail: `Could not read the reconciliation panel at ${path}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (err) {
    return {
      ok: false,
      detail: `Reconciliation panel at ${path} is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  const schemes = (parsed as { schemes?: unknown } | null)?.schemes;
  if (!Array.isArray(schemes) || schemes.length === 0) {
    return { ok: false, detail: `Reconciliation panel at ${path} has no "schemes" array.` };
  }

  const entries: ReconciliationPanelEntry[] = [];
  const bad: string[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of schemes.entries()) {
    const r = raw as Partial<ReconciliationPanelEntry> | null;
    if (
      r === null ||
      !isNonEmptyString(r.schemeCode) ||
      !isNonEmptyString(r.schemeName) ||
      !isNonEmptyString(r.sebiSubCategory)
    ) {
      bad.push(`#${i}`);
      continue;
    }
    // A duplicated code would be fetched and compared twice and would then
    // double-count in every ratio in the summary.
    if (seen.has(r.schemeCode)) {
      bad.push(`#${i} (duplicate scheme ${r.schemeCode})`);
      continue;
    }
    seen.add(r.schemeCode);
    entries.push({
      schemeCode: r.schemeCode,
      schemeName: r.schemeName,
      sebiSubCategory: r.sebiSubCategory,
      codeVerified: r.codeVerified === true,
    });
  }

  if (entries.length === 0) {
    return { ok: false, detail: `Reconciliation panel at ${path} has no usable entries.` };
  }
  if (bad.length > 0) {
    // Malformed entries are dropped, never guessed at, and said out loud.
    logger.warn({ path, bad }, '[mfRecon] panel entries skipped as malformed');
  }
  const unverified = entries.filter((e) => !e.codeVerified);
  if (unverified.length > 0) {
    logger.warn(
      { path, unverified: unverified.length, total: entries.length },
      '[mfRecon] panel contains scheme codes not yet spot-checked against a live AMFI file — ' +
        'a wrong code silently reconciles the wrong fund',
    );
  }
  return { ok: true, entries };
}

// ---------------------------------------------------------------------------
// Metric identity
// ---------------------------------------------------------------------------

/** The five things `06 §2` reconciles. Persisted in `sourceRef`, so stable. */
export type ReconciledMetric = 'RETURN_1Y' | 'RETURN_3Y' | 'RETURN_5Y' | 'TER' | 'AUM';

function returnMetric(h: PublishedHorizon): ReconciledMetric {
  return `RETURN_${h}Y` as ReconciledMetric;
}

/**
 * Why a comparison could not be made. Every one of these is counted and
 * reported; none of them is allowed to look like agreement.
 */
export type UnreconciledReason =
  /** The external feed failed for this scheme — see the fetch outcome's reason. */
  | 'feed_unavailable'
  /** The publisher's as-at date is not this month-end (see `ASOF_MAX_LAG_DAYS`). */
  | 'published_as_on_mismatch'
  /** The publisher did not carry this figure at all. */
  | 'not_published'
  /** We have no `MfSchemeMetrics` row near this month-end for this horizon. */
  | 'our_metrics_missing'
  /** We have a row, but its `status` is not OK — nothing to compare. */
  | 'our_metrics_not_ok'
  /** Row is OK but the specific return field is null. */
  | 'our_value_missing'
  /** No `MfSchemeTer` / `MfSchemeAum` row at or before this month-end. */
  | 'our_reference_missing'
  /** The scheme is not in `MfSchemeMeta` at all — the panel code may be wrong. */
  | 'scheme_not_in_master'
  /** The run hit `RUN_BUDGET_MS` before reaching this scheme. */
  | 'run_budget_exhausted';

/**
 * `06 §2`: "Drift is nearly always one of: quarantined NAV gap, wrong IDCW
 * adjustment, window start off by a day, or a merged scheme." These are those
 * four, plus the honest fifth.
 */
export type DriftCause =
  /**
   * Proven, not guessed: a neighbouring `asOf` within `WINDOW_PROBE_DAYS`
   * carries a value that IS within tolerance of the published figure. The
   * numbers are right, the window they were taken over is a day out.
   */
  | 'WINDOW_START_OFF_BY_A_DAY'
  /** The scheme is not ACTIVE, or has a predecessor chain. `01 §7`. */
  | 'MERGED_OR_INACTIVE_SCHEME'
  /** Quarantined NAV rows inside the horizon window (`01 §6`). */
  | 'QUARANTINED_NAV_GAP'
  /** An IDCW option with unadjusted NAV rows in the window (`01 §2`). */
  | 'IDCW_ADJUSTMENT_MISSING'
  /** None of the above fits the evidence we hold. Said plainly, not guessed. */
  | 'UNCLASSIFIED';

export interface DriftBreach {
  schemeCode: string;
  schemeName: string;
  metric: ReconciledMetric;
  /** "YYYY-MM" — the period reconciled. Part of the DLQ dedupe key. */
  period: string;
  /** Percentage points for returns and TER; INR crore for AUM. */
  ourValue: string;
  theirValue: string;
  driftAbs: string;
  cause: DriftCause;
  /** What made us say that cause. Goes in the DLQ message. */
  causeEvidence: string;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * The last day of the month *before* `now`.
 *
 * Never the current month: on the 5th, this month has no month-end yet, and a
 * job that reconciled a partial month against a publisher's last full month
 * would report thirty breaches every single run.
 */
export function lastCompletedMonthEnd(now: Date): Date {
  // Day 0 of the current month is the last day of the previous one.
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
}

function periodKey(monthEnd: Date): string {
  return monthEnd.toISOString().slice(0, 7);
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

// ---------------------------------------------------------------------------
// Comparison primitives — Decimal only, never a float
// ---------------------------------------------------------------------------

/**
 * A return breach: strictly greater than the tolerance. See
 * `RETURN_TOLERANCE_PP` for the boundary decision and why it is a Decimal.
 */
export function isReturnBreach(oursPct: Decimal, theirsPct: Decimal): boolean {
  return oursPct.minus(theirsPct).abs().gt(RETURN_TOLERANCE_PP);
}

/**
 * `06 §2` expects an **exact** match on TER (it is disclosed daily) and on the
 * AUM we ingest from the same factsheet. Exact against a publisher who quotes
 * two decimals cannot mean bit-equality with our `Decimal(12,6)` column: a
 * stored 0.625000 against a disclosed "0.63" is not a disagreement about the
 * TER, it is a disagreement about rounding, and it would fire every month
 * forever on funds whose TER simply has a third decimal.
 *
 * So "exact" is evaluated at the publisher's own precision: round our value to
 * the scale they published at (banker's rounding, matching `serializeMoney` in
 * `§14.3`) and require equality. A real disagreement — a stale TER, last
 * month's AUM, a merged scheme's figures — is orders of magnitude larger than
 * one rounding tick and still fires.
 */
export function equalAtPublishedScale(ours: Decimal, published: PublishedFigure): boolean {
  return ours.toDecimalPlaces(published.scale, Decimal.ROUND_HALF_EVEN).eq(published.value);
}

/** `MfSchemeAum.aum` is plain rupees by schema comment; factsheets quote crore. */
const RUPEES_PER_CRORE = new Decimal('10000000');

// ---------------------------------------------------------------------------
// Reading OUR side
// ---------------------------------------------------------------------------

interface OurMetricRow {
  asOf: Date;
  status: string;
  statusReason: string | null;
  metrics: MfHorizonMetrics;
}

/**
 * The return figure to compare, in **percentage points**.
 *
 * The horizon matters and is easy to get wrong. `mfMetrics.service.ts` puts the
 * one-year figure in `returns.absolute` and deliberately leaves `returns.cagr`
 * null there (SEBI states one-year performance absolute, and the two are
 * arithmetically identical at exactly 1y). A naive read of `returns.cagr`
 * across all three horizons would therefore find nothing at 1y and quietly
 * report "we could not reconcile 1y" for all thirty schemes, forever.
 *
 * `Ratio` is a fraction (0.1842); the publisher quotes percent (18.42). The
 * ×100 lives here and nowhere else.
 */
export function ourReturnPct(m: MfHorizonMetrics, horizon: PublishedHorizon): Decimal | null {
  const raw = horizon === 1 ? m.returns.absolute : m.returns.cagr;
  if (raw === null || raw === undefined) return null;
  return toDecimal(raw).times(100);
}

// ---------------------------------------------------------------------------
// DLQ ownership — identical to mfMetadataJob / mfPeerRankJob / benchmarkPriceJob
// ---------------------------------------------------------------------------

/**
 * `IngestionFailure` and `Alert` both require a `userId`; this is reference-data
 * work owned by nobody. Attribute it to the oldest active ADMIN so it surfaces
 * at `/ops/ingestion-failures`; with no admin present, log at `error` and drop
 * rather than fabricate a user.
 *
 * Deliberately the same resolution as every sibling reference-data job — two of
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

// ---------------------------------------------------------------------------
// Drift classification
// ---------------------------------------------------------------------------

interface SchemeContext {
  schemeCode: string;
  status: string;
  predecessorSchemeCode: string | null;
  optionType: string;
  /** `MutualFundMaster.id`, the FK `MFNav` is actually keyed by. Null when the
   *  scheme has no master row — see the two-hop join note on `MfSchemeMeta`. */
  fundId: string | null;
}

interface Classification {
  cause: DriftCause;
  evidence: string;
}

/**
 * Turn a bare "the values differ" into the thing an operator would otherwise
 * spend an afternoon deriving.
 *
 * Order is by strength of evidence, not by likelihood:
 *
 *  1. The neighbouring-`asOf` probe is *proof*: if a metrics row one or two days
 *     either side of the one we used agrees with the publisher, the arithmetic
 *     is fine and the window boundary is the bug. Nothing else here is that
 *     conclusive, so it goes first.
 *  2. A non-ACTIVE or merged scheme invalidates the comparison outright (`01 §7`
 *     — a successor's NAV series is its own and history is never spliced), so it
 *     outranks the two "there is a hole in the inputs" hints.
 *  3. Quarantined NAV rows before unadjusted IDCW NAVs, because a quarantine
 *     removes observations from the window entirely while a missing IDCW
 *     adjustment merely biases them.
 *
 * Only ever *suspected*. Every branch says what it saw, so the operator can
 * disagree with the conclusion without having to re-run the queries.
 */
async function classifyDrift(
  ctx: SchemeContext | undefined,
  input: {
    metric: ReconciledMetric;
    horizon: PublishedHorizon | null;
    monthEnd: Date;
    ourAsOf: Date | null;
    theirsPct: Decimal | null;
  },
): Promise<Classification> {
  if (ctx === undefined) {
    return {
      cause: 'UNCLASSIFIED',
      evidence: 'no MfSchemeMeta row for this scheme, so no context to classify against',
    };
  }

  // 1. Off-by-a-day window — provable, so it is checked first.
  if (input.horizon !== null && input.ourAsOf !== null && input.theirsPct !== null) {
    const probe = await probeNeighbouringAsOf(
      ctx.schemeCode,
      input.horizon,
      input.ourAsOf,
      input.theirsPct,
    );
    if (probe !== null) {
      return {
        cause: 'WINDOW_START_OFF_BY_A_DAY',
        evidence:
          `our ${isoDay(probe.asOf)} row for this horizon is within tolerance of the published ` +
          `figure (${probe.pct.toFixed(4)}pp) while the ${isoDay(input.ourAsOf)} row we used is ` +
          `not — the maths agrees, the window boundary does not`,
      };
    }
  }

  // 2. Merged / inactive.
  if (ctx.status !== 'ACTIVE' || ctx.predecessorSchemeCode !== null) {
    return {
      cause: 'MERGED_OR_INACTIVE_SCHEME',
      evidence:
        `scheme status is ${ctx.status}` +
        (ctx.predecessorSchemeCode === null
          ? ''
          : ` with predecessor ${ctx.predecessorSchemeCode}`) +
        ` — the publisher is very likely quoting the surviving scheme's spliced history, which ` +
        `01 §7 forbids us from doing`,
    };
  }

  // 3 and 4 both need the NAV series, which needs the two-hop join.
  if (ctx.fundId !== null && input.horizon !== null) {
    const from = new Date(
      Date.UTC(
        input.monthEnd.getUTCFullYear() - input.horizon,
        input.monthEnd.getUTCMonth(),
        input.monthEnd.getUTCDate(),
      ),
    );
    const window = { gte: from, lte: input.monthEnd };

    const quarantined = await prisma.mFNav.count({
      where: { fundId: ctx.fundId, date: window, isQuarantined: true },
    });
    if (quarantined > 0) {
      return {
        cause: 'QUARANTINED_NAV_GAP',
        evidence:
          `${quarantined} quarantined NAV row(s) between ${isoDay(from)} and ` +
          `${isoDay(input.monthEnd)} — those observations are excluded from our window and ` +
          `included in theirs`,
      };
    }

    // Only meaningful for a non-GROWTH option: `adjustedNav` is the IDCW
    // distribution-adjusted series, and a null there means "not yet adjusted".
    if (ctx.optionType !== 'GROWTH') {
      const unadjusted = await prisma.mFNav.count({
        where: { fundId: ctx.fundId, date: window, adjustedNav: null },
      });
      if (unadjusted > 0) {
        return {
          cause: 'IDCW_ADJUSTMENT_MISSING',
          evidence:
            `${ctx.optionType} option with ${unadjusted} unadjusted NAV row(s) in the window — ` +
            `every distribution in that span reads as a fall in NAV and understates our return`,
        };
      }
    }
  }

  return {
    cause: 'UNCLASSIFIED',
    evidence:
      `scheme is ACTIVE with no quarantined NAV, no missing IDCW adjustment and no ` +
      `neighbouring asOf that agrees — none of 06 §2's four usual causes fits, so this one ` +
      `needs a human`,
  };
}

/**
 * Look for a metrics row near `ourAsOf` whose return IS within tolerance.
 *
 * Deliberately excludes `ourAsOf` itself, and deliberately takes the *nearest*
 * agreeing row rather than the first found, so the evidence string names the
 * date an operator should actually look at.
 */
async function probeNeighbouringAsOf(
  schemeCode: string,
  horizon: PublishedHorizon,
  ourAsOf: Date,
  theirsPct: Decimal,
): Promise<{ asOf: Date; pct: Decimal } | null> {
  const rows = await prisma.mfSchemeMetrics.findMany({
    where: {
      schemeCode,
      horizonYears: horizon,
      status: 'OK',
      asOf: { gte: addDays(ourAsOf, -WINDOW_PROBE_DAYS), lte: addDays(ourAsOf, WINDOW_PROBE_DAYS) },
    },
    select: { asOf: true, metrics: true },
  });

  let best: { asOf: Date; pct: Decimal; distance: number } | null = null;
  for (const r of rows) {
    if (r.asOf.getTime() === ourAsOf.getTime()) continue;
    const pct = ourReturnPct(r.metrics as unknown as MfHorizonMetrics, horizon);
    if (pct === null) continue;
    if (isReturnBreach(pct, theirsPct)) continue;
    const distance = Math.abs(r.asOf.getTime() - ourAsOf.getTime());
    if (best === null || distance < best.distance) best = { asOf: r.asOf, pct, distance };
  }
  return best === null ? null : { asOf: best.asOf, pct: best.pct };
}

// ---------------------------------------------------------------------------
// DLQ
// ---------------------------------------------------------------------------

interface PendingFailure {
  sourceRef: string;
  errorMessage: string;
  rawPayload: Record<string, unknown>;
}

/**
 * Stable DLQ identity: scheme + metric + period.
 *
 * That triple is exactly the idempotency key `06 §2`'s monthly cadence needs.
 * Re-running the job on the same month must not deposit a second copy of the
 * same breach — the ops queue is only read while it is short.
 */
function breachSourceRef(schemeCode: string, metric: ReconciledMetric, period: string): string {
  return `mf-recon:${schemeCode}:${metric}:${period}`;
}

/**
 * Write pending rows, skipping any that already have an unresolved row with the
 * same `(sourceRef, errorMessage)` — the same de-duplication `mfMetadataJob`
 * uses, for the same reason.
 *
 * Including the message in the key, rather than the ref alone, is deliberate: a
 * breach whose *magnitude* changed between runs is new information and gets a
 * new row, while an unchanged breach re-reported next month does not.
 */
async function writeFailures(
  opsUserId: string,
  pending: readonly PendingFailure[],
): Promise<number> {
  if (pending.length === 0) return 0;

  const existing = await prisma.ingestionFailure.findMany({
    where: {
      userId: opsUserId,
      sourceAdapter: MF_RECONCILIATION_ADAPTER_ID,
      resolvedAt: null,
      sourceRef: { in: pending.map((p) => p.sourceRef) },
    },
    select: { sourceRef: true, errorMessage: true },
  });
  const seen = new Set(existing.map((e) => `${e.sourceRef} ${e.errorMessage}`));

  let written = 0;
  for (const p of pending) {
    const key = `${p.sourceRef} ${p.errorMessage}`;
    if (seen.has(key)) continue;
    // Guards against the same ref appearing twice within one run.
    seen.add(key);
    const row = await writeIngestionFailure({
      userId: opsUserId,
      sourceAdapter: MF_RECONCILIATION_ADAPTER_ID,
      adapterVersion: MF_RECONCILIATION_ADAPTER_VERSION,
      sourceRef: p.sourceRef,
      error: p.errorMessage,
      rawPayload: p.rawPayload,
    });
    if (row) written += 1;
  }
  return written;
}

/**
 * One alert per run per title per day. Dedupe key `(userId, type, title,
 * triggerDate)` — the same shape `benchmarkPriceJob` and `mfNavAdjustmentJob`
 * use, so three reference-data jobs cannot disagree about what "already alerted
 * today" means.
 */
async function raiseAlert(input: {
  opsUserId: string | null;
  title: string;
  description: string;
  triggerDate: Date;
  metadata: Record<string, unknown>;
}): Promise<boolean> {
  if (input.opsUserId === null) {
    logger.error({ title: input.title }, `[mfRecon] ${input.description} (no ADMIN user to alert)`);
    return false;
  }
  const existing = await prisma.alert.findFirst({
    where: {
      userId: input.opsUserId,
      type: 'CUSTOM',
      title: input.title,
      triggerDate: input.triggerDate,
    },
    select: { id: true },
  });
  if (existing) return true;

  await prisma.alert.create({
    data: {
      userId: input.opsUserId,
      type: 'CUSTOM',
      title: input.title,
      description: input.description,
      triggerDate: input.triggerDate,
      metadata: { source: MF_RECONCILIATION_ADAPTER_ID, ...input.metadata },
    },
  });
  logger.warn({ title: input.title }, `[mfRecon] ${input.description}`);
  return true;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/** How much of the panel we managed to compare. Orthogonal to `outcome`. */
export type ReconciliationCoverage = 'FULL' | 'PARTIAL' | 'NONE';

/** What the comparisons we made said. Orthogonal to `coverage`. */
export type ReconciliationOutcome = 'MATCHED' | 'DRIFT_DETECTED' | 'COULD_NOT_RECONCILE';

export interface MfReconciliationJobResult {
  monthEnd: Date;
  period: string;
  coverage: ReconciliationCoverage;
  outcome: ReconciliationOutcome;
  panelSize: number;
  /** Schemes whose published figures we obtained and dated correctly. */
  schemesReconciled: number;
  /** Scheme-level comparisons actually performed. Zero ⇒ COULD_NOT_RECONCILE. */
  comparisons: number;
  matched: number;
  drifted: number;
  /** Comparisons we could not make. Never counted as agreement. */
  unreconciled: number;
  unreconciledByReason: Partial<Record<UnreconciledReason, number>>;
  driftsByCause: Partial<Record<DriftCause, number>>;
  breaches: DriftBreach[];
  dlqWritten: number;
  alertsRaised: number;
  budgetExhausted: boolean;
  durationMs: number;
}

export interface MfReconciliationJobOptions {
  /** Defaults to the last completed month-end relative to `now`. */
  monthEnd?: Date;
  now?: Date;
  /** Owner of DLQ rows and alerts. Tests pass it so a shared development
   *  database does not attribute their rows to whichever admin is oldest. */
  opsUserId?: string;
  /** Overrides the seed file. Tests pass a two- or three-scheme panel. */
  panel?: readonly ReconciliationPanelEntry[];
  /** The external comparison source. Injected in tests so nothing can reach
   *  the network, and injectable in production so a paid feed is a swap. */
  fetchPublished?: PublishedReturnsFetcher;
}

// ---------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------

let running = false;

export async function runMfReconciliationJob(
  options: MfReconciliationJobOptions = {},
): Promise<MfReconciliationJobResult> {
  const t0 = Date.now();
  const now = options.now ?? new Date();
  const monthEnd = utcMidnight(options.monthEnd ?? lastCompletedMonthEnd(now));
  const period = periodKey(monthEnd);
  const fetchPublished: PublishedReturnsFetcher =
    options.fetchPublished ?? ((code) => fetchMfPublishedReturns(code));

  return runAsSystem(async () => {
    const result: MfReconciliationJobResult = {
      monthEnd,
      period,
      coverage: 'NONE',
      outcome: 'COULD_NOT_RECONCILE',
      panelSize: 0,
      schemesReconciled: 0,
      comparisons: 0,
      matched: 0,
      drifted: 0,
      unreconciled: 0,
      unreconciledByReason: {},
      driftsByCause: {},
      breaches: [],
      dlqWritten: 0,
      alertsRaised: 0,
      budgetExhausted: false,
      durationMs: 0,
    };
    const pending: PendingFailure[] = [];
    const opsUserId = await resolveOpsUserId(options.opsUserId);

    const bumpUnreconciled = (reason: UnreconciledReason): void => {
      result.unreconciled += 1;
      result.unreconciledByReason[reason] = (result.unreconciledByReason[reason] ?? 0) + 1;
    };

    // --- Panel -------------------------------------------------------------
    let panel: readonly ReconciliationPanelEntry[];
    if (options.panel !== undefined) {
      panel = options.panel;
    } else {
      const loaded = await loadReconciliationPanel();
      if (!loaded.ok) {
        // No panel means nothing was compared. That is COULD_NOT_RECONCILE and
        // it alerts — it is emphatically not a clean run.
        result.durationMs = Date.now() - t0;
        await finishCouldNotReconcile(result, opsUserId, loaded.detail, pending);
        return result;
      }
      panel = loaded.entries;
    }
    result.panelSize = panel.length;

    // --- Our side, loaded once for the whole panel -------------------------
    const codes = panel.map((p) => p.schemeCode);
    const ctxByCode = await loadSchemeContexts(codes);

    // --- Per scheme --------------------------------------------------------
    for (let i = 0; i < panel.length; i += SCHEME_CHUNK_SIZE) {
      if (Date.now() - t0 > RUN_BUDGET_MS) {
        result.budgetExhausted = true;
        const skipped = panel.length - i;
        logger.warn(
          { processed: i, total: panel.length, budgetMs: RUN_BUDGET_MS },
          '[mfRecon] run budget exhausted — remaining panel schemes not reconciled',
        );
        // Counted, so the run can never be reported as FULL coverage.
        for (let s = 0; s < skipped; s += 1) bumpUnreconciled('run_budget_exhausted');
        break;
      }

      const slice = panel.slice(i, i + SCHEME_CHUNK_SIZE);
      const sliceStart = Date.now();

      for (const entry of slice) {
        await reconcileScheme({
          entry,
          ctx: ctxByCode.get(entry.schemeCode),
          monthEnd,
          period,
          fetchPublished,
          result,
          pending,
          bumpUnreconciled,
        });
      }

      const elapsed = Date.now() - sliceStart;
      if (elapsed > SLICE_BUDGET_MS) {
        logger.warn(
          { elapsed, budgetMs: SLICE_BUDGET_MS, sliceSize: slice.length },
          '[mfRecon] slice exceeded its budget — the published-returns source is slow',
        );
      }
    }

    // --- Verdict -----------------------------------------------------------
    if (result.comparisons === 0) {
      result.durationMs = Date.now() - t0;
      await finishCouldNotReconcile(
        result,
        opsUserId,
        `Reconciliation for ${period} made zero comparisons across a ${result.panelSize}-scheme ` +
          `panel. Breakdown: ${describeReasons(result.unreconciledByReason)}.`,
        pending,
      );
      return result;
    }

    result.coverage =
      result.unreconciled === 0 && !result.budgetExhausted ? 'FULL' : 'PARTIAL';
    result.outcome = result.drifted > 0 ? 'DRIFT_DETECTED' : 'MATCHED';

    if (result.drifted > 0) {
      const names = result.breaches
        .slice(0, ALERT_SCHEME_SAMPLE)
        .map((b) => `${b.schemeCode} ${b.metric} (${b.cause})`)
        .join('; ');
      const more = result.breaches.length - Math.min(ALERT_SCHEME_SAMPLE, result.breaches.length);
      const raised = await raiseAlert({
        opsUserId,
        title: `MF reconciliation drift: ${result.drifted} breach(es) ${period}`,
        description:
          `${result.drifted} of ${result.comparisons} reconciled figures differ from the ` +
          `published source by more than the ${RETURN_TOLERANCE_PP.toString()}pp tolerance ` +
          `(TER and AUM are compared for exact agreement at the published scale). ` +
          `${names}${more > 0 ? `; and ${more} more` : ''}. ` +
          `Per-breach detail, including the suspected cause, is at /ops/ingestion-failures.`,
        triggerDate: monthEnd,
        metadata: {
          period,
          drifted: result.drifted,
          comparisons: result.comparisons,
          byCause: result.driftsByCause,
          schemes: result.breaches.map((b) => b.schemeCode),
        },
      });
      if (raised) result.alertsRaised += 1;
    }

    if (result.coverage === 'PARTIAL') {
      // A partial run is not a failure, but it is also not the assurance a full
      // one gives, and the operator has to be told which schemes went unchecked.
      const raised = await raiseAlert({
        opsUserId,
        title: `MF reconciliation incomplete: ${period}`,
        description:
          `Reconciled ${result.comparisons} figure(s) across ${result.schemesReconciled} of ` +
          `${result.panelSize} panel schemes; ${result.unreconciled} comparison(s) could not be ` +
          `made (${describeReasons(result.unreconciledByReason)})` +
          `${result.budgetExhausted ? ' after the run budget was exhausted' : ''}. ` +
          `The unchecked figures are unverified, not verified-clean.`,
        triggerDate: monthEnd,
        metadata: {
          period,
          coverage: result.coverage,
          unreconciled: result.unreconciled,
          byReason: result.unreconciledByReason,
          budgetExhausted: result.budgetExhausted,
        },
      });
      if (raised) result.alertsRaised += 1;
    }

    result.dlqWritten = await flushFailures(opsUserId, pending, result);
    result.durationMs = Date.now() - t0;
    logger.info(
      {
        period,
        coverage: result.coverage,
        outcome: result.outcome,
        comparisons: result.comparisons,
        matched: result.matched,
        drifted: result.drifted,
        unreconciled: result.unreconciled,
        ms: result.durationMs,
      },
      '[cron] mf reconciliation job done',
    );
    return result;
  });
}

function describeReasons(by: Partial<Record<UnreconciledReason, number>>): string {
  const parts = Object.entries(by).map(([k, v]) => `${k}=${v}`);
  return parts.length === 0 ? 'no reasons recorded' : parts.join(', ');
}

async function flushFailures(
  opsUserId: string | null,
  pending: readonly PendingFailure[],
  result: MfReconciliationJobResult,
): Promise<number> {
  if (opsUserId === null) {
    if (pending.length > 0) {
      logger.error(
        { pending: pending.length, period: result.period },
        '[mfRecon] no active ADMIN to own the DLQ rows — failures logged only',
      );
    }
    return 0;
  }
  return writeFailures(opsUserId, pending);
}

/**
 * The one path that must never be mistaken for success.
 *
 * It writes a DLQ row with its own reason (`could_not_reconcile`, distinct from
 * `reconciliation_drift`) and raises its own alert, so both the ops queue and
 * the admin inbox distinguish "we checked and nothing was wrong" from "we never
 * checked".
 */
async function finishCouldNotReconcile(
  result: MfReconciliationJobResult,
  opsUserId: string | null,
  detail: string,
  pending: PendingFailure[],
): Promise<void> {
  result.coverage = 'NONE';
  result.outcome = 'COULD_NOT_RECONCILE';

  pending.push({
    sourceRef: `mf-recon:run:${result.period}`,
    errorMessage:
      `could_not_reconcile: ${detail} No figure was compared, so NOTHING about the ` +
      `accuracy of our metrics has been verified for this month. This is not a clean run.`,
    rawPayload: {
      reason: 'could_not_reconcile',
      period: result.period,
      panelSize: result.panelSize,
      unreconciledByReason: result.unreconciledByReason,
      budgetExhausted: result.budgetExhausted,
    },
  });

  const raised = await raiseAlert({
    opsUserId,
    title: `MF reconciliation could not run: ${result.period}`,
    description:
      `${detail} Zero comparisons were made, so this month's metrics are UNVERIFIED — ` +
      `treat this as a gap in assurance, not as a pass.`,
    triggerDate: result.monthEnd,
    metadata: {
      period: result.period,
      panelSize: result.panelSize,
      byReason: result.unreconciledByReason,
    },
  });
  if (raised) result.alertsRaised += 1;

  result.dlqWritten = await flushFailures(opsUserId, pending, result);
  logger.error(
    { period: result.period, panelSize: result.panelSize, detail },
    '[cron] mf reconciliation could not reconcile anything',
  );
}

// ---------------------------------------------------------------------------
// Per-scheme reconciliation
// ---------------------------------------------------------------------------

interface ReconcileSchemeArgs {
  entry: ReconciliationPanelEntry;
  ctx: SchemeContext | undefined;
  monthEnd: Date;
  period: string;
  fetchPublished: PublishedReturnsFetcher;
  result: MfReconciliationJobResult;
  pending: PendingFailure[];
  bumpUnreconciled: (reason: UnreconciledReason) => void;
}

/**
 * One scheme's five comparisons.
 *
 * Never throws. A scheme's failure is that scheme's failure (`CONTEXT.md §3.5`,
 * and the same guarantee `mfMetadataJob` and `mfPeerRankJob` give): the loop
 * continues, and everything that went wrong is counted and, where it is a
 * genuine anomaly rather than a merely-absent figure, written to the DLQ.
 */
async function reconcileScheme(args: ReconcileSchemeArgs): Promise<void> {
  const { entry, ctx, monthEnd, period, result, pending, bumpUnreconciled } = args;
  // Five potential comparisons per scheme: 1y, 3y, 5y, TER, AUM.
  const METRICS_PER_SCHEME = PUBLISHED_HORIZONS.length + 2;

  let fetched: MfPublishedReturnsFetchOutcome;
  try {
    fetched = await args.fetchPublished(entry.schemeCode);
  } catch (err) {
    // The fetcher contract says it never throws. If it does anyway, that is a
    // bug in the fetcher and not a reason to abandon the other 29 schemes.
    fetched = {
      ok: false,
      reason: 'NETWORK_ERROR',
      detail: `fetcher threw: ${err instanceof Error ? err.message : String(err)}`,
      sourceRef: `published-returns:${entry.schemeCode}`,
    };
  }

  if (!fetched.ok) {
    for (let i = 0; i < METRICS_PER_SCHEME; i += 1) bumpUnreconciled('feed_unavailable');
    pending.push({
      sourceRef: `mf-recon:${entry.schemeCode}:FEED:${period}`,
      errorMessage:
        `reconciliation_feed_unavailable: scheme ${entry.schemeCode} (${entry.schemeName}) ` +
        `for ${period}: ${fetched.reason} — ${fetched.detail}. Nothing was compared for this ` +
        `scheme; its figures are unverified, not verified-clean.`,
      rawPayload: {
        reason: 'reconciliation_feed_unavailable',
        schemeCode: entry.schemeCode,
        schemeName: entry.schemeName,
        period,
        fetchReason: fetched.reason,
        ...(fetched.httpStatus === undefined ? {} : { httpStatus: fetched.httpStatus }),
        ...(fetched.parseReason === undefined ? {} : { parseReason: fetched.parseReason }),
        ...(fetched.bodySample === undefined ? {} : { bodySample: fetched.bodySample }),
        adapterVersion: MF_PUBLISHED_RETURNS_ADAPTER_VERSION,
      },
    });
    return;
  }

  const published = fetched.data;

  // The publisher's as-at date has to be this month-end (allowing for the
  // weekend/holiday lag). Comparing their July figure against our August row
  // would report a drift that is entirely of our own making.
  const lagDays = Math.round((monthEnd.getTime() - published.asOn.getTime()) / 86_400_000);
  if (lagDays < 0 || lagDays > ASOF_MAX_LAG_DAYS) {
    for (let i = 0; i < METRICS_PER_SCHEME; i += 1) bumpUnreconciled('published_as_on_mismatch');
    pending.push({
      sourceRef: `mf-recon:${entry.schemeCode}:ASON:${period}`,
      errorMessage:
        `reconciliation_as_on_mismatch: scheme ${entry.schemeCode} (${entry.schemeName}): ` +
        `published figures are as at ${isoDay(published.asOn)} but we are reconciling ` +
        `${isoDay(monthEnd)} (lag ${lagDays}d, max ${ASOF_MAX_LAG_DAYS}d). Comparison refused ` +
        `rather than made against the wrong period.`,
      rawPayload: {
        reason: 'reconciliation_as_on_mismatch',
        schemeCode: entry.schemeCode,
        period,
        publishedAsOn: isoDay(published.asOn),
        monthEnd: isoDay(monthEnd),
        lagDays,
      },
    });
    return;
  }

  result.schemesReconciled += 1;

  if (ctx === undefined) {
    // The panel names a scheme our master does not have. Most likely an
    // unverified panel code (see `codeVerified`), which is precisely the
    // failure mode the panel file warns about.
    for (let i = 0; i < METRICS_PER_SCHEME; i += 1) bumpUnreconciled('scheme_not_in_master');
    pending.push({
      sourceRef: `mf-recon:${entry.schemeCode}:MASTER:${period}`,
      errorMessage:
        `reconciliation_scheme_unknown: panel scheme ${entry.schemeCode} (${entry.schemeName}) ` +
        `has no MfSchemeMeta row. Spot-check the code against a live AMFI file — an unverified ` +
        `panel code reconciles the wrong fund.`,
      rawPayload: {
        reason: 'reconciliation_scheme_unknown',
        schemeCode: entry.schemeCode,
        schemeName: entry.schemeName,
        expectedSubCategory: entry.sebiSubCategory,
        period,
      },
    });
    return;
  }

  await reconcileReturns(args, published, ctx);
  await reconcileTer(args, published, ctx);
  await reconcileAum(args, published, ctx);
}

async function reconcileReturns(
  args: ReconcileSchemeArgs,
  published: MfPublishedReturns,
  ctx: SchemeContext,
): Promise<void> {
  const { entry, monthEnd, period, result, pending, bumpUnreconciled } = args;

  const ourRows = await loadOurMetrics(entry.schemeCode, monthEnd);

  for (const horizon of PUBLISHED_HORIZONS) {
    const metric = returnMetric(horizon);
    const theirs = published.returnsPct[horizon];
    if (theirs === undefined) {
      // Not published is not a disagreement. It is also not agreement.
      bumpUnreconciled('not_published');
      continue;
    }

    const ours = ourRows.get(horizon);
    if (ours === undefined) {
      bumpUnreconciled('our_metrics_missing');
      continue;
    }
    if (ours.status !== 'OK') {
      // A degraded metric is honest about itself (`06 §6`); comparing it would
      // manufacture a breach out of a gap we already know about.
      bumpUnreconciled('our_metrics_not_ok');
      continue;
    }
    const oursPct = ourReturnPct(ours.metrics, horizon);
    if (oursPct === null) {
      bumpUnreconciled('our_value_missing');
      continue;
    }

    result.comparisons += 1;
    if (!isReturnBreach(oursPct, theirs.value)) {
      result.matched += 1;
      continue;
    }

    const classification = await classifyDrift(ctx, {
      metric,
      horizon,
      monthEnd,
      ourAsOf: ours.asOf,
      theirsPct: theirs.value,
    });
    recordBreach({
      result,
      pending,
      entry,
      metric,
      period,
      unit: 'pp',
      ourValue: oursPct.toFixed(4),
      theirValue: theirs.value.toFixed(4),
      driftAbs: oursPct.minus(theirs.value).abs().toFixed(4),
      tolerance: `${RETURN_TOLERANCE_PP.toString()}pp`,
      classification,
      extraPayload: {
        horizonYears: horizon,
        ourAsOf: isoDay(ours.asOf),
        publishedAsOn: isoDay(published.asOn),
        mathVersion: ours.metrics.mathVersion,
        benchmarkCode: ours.metrics.benchmarkCode,
      },
    });
  }
}

async function reconcileTer(
  args: ReconcileSchemeArgs,
  published: MfPublishedReturns,
  ctx: SchemeContext,
): Promise<void> {
  const { entry, monthEnd, period, result, pending, bumpUnreconciled } = args;
  const theirs = published.terPct;
  if (theirs === null) {
    bumpUnreconciled('not_published');
    return;
  }

  const row = await prisma.mfSchemeTer.findFirst({
    where: { schemeCode: entry.schemeCode, effectiveFrom: { lte: monthEnd } },
    orderBy: { effectiveFrom: 'desc' },
    select: { terPct: true, effectiveFrom: true },
  });
  if (row === null) {
    bumpUnreconciled('our_reference_missing');
    return;
  }

  const ours = toDecimal(row.terPct);
  result.comparisons += 1;
  if (equalAtPublishedScale(ours, theirs)) {
    result.matched += 1;
    return;
  }

  // TER drift is not one of `06 §2`'s four return-window causes — those are all
  // about the NAV series — so classification only checks whether the scheme
  // itself is the explanation, and says so plainly otherwise.
  const classification = await classifyDrift(ctx, {
    metric: 'TER',
    horizon: null,
    monthEnd,
    ourAsOf: null,
    theirsPct: null,
  });
  recordBreach({
    result,
    pending,
    entry,
    metric: 'TER',
    period,
    unit: 'pp',
    ourValue: ours.toFixed(6),
    // The publisher's own text, not a normalised Decimal: "1000.00" round-tripped
    // through Decimal prints as "1000", and an operator comparing our DLQ message
    // against the factsheet should see the digits the factsheet actually carries.
    theirValue: theirs.raw,
    driftAbs: ours.minus(theirs.value).abs().toFixed(6),
    tolerance: `exact at the published scale (${theirs.scale}dp)`,
    classification,
    extraPayload: {
      ourEffectiveFrom: isoDay(row.effectiveFrom),
      publishedScale: theirs.scale,
      publishedRaw: theirs.raw,
    },
  });
}

async function reconcileAum(
  args: ReconcileSchemeArgs,
  published: MfPublishedReturns,
  ctx: SchemeContext,
): Promise<void> {
  const { entry, monthEnd, period, result, pending, bumpUnreconciled } = args;
  const theirs = published.aumCrore;
  if (theirs === null) {
    bumpUnreconciled('not_published');
    return;
  }

  const row = await prisma.mfSchemeAum.findFirst({
    where: { schemeCode: entry.schemeCode, asOf: { lte: monthEnd } },
    orderBy: { asOf: 'desc' },
    select: { aum: true, asOf: true },
  });
  if (row === null) {
    bumpUnreconciled('our_reference_missing');
    return;
  }

  // `MfSchemeAum.aum` is plain rupees by schema comment; the publisher quotes
  // crore. The division is exact in Decimal and happens exactly here.
  const oursCrore = toDecimal(row.aum).dividedBy(RUPEES_PER_CRORE);
  result.comparisons += 1;
  if (equalAtPublishedScale(oursCrore, theirs)) {
    result.matched += 1;
    return;
  }

  const classification = await classifyDrift(ctx, {
    metric: 'AUM',
    horizon: null,
    monthEnd,
    ourAsOf: null,
    theirsPct: null,
  });
  recordBreach({
    result,
    pending,
    entry,
    metric: 'AUM',
    period,
    unit: 'cr',
    ourValue: oursCrore.toFixed(4),
    // The publisher's own text, not a normalised Decimal: "1000.00" round-tripped
    // through Decimal prints as "1000", and an operator comparing our DLQ message
    // against the factsheet should see the digits the factsheet actually carries.
    theirValue: theirs.raw,
    driftAbs: oursCrore.minus(theirs.value).abs().toFixed(4),
    tolerance: `exact at the published scale (${theirs.scale}dp)`,
    classification,
    extraPayload: {
      ourAsOf: isoDay(row.asOf),
      publishedScale: theirs.scale,
      publishedRaw: theirs.raw,
    },
  });
}

interface RecordBreachArgs {
  result: MfReconciliationJobResult;
  pending: PendingFailure[];
  entry: ReconciliationPanelEntry;
  metric: ReconciledMetric;
  period: string;
  unit: 'pp' | 'cr';
  ourValue: string;
  theirValue: string;
  driftAbs: string;
  tolerance: string;
  classification: Classification;
  extraPayload: Record<string, unknown>;
}

/**
 * Build the DLQ row `06 §2` specifies.
 *
 * The message names the scheme (Task 2.6's acceptance criterion), the metric,
 * both values and the suspected cause with its evidence, because a bare
 * "values differ" makes the operator re-derive everything this function already
 * knows.
 */
function recordBreach(a: RecordBreachArgs): void {
  const breach: DriftBreach = {
    schemeCode: a.entry.schemeCode,
    schemeName: a.entry.schemeName,
    metric: a.metric,
    period: a.period,
    ourValue: a.ourValue,
    theirValue: a.theirValue,
    driftAbs: a.driftAbs,
    cause: a.classification.cause,
    causeEvidence: a.classification.evidence,
  };
  a.result.drifted += 1;
  a.result.breaches.push(breach);
  a.result.driftsByCause[breach.cause] = (a.result.driftsByCause[breach.cause] ?? 0) + 1;

  a.pending.push({
    sourceRef: breachSourceRef(a.entry.schemeCode, a.metric, a.period),
    errorMessage:
      `reconciliation_drift: scheme ${a.entry.schemeCode} (${a.entry.schemeName}) ` +
      `metric ${a.metric} for ${a.period}: ours ${a.ourValue}${a.unit}, ` +
      `published ${a.theirValue}${a.unit}, drift ${a.driftAbs}${a.unit} ` +
      `(tolerance ${a.tolerance}). Suspected cause: ${a.classification.cause} — ` +
      `${a.classification.evidence}.`,
    rawPayload: {
      reason: 'reconciliation_drift',
      schemeCode: a.entry.schemeCode,
      schemeName: a.entry.schemeName,
      sebiSubCategory: a.entry.sebiSubCategory,
      metric: a.metric,
      period: a.period,
      ourValue: a.ourValue,
      theirValue: a.theirValue,
      driftAbs: a.driftAbs,
      unit: a.unit,
      tolerance: a.tolerance,
      suspectedCause: a.classification.cause,
      causeEvidence: a.classification.evidence,
      ...a.extraPayload,
    },
  });
}

// ---------------------------------------------------------------------------
// Loading our side
// ---------------------------------------------------------------------------

/**
 * Meta + the `MutualFundMaster.id` the NAV series is actually keyed by.
 *
 * Two queries for the whole panel rather than two per scheme: 30 narrow rows is
 * one round trip, and classification only needs `fundId` for the handful of
 * schemes that actually drift.
 */
async function loadSchemeContexts(codes: readonly string[]): Promise<Map<string, SchemeContext>> {
  const metas = await prisma.mfSchemeMeta.findMany({
    where: { schemeCode: { in: [...codes] } },
    select: {
      schemeCode: true,
      status: true,
      predecessorSchemeCode: true,
      optionType: true,
    },
  });
  const masters = await prisma.mutualFundMaster.findMany({
    where: { schemeCode: { in: [...codes] } },
    select: { id: true, schemeCode: true },
  });
  const fundIdByCode = new Map(masters.map((m) => [m.schemeCode, m.id]));

  return new Map(
    metas.map((m) => [
      m.schemeCode,
      {
        schemeCode: m.schemeCode,
        status: m.status,
        predecessorSchemeCode: m.predecessorSchemeCode,
        optionType: m.optionType,
        fundId: fundIdByCode.get(m.schemeCode) ?? null,
      },
    ]),
  );
}

/**
 * Our 1y/3y/5y metrics rows "at month-end".
 *
 * Not `asOf = monthEnd` exactly. `mfMetricsJob` runs daily and writes a row per
 * calendar day it runs, but a month-end that falls on a Sunday has no NAV and
 * may have no row — and demanding an exact hit would report
 * `our_metrics_missing` for every scheme in every month that ends on a weekend,
 * which is four months a year of silently unverified metrics. So we take the
 * newest row at or before month-end within `ASOF_MAX_LAG_DAYS`, and the DLQ
 * payload records which `asOf` was actually used.
 */
async function loadOurMetrics(
  schemeCode: string,
  monthEnd: Date,
): Promise<Map<PublishedHorizon, OurMetricRow>> {
  const rows = await prisma.mfSchemeMetrics.findMany({
    where: {
      schemeCode,
      horizonYears: { in: [...PUBLISHED_HORIZONS] },
      asOf: { gte: addDays(monthEnd, -ASOF_MAX_LAG_DAYS), lte: monthEnd },
    },
    orderBy: { asOf: 'desc' },
    select: { asOf: true, horizonYears: true, status: true, statusReason: true, metrics: true },
  });

  const out = new Map<PublishedHorizon, OurMetricRow>();
  for (const r of rows) {
    const h = r.horizonYears as PublishedHorizon;
    // Rows arrive newest-first, so the first sighting of a horizon is the one
    // closest to month-end.
    if (out.has(h)) continue;
    out.set(h, {
      asOf: r.asOf,
      status: r.status,
      statusReason: r.statusReason,
      metrics: r.metrics as unknown as MfHorizonMetrics,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

/**
 * 5th of the month, 03:00 IST.
 *
 * Not the 1st, and the reason is the whole job's validity. AMCs publish
 * month-end factsheets — the TER and AUM half of this reconciliation — within
 * the first few working days, and a publisher's trailing-return page lags the
 * month-end by the same margin. Running on the 1st would compare our fresh
 * month-end numbers against last month's published ones and report a breach on
 * all thirty schemes, every month, which is how an alert channel gets muted.
 *
 * 03:00 and not the 22:00-00:30 band because that band is the daily chain
 * (benchmarkPrice 20:00, mfNavAdjustment 22:30, mfMetrics 23:15, mfPeerRank
 * 00:30) and this job reads what those write. It also lands after
 * `mfMetadataJob` (1st, 02:00), so the TER/AUM rows it reconciles are the
 * refreshed ones rather than a month-old snapshot.
 */
export function startMfReconciliationJob(): void {
  if (process.env.ENABLE_MF_RECONCILIATION_CRON === 'false') {
    logger.info('[cron] mf reconciliation job disabled via ENABLE_MF_RECONCILIATION_CRON=false');
    return;
  }
  cron.schedule(
    '0 3 5 * *',
    () => {
      if (running) {
        logger.warn('[cron] mf reconciliation job already running — skipping this tick');
        return;
      }
      running = true;
      void runMfReconciliationJob()
        .catch((err: unknown) => {
          // Per-scheme failures are already in the DLQ; reaching here means the
          // run itself failed. Logged at error, never swallowed — and note that
          // a crashed run leaves no "all clear" behind, by construction.
          logger.error({ err }, '[cron] mf reconciliation job failed');
        })
        .finally(() => {
          running = false;
        });
    },
    { timezone: TZ },
  );
  logger.info('[cron] scheduled: mf reconciliation @03:00 IST on the 5th');
}
