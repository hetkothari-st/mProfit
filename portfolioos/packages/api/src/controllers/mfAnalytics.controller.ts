import { loadAlternatives } from '../services/mfAnalytics/mfAlternatives.service.js';
/**
 * HTTP surface for the mutual-fund analytics REFERENCE layer
 * (`/api/mf-analytics`, `docs/mf-analytics/07-IMPLEMENTATION-PLAN.md` Task 3.1).
 *
 * Three properties define this file, and every one of them is a deliberate
 * constraint rather than a stylistic preference.
 *
 * 1. **It declares no types of its own.** Every handler's return value is a
 *    type imported verbatim from `@portfolioos/shared/mfAnalytics.types`, or an
 *    indexed access into one (`MfFundAnalyticsDto['metrics']`). This is not
 *    pedantry: the `/advisor` page crashed on first load because the client had
 *    locally-declared shapes and `tsc` therefore had nothing to compare against
 *    (CONTEXT.md §11). Task 3.1 states outright that a locally-declared type
 *    here is a review failure. Where a response needs a container shape — "the
 *    metrics for each horizon" — it borrows the one already living on
 *    `MfFundAnalyticsDto`, so the piecemeal endpoints and the composed endpoint
 *    are structurally incapable of disagreeing.
 *
 * 2. **It does not compute.** `MfSchemeMetrics.metrics` and `MfSchemeScore
 *    .pillars` already hold the finished DTOs as JSON, with every numeric
 *    already a Decimal STRING. The handlers hand those JSON blobs straight to
 *    `ok()`. Nothing here parses a number out of them and re-serialises it —
 *    a round trip through IEEE-754 is precisely the loss CONTEXT.md §3.1 exists
 *    to prevent, and the writer already did the rounding. The only arithmetic
 *    in this file is the category median/top-quartile in `categoryStatsFor`,
 *    and it is done in `Decimal`.
 *
 * 3. **These tables are reference data, not user data.** `MfSchemeMeta`,
 *    `MfSchemeMetrics`, `MfPeerRank`, `MfSchemeScore`, `MfPortfolioSnapshot`
 *    and `MfSchemeQualitativeFact` are shared market data: they are absent from
 *    `USER_SCOPED_MODELS` in `lib/prisma.ts` (and asserted absent by
 *    `mf-reference-not-user-scoped.test.ts`). So there is no `userId` filter and
 *    no `runAsUser` wrapper anywhere below — adding one would make every read
 *    return zero rows. The ROUTE is still gated: `authenticate` +
 *    `requireFeature('MF_ANALYTICS')` in `mfAnalytics.routes.ts`. Who may ASK is
 *    an entitlement question; what the answer contains is not scoped to them.
 *
 * Honesty contract (`06-QUALITY-COMPLIANCE.md §6`) is preserved by omission of
 * cleverness: a metric with `status !== 'OK'` travels with its status and
 * reason; `ratingStatus` (`INSUFFICIENT_HISTORY` / `CATEGORY_TOO_SMALL`) is
 * returned as stored with `composite`/`rating` null. Nothing here substitutes a
 * zero for an unknown, and nothing drops a status field to tidy a response.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import {
  MF_HORIZONS,
  universeKey as buildUniverseKey,
  serializeRatioOrNull,
  serializeMoney,
  ratingHistoryFor,
  type MfSchemeMetaDto,
  type MfExitLoadRule,
  type MfHorizonMetrics,
  type MfHorizonYears,
  type MfCurrentProfile,
  type MfSchemeScoreDto,
  type MfPillarScore,
  type MfQualitativeFactDto,
  type MfFundAnalyticsDto,
  type MfModelKey,
  type SebiCategory,
  type SebiSubCategory,
  type MfPlanType,
  type MfOptionType,
  type MfSchemeStatus,
  type MfRatingStatus,
} from '@portfolioos/shared';

import type { MfSchemeMeta } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { ok } from '../lib/response.js';
import { AppError, NotFoundError } from '../lib/errors.js';
import { parsePeerRankPayload } from '../services/mfAnalytics/mfPeerRank.service.js';
import { fundAgeYears as fundAgeYearsMetric } from '../services/mfAnalytics/mfMetricsMath.js';

// ---------------------------------------------------------------------------
// Query schemas
// ---------------------------------------------------------------------------

/**
 * `?horizon=` filters to a single reporting horizon. Deliberately NOT
 * `z.coerce.number()` alone: an unparseable value must be a 422 naming the
 * field, not a silent `NaN` that quietly matches no rows and renders as "this
 * fund has no 5-year history". A wrong answer that looks like a data gap is the
 * worst failure mode this layer has.
 */
const horizonQuerySchema = z.object({
  horizon: z
    .enum(['1', '3', '5', '7', '10'])
    .optional()
    .transform((v) => (v === undefined ? undefined : (Number.parseInt(v, 10) as MfHorizonYears))),
});

/**
 * `?version=` pins a specific `methodologyVersion` (`03 §9`). The admin
 * methodology page compares two versions of the same scheme's score side by
 * side, which is only possible because `MfSchemeScore` is append-only on
 * `(schemeCode, asOf, methodologyVersion)` — a methodology bump writes a NEW
 * row rather than editing a score a user was already shown.
 */
const scoreQuerySchema = z.object({
  version: z.string().min(1).max(120).optional(),
});

// ---------------------------------------------------------------------------
// Shared reads
// ---------------------------------------------------------------------------

/**
 * The whole row, not a `select`.
 *
 * `MfSchemeMeta` is one narrow row per scheme with no large columns, so
 * projecting it would trade a real maintenance cost — a select list that has to
 * be kept in step with `MfSchemeMetaDto` by hand, in a file whose entire
 * premise is that hand-maintained shape duplication is what broke `/advisor` —
 * for a saving of a few hundred bytes on a single-row lookup.
 */
type SchemeMetaRow = MfSchemeMeta;

/**
 * Load a scheme or 404.
 *
 * Every endpoint in this controller starts here, including the ones that then
 * read a different table. That is on purpose: "this scheme does not exist" and
 * "this scheme exists but has no metrics yet" are different answers, and a
 * handler that queried only `MfSchemeMetrics` would collapse them into the same
 * empty response. The first is a 404; the second is a 200 carrying null with a
 * status, per `02-METRICS.md §1`.
 */
async function requireScheme(schemeCode: string): Promise<SchemeMetaRow> {
  const scheme = await prisma.mfSchemeMeta.findUnique({ where: { schemeCode } });
  if (scheme === null) throw new NotFoundError(`Unknown scheme code: ${schemeCode}`);
  return scheme;
}

/** `YYYY-MM-DD`. Matches `mfMetrics.service.ts`, which serialises every date in
 *  the stored metrics JSON this way; a controller emitting full ISO timestamps
 *  would make `meta.inceptionDate` and `profile.asOf` incomparable as strings. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * `MfSchemeMeta.exitLoadRules` is written by `adapters/mfFactsheet` as exactly
 * `[{ daysUpTo: number, pct: Pct-string }]` — the JSON form of
 * `MfExitLoadRule`. Passed through rather than rebuilt: `pct` is already a
 * Decimal string at 6 places and re-serialising it could only lose precision.
 * The guard is a shape check, not a parse — a malformed column is a writer bug
 * and is surfaced as `null` (unknown load) rather than as a crash, because an
 * unknown exit load is a legitimate state the DTO already models.
 */
function toExitLoadRules(raw: unknown): MfExitLoadRule[] | null {
  if (!Array.isArray(raw)) return null;
  const isRule = (r: unknown): r is MfExitLoadRule =>
    typeof r === 'object' &&
    r !== null &&
    typeof (r as { daysUpTo?: unknown }).daysUpTo === 'number' &&
    typeof (r as { pct?: unknown }).pct === 'string';
  return raw.every(isRule) ? (raw as MfExitLoadRule[]) : null;
}

/**
 * Row → `MfSchemeMetaDto`.
 *
 * The Prisma enums (`MfSebiCategory`, `MfPlanType`, `MfOptionType`,
 * `MfSchemeStatus`) are value-identical to the shared string unions, so the
 * casts are widening-free. `sebiSubCategory` is a plain `String` column because
 * it also carries the literal `'UNMAPPED'` sentinel, which the DTO models
 * explicitly.
 *
 * `fundAgeYears` is computed at `asOf` using the SAME `fundAgeYears` helper the
 * metrics layer uses (365.25-day Julian year), not a second local formula. It
 * is the number the UI needs to render "Unrated — N months of history" for a
 * scheme whose `ratingStatus` is `INSUFFICIENT_HISTORY`: `MfSchemeScoreDto`
 * carries the peer count (`universeSize`) for `CATEGORY_TOO_SMALL` but has no
 * month-count field, so the history figure has to reach the client through the
 * meta DTO. See the report note on `06 §6`.
 */
function toMetaDto(row: SchemeMetaRow, asOf: Date): MfSchemeMetaDto {
  return {
    schemeCode: row.schemeCode,
    isin: row.isin,
    schemeName: row.schemeName,
    amcCode: row.amcCode,
    amcName: row.amcName,
    sebiCategory: row.sebiCategory as SebiCategory,
    sebiSubCategory: row.sebiSubCategory as SebiSubCategory | 'UNMAPPED',
    planType: row.planType as MfPlanType,
    optionType: row.optionType as MfOptionType,
    benchmarkIndexCode: row.benchmarkIndexCode,
    inceptionDate: isoDate(row.inceptionDate),
    status: row.status as MfSchemeStatus,
    statusChangedAt: row.statusChangedAt === null ? null : isoDate(row.statusChangedAt),
    predecessorSchemeCode: row.predecessorSchemeCode,
    growthSiblingSchemeCode: row.growthSiblingSchemeCode,
    // SEBI expects the risk-o-meter displayed wherever a scheme is presented
    // (`06 §4`). This is the field that carries it, and it is the reason the
    // fund page fetches meta alongside any score.
    riskometer: row.riskometer,
    exitLoadText: row.exitLoadText,
    exitLoadRules: toExitLoadRules(row.exitLoadRules),
    minSip: row.minSip === null ? null : serializeMoney(row.minSip),
    fundAgeYears: serializeRatioOrNull(fundAgeYearsMetric(row.inceptionDate, asOf).value),
  };
}

/**
 * The stored `metrics` JSON column IS the DTO (`persistSchemeMetrics` writes the
 * `MfHorizonMetrics` / `MfCurrentProfile` object verbatim). This asserts the
 * blob is an object and hands it over untouched.
 *
 * It throws rather than returning null on a malformed blob. That is not a
 * silent-catch violation in reverse — a non-object in this column means the
 * writer produced something it never should have, and quietly degrading it to
 * "no metrics available" would present a data-integrity failure to the user as
 * a normal, expected gap in coverage. `06 §6` distinguishes those two states
 * everywhere else; the API must not merge them here.
 */
function metricsJsonAsDto<T>(raw: unknown, schemeCode: string, horizonYears: number): T {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AppError(
      `Malformed metrics payload for ${schemeCode} horizon ${horizonYears}`,
      500,
      'MF_METRICS_PAYLOAD_CORRUPT',
    );
  }
  return raw as T;
}

/**
 * The newest `asOf` for which this scheme has any metrics row.
 *
 * `mfMetricsJob` writes all six rows (horizons 1/3/5/7/10 plus the horizon-0
 * profile) at one `asOf` in a single pass, so pinning every horizon to
 * `max(asOf)` guarantees the response is internally consistent. Reading each
 * horizon's own latest row independently would let a partially-completed job
 * return a 3-year figure from March beside a 5-year figure from February, and
 * nothing in the payload would say so.
 */
async function latestMetricsAsOf(schemeCode: string): Promise<Date | null> {
  const newest = await prisma.mfSchemeMetrics.findFirst({
    where: { schemeCode },
    orderBy: { asOf: 'desc' },
    select: { asOf: true },
  });
  return newest?.asOf ?? null;
}

/** Horizons 1..10, keyed by horizon, exactly as `MfFundAnalyticsDto.metrics`. */
async function loadHorizonMetrics(
  schemeCode: string,
  horizon: MfHorizonYears | undefined,
): Promise<MfFundAnalyticsDto['metrics']> {
  const asOf = await latestMetricsAsOf(schemeCode);
  if (asOf === null) return {};

  const rows = await prisma.mfSchemeMetrics.findMany({
    where: {
      schemeCode,
      asOf,
      horizonYears: horizon === undefined ? { in: [...MF_HORIZONS] } : horizon,
    },
    select: { horizonYears: true, metrics: true },
  });

  const out: MfFundAnalyticsDto['metrics'] = {};
  for (const row of rows) {
    const key = String(row.horizonYears) as `${MfHorizonYears}`;
    out[key] = metricsJsonAsDto<MfHorizonMetrics>(row.metrics, schemeCode, row.horizonYears);
  }
  return out;
}

/**
 * The horizon-0 row: everything derived from the latest monthly portfolio
 * disclosure plus the structural tables (`02 §7-8`).
 *
 * Null — not 404, not `{}` — when the metrics job has never run for this
 * scheme. The DTO models that state (`MfFundAnalyticsDto.profile` is
 * `MfCurrentProfile | null`), and it is genuinely different from a profile that
 * exists with `status: INSUFFICIENT_DATA`, which means the job ran and found
 * nothing usable.
 */
async function loadProfile(schemeCode: string): Promise<MfCurrentProfile | null> {
  const row = await prisma.mfSchemeMetrics.findFirst({
    where: { schemeCode, horizonYears: 0 },
    orderBy: { asOf: 'desc' },
    select: { metrics: true },
  });
  if (row === null) return null;
  return metricsJsonAsDto<MfCurrentProfile>(row.metrics, schemeCode, 0);
}

/**
 * Latest score, or the score for one explicit `methodologyVersion`.
 *
 * Ordering is `asOf desc, computedAt desc`. The second key breaks the tie when
 * two methodology versions were scored for the same `asOf` — the append-only
 * unique key is `(schemeCode, asOf, methodologyVersion)`, so that is a normal
 * state during a methodology rollout, and "latest" must then mean the most
 * recently computed one rather than whichever the planner happened to return.
 */
async function loadScore(
  schemeCode: string,
  methodologyVersion: string | undefined,
): Promise<MfSchemeScoreDto | null> {
  const row = await prisma.mfSchemeScore.findFirst({
    where: {
      schemeCode,
      ...(methodologyVersion === undefined ? {} : { methodologyVersion }),
    },
    orderBy: [{ asOf: 'desc' }, { computedAt: 'desc' }],
    // The scheme is joined, not fetched separately, because `MfSchemeScoreDto`
    // now carries `riskometer` (SEBI requires it beside any score, 06 §4) and
    // the unrated-copy figures derived from `inceptionDate` (06 §6). Both are
    // needed on every score response, so a second round-trip would be pure
    // overhead.
    include: { scheme: { select: { riskometer: true, inceptionDate: true } } },
  });
  if (row === null) return null;

  const ratingHistory = ratingHistoryFor(
    row.scheme.inceptionDate,
    row.asOf,
    row.ratingStatus as MfRatingStatus,
  );

  return {
    schemeCode: row.schemeCode,
    asOf: isoDate(row.asOf),
    methodologyVersion: row.methodologyVersion,
    modelKey: row.modelKey as MfModelKey,
    // Returned exactly as stored. INSUFFICIENT_HISTORY and CATEGORY_TOO_SMALL
    // are answers, not errors: `06 §6` requires the client to render
    // "Unrated — N months of history" / "Unrated — only n peers in category",
    // which it cannot do if the API normalises the status away or substitutes
    // a zero composite. `composite` and `rating` stay null; `universeSize`
    // below carries the peer count the CATEGORY_TOO_SMALL copy needs.
    ratingStatus: row.ratingStatus,
    composite: serializeRatioOrNull(row.composite),
    rating: row.rating as MfSchemeScoreDto['rating'],
    // The full pillar derivation, already Decimal strings in the JSON column.
    pillars: row.pillars as unknown as Record<string, MfPillarScore>,
    universeKey: row.universeKey,
    universeSize: row.universeSize,
    computedAt: row.computedAt.toISOString(),
    riskometer: row.scheme.riskometer,
    historyMonths: ratingHistory.historyMonths,
    ratedFrom: ratingHistory.ratedFrom,
  };
}

/** Peer percentiles keyed by horizon, exactly as `MfFundAnalyticsDto.peer`. */
async function loadPeers(
  schemeCode: string,
  horizon: MfHorizonYears | undefined,
): Promise<MfFundAnalyticsDto['peer']> {
  const newest = await prisma.mfPeerRank.findFirst({
    where: { schemeCode },
    orderBy: { asOf: 'desc' },
    select: { asOf: true },
  });
  if (newest === null) return {};

  const rows = await prisma.mfPeerRank.findMany({
    where: {
      schemeCode,
      asOf: newest.asOf,
      ...(horizon === undefined ? {} : { horizonYears: horizon }),
    },
  });

  const out: MfFundAnalyticsDto['peer'] = {};
  for (const row of rows) {
    // Never hand-parse `percentiles`: the `$`-prefixed keys (medians, universe
    // block, module version) are an internal encoding owned by
    // mfPeerRank.service.ts, and a second decoder here would drift from it the
    // first time that encoding gains a key.
    const parsed = parsePeerRankPayload(row);
    const key = String(row.horizonYears) as `${MfHorizonYears}`;
    out[key] = parsed.peer;
  }
  return out;
}

/**
 * Admin-curated facts in force at `asOf` (`01 §2`, `03 §4`).
 *
 * The open-interval filter matters: `validTo === null` means "still in force",
 * not "missing end date". A fact that has expired is deliberately excluded
 * rather than returned with a flag, because a lapsed SEBI action against an AMC
 * must not keep depressing what the user reads today.
 */
async function loadQualitative(schemeCode: string, asOf: Date): Promise<MfQualitativeFactDto[]> {
  const rows = await prisma.mfSchemeQualitativeFact.findMany({
    where: {
      schemeCode,
      validFrom: { lte: asOf },
      OR: [{ validTo: null }, { validTo: { gte: asOf } }],
    },
    orderBy: [{ validFrom: 'desc' }],
    select: { factType: true, value: true, validFrom: true, validTo: true, source: true },
  });

  return rows.map((r) => ({
    factType: r.factType,
    value: r.value,
    validFrom: isoDate(r.validFrom),
    validTo: r.validTo === null ? null : isoDate(r.validTo),
    source: r.source,
    // `enteredBy` (the admin userId) is deliberately NOT surfaced. It is
    // provenance for the audit trail, not something an investor needs, and
    // leaking an internal user id onto a public-ish read has no upside.
  }));
}

/**
 * Universe context for a score: how the fund's composite sits against its peers.
 *
 * Computed here rather than read from a column because nothing persists it —
 * `MfSchemeScore` stores `universeKey`/`universeSize` per scheme but no
 * universe-level aggregate. Both figures are taken over the SAME
 * `(universeKey, asOf, methodologyVersion)` slice the scheme itself was scored
 * in, so a scheme scored under an older methodology is compared against peers
 * scored the same way rather than against the current model's distribution.
 *
 * Only `RATED` schemes contribute. An unrated fund has a null composite by
 * construction, and treating that as a zero would drag the median toward the
 * bottom of the scale in exactly the small categories where the median matters
 * most.
 */
async function categoryStatsFor(
  scheme: SchemeMetaRow,
  score: MfSchemeScoreDto | null,
): Promise<MfFundAnalyticsDto['categoryStats']> {
  const fallbackKey = buildUniverseKey(scheme.sebiSubCategory, scheme.planType as MfPlanType);

  if (score === null) {
    // No score at all: name the universe the scheme WOULD be ranked in, and say
    // nothing about its distribution rather than inventing a size of 0 peers.
    return {
      universeKey: fallbackKey,
      universeSize: 0,
      medianComposite: null,
      topQuartileComposite: null,
    };
  }

  // Day range rather than equality on a Date rebuilt from `score.asOf`.
  // `score.asOf` is a `YYYY-MM-DD` string, so reconstructing an exact instant
  // from it silently assumes every writer stored midnight UTC. `mfScoringJob`
  // does — but a single row written at 00:00:01 would then match nothing and
  // this function would report a universe of zero peers with no error anywhere,
  // which is exactly the class of failure that looks like missing data instead
  // of like a bug.
  const dayStart = new Date(`${score.asOf}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const peers = await prisma.mfSchemeScore.findMany({
    where: {
      universeKey: score.universeKey,
      asOf: { gte: dayStart, lt: dayEnd },
      methodologyVersion: score.methodologyVersion,
      ratingStatus: 'RATED',
      composite: { not: null },
    },
    select: { composite: true },
  });

  const composites = peers
    .map((p) => new Decimal(p.composite!.toString()))
    .sort((a, b) => a.comparedTo(b));

  return {
    universeKey: score.universeKey,
    universeSize: score.universeSize,
    medianComposite: serializeRatioOrNull(percentileOf(composites, 0.5)),
    // "Top quartile" is the 75th percentile of the composite: higher composite
    // is better, so the top quartile sits at the HIGH end of the distribution.
    topQuartileComposite: serializeRatioOrNull(percentileOf(composites, 0.75)),
  };
}

/**
 * Linear-interpolated percentile over an ascending Decimal array.
 *
 * Interpolated rather than nearest-rank so that the median of an even-sized
 * universe is the mean of the two central values — the definition every
 * factsheet and every reader assumes. All in `Decimal`; the index arithmetic is
 * over array positions, which are counts, not money.
 */
function percentileOf(sorted: readonly Decimal[], p: number): Decimal | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  const weight = new Decimal(pos - lo);
  return sorted[lo]!.plus(sorted[hi]!.minus(sorted[lo]!).times(weight));
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** `GET /api/mf-analytics/schemes/:schemeCode` → `MfSchemeMetaDto`. */
export async function getSchemeMeta(req: Request, res: Response): Promise<void> {
  const scheme = await requireScheme(req.params.schemeCode!);
  const dto: MfSchemeMetaDto = toMetaDto(scheme, new Date());
  ok(res, dto);
}

/**
 * `GET /api/mf-analytics/schemes/:schemeCode/metrics` → every horizon, keyed by
 * horizon; `?horizon=3` narrows it to one.
 *
 * Keyed rather than an array because `MfHorizonMetrics` carries its own
 * `horizonYears`, and a keyed object is the shape `MfFundAnalyticsDto.metrics`
 * already uses — so the piecemeal read and the composed read cannot diverge.
 * An empty object means the metrics job has not run for this scheme; it does
 * not mean the scheme is unknown, which is a 404 from `requireScheme` above.
 */
export async function getSchemeMetrics(req: Request, res: Response): Promise<void> {
  const schemeCode = req.params.schemeCode!;
  await requireScheme(schemeCode);
  const { horizon } = horizonQuerySchema.parse(req.query);
  ok(res, await loadHorizonMetrics(schemeCode, horizon));
}

/**
 * `GET /api/mf-analytics/schemes/:schemeCode/score` → latest `MfSchemeScoreDto`,
 * or the one for `?version=<methodologyVersion>` (`03 §9`).
 *
 * An explicit `?version=` that matches nothing is a 404: the caller named a
 * specific resource and it does not exist. No `?version=` and no score at all
 * is `null` with a 200: the scheme exists, it simply has not been scored yet,
 * and the DTO models that (`MfFundAnalyticsDto.score` is nullable). Collapsing
 * the two would make the methodology-comparison page unable to tell "that
 * version was never run" from "this fund is unscored".
 */
export async function getSchemeScore(req: Request, res: Response): Promise<void> {
  const schemeCode = req.params.schemeCode!;
  await requireScheme(schemeCode);
  const { version } = scoreQuerySchema.parse(req.query);

  const score = await loadScore(schemeCode, version);
  if (score === null && version !== undefined) {
    throw new NotFoundError(`No score for ${schemeCode} at methodology version ${version}`);
  }
  ok(res, score);
}

/**
 * `GET /api/mf-analytics/schemes/:schemeCode/peers` → percentiles and category
 * medians per horizon, at the latest ranked `asOf`; `?horizon=` narrows it.
 */
/**
 * `GET /api/mf-analytics/schemes/:schemeCode/alternatives` → `MfAlternativesDto`.
 *
 * Reference data with no owner, like the rest of this controller: which funds
 * outscore this one in its own category is the same fact for every reader.
 * Anything that depends on what the reader holds — switch cost, tax, a
 * recommendation — belongs to the verdict endpoints, which are user-scoped.
 */
export async function getSchemeAlternatives(req: Request, res: Response): Promise<void> {
  const schemeCode = req.params.schemeCode!;
  await requireScheme(schemeCode);
  ok(res, await loadAlternatives(schemeCode));
}

export async function getSchemePeers(req: Request, res: Response): Promise<void> {
  const schemeCode = req.params.schemeCode!;
  await requireScheme(schemeCode);
  const { horizon } = horizonQuerySchema.parse(req.query);
  ok(res, await loadPeers(schemeCode, horizon));
}

/**
 * `GET /api/mf-analytics/schemes/:schemeCode/holdings` → `MfCurrentProfile`.
 *
 * This is the horizon-0 row (`02 §7`): the latest monthly portfolio disclosure
 * reduced to the numbers the fund page shows — `snapshotAsOf` (which drives the
 * amber "Portfolio as of {date}" badge in `06 §6`), `numHoldings`, `cashPct`,
 * `topHoldings`, sector weights, market-cap and credit splits, plus the
 * structural block.
 *
 * It is NOT the raw `MfPortfolioHolding` list. `topHoldings` is the top ten by
 * weight; there is no shared DTO for a full per-security snapshot, and
 * inventing one in this controller is the review failure Task 3.1 names. See
 * the report: exposing the complete holdings list needs an `MfPortfolioSnapshotDto`
 * added to `packages/shared`, which is outside this task's footprint.
 */
export async function getSchemeHoldings(req: Request, res: Response): Promise<void> {
  const schemeCode = req.params.schemeCode!;
  await requireScheme(schemeCode);
  ok(res, await loadProfile(schemeCode));
}

/**
 * `GET /api/mf-analytics/schemes/:schemeCode/analytics` → `MfFundAnalyticsDto`.
 *
 * The composed read the fund detail page (Task 3.2) consumes, and the reason
 * the base path stayed as bare meta rather than becoming this: keeping both
 * means a caller that only needs a scheme's name and risk-o-meter does not pay
 * for five joins, while the page gets one round trip instead of five.
 *
 * It also settles `06 §4`'s "risk-o-meter alongside any score" structurally
 * rather than by convention — `meta.riskometer` and `score` arrive in the same
 * payload, so a page cannot render one without having the other in hand.
 *
 * `held`, `findings` and `verdict` are null/empty here, and that is a scope
 * boundary rather than a claim about the fund. They come from the USER-scoped
 * half of this layer — `MfAnalysisRun`, `MfFinding`, `MfFundVerdict` — whose
 * engine is Tasks 4.2 and 5.4 and does not exist yet; the tables have RLS
 * policies but nothing writes them. A consumer must therefore NOT read
 * `findings: []` as "nothing is wrong with this fund"; until the engine lands
 * it means "no analysis has run". Wiring them is a change to this handler only.
 */
export async function getFundAnalytics(req: Request, res: Response): Promise<void> {
  const schemeCode = req.params.schemeCode!;
  const scheme = await requireScheme(schemeCode);
  const asOf = new Date();

  // Independent reads; nothing here depends on another's result except
  // categoryStats, which needs the score's universe and methodology version.
  let [metrics, profile, score, peer, qualitative] = await Promise.all([
    loadHorizonMetrics(schemeCode, undefined),
    loadProfile(schemeCode),
    loadScore(schemeCode, undefined),
    loadPeers(schemeCode, undefined),
    loadQualitative(schemeCode, asOf),
  ]);

  /**
   * An IDCW scheme inherits its growth sibling's analytics.
   *
   * Peer universes are GROWTH-only (`03 §1`), so a payout or reinvest option is
   * never ranked and has no score of its own — 4,711 of the ACTIVE schemes in
   * this database, against 2,110 growth ones. Returning nothing for them tells
   * an IDCW holder their fund is unrated when the fund is rated; it is the same
   * portfolio, the same manager and the same mandate, differing only in how it
   * distributes.
   *
   * The substitution is never silent: `analyticsFromSchemeCode` names whose
   * numbers these are, and the DTO has no way to express the swap without it.
   * Only the shared, portfolio-level reads are taken — score, metrics, profile
   * and peer rank. `meta` stays the scheme the caller asked for, because its
   * plan, option and NAV really are its own.
   */
  const sibling = scheme.growthSiblingSchemeCode;
  const needsSibling = score === null && sibling !== null && sibling !== schemeCode;
  let analyticsFromSchemeCode: string | null = null;

  if (needsSibling) {
    const [sMetrics, sProfile, sScore, sPeer] = await Promise.all([
      loadHorizonMetrics(sibling, undefined),
      loadProfile(sibling),
      loadScore(sibling, undefined),
      loadPeers(sibling, undefined),
    ]);
    // Only claim the substitution when it actually produced a rating; a
    // sibling with no score either leaves the reader exactly where they were.
    if (sScore !== null) {
      metrics = sMetrics;
      profile = sProfile;
      score = sScore;
      peer = sPeer;
      analyticsFromSchemeCode = sibling;
    }
  }

  const dto: MfFundAnalyticsDto = {
    meta: toMetaDto(scheme, asOf),
    score,
    metrics,
    profile,
    peer,
    qualitative,
    categoryStats: await categoryStatsFor(scheme, score),
    analyticsFromSchemeCode,
    held: null,
    findings: [],
    verdict: null,
  };

  ok(res, dto);
}
