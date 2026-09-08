/**
 * Scheme scoring service — the I/O half of `docs/mf-analytics/03-SCORING.md`.
 *
 * `mfScoreMath.ts` beside this file is sterile: percentile, blend, pillar,
 * composite, bucket. This module is everything the maths is not allowed to
 * touch — reading the universe out of the database, deciding which stored
 * number feeds which model input, and writing `MfSchemeScore` rows. It
 * reimplements none of the arithmetic; every number in a persisted row was
 * produced by a function in `mfScoreMath.ts`, which is what makes a score
 * reproducible from its inputs months later (`03 §9`).
 *
 * ## The unit of work is the universe, never the scheme
 *
 * A rating is a bucket *within the universe* (`03 §8`): to say a fund is
 * five-star you need every other member's composite. So `scoreUniverse` is
 * the primitive and `scoreScheme` delegates to it — scoring one scheme in
 * isolation would either have to load the whole universe anyway or emit a
 * rating relative to nothing.
 *
 * ## Append-only, with no update path (`03 §9`, `06 §1` mf-score-append-only)
 *
 * A score row is a claim — "this fund scored 71.4 on 2026-03-31 under
 * `score-active-equity-v1`" — that a backtest, a methodology changelog and a
 * user who saw the number all rely on staying true. The row is therefore
 * written once and never touched again:
 *
 *   - a same-`asOf`, same-version re-run finds the row and writes nothing
 *     (the unique constraint on `(schemeCode, asOf, methodologyVersion)` is
 *     the backstop; the pre-check is what lets the job report "skipped");
 *   - a bumped `methodologyVersion` writes a *new* row beside the old one,
 *     and the old one stays byte-identical;
 *   - there is deliberately **no** `update`, `upsert`, `updateMany` or
 *     `delete` call on `mfSchemeScore` anywhere in this file. A "fix" to an
 *     old score is a new methodology version, by construction.
 *
 * ## IDCW options are scored through their growth sibling (`03 §1`, `§11.9`)
 *
 * Universes contain GROWTH options only, because an IDCW option is the same
 * portfolio, the same manager and the same holdings — scoring it separately
 * would count one fund twice in its own category and depress every peer's
 * percentile toward that fund's value. A user holding the IDCW option still
 * gets a score: `scoreScheme` / `getScoreForScheme` resolve
 * `MfSchemeMeta.growthSiblingSchemeCode` and score/read the sibling. The row
 * is keyed by the sibling's code and **no mirror row is written under the
 * IDCW code** — a mirror would re-enter the universe through the back door
 * the moment anything counted rows per `universeKey` (which
 * `mfFacts.builder.ts` does for category medians).
 *
 * ## Where each input's percentile comes from
 *
 * `MfPeerRank` is the primary source (`03 §10`: "every number traceable to a
 * metric percentile, every percentile to a universe"). It ranks the
 * return-window metrics per horizon and TER / AUM at horizon 0. The portfolio
 * and people inputs the models also name — active share, HHI, style drift,
 * manager tenure, credit splits, cash — are *not* ranked there, so this
 * module ranks them itself, over the same universe, with the same
 * `percentileRankForMetric` (so direction, plateau and tie handling cannot
 * differ). The explainability payload records the percentile either way.
 */

import {
  Decimal,
  toDecimal,
  serializeRatio,
  serializeRatioOrNull,
  specFor,
  universeKey as buildUniverseKey,
  wholeMonthsBetween,
  MIN_UNIVERSE_SIZE,
  UNMAPPED_SUBCATEGORY,
} from '@portfolioos/shared';
import type {
  MfCurrentProfile,
  MfHorizonMetrics,
  MfHorizonYears,
  MfMetricStatus,
  MfModelKey,
  MfPillarInput,
  MfPillarScore,
  MfPlanType,
  MfRatingStatus,
  Ratio,
  SebiSubCategory,
  SebiSubCategorySpec,
} from '@portfolioos/shared';
import type { Prisma } from '@prisma/client';

import { prisma, runInTransaction } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import {
  amcQualitativeScore,
  blendHorizons,
  composite as compositeOf,
  directionFor,
  pillarScore,
  percentileRankForMetric,
  ratingFromComposite,
  ratingStatusFor,
  type AmcQualitativeFact,
  type MfRating,
  type PillarInputValue,
  type ScoringHorizon,
  type ScoringModel,
} from './mfScoreMath.js';
import { modelForKey } from './models/registry.js';
import {
  medianOf,
  parsePeerRankPayload,
  resolveRankableSchemeCode,
  STRUCTURAL_HORIZON,
  type PersistedPeerRank,
  type UniverseRef,
} from '../mfPeerRank.service.js';

// `mfScoreMath` sets this too; decimal.js precision is global and the two
// must agree whichever loads first.
Decimal.set({ precision: 28 });

// ---------------------------------------------------------------------------
// 0. Constants
// ---------------------------------------------------------------------------

/**
 * Bumped when *this file* changes which stored number feeds which input, or
 * how a derived input (`sovAaaPct`, `trackingDifferenceAbs`,
 * `equityAllocationDrift`, `modifiedDurationInBand`) is built. Distinct from
 * a model's `methodologyVersion`, which is what the unique constraint keys on;
 * a change here that alters any score must also bump every affected model's
 * version, because that is the only thing that produces new rows.
 */
export const MF_SCORE_SERVICE_VERSION = '1.0.0';

/** The horizons a rating blends over (`03 §3`). 1y and 7y are reported, not scored. */
export const SCORING_HORIZONS: readonly ScoringHorizon[] = [3, 5, 10];

/**
 * `03 §5`: the INDEX model blends tracking error over 1y and 3y, 50/50. It is
 * the one input not on the 3/5/10 ladder — a tracker's recent noise is the
 * question, not its decade — and `blendHorizons` cannot express it, so it is
 * handled in `trackingErrorBlend` below with the same renormalise-over-
 * available rule the ladder uses.
 */
const TRACKING_ERROR_HORIZONS: readonly MfHorizonYears[] = [1, 3];

/**
 * The horizon whose raw value and category median appear as the single
 * `value` / `universeMedian` of a blended input in the `03 §10` payload. The
 * blend itself is across horizons; the explanation needs one number to print
 * ("Sortino 1.12 vs median 0.87"), and 3y is the horizon a rating cannot exist
 * without (`03 §3`: no 3y ⇒ no rating), so it is the one every rated fund has.
 */
const ANCHOR_HORIZON: ScoringHorizon = 3;

/** Qualitative fact types `amcQualitativeScore` knows about (`03 §4`). */
const AMC_FACT_TYPES: readonly string[] = ['AMC_REGULATORY_ACTION', 'AMC_FRONT_RUNNING'];

/** `03 §7`: equity-share drift is measured across the last 12 disclosures. */
const EQUITY_DRIFT_SNAPSHOTS = 12;

const HUNDRED = new Decimal(100);

// ---------------------------------------------------------------------------
// 1. Types
// ---------------------------------------------------------------------------

/** The in-memory form of one `MfSchemeScore` row, before or after persistence. */
export interface MfSchemeScoreRow {
  schemeCode: string;
  asOf: Date;
  methodologyVersion: string;
  modelKey: MfModelKey;
  ratingStatus: MfRatingStatus;
  /** 0-100. Null unless `ratingStatus === 'RATED'` (schema contract). */
  composite: Decimal | null;
  rating: MfRating | null;
  pillars: Record<string, MfPillarScore>;
  universeKey: string;
  /** The size of the pool the rating was bucketed within — see `rateUniverse`. */
  universeSize: number;
  /**
   * Not persisted. What the gates saw, so a caller (the job log, a test) can
   * tell *why* a fund is unrated without re-deriving it.
   */
  diagnostics: {
    historyMonths: number;
    /** The composite before the rating gate withheld it. Null when no pillar scored. */
    compositeBeforeGate: Decimal | null;
  };
}

export interface UniverseScoreResult {
  universeKey: string;
  asOf: Date;
  modelKey: MfModelKey;
  methodologyVersion: string;
  /** Members scored (rows computed), whether or not they were new. */
  scored: number;
  /** Rows inserted by this call. */
  written: number;
  /** Rows that already existed for `(schemeCode, asOf, methodologyVersion)` and were left untouched. */
  skippedExisting: number;
  /** ACTIVE growth members with no `MfSchemeMetrics` row at `asOf` — never measured, so not scored. */
  skippedUnmeasured: number;
  ratingStatusCounts: Record<MfRatingStatus, number>;
  rows: MfSchemeScoreRow[];
}

/**
 * Why `scoreScheme` could not produce a persisted row. Each is a real answer
 * about the scheme, not an error, which is why the outcome carries
 * `ratingStatus: 'NOT_APPLICABLE'` rather than throwing.
 */
export type SchemeNotScoredReason =
  | 'scheme_not_found'
  | 'no_growth_sibling'
  | 'unmapped_subcategory'
  | 'not_active'
  | 'not_in_universe';

export interface SchemeScoreOutcome {
  requestedSchemeCode: string;
  /** The code the row is keyed by: the growth sibling for an IDCW option. Null when nothing could be scored. */
  scoredSchemeCode: string | null;
  ratingStatus: MfRatingStatus;
  reason?: SchemeNotScoredReason;
  row: MfSchemeScoreRow | null;
  universe: UniverseScoreResult | null;
}

interface CandidateMeta {
  schemeCode: string;
  sebiSubCategory: string;
  planType: MfPlanType;
  inceptionDate: Date;
  isEtf: boolean;
}

interface LoadedMetrics {
  status: MfMetricStatus;
  metrics: MfHorizonMetrics | null;
}

/** Everything one scheme contributes to its own score, already loaded. */
interface SchemeContext {
  meta: CandidateMeta;
  /** `horizonYears` → the metrics row. Horizon 0 is the profile row. */
  metricsByHorizon: ReadonlyMap<number, LoadedMetrics>;
  profile: MfCurrentProfile | null;
  /** `horizonYears` → the parsed `MfPeerRank` row, horizon 0 included. */
  ranksByHorizon: ReadonlyMap<number, PersistedPeerRank>;
  qualitativeFacts: readonly AmcQualitativeFact[];
  /** Equity share (percent) per snapshot, newest first. Null when unloaded. */
  equityShares: readonly Decimal[] | null;
}

interface LocalRank {
  /** `schemeCode` → percentile, for members that carried a value. */
  percentiles: ReadonlyMap<string, Decimal>;
  median: Decimal | null;
}

/** A resolved input: what goes into `pillarScore` plus what goes into the payload. */
interface ResolvedInput {
  metric: string;
  value: Decimal | null;
  percentile: Decimal | null;
  status: MfMetricStatus;
  universeMedian: Decimal | null;
  horizonBlend?: Partial<Record<`${MfHorizonYears}`, Decimal>>;
}

// ---------------------------------------------------------------------------
// 2. Input source table — which stored number feeds which model input
// ---------------------------------------------------------------------------

/**
 * Return-window metrics ranked by `mfPeerRank` per horizon. The dotted path is
 * where the raw value sits on `MfHorizonMetrics` and is also the key
 * `fieldStatus` uses, so a null value's reason can be read off the same row.
 */
const HORIZON_METRIC_PATH: Readonly<Record<string, string>> = Object.freeze({
  sortino: 'riskAdjusted.sortino',
  informationRatio: 'riskAdjusted.informationRatio',
  jensenAlphaAnn: 'riskAdjusted.jensenAlphaAnn',
  sharpe: 'riskAdjusted.sharpe',
  trackingErrorAnn: 'riskAdjusted.trackingErrorAnn',
  downCapture: 'relative.downCapture',
  outperformanceAnn: 'relative.outperformanceAnn',
  maxDrawdown: 'risk.maxDrawdown',
  worstCalendarYear: 'risk.worstCalendarYear',
  worstMonth: 'risk.worstMonth',
  pctNegativeMonths: 'risk.pctNegativeMonths',
  rollingBeatBenchPct: 'consistency.rollingBeatBenchPct',
});

/**
 * Consistency figures computed *by the peer-rank job* (they need the universe)
 * and stored on the rank row's `universeDerived` block, not on the metrics
 * row — which is where the metrics job leaves a null with a status for them.
 */
const UNIVERSE_DERIVED_METRICS: ReadonlySet<string> = new Set([
  'rollingBeatCategoryPct',
  'quartileConsistency',
]);

/**
 * Horizon-0 inputs. The model names the *percentile* (`terPercentile`,
 * `aumCategoryPercentile`), the rank row is keyed by the *metric* it ranked
 * (`terPct`, `aum`), and the raw value is on the profile under the metric
 * name. One table so the three spellings cannot drift apart.
 */
const STRUCTURAL_INPUTS: Readonly<
  Record<string, { rankKey: string; valueField: 'terPct' | 'aum' }>
> = Object.freeze({
  terPercentile: { rankKey: 'terPct', valueField: 'terPct' },
  aumCategoryPercentile: { rankKey: 'aum', valueField: 'aum' },
});

/**
 * Profile-level inputs ranked in this module. `read` returns the raw value
 * (null when absent), `statusField` is the `fieldStatus` key that explains a
 * null. Direction comes from `METRIC_DIRECTION` by name, as everywhere.
 */
const PROFILE_INPUTS: Readonly<
  Record<string, { read: (p: MfCurrentProfile) => Decimal | null; statusField: string }>
> = Object.freeze({
  activeShare: { read: (p) => dec(p.activeShare), statusField: 'activeShare' },
  hhi: { read: (p) => dec(p.hhi), statusField: 'hhi' },
  styleDrift: { read: (p) => dec(p.styleDrift), statusField: 'styleDrift' },
  managerTenureYears: { read: (p) => dec(p.managerTenureYears), statusField: 'managerTenureYears' },
  managerChangesLast3y: {
    read: (p) => (p.managerChangesLast3y === null ? null : toDecimal(p.managerChangesLast3y)),
    statusField: 'managerChangesLast3y',
  },
  cashPct: { read: (p) => dec(p.cashPct), statusField: 'cashPct' },
  aumGrowth12mPct: { read: (p) => dec(p.aumGrowth12mPct), statusField: 'aumGrowth12mPct' },
  belowAAPct: { read: (p) => dec(p.belowAAPct), statusField: 'belowAAPct' },
  topIssuerPct: { read: (p) => dec(p.topIssuerPct), statusField: 'topIssuerPct' },
  /**
   * `03 §6`: `creditQualitySplit.sov + aaa`. Summed here because the profile
   * stores the split and no metric carries the sum. Null when the split is
   * absent or *both* legs are null; a null leg beside a present one counts as
   * zero, because a debt fund with no sovereign paper at all is exactly the
   * fund whose `sov` the disclosure leaves blank.
   */
  sovAaaPct: {
    read: (p) => {
      const split = p.creditQualitySplit;
      if (split === null) return null;
      if (split.sov === null && split.aaa === null) return null;
      return (dec(split.sov) ?? new Decimal(0)).plus(dec(split.aaa) ?? new Decimal(0));
    },
    statusField: 'creditQualitySplit',
  },
});

/** Inputs this module builds from something other than a single stored field. */
const DERIVED_INPUTS: ReadonlySet<string> = new Set([
  'amcQualitativeScore',
  'modifiedDurationInBand',
  'trackingDifferenceAbs',
  'equityAllocationDrift',
  'inavDeviationAbs',
]);

export type InputSourceKind =
  | 'peer-rank-horizon'
  | 'peer-rank-universe-derived'
  | 'peer-rank-structural'
  | 'local-profile'
  | 'derived';

/**
 * Where an input's percentile comes from. Exported so the test can assert that
 * every metric named in every model resolves to a source — the same coverage
 * discipline `03 §11.2` applies to the direction table, and for the same
 * reason: an input added to a model without a source here would silently
 * arrive as `INSUFFICIENT_DATA` for every fund and re-normalise itself away.
 *
 * @throws RangeError for an unknown metric.
 */
export function inputSourceFor(metric: string): InputSourceKind {
  if (HORIZON_METRIC_PATH[metric] !== undefined) return 'peer-rank-horizon';
  if (UNIVERSE_DERIVED_METRICS.has(metric)) return 'peer-rank-universe-derived';
  if (STRUCTURAL_INPUTS[metric] !== undefined) return 'peer-rank-structural';
  if (PROFILE_INPUTS[metric] !== undefined) return 'local-profile';
  if (DERIVED_INPUTS.has(metric)) return 'derived';
  throw new RangeError(
    `inputSourceFor: no input source for metric "${metric}". Every input named in a ` +
      'model must resolve to a stored number or a derivation in mfScore.service.',
  );
}

// ---------------------------------------------------------------------------
// 3. Small helpers
// ---------------------------------------------------------------------------

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Decimal from a stored Ratio/Pct/Money string; null-through; NaN treated as absent. */
function dec(raw: string | number | null | undefined): Decimal | null {
  if (raw === null || raw === undefined) return null;
  let d: Decimal;
  try {
    d = toDecimal(raw);
  } catch {
    // A non-numeric string in a numeric slot is a corrupt metrics row; it is
    // not this module's job to repair it, and ranking NaN would poison every
    // peer's percentile. Absent is what null means.
    logger.warn({ raw }, '[mfScore] non-numeric stored value; treated as unavailable');
    return null;
  }
  return d.isFinite() ? d : null;
}

/** Read a dotted path (`riskAdjusted.sortino`) off a metrics row. */
function readPath(metrics: MfHorizonMetrics | null, path: string): Decimal | null {
  if (metrics === null) return null;
  const [block, field] = path.split('.');
  const blockValue = (metrics as unknown as Record<string, unknown>)[block!];
  if (blockValue === null || typeof blockValue !== 'object') return null;
  const raw = (blockValue as Record<string, unknown>)[field!];
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  return dec(raw);
}

/** Percentile for `rankKey` off a parsed rank row. */
function rankPercentile(rank: PersistedPeerRank | undefined, rankKey: string): Decimal | null {
  const raw = rank?.peer.percentiles[rankKey];
  return raw === undefined ? null : dec(raw);
}

function rankMedian(rank: PersistedPeerRank | undefined, rankKey: string): Decimal | null {
  const raw = rank?.peer.medians[rankKey];
  return raw === undefined ? null : dec(raw);
}

/**
 * The status to publish beside a null horizon input.
 *
 * Read off the anchor-horizon metrics row, most specific first: the field's
 * own `fieldStatus` entry (a benchmark gap invalidates alpha but not Sortino),
 * then the row's status (`QUARANTINED`, `INSUFFICIENT_DATA`), then the
 * generic "we have no row at all". Never `OK` — an `OK` beside a null is the
 * one combination the status vocabulary forbids.
 */
function horizonNullStatus(ctx: SchemeContext, path: string | null): MfMetricStatus {
  const anchor = ctx.metricsByHorizon.get(ANCHOR_HORIZON);
  if (anchor === undefined) return 'INSUFFICIENT_DATA';
  if (path !== null) {
    const fs = anchor.metrics?.fieldStatus?.[path];
    if (fs !== undefined && fs !== 'OK') return fs;
  }
  if (anchor.status !== 'OK') return anchor.status;
  return 'INSUFFICIENT_DATA';
}

function profileNullStatus(profile: MfCurrentProfile | null, field: string): MfMetricStatus {
  if (profile === null) return 'INSUFFICIENT_DATA';
  const fs = profile.fieldStatus?.[field];
  if (fs !== undefined && fs !== 'OK') return fs;
  return 'INSUFFICIENT_DATA';
}

// ---------------------------------------------------------------------------
// 4. Local ranks — inputs `mfPeerRank` does not rank
// ---------------------------------------------------------------------------

/**
 * Percentile-rank one profile-level metric across the universe.
 *
 * Membership is per metric: members that carry the value contribute one and
 * receive a percentile, exactly the convention the peer-rank rows use. The
 * universe is the ACTIVE growth members loaded for scoring, i.e. the same set
 * the structural (horizon-0) rank was taken over, so a fund's TER percentile
 * and its active-share percentile describe the same peers.
 */
function rankProfileMetric(
  metric: string,
  schemes: readonly SchemeContext[],
  modelKey: MfModelKey,
): LocalRank {
  const spec = PROFILE_INPUTS[metric]!;
  const values = new Map<string, Decimal>();
  for (const s of schemes) {
    if (s.profile === null) continue;
    const v = spec.read(s.profile);
    if (v !== null) values.set(s.meta.schemeCode, v);
  }
  return rankValues(metric, values, modelKey);
}

function rankValues(
  metric: string,
  values: ReadonlyMap<string, Decimal>,
  modelKey: MfModelKey,
): LocalRank {
  const percentiles = new Map<string, Decimal>();
  if (values.size === 0) return { percentiles, median: null };
  const all = [...values.values()];
  for (const [code, target] of values) {
    const pct = percentileRankForMetric(metric, all, target, modelKey);
    if (pct !== null) percentiles.set(code, pct);
  }
  return { percentiles, median: medianOf(all) };
}

/**
 * `03 §5`: `|outperformanceAnn + TER|` — how far a tracker lands from
 * "index minus its own fee", per horizon. `outperformanceAnn` is a fraction
 * and `terPct` a percent, so the fee is scaled before the sum. A fund missing
 * either leg at a horizon simply has no value there.
 */
function trackingDifferenceAbs(ctx: SchemeContext, horizon: MfHorizonYears): Decimal | null {
  const outperf = readPath(ctx.metricsByHorizon.get(horizon)?.metrics ?? null, 'relative.outperformanceAnn');
  const ter = ctx.profile === null ? null : dec(ctx.profile.terPct);
  if (outperf === null || ter === null) return null;
  return outperf.plus(ter.dividedBy(HUNDRED)).abs();
}

function rankTrackingDifference(
  schemes: readonly SchemeContext[],
  modelKey: MfModelKey,
): ReadonlyMap<MfHorizonYears, LocalRank> {
  const out = new Map<MfHorizonYears, LocalRank>();
  for (const h of SCORING_HORIZONS) {
    const values = new Map<string, Decimal>();
    for (const s of schemes) {
      // Only members the peer-rank job admitted to this horizon's universe
      // rank here, so the universe behind this percentile is the same one
      // behind every other horizon input on the row.
      if (s.metricsByHorizon.get(h)?.status !== 'OK') continue;
      const v = trackingDifferenceAbs(s, h);
      if (v !== null) values.set(s.meta.schemeCode, v);
    }
    out.set(h, rankValues('trackingDifferenceAbs', values, modelKey));
  }
  return out;
}

/**
 * `03 §7`: deviation of the equity share from the sub-category band across
 * the last 12 disclosures, in percentage points, averaged. Zero for a fund
 * that stayed inside its band every month; null when there are no snapshots
 * (INSUFFICIENT_DATA) or the sub-category has no equity band
 * (NOT_APPLICABLE — decided by the caller, which has the spec).
 */
function equityAllocationDrift(
  shares: readonly Decimal[] | null,
  band: { minPct: number | null; maxPct: number | null },
): Decimal | null {
  if (shares === null || shares.length === 0) return null;
  const min = band.minPct === null ? null : toDecimal(band.minPct);
  const max = band.maxPct === null ? null : toDecimal(band.maxPct);
  let total = new Decimal(0);
  for (const share of shares) {
    let drift = new Decimal(0);
    if (min !== null && share.lessThan(min)) drift = min.minus(share);
    else if (max !== null && share.greaterThan(max)) drift = share.minus(max);
    total = total.plus(drift);
  }
  return total.dividedBy(toDecimal(shares.length));
}

function rankEquityDrift(
  schemes: readonly SchemeContext[],
  band: { minPct: number | null; maxPct: number | null },
  modelKey: MfModelKey,
): LocalRank {
  const values = new Map<string, Decimal>();
  for (const s of schemes) {
    const v = equityAllocationDrift(s.equityShares, band);
    if (v !== null) values.set(s.meta.schemeCode, v);
  }
  return rankValues('equityAllocationDrift', values, modelKey);
}

/**
 * `03 §6` MANDATE_FIT: is the fund's duration inside the SEBI band? Binary
 * 1/0 raw score. Mirrors `rules/debt.duration-mismatch.ts` exactly, including
 * its two traps, because a fund the rule flags as outside its mandate must
 * not score 1 here:
 *
 *  - SEBI bands are **Macaulay**; the profile carries **modified** duration,
 *    which is always the smaller number. With `ytmPct` on file the conversion
 *    is `macaulay = modified × (1 + ytm)` (n = 1, the largest implied
 *    Macaulay, so a below-floor breach is claimed only when certain). Without
 *    a yield only the above-ceiling side is decidable: `modified > max`
 *    already implies `macaulay > max`. A band with a floor and no yield is
 *    therefore undecidable → null with INSUFFICIENT_DATA, never a guess.
 *  - A band with neither floor nor ceiling (Dynamic Bond) and an
 *    `exactYears`-only band (Gilt 10y, for which no tolerance constant exists)
 *    are not testable → NOT_APPLICABLE.
 */
function modifiedDurationInBand(
  profile: MfCurrentProfile | null,
  band: SebiSubCategorySpec['durationBand'],
): { value: Decimal | null; status: MfMetricStatus } {
  if (band === undefined || (band.minYears === null && band.maxYears === null)) {
    return { value: null, status: 'NOT_APPLICABLE' };
  }
  const modified = profile === null ? null : dec(profile.modifiedDuration);
  if (modified === null) {
    return { value: null, status: profileNullStatus(profile, 'modifiedDuration') };
  }
  const ytm = profile === null ? null : dec(profile.ytmPct);
  const converted = ytm !== null && ytm.dividedBy(HUNDRED).greaterThan(-1);
  const macaulay = converted ? modified.times(new Decimal(1).plus(ytm.dividedBy(HUNDRED))) : null;

  const ceiling = band.maxYears === null ? null : toDecimal(band.maxYears);
  const floor = band.minYears === null ? null : toDecimal(band.minYears);

  // Above the ceiling is certain from the modified figure alone.
  if (ceiling !== null && modified.greaterThan(ceiling)) return { value: new Decimal(0), status: 'OK' };
  if (macaulay !== null) {
    if (ceiling !== null && macaulay.greaterThan(ceiling)) return { value: new Decimal(0), status: 'OK' };
    if (floor !== null && macaulay.lessThan(floor)) return { value: new Decimal(0), status: 'OK' };
    return { value: new Decimal(1), status: 'OK' };
  }
  // No yield: the floor cannot be tested (modified < macaulay always).
  if (floor === null) return { value: new Decimal(1), status: 'OK' };
  return { value: null, status: 'INSUFFICIENT_DATA' };
}

// ---------------------------------------------------------------------------
// 5. Resolving one input for one scheme
// ---------------------------------------------------------------------------

interface UniverseLocals {
  profile: ReadonlyMap<string, LocalRank>;
  trackingDifference: ReadonlyMap<MfHorizonYears, LocalRank> | null;
  equityDrift: LocalRank | null;
}

/**
 * Blend a horizon input's percentiles (`03 §3`, on the percentile). Returns
 * the per-horizon percentiles alongside for the `horizonBlend` payload.
 */
function blendedHorizonInput(
  perHorizon: (h: ScoringHorizon) => Decimal | null,
): { percentile: Decimal | null; horizonBlend: Partial<Record<`${MfHorizonYears}`, Decimal>> } {
  const byHorizon: Partial<Record<ScoringHorizon, Decimal | null>> = {};
  const horizonBlend: Partial<Record<`${MfHorizonYears}`, Decimal>> = {};
  for (const h of SCORING_HORIZONS) {
    const pct = perHorizon(h);
    byHorizon[h] = pct;
    if (pct !== null) horizonBlend[`${h}`] = pct;
  }
  return { percentile: blendHorizons(byHorizon).value, horizonBlend };
}

/**
 * The `03 §5` 1y/3y 50/50 tracking-error blend, renormalised over whichever of
 * the two is available (one horizon ⇒ 100%), which is the same rule
 * `blendHorizons` applies to its own ladder.
 */
function trackingErrorBlend(
  ctx: SchemeContext,
): { percentile: Decimal | null; horizonBlend: Partial<Record<`${MfHorizonYears}`, Decimal>> } {
  const horizonBlend: Partial<Record<`${MfHorizonYears}`, Decimal>> = {};
  const available: Decimal[] = [];
  for (const h of TRACKING_ERROR_HORIZONS) {
    const pct = rankPercentile(ctx.ranksByHorizon.get(h), 'trackingErrorAnn');
    if (pct === null) continue;
    horizonBlend[`${h}`] = pct;
    available.push(pct);
  }
  if (available.length === 0) return { percentile: null, horizonBlend };
  const sum = available.reduce((acc, p) => acc.plus(p), new Decimal(0));
  return { percentile: sum.dividedBy(toDecimal(available.length)), horizonBlend };
}

function resolveInput(
  metric: string,
  ctx: SchemeContext,
  universe: { modelKey: MfModelKey; spec: SebiSubCategorySpec; asOf: Date; locals: UniverseLocals },
): ResolvedInput {
  const { modelKey, spec, asOf, locals } = universe;
  // Validates the model/metric pairing (a model-scoped metric from the wrong
  // model throws here, at scoring time, rather than producing a number).
  directionFor(metric, modelKey);

  switch (inputSourceFor(metric)) {
    case 'peer-rank-horizon': {
      const path = HORIZON_METRIC_PATH[metric]!;
      const anchor = ctx.metricsByHorizon.get(ANCHOR_HORIZON)?.metrics ?? null;
      const value = readPath(anchor, path);
      const median = rankMedian(ctx.ranksByHorizon.get(ANCHOR_HORIZON), metric);
      const blend =
        metric === 'trackingErrorAnn'
          ? trackingErrorBlend(ctx)
          : blendedHorizonInput((h) => rankPercentile(ctx.ranksByHorizon.get(h), metric));
      return {
        metric,
        value,
        percentile: blend.percentile,
        status: blend.percentile === null ? horizonNullStatus(ctx, path) : 'OK',
        universeMedian: median,
        horizonBlend: blend.horizonBlend,
      };
    }
    case 'peer-rank-universe-derived': {
      const anchorRank = ctx.ranksByHorizon.get(ANCHOR_HORIZON);
      const derived = anchorRank?.universeDerived ?? null;
      const raw =
        derived === null
          ? null
          : metric === 'rollingBeatCategoryPct'
            ? derived.rollingBeatCategoryPct
            : derived.quartileConsistency;
      const blend = blendedHorizonInput((h) => rankPercentile(ctx.ranksByHorizon.get(h), metric));
      return {
        metric,
        value: dec(raw),
        percentile: blend.percentile,
        status: blend.percentile === null ? horizonNullStatus(ctx, null) : 'OK',
        universeMedian: rankMedian(anchorRank, metric),
        horizonBlend: blend.horizonBlend,
      };
    }
    case 'peer-rank-structural': {
      const { rankKey, valueField } = STRUCTURAL_INPUTS[metric]!;
      const structural = ctx.ranksByHorizon.get(STRUCTURAL_HORIZON);
      const percentile = rankPercentile(structural, rankKey);
      return {
        metric,
        value: ctx.profile === null ? null : dec(ctx.profile[valueField]),
        percentile,
        status: percentile === null ? profileNullStatus(ctx.profile, valueField) : 'OK',
        universeMedian: rankMedian(structural, rankKey),
      };
    }
    case 'local-profile': {
      const { read, statusField } = PROFILE_INPUTS[metric]!;
      const local = locals.profile.get(metric);
      const percentile = local?.percentiles.get(ctx.meta.schemeCode) ?? null;
      return {
        metric,
        value: ctx.profile === null ? null : read(ctx.profile),
        percentile,
        status: percentile === null ? profileNullStatus(ctx.profile, statusField) : 'OK',
        universeMedian: local?.median ?? null,
      };
    }
    case 'derived':
      return resolveDerivedInput(metric, ctx, { modelKey, spec, asOf, locals });
  }
}

function resolveDerivedInput(
  metric: string,
  ctx: SchemeContext,
  universe: { modelKey: MfModelKey; spec: SebiSubCategorySpec; asOf: Date; locals: UniverseLocals },
): ResolvedInput {
  const { spec, asOf, locals } = universe;
  switch (metric) {
    case 'amcQualitativeScore': {
      // Raw 0-1 score (`03 §4`), never ranked. Always computable: no facts
      // means a clean AMC, which is the 1.0 default, not "unknown".
      const value = amcQualitativeScore(ctx.qualitativeFacts, asOf);
      return { metric, value, percentile: value, status: 'OK', universeMedian: null };
    }
    case 'modifiedDurationInBand': {
      const r = modifiedDurationInBand(ctx.profile, spec.durationBand);
      return { metric, value: r.value, percentile: r.value, status: r.status, universeMedian: null };
    }
    case 'trackingDifferenceAbs': {
      const byHorizon = locals.trackingDifference;
      const blend = blendedHorizonInput((h) =>
        byHorizon?.get(h)?.percentiles.get(ctx.meta.schemeCode) ?? null,
      );
      return {
        metric,
        value: trackingDifferenceAbs(ctx, ANCHOR_HORIZON),
        percentile: blend.percentile,
        status:
          blend.percentile === null
            ? ctx.profile === null || dec(ctx.profile.terPct) === null
              ? profileNullStatus(ctx.profile, 'terPct')
              : horizonNullStatus(ctx, 'relative.outperformanceAnn')
            : 'OK',
        universeMedian: byHorizon?.get(ANCHOR_HORIZON)?.median ?? null,
        horizonBlend: blend.horizonBlend,
      };
    }
    case 'equityAllocationDrift': {
      if (spec.equityBand === undefined) {
        return { metric, value: null, percentile: null, status: 'NOT_APPLICABLE', universeMedian: null };
      }
      const local = locals.equityDrift;
      const percentile = local?.percentiles.get(ctx.meta.schemeCode) ?? null;
      return {
        metric,
        value: equityAllocationDrift(ctx.equityShares, spec.equityBand),
        percentile,
        status: percentile === null ? 'INSUFFICIENT_DATA' : 'OK',
        universeMedian: local?.median ?? null,
      };
    }
    case 'inavDeviationAbs':
      // No feed for ETF bid-ask / iNAV deviation exists in this repo yet. The
      // input is kept in the INDEX model so the day a feed lands it scores
      // without a methodology bump; until then it is honestly unavailable
      // (INSUFFICIENT_DATA, not NOT_APPLICABLE — an ETF *has* the number) and
      // `pillarScore` re-normalises STRUCTURE onto `cashPct`.
      return {
        metric,
        value: null,
        percentile: null,
        status: ctx.meta.isEtf ? 'INSUFFICIENT_DATA' : 'NOT_APPLICABLE',
        universeMedian: null,
      };
    default:
      throw new RangeError(`resolveDerivedInput: "${metric}" is not a derived input`);
  }
}

// ---------------------------------------------------------------------------
// 6. Scoring one scheme (pure given loaded context)
// ---------------------------------------------------------------------------

interface ScoredPillars {
  pillars: Record<string, MfPillarScore>;
  /** The composite before any rating gate. */
  composite: Decimal | null;
  /** Pillar scores keyed by pillar, for `ratingStatusFor`. */
  pillarScores: Record<string, { score: Decimal | null }>;
}

/**
 * Build the `03 §10` explainability payload for one scheme and its composite.
 *
 * Every number is serialised through `serializeRatio` (six decimals) at this
 * boundary and nowhere else, so the stored JSON is deterministic — object
 * keys are emitted in model order, inputs in pillar order — which is what
 * lets the append-only test compare rows byte-for-byte.
 */
function scorePillars(
  model: ScoringModel,
  ctx: SchemeContext,
  universe: { modelKey: MfModelKey; spec: SebiSubCategorySpec; asOf: Date; locals: UniverseLocals },
): ScoredPillars {
  const resolvedByPillar: Array<{ key: string; weight: number; inputs: ResolvedInput[] }> = [];
  for (const pillar of model.pillars) {
    resolvedByPillar.push({
      key: pillar.key,
      weight: pillar.weight,
      inputs: pillar.inputs.map((i) => resolveInput(i.metric, ctx, universe)),
    });
  }

  const pillarResults = resolvedByPillar.map((p, idx) => {
    const declared = model.pillars[idx]!.inputs;
    const values: PillarInputValue[] = p.inputs.map((r, j) => ({
      metric: r.metric,
      weight: declared[j]!.weight,
      percentile: r.percentile,
      status: r.status,
    }));
    return { key: p.key, weight: p.weight, result: pillarScore(values), inputs: p.inputs };
  });

  const compositeResult = compositeOf(
    pillarResults.map((p) => ({ key: p.key, score: p.result.score, weight: p.weight })),
  );

  const pillars: Record<string, MfPillarScore> = {};
  const pillarScores: Record<string, { score: Decimal | null }> = {};
  for (const p of pillarResults) {
    const inputs: Record<string, MfPillarInput> = {};
    for (const r of p.inputs) {
      const entry: MfPillarInput = {
        value: serializeRatioOrNull(r.value),
        percentile: serializeRatioOrNull(r.percentile),
        status: r.status,
        universeMedian: serializeRatioOrNull(r.universeMedian),
        // Applied weight (`pillarScore` re-normalises across the inputs that
        // scored), not the declared one — publishing the declared weight
        // would misexplain a pillar the moment one input is missing.
        weight: serializeRatio(p.result.appliedWeights[r.metric] ?? new Decimal(0)),
      };
      if (r.horizonBlend !== undefined) {
        const blend: Partial<Record<`${MfHorizonYears}`, Ratio>> = {};
        for (const [h, pct] of Object.entries(r.horizonBlend)) {
          blend[h as `${MfHorizonYears}`] = serializeRatio(pct as Decimal);
        }
        entry.horizonBlend = blend;
      }
      inputs[r.metric] = entry;
    }
    pillars[p.key] = {
      score: serializeRatioOrNull(p.result.score),
      weight: serializeRatio(compositeResult.weights[p.key] ?? new Decimal(0)),
      inputs,
    };
    pillarScores[p.key] = { score: p.result.score };
  }

  return { pillars, composite: compositeResult.composite, pillarScores };
}

// ---------------------------------------------------------------------------
// 7. Rating a universe (pure)
// ---------------------------------------------------------------------------

export interface UniverseScoringInput {
  ref: UniverseRef;
  modelKey: MfModelKey;
  model: ScoringModel;
  spec: SebiSubCategorySpec;
  asOf: Date;
  schemes: readonly SchemeContext[];
}

/**
 * Score and rate every member. Pure given the loaded contexts, so a test can
 * drive it without a database and the job can drive it with one.
 *
 * ## Why the rating pool is decided in two passes
 *
 * `ratingStatusFor` has three gates — history, universe size, required
 * pillars — and the middle one needs a number the other two decide: the
 * universe a rating is bucketed within is the set of members that *could* be
 * rated. So pass one applies the history and pillar gates with the size gate
 * held open (`MIN_UNIVERSE_SIZE` passed as the size — "assume exactly enough
 * peers; let the other gates speak"), the survivors form the pool, and pass
 * two re-applies all three gates with the pool's real size. `universeSize` on
 * every row is that pool size, for the same reason `MfPeerRank` stores its
 * `n`: a bucket is meaningless without the count it was cut from, and a
 * CATEGORY_TOO_SMALL row needs the peer count for its "only n peers" copy.
 */
export function rateUniverse(input: UniverseScoringInput): MfSchemeScoreRow[] {
  const { ref, modelKey, model, spec, asOf, schemes } = input;

  const locals: UniverseLocals = {
    profile: new Map(
      model.pillars
        .flatMap((p) => p.inputs.map((i) => i.metric))
        .filter((m) => PROFILE_INPUTS[m] !== undefined)
        .map((m) => [m, rankProfileMetric(m, schemes, modelKey)] as const),
    ),
    trackingDifference: modelUses(model, 'trackingDifferenceAbs')
      ? rankTrackingDifference(schemes, modelKey)
      : null,
    equityDrift:
      modelUses(model, 'equityAllocationDrift') && spec.equityBand !== undefined
        ? rankEquityDrift(schemes, spec.equityBand, modelKey)
        : null,
  };
  const universe = { modelKey, spec, asOf, locals };

  // ── Pass 1: pillars, composite, and the gates that do not need the pool ──
  const scored = schemes.map((ctx) => {
    const s = scorePillars(model, ctx, universe);
    const historyMonths = wholeMonthsBetween(ctx.meta.inceptionDate, asOf);
    const gatesExceptSize = ratingStatusFor({
      historyMonths,
      universeSize: MIN_UNIVERSE_SIZE,
      pillars: s.pillarScores,
    });
    return { ctx, s, historyMonths, poolMember: gatesExceptSize === 'RATED' && s.composite !== null };
  });

  const pool = scored.filter((x) => x.poolMember).map((x) => x.s.composite as Decimal);
  const universeSize = pool.length;

  // ── Pass 2: final status with the real pool size, then the bucket ────────
  return scored.map(({ ctx, s, historyMonths }) => {
    const ratingStatus = ratingStatusFor({
      historyMonths,
      universeSize,
      pillars: s.pillarScores,
    });
    const rated = ratingStatus === 'RATED' && s.composite !== null;
    return {
      schemeCode: ctx.meta.schemeCode,
      asOf,
      methodologyVersion: model.methodologyVersion,
      modelKey,
      ratingStatus,
      // Schema contract: composite is null whenever the rating is withheld.
      // The gated value survives in `diagnostics` for the log, never the row.
      composite: rated ? s.composite : null,
      rating: rated ? ratingFromComposite(s.composite as Decimal, pool) : null,
      pillars: s.pillars,
      universeKey: ref.universeKey,
      universeSize,
      diagnostics: { historyMonths, compositeBeforeGate: s.composite },
    };
  });
}

function modelUses(model: ScoringModel, metric: string): boolean {
  return model.pillars.some((p) => p.inputs.some((i) => i.metric === metric));
}

/**
 * Has the metrics job measured at least one return window for this scheme?
 *
 * Decided on `observationsMonthly` — part of the shared `MfHorizonMetrics`
 * contract — rather than on the metrics service's internal reason strings, so
 * a rewording of `no_adjusted_nav_history` cannot silently change who gets
 * scored. Horizon 0 is the portfolio profile and says nothing about NAV.
 */
function isMeasured(ctx: SchemeContext): boolean {
  for (const [horizon, row] of ctx.metricsByHorizon) {
    if (horizon === STRUCTURAL_HORIZON) continue;
    if (row.status === 'OK') return true;
    if ((row.metrics?.observationsMonthly ?? 0) > 0) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 8. I/O — loading a universe
// ---------------------------------------------------------------------------

async function loadCandidates(ref: UniverseRef): Promise<CandidateMeta[]> {
  // ACTIVE + GROWTH only: the scoring universe is the *ranking* universe of
  // `mfPeerRank.service` (a percentile is a statement about choosable
  // alternatives today). Dead schemes matter to the medians, and the peer-rank
  // job already folded them in where they belong.
  const rows = await prisma.mfSchemeMeta.findMany({
    where: {
      sebiSubCategory: ref.sebiSubCategory,
      planType: ref.planType,
      optionType: 'GROWTH',
      status: 'ACTIVE',
    },
    select: {
      schemeCode: true,
      sebiSubCategory: true,
      planType: true,
      inceptionDate: true,
      isEtf: true,
    },
    orderBy: { schemeCode: 'asc' },
  });
  return rows;
}

async function loadSchemeContexts(
  candidates: readonly CandidateMeta[],
  asOf: Date,
  needEquityShares: boolean,
): Promise<SchemeContext[]> {
  const codes = candidates.map((c) => c.schemeCode);
  if (codes.length === 0) return [];

  const [metricRows, rankRows, factRows] = await Promise.all([
    prisma.mfSchemeMetrics.findMany({
      where: { schemeCode: { in: codes }, asOf },
      select: { schemeCode: true, horizonYears: true, status: true, metrics: true },
    }),
    prisma.mfPeerRank.findMany({
      where: { schemeCode: { in: codes }, asOf },
      select: {
        schemeCode: true,
        asOf: true,
        horizonYears: true,
        universeKey: true,
        universeSize: true,
        percentiles: true,
      },
    }),
    prisma.mfSchemeQualitativeFact.findMany({
      // Validity against `asOf` is `amcQualitativeScore`'s job; loading every
      // fact of the two types keeps that logic in one (sterile, tested) place.
      where: { schemeCode: { in: codes }, factType: { in: [...AMC_FACT_TYPES] } },
      select: { schemeCode: true, factType: true, validFrom: true, validTo: true },
      orderBy: { validFrom: 'asc' },
    }),
  ]);

  const metricsByScheme = new Map<string, Map<number, LoadedMetrics>>();
  for (const r of metricRows) {
    let byHorizon = metricsByScheme.get(r.schemeCode);
    if (byHorizon === undefined) {
      byHorizon = new Map();
      metricsByScheme.set(r.schemeCode, byHorizon);
    }
    byHorizon.set(r.horizonYears, {
      status: r.status,
      metrics:
        r.metrics !== null && typeof r.metrics === 'object' && !Array.isArray(r.metrics)
          ? (r.metrics as unknown as MfHorizonMetrics)
          : null,
    });
  }

  const ranksByScheme = new Map<string, Map<number, PersistedPeerRank>>();
  for (const r of rankRows) {
    let byHorizon = ranksByScheme.get(r.schemeCode);
    if (byHorizon === undefined) {
      byHorizon = new Map();
      ranksByScheme.set(r.schemeCode, byHorizon);
    }
    byHorizon.set(r.horizonYears, parsePeerRankPayload(r));
  }

  const factsByScheme = new Map<string, AmcQualitativeFact[]>();
  for (const f of factRows) {
    const list = factsByScheme.get(f.schemeCode) ?? [];
    list.push({
      factType: f.factType,
      validFrom: f.validFrom.toISOString(),
      validTo: f.validTo === null ? null : f.validTo.toISOString(),
    });
    factsByScheme.set(f.schemeCode, list);
  }

  const equityByScheme = needEquityShares ? await loadEquityShares(codes, asOf) : null;

  return candidates.map((meta) => {
    const byHorizon = metricsByScheme.get(meta.schemeCode) ?? new Map<number, LoadedMetrics>();
    const h0 = byHorizon.get(STRUCTURAL_HORIZON);
    return {
      meta,
      metricsByHorizon: byHorizon,
      // The horizon-0 row stores an `MfCurrentProfile` in the same JSON column
      // (`mfMetrics.service.persistSchemeMetrics`); the cast is the boundary.
      profile:
        h0 === undefined || h0.metrics === null ? null : (h0.metrics as unknown as MfCurrentProfile),
      ranksByHorizon: ranksByScheme.get(meta.schemeCode) ?? new Map(),
      qualitativeFacts: factsByScheme.get(meta.schemeCode) ?? [],
      equityShares: equityByScheme === null ? null : equityByScheme.get(meta.schemeCode) ?? [],
    };
  });
}

/**
 * Equity share per disclosure for the last `EQUITY_DRIFT_SNAPSHOTS` snapshots
 * at or before `asOf`, newest first. Loaded only for models that score
 * `equityAllocationDrift` (hybrids), and summed in the database with a
 * `groupBy` rather than pulling every holding row into memory.
 */
async function loadEquityShares(
  codes: readonly string[],
  asOf: Date,
): Promise<Map<string, Decimal[]>> {
  const snapshots = await prisma.mfPortfolioSnapshot.findMany({
    where: { schemeCode: { in: [...codes] }, asOf: { lte: asOf } },
    select: { id: true, schemeCode: true, asOf: true },
    orderBy: [{ schemeCode: 'asc' }, { asOf: 'desc' }],
  });

  const kept: Array<{ id: string; schemeCode: string }> = [];
  const perScheme = new Map<string, number>();
  for (const s of snapshots) {
    const n = perScheme.get(s.schemeCode) ?? 0;
    if (n >= EQUITY_DRIFT_SNAPSHOTS) continue;
    perScheme.set(s.schemeCode, n + 1);
    kept.push(s);
  }
  const out = new Map<string, Decimal[]>();
  if (kept.length === 0) return out;

  const sums = await prisma.mfPortfolioHolding.groupBy({
    by: ['snapshotId'],
    where: { snapshotId: { in: kept.map((k) => k.id) }, kind: 'EQUITY' },
    _sum: { weightPct: true },
  });
  const equityBySnapshot = new Map<string, Decimal>();
  for (const s of sums) {
    if (s._sum.weightPct !== null) equityBySnapshot.set(s.snapshotId, toDecimal(s._sum.weightPct));
  }
  // A snapshot with no EQUITY holdings at all is a 0% equity share, not a
  // missing one — that is exactly the drift a conservative hybrid would show.
  for (const k of kept) {
    const list = out.get(k.schemeCode) ?? [];
    list.push(equityBySnapshot.get(k.id) ?? new Decimal(0));
    out.set(k.schemeCode, list);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 9. I/O — append-only persistence
// ---------------------------------------------------------------------------

function toCreateInput(row: MfSchemeScoreRow): Prisma.MfSchemeScoreCreateManyInput {
  return {
    schemeCode: row.schemeCode,
    asOf: row.asOf,
    methodologyVersion: row.methodologyVersion,
    modelKey: row.modelKey,
    ratingStatus: row.ratingStatus,
    // Decimal(12,6) column; fixed here so the stored digits are the ones the
    // rating was bucketed on, not a re-rounding by the driver.
    composite: row.composite === null ? null : row.composite.toFixed(6),
    rating: row.rating,
    pillars: row.pillars as unknown as Prisma.InputJsonValue,
    universeKey: row.universeKey,
    universeSize: row.universeSize,
  };
}

/**
 * Insert the rows that do not already exist. **Never updates.**
 *
 * One `runInTransaction` per universe (a universe is at most ~70 rows, well
 * inside the long-transaction concern `mfPeerRank` avoids by not batching at
 * all), and `runInTransaction` rather than `prisma.$transaction` because only
 * the former is atomic under the RLS hook. The pre-select is what lets the
 * job report `skippedExisting`; `skipDuplicates` is the race backstop — two
 * runs that both pass the pre-select cannot both insert, and neither can
 * overwrite, because the only write here is an insert.
 */
async function appendUniverseScores(
  rows: readonly MfSchemeScoreRow[],
): Promise<{ written: number; skippedExisting: number }> {
  if (rows.length === 0) return { written: 0, skippedExisting: 0 };
  const asOf = rows[0]!.asOf;
  const methodologyVersion = rows[0]!.methodologyVersion;

  return runInTransaction(async (tx) => {
    const existing = await tx.mfSchemeScore.findMany({
      where: {
        asOf,
        methodologyVersion,
        schemeCode: { in: rows.map((r) => r.schemeCode) },
      },
      select: { schemeCode: true },
    });
    const existingCodes = new Set(existing.map((e) => e.schemeCode));
    const fresh = rows.filter((r) => !existingCodes.has(r.schemeCode));
    if (fresh.length === 0) return { written: 0, skippedExisting: rows.length };

    const result = await tx.mfSchemeScore.createMany({
      data: fresh.map(toCreateInput),
      skipDuplicates: true,
    });
    return { written: result.count, skippedExisting: rows.length - result.count };
  });
}

// ---------------------------------------------------------------------------
// 10. Public API
// ---------------------------------------------------------------------------

function emptyStatusCounts(): Record<MfRatingStatus, number> {
  return { RATED: 0, INSUFFICIENT_HISTORY: 0, CATEGORY_TOO_SMALL: 0, NOT_APPLICABLE: 0 };
}

/**
 * The scoring model for a sub-category, or `null` when none applies.
 *
 * `SOLUTION` → the HYBRID model and `FOF` → its own model are both already
 * encoded in `MF_SCORING_MODELS`; this only resolves the sub-category to its
 * key and keeps the UNMAPPED case explicit.
 */
export function modelForSubCategory(
  sebiSubCategory: string,
): { modelKey: MfModelKey; model: ScoringModel; spec: SebiSubCategorySpec } | null {
  if (sebiSubCategory === UNMAPPED_SUBCATEGORY) return null;
  const spec = specFor(sebiSubCategory as SebiSubCategory);
  if (spec === undefined) return null;
  return { modelKey: spec.modelKey, model: modelForKey(spec.modelKey), spec };
}

/**
 * Score and rate one universe at `asOf`, appending the rows that do not yet
 * exist. Accepts any `asOf` — the backtest scores historical month-ends — and
 * reads only rows keyed to that exact day, so a run for 2024-03-31 sees the
 * metrics and ranks of 2024-03-31 and nothing later.
 */
export async function scoreUniverse(ref: UniverseRef, asOf: Date): Promise<UniverseScoreResult> {
  const day = startOfUtcDay(asOf);
  const resolved = modelForSubCategory(ref.sebiSubCategory);
  if (resolved === null) {
    throw new Error(
      `[mfScore] "${ref.sebiSubCategory}" has no scoring model; an UNMAPPED universe cannot be scored.`,
    );
  }
  const { modelKey, model, spec } = resolved;

  const candidates = await loadCandidates(ref);
  const loaded = await loadSchemeContexts(
    candidates,
    day,
    modelUses(model, 'equityAllocationDrift') && spec.equityBand !== undefined,
  );

  // Membership: a scheme with no measured return window at this `asOf` is not
  // scored at all — no row, rather than an INSUFFICIENT_HISTORY row. The
  // metrics job writes six rows for every ACTIVE scheme it can see, including
  // one that has no NAV in this database at all (`observationsMonthly: 0` on
  // every return horizon). Scoring such a scheme would label a fund that may
  // be twenty years old INSUFFICIENT_HISTORY, and the "rated from {date}" copy
  // `06 §6` derives from its inception date would then promise a rating that
  // no amount of waiting will produce. "We have no data" and "young fund" are
  // different answers; only the second is a rating status. A scheme with even
  // one measured window (a 20-month-old fund has a 1y row) *is* scored, and
  // its status explains why it is unrated.
  const schemes = loaded.filter(isMeasured);
  const skippedUnmeasured = loaded.length - schemes.length;

  const rows = rateUniverse({ ref, modelKey, model, spec, asOf: day, schemes });
  const persisted = await appendUniverseScores(rows);

  const ratingStatusCounts = emptyStatusCounts();
  for (const r of rows) ratingStatusCounts[r.ratingStatus] += 1;

  return {
    universeKey: ref.universeKey,
    asOf: day,
    modelKey,
    methodologyVersion: model.methodologyVersion,
    scored: rows.length,
    written: persisted.written,
    skippedExisting: persisted.skippedExisting,
    skippedUnmeasured,
    ratingStatusCounts,
    rows,
  };
}

/**
 * Score one scheme by scoring its universe (`03 §8`: a rating is relative to
 * the universe, so there is no cheaper correct way), following the IDCW →
 * growth-sibling hop first.
 *
 * Nothing is persisted for the NOT_APPLICABLE outcomes. Persisting would need
 * a `modelKey` and `methodologyVersion` for a scheme that has neither, and
 * inventing a placeholder key would flow through `MfSchemeScoreDto.modelKey`
 * — a closed union in `packages/shared` — into every consumer that switches
 * on it. The outcome carries the status and the reason instead.
 */
export async function scoreScheme(schemeCode: string, asOf: Date): Promise<SchemeScoreOutcome> {
  const notScored = (reason: SchemeNotScoredReason): SchemeScoreOutcome => ({
    requestedSchemeCode: schemeCode,
    scoredSchemeCode: null,
    ratingStatus: 'NOT_APPLICABLE',
    reason,
    row: null,
    universe: null,
  });

  const meta = await prisma.mfSchemeMeta.findUnique({
    where: { schemeCode },
    select: { schemeCode: true, optionType: true, growthSiblingSchemeCode: true },
  });
  if (meta === null) return notScored('scheme_not_found');

  // IDCW → growth sibling. `null` means the sibling has not been resolved by
  // the metadata job yet; scoring the IDCW option's own NAV instead would
  // understate the fund by every distribution it ever paid.
  const rankable = resolveRankableSchemeCode(meta);
  if (rankable === null) return notScored('no_growth_sibling');

  // A second read even when `rankable === schemeCode`: the first select was
  // deliberately narrow (option + sibling) so the IDCW hop cannot accidentally
  // score the IDCW row's own category if the sibling's differs.
  const target = await prisma.mfSchemeMeta.findUnique({
    where: { schemeCode: rankable },
    select: { schemeCode: true, sebiSubCategory: true, planType: true, status: true },
  });
  if (target === null) return notScored('no_growth_sibling');
  if (target.sebiSubCategory === UNMAPPED_SUBCATEGORY) return notScored('unmapped_subcategory');
  if (target.status !== 'ACTIVE') return notScored('not_active');

  const ref: UniverseRef = {
    universeKey: buildUniverseKey(target.sebiSubCategory, target.planType),
    sebiSubCategory: target.sebiSubCategory,
    planType: target.planType,
  };
  const universe = await scoreUniverse(ref, asOf);
  const row = universe.rows.find((r) => r.schemeCode === target.schemeCode) ?? null;
  if (row === null) return { ...notScored('not_in_universe'), universe };

  return {
    requestedSchemeCode: schemeCode,
    scoredSchemeCode: target.schemeCode,
    ratingStatus: row.ratingStatus,
    row,
    universe,
  };
}

/** A persisted score row, as read back. */
export interface PersistedSchemeScore {
  id: string;
  schemeCode: string;
  asOf: Date;
  methodologyVersion: string;
  modelKey: MfModelKey;
  ratingStatus: MfRatingStatus;
  composite: Decimal | null;
  rating: MfRating | null;
  pillars: Record<string, MfPillarScore>;
  universeKey: string;
  universeSize: number;
  computedAt: Date;
}

/**
 * The latest score that applies to `schemeCode` at or before `asOf`, following
 * the IDCW → growth-sibling hop (`03 §1`, `§11.9`). `null` when the scheme has
 * no rankable sibling or has never been scored — the honest answer in both
 * cases. `methodologyVersion` narrows to one version for the admin comparison
 * page (`03 §9`).
 */
export async function getScoreForScheme(
  schemeCode: string,
  opts: { asOf?: Date; methodologyVersion?: string } = {},
): Promise<PersistedSchemeScore | null> {
  const meta = await prisma.mfSchemeMeta.findUnique({
    where: { schemeCode },
    select: { schemeCode: true, optionType: true, growthSiblingSchemeCode: true },
  });
  if (meta === null) return null;
  const rankable = resolveRankableSchemeCode(meta);
  if (rankable === null) return null;

  const row = await prisma.mfSchemeScore.findFirst({
    where: {
      schemeCode: rankable,
      ...(opts.asOf === undefined ? {} : { asOf: { lte: startOfUtcDay(opts.asOf) } }),
      ...(opts.methodologyVersion === undefined ? {} : { methodologyVersion: opts.methodologyVersion }),
    },
    orderBy: [{ asOf: 'desc' }, { computedAt: 'desc' }],
  });
  if (row === null) return null;

  return {
    id: row.id,
    schemeCode: row.schemeCode,
    asOf: row.asOf,
    methodologyVersion: row.methodologyVersion,
    modelKey: row.modelKey as MfModelKey,
    ratingStatus: row.ratingStatus,
    composite: row.composite === null ? null : toDecimal(row.composite),
    rating: (row.rating as MfRating | null) ?? null,
    pillars: (row.pillars ?? {}) as unknown as Record<string, MfPillarScore>,
    universeKey: row.universeKey,
    universeSize: row.universeSize,
    computedAt: row.computedAt,
  };
}
