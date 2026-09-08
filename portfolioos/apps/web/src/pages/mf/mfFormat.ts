/**
 * Formatting and status resolution for the MF analytics surfaces.
 *
 * Two jobs, and both exist to stop the same class of lie.
 *
 * **1. Formatting without touching IEEE-754.** Every numeric on this contract
 * is a branded Decimal string (`Ratio`, `Pct`, `Money`). `Number(x)` and
 * `parseFloat(x)` are lint errors repo-wide, and the ban is not ceremonial: a
 * Sharpe of `1.234567` round-tripped through a double and compared against a
 * threshold starts depending on binary representation rather than on the
 * number we computed. Everything here goes through `toDecimal` and
 * `Decimal.toFixed(..., ROUND_HALF_EVEN)` — banker's rounding, matching
 * `serializeRatio` on the server so the two never disagree on a half-way case.
 * `formatPercent` from `@portfolioos/shared` is deliberately NOT used: its
 * signature takes a JS `number`, which is exactly the coercion we are avoiding.
 *
 * **2. Turning a null into a sentence.** `02-METRICS.md §1` and
 * `06-QUALITY-COMPLIANCE.md §6`: a metric that could not be computed is `null`
 * with a status beside it, and the UI renders the status. Never `0` — zero is a
 * real Sharpe ratio, a real alpha and an outstanding expense ratio, so using it
 * for "we don't know" tells the user something false and gives them no way to
 * tell it apart from a real measurement. Never a bare dash either: a dash says
 * "nothing here" without saying why, which is the same failure with less ink.
 */

import {
  Decimal,
  toDecimal,
  ratioToPct,
  type MfMetricStatus,
  type Pct,
  type Ratio,
} from '@portfolioos/shared';

// ---------------------------------------------------------------------------
// Number formatting — Decimal in, string out, no JS number anywhere
// ---------------------------------------------------------------------------

/** Bare ratio, e.g. a Sharpe of 1.12 or an HHI of 0.043. */
export function formatRatio(value: Ratio | string, fractionDigits = 2): string {
  return toDecimal(value).toFixed(fractionDigits, Decimal.ROUND_HALF_EVEN);
}

/**
 * A dimensionless `Ratio` displayed as a percentage: 0.0725 → "7.25%".
 *
 * The ×100 lives here and in `ratioToPct` and nowhere else. Scattering it
 * across call sites is how a chart ends up reading 4500% — the exact bug the
 * `Ratio`/`Pct` brand split exists to make a compile error.
 */
export function formatRatioAsPct(
  value: Ratio | string,
  fractionDigits = 2,
  showSign = false,
): string {
  return formatPct(ratioToPct(value as Ratio), fractionDigits, showSign);
}

/** A value already carrying percent units: a `Pct` of 0.45 is "0.45%" (a TER). */
export function formatPct(
  value: Pct | string,
  fractionDigits = 2,
  showSign = false,
): string {
  const d = toDecimal(value);
  const sign = d.isNegative() ? '-' : showSign && d.greaterThan(0) ? '+' : '';
  return `${sign}${d.abs().toFixed(fractionDigits, Decimal.ROUND_HALF_EVEN)}%`;
}

/** A percentile `Ratio` (0.78) rendered as the ordinal readers expect: "78th". */
export function formatPercentileOrdinal(value: Ratio | string): string {
  const n = toDecimal(value).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
  const asText = n.toFixed(0);
  const last2 = n.mod(100);
  const last1 = n.mod(10);
  // 11th/12th/13th are the exceptions to the 1st/2nd/3rd pattern.
  if (last2.greaterThanOrEqualTo(11) && last2.lessThanOrEqualTo(13)) return `${asText}th`;
  if (last1.equals(1)) return `${asText}st`;
  if (last1.equals(2)) return `${asText}nd`;
  if (last1.equals(3)) return `${asText}rd`;
  return `${asText}th`;
}

/**
 * Chart geometry only — never a displayed number.
 *
 * Recharts and raw SVG take numbers, and a pixel offset does not care about
 * the 15th significant digit. Every number a reader can actually read comes
 * from the formatters above instead. Nullish collapses to 0 because a missing
 * bar has zero length; call sites must decide separately whether to draw the
 * bar at all, and a metric that is null renders as text, not as an empty bar.
 */
export function ratioToChartNumber(value: Ratio | Pct | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  return toDecimal(value).toNumber();
}

// ---------------------------------------------------------------------------
// Status resolution — `06 §6`
// ---------------------------------------------------------------------------

/**
 * Human copy for each non-OK status, used as the "{reason}" in
 * "Not available — {reason}".
 *
 * `NOT_APPLICABLE` is absent on purpose: it does not belong in this map
 * because it must never be rendered as "not available". See `MetricValue`.
 */
const STATUS_REASON: Record<Exclude<MfMetricStatus, 'OK' | 'NOT_APPLICABLE'>, string> = {
  INSUFFICIENT_DATA: 'not enough history to compute it',
  BENCHMARK_UNAVAILABLE: 'this scheme has no usable benchmark index',
  STALE: 'the underlying data is out of date',
  QUARANTINED: 'the underlying NAV data failed validation',
};

/**
 * The reason string shown when the server sent a null without a status.
 *
 * The contract says a null always carries a `fieldStatus` entry, so reaching
 * this is a server bug. It still must not render as `0` or as a bare dash —
 * saying "we do not know, and we do not know why" is worse than a clean
 * status and better than a fabricated number.
 */
const UNREPORTED_REASON = 'the server reported no value and no reason';

export interface ResolvedMetric {
  value: string | null;
  status: MfMetricStatus;
  /** Populated for every non-OK, non-NOT_APPLICABLE status. */
  reason?: string;
}

export interface StatusBlock {
  status: MfMetricStatus;
  statusReason?: string;
  fieldStatus: Record<string, MfMetricStatus>;
}

/**
 * Pair a nullable metric with the status that explains it.
 *
 * `path` is the dotted key the server uses in `fieldStatus`
 * ("riskAdjusted.sortino", "terPct"), so the lookup here mirrors exactly what
 * `02 §9` promises rather than re-deriving a reason on the client.
 *
 * The awkward-looking `status === 'OK' && value === null` branch is the one
 * that matters most. `OK` is the single status that licenses a consumer to
 * render the number, so an `OK` beside a null would send a spec-following UI
 * straight to `0.00` — the precise failure the whole status vocabulary exists
 * to prevent (see the `NOT_APPLICABLE` comment in `mfAnalytics.types.ts`). We
 * refuse to trust it and fall back to an explicit unavailability.
 */
export function resolveMetric(
  value: string | null,
  path: string,
  block: StatusBlock,
): ResolvedMetric {
  const fieldStatus = block.fieldStatus[path];

  if (fieldStatus !== undefined && fieldStatus !== 'OK') {
    return { value: null, status: fieldStatus, reason: reasonFor(fieldStatus, block, fieldStatus) };
  }

  if (value !== null && value !== undefined) {
    // A field-level OK, or no entry at all with a value present: render it.
    return { value, status: 'OK' };
  }

  // Null with no field-level explanation. Inherit the block's status when the
  // block itself is unhealthy — a whole horizon marked INSUFFICIENT_DATA
  // explains every null inside it — otherwise say the reason is missing.
  if (block.status !== 'OK') {
    return {
      value: null,
      status: block.status,
      reason: reasonFor(block.status, block, block.status),
    };
  }
  return { value: null, status: 'INSUFFICIENT_DATA', reason: UNREPORTED_REASON };
}

function reasonFor(
  status: MfMetricStatus,
  block: StatusBlock,
  matchedStatus: MfMetricStatus,
): string | undefined {
  if (status === 'OK' || status === 'NOT_APPLICABLE') return undefined;
  const base = STATUS_REASON[status];
  // Only attach the block's own free-text reason when the field is failing for
  // the same reason the block is. Borrowing a block reason for an unrelated
  // field-level status would attribute a cause we have no evidence for.
  if (block.statusReason && matchedStatus === block.status) {
    return `${base} (${block.statusReason})`;
  }
  return base;
}

/**
 * Pair a value with a status that arrived **beside it** rather than through a
 * `fieldStatus` map.
 *
 * `MfPortfolioAnalysisDto` uses this shape in several places —
 * `totals.portfolioXirr` + `totals.portfolioXirrStatus`,
 * `MfHeldFundDto.userXirr` + `userXirrStatus` + `userXirrStatusReason`. There
 * is no dotted-path map to look the reason up in, so `resolveMetric` cannot be
 * used directly; this adapts the pair into the same `ResolvedMetric` every
 * render site consumes.
 *
 * The `status === 'OK' && value === null` branch is inherited deliberately:
 * `OK` is the one status that licenses printing the number, so an `OK` beside
 * a null would send a spec-following UI straight to `0.00`.
 */
export function resolveWithStatus(
  value: string | null,
  status: MfMetricStatus,
  statusReason?: string,
): ResolvedMetric {
  return resolveMetric(value, '__inline__', { status, statusReason, fieldStatus: {} });
}

/**
 * A value the contract types as plainly nullable, with **no** status field
 * anywhere beside it.
 *
 * Most of `MfPortfolioAnalysisDto` is like this: `weightedTerPct`,
 * `annualCostInr`, `redundancyScore`, `MfLotDto.exitLoadPct`,
 * `taxIfSoldTodayInr`, `weightInNetWorth`. The DTO's doc comments say precisely
 * what each null MEANS — "no held fund disclosed a TER", "we do not know this
 * scheme's exit load", "the slab is unknowable" — and that meaning is the
 * reason string the reader needs. So the caller supplies it at the call site,
 * quoting the contract, rather than this module inventing a generic one.
 *
 * The reason must not contain a digit. `MetricValue` renders it inside
 * `[data-metric-value]`, and the keystone test walks every one of those and
 * fails if a non-`OK` metric contains a digit — the check that catches a
 * `?? 0` from ever reading as a measurement. A reason like "below ₹1.25 lakh"
 * would trip it, correctly: a number inside an unavailability is a number the
 * reader can mistake for the answer.
 */
export function unavailable(reason: string): ResolvedMetric {
  return { value: null, status: 'INSUFFICIENT_DATA', reason };
}

/** A value that is present and needs no status negotiation. */
export function known(value: string): ResolvedMetric {
  return { value, status: 'OK' };
}

/**
 * `known` when present, `unavailable(reason)` when null — the shape almost
 * every field on the portfolio DTO needs.
 */
export function resolveNullable(
  value: string | null | undefined,
  reason: string,
): ResolvedMetric {
  return value === null || value === undefined ? unavailable(reason) : known(value);
}

/**
 * Fund units. Not money and not a `Ratio`, just a plain Decimal string on the
 * contract (`MfHeldFundDto.units`, `MfLotDto.units`).
 *
 * Three decimals because MF allotments are quoted to three and a fund with
 * 12.345 units genuinely holds 12.345 — rounding to two would show two
 * different lots of 0.004 and 0.006 units as the same 0.01.
 */
export function formatUnits(value: string, fractionDigits = 3): string {
  return toDecimal(value).toFixed(fractionDigits, Decimal.ROUND_HALF_EVEN);
}

/** Convenience: resolve straight out of a `Ratio | null` field. */
export function resolveRatio(
  value: Ratio | null,
  path: string,
  block: StatusBlock,
): ResolvedMetric {
  return resolveMetric(value, path, block);
}

/** Convenience: resolve straight out of a `Pct | null` field. */
export function resolvePct(
  value: Pct | null,
  path: string,
  block: StatusBlock,
): ResolvedMetric {
  return resolveMetric(value, path, block);
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * Days a portfolio snapshot may lag before the amber badge appears (`06 §6`).
 *
 * AMCs disclose monthly, so a 30-45 day lag is normal and badging it would
 * train users to ignore the badge. Past 60 days the disclosure has actually
 * been missed, and the sector/holding numbers on screen describe a portfolio
 * the fund may no longer hold.
 */
export const HOLDINGS_STALE_AFTER_DAYS = 60;

/** ISO date → "12 Mar 2026". Returns null when the input is unparseable. */
export function formatIsoDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Whole days between an ISO date and `now`. Null when unparseable. */
export function daysSince(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Keys and labels
// ---------------------------------------------------------------------------

/**
 * Plain-English reason for a non-OK status, with no block context available.
 *
 * Used where a status arrives on its own rather than through `fieldStatus` —
 * `MfPillarInput.status` is the main case. Returns `undefined` for `OK` and
 * for `NOT_APPLICABLE`, both of which are rendered by a different path in
 * `MetricValue` and must never be phrased as "not available".
 */
export function statusReasonText(status: MfMetricStatus): string | undefined {
  if (status === 'OK' || status === 'NOT_APPLICABLE') return undefined;
  return STATUS_REASON[status];
}

/**
 * `pillars` and `inputs` are `Record<string, …>` on the contract: the scoring
 * models own the key set (`03 §4-7`) and add to it whenever a model gains an
 * input. A hardcoded label map on the client would therefore render a brand
 * new input as a blank cell — the failure mode is silent, which is the worst
 * kind. Deriving the label from the key keeps an unrecognised input legible.
 */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_.]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  if (spaced.length === 0) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
