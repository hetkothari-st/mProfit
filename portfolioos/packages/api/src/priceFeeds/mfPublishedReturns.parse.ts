/**
 * Pure parser for an externally **published** set of trailing scheme returns —
 * the independent yardstick `06-QUALITY-COMPLIANCE.md §2` reconciles our own
 * `MfSchemeMetrics` against.
 *
 * PURE MODULE (`CONTEXT.md §14`): no network, no fs, no Prisma, no clock.
 * `mfPublishedReturns.v1.ts` fetches bytes and hands them here.
 *
 * =============================================================================
 * WHAT THIS FILE IS FOR, AND WHY IT MUST NOT BE CLEVER
 * =============================================================================
 * Everything else in the MF analytics layer computes returns. This one reads
 * somebody else's. That asymmetry is the entire value of the reconciliation
 * job: a bug in `mfMetricsMath.ts` cannot hide here, because nothing here
 * shares a line of code with it.
 *
 * The corollary is that this parser must never repair, interpolate or infer.
 * A field it cannot read with certainty is **absent**, and an absent field
 * means "we could not reconcile this metric" — never "they agree with us".
 * A reconciliation that reports a match it did not actually make is worse than
 * no reconciliation at all, because it manufactures confidence.
 *
 * =============================================================================
 * ASSUMED RESPONSE SHAPE — UNVERIFIED
 * =============================================================================
 * AMFI publishes scheme performance and `api.mfapi.in` mirrors AMFI data; this
 * repo already uses `api.mfapi.in/mf/<schemeCode>` for NAV history
 * (`priceFeeds/amfi.service.ts`). We have **no verified access to a trailing-
 * returns endpoint** on that host or any other, so the shape below is written
 * from the documented shape of the NAV endpoint plus the fields a performance
 * endpoint must carry. It is an assumption, stated here so that correcting it
 * later is a one-file edit and a new fixture rather than an archaeology
 * exercise.
 *
 * Assumed JSON body, one scheme per response:
 *
 *     {
 *       "meta": {
 *         "scheme_code": 120503,
 *         "scheme_name": "ICICI Prudential Bluechip Fund - Direct Plan - Growth",
 *         "fund_house": "ICICI Prudential Mutual Fund",
 *         "as_on": "2026-08-31"
 *       },
 *       "returns": {
 *         "1y": "18.42",
 *         "3y": "15.10",
 *         "5y": "12.03"
 *       },
 *       "expense_ratio": "0.62",
 *       "aum_cr": "63421.55"
 *     }
 *
 * Units, which are the part that silently ruins a comparison:
 *   - `returns.*` are **percent**, not fractions. "18.42" is 18.42% p.a.
 *     Our `MfHorizonMetrics.returns.cagr` is a `Ratio` (0.1842). The job does
 *     the x100; this parser reports what was published, in published units.
 *   - `expense_ratio` is **percent** (0.62 = 0.62% TER), matching
 *     `MfSchemeTer.terPct`'s documented units.
 *   - `aum_cr` is **INR crore**, matching how every AMC factsheet quotes it and
 *     NOT matching `MfSchemeAum.aum`, which is plain rupees by schema comment.
 *     The conversion is the job's, done once, in one place.
 *
 * Tolerated variation (a short, deliberate alias list — see `pick`):
 *   - the returns block may be flat on the root instead of nested;
 *   - horizon keys `1y` | `return_1y` | `oneYear` | `1yr` | `1_year`;
 *   - values as JSON strings or JSON numbers (numbers are read from their
 *     source text via `JSON.stringify`, never coerced through arithmetic —
 *     see `figureFromJson`);
 *   - `-`, `NA`, `N/A`, `null`, `""` for "not published", which become
 *     **absent**, never zero. A zero return would either read as a 100% drift
 *     against a real fund or, worse, quietly match a fund that really did
 *     return nothing.
 *
 * Anything outside that list is a parse failure with a reason, not a guess.
 * A genuinely different shape is a NEW adapter version and a new fixture here,
 * never an edit to these expectations (`CONTEXT.md §14`).
 */

import type { Decimal } from 'decimal.js';
import { toDecimal } from '@portfolioos/shared';

/**
 * Horizons `06 §2` reconciles. Deliberately not every `MF_HORIZONS` value —
 * published sources rarely carry 7y/10y, and an absent field is not a drift.
 */
export const PUBLISHED_HORIZONS = [1, 3, 5] as const;
export type PublishedHorizon = (typeof PUBLISHED_HORIZONS)[number];

/**
 * One published number, kept together with the *scale it was published at*.
 *
 * The scale is load-bearing, not decoration. `06 §2` expects an **exact**
 * match on TER, and our `MfSchemeTer.terPct` is `Decimal(12,6)` while a
 * factsheet discloses "0.62". Comparing 0.620000 against 0.62 is exact;
 * comparing 0.625000 against 0.62 is not, and without knowing they published
 * two decimals we could not tell a real disagreement from their rounding. So
 * we carry the scale and let the job compare at *their* precision.
 */
export interface PublishedFigure {
  /** The published magnitude, exact. Units are per-field; see the header. */
  value: Decimal;
  /** Digits after the decimal point in the published text. 0 for "12". */
  scale: number;
  /** Exactly what was published, for the DLQ payload. */
  raw: string;
}

export interface MfPublishedReturns {
  schemeCode: string;
  schemeName: string | null;
  /** The date the publisher says these figures are as at. UTC midnight. */
  asOn: Date;
  /** Percent units. A horizon the source did not publish is simply missing. */
  returnsPct: Partial<Record<PublishedHorizon, PublishedFigure>>;
  /** Percent units (0.62 = 0.62%). */
  terPct: PublishedFigure | null;
  /** INR crore, as factsheets quote it. */
  aumCrore: PublishedFigure | null;
}

export type MfPublishedReturnsParseFailureReason =
  /** Body is not JSON at all — an HTML error page, a login wall, a stub. */
  | 'not_json'
  /** Valid JSON, but not the object envelope documented above. */
  | 'not_an_object'
  /** No scheme code in the payload; we cannot prove whose numbers these are. */
  | 'missing_scheme_code'
  /** The payload is for a *different* scheme than we asked about. */
  | 'scheme_code_mismatch'
  /**
   * No `as_on` date, or one we cannot read. Without it a comparison is undated
   * and could be reconciling last quarter against this month-end.
   */
  | 'missing_as_on'
  | 'bad_as_on'
  /**
   * Parsed cleanly and carried not one usable figure. Reported as a failure
   * rather than an empty success, for the reason in the header.
   */
  | 'no_usable_figures';

export interface MfPublishedReturnsParseFailure {
  ok: false;
  reason: MfPublishedReturnsParseFailureReason;
  detail: string;
  /** First bytes of an unexpected body, to diagnose drift. Truncated. */
  bodySample?: string;
}

export type MfPublishedReturnsParseOutcome =
  | { ok: true; data: MfPublishedReturns }
  | MfPublishedReturnsParseFailure;

// ---------------------------------------------------------------------------
// Scalar readers
// ---------------------------------------------------------------------------

/** Values that mean "the publisher did not publish this", never zero. */
const ABSENT_TOKENS = new Set(['', '-', '--', 'na', 'n/a', 'nil', 'null', 'none', 'nr']);

/**
 * Strict numeric reader.
 *
 * Everything it strips is presentational: thousands separators (Indian or
 * Western grouping), a trailing `%`, a leading currency marker, surrounding
 * space, a leading `+`. It strips nothing that could change a magnitude.
 *
 * The final shape is checked by regex *before* `toDecimal`, so a malformed
 * value returns null instead of throwing — a bad field in one scheme's payload
 * must not take the other 29 schemes down with it.
 */
export function parsePublishedFigure(raw: string): PublishedFigure | null {
  const trimmed = raw.trim();
  if (ABSENT_TOKENS.has(trimmed.toLowerCase())) return null;

  const cleaned = trimmed
    .replace(/^\+/, '')
    .replace(/^(?:₹|rs\.?)\s*/i, '')
    .replace(/,/g, '')
    .replace(/\s*%\s*$/, '')
    .trim();

  // No exponent form accepted. A published return in scientific notation is a
  // sign the source changed shape, not a number to be helpful about.
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;

  const dot = cleaned.indexOf('.');
  return {
    value: toDecimal(cleaned),
    scale: dot === -1 ? 0 : cleaned.length - dot - 1,
    raw: trimmed,
  };
}

/**
 * Read a figure from an arbitrary JSON value.
 *
 * A JSON **number** is re-serialised with `JSON.stringify` and re-read as text.
 * That is not pedantry: `JSON.parse` has already put the token through an
 * IEEE-754 double, and its shortest round-trip text is the only thing left to
 * recover. What we must never do is arithmetic on it, so it goes straight back
 * to text and then into `Decimal` (`CONTEXT.md §3.1`). Strings — the shape we
 * expect and the one a well-behaved publisher uses — never touch a double.
 */
function figureFromJson(v: unknown): PublishedFigure | null {
  if (typeof v === 'string') return parsePublishedFigure(v);
  if (typeof v === 'number' && Number.isFinite(v)) return parsePublishedFigure(JSON.stringify(v));
  return null;
}

/** First present key from a documented alias list. Case-insensitive. */
function pick(obj: Record<string, unknown>, keys: readonly string[]): unknown {
  const lower = new Map(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
  for (const k of keys) {
    const hit = lower.get(k.toLowerCase());
    if (hit !== undefined && hit !== null) return hit;
  }
  return undefined;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function readString(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' && Number.isInteger(v)) return JSON.stringify(v);
  return null;
}

const MONTHS: Readonly<Record<string, number>> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function utcDate(y: number, m1: number, d: number): Date | null {
  if (m1 < 1 || m1 > 12 || d < 1 || d > 31) return null;
  const out = new Date(Date.UTC(y, m1 - 1, d));
  // Rejects 2026-02-31, which `Date.UTC` would happily roll into March.
  if (out.getUTCMonth() !== m1 - 1 || out.getUTCDate() !== d) return null;
  return out;
}

/**
 * `YYYY-MM-DD`, `DD-MM-YYYY` (the form `api.mfapi.in` uses for NAV dates) and
 * `DD-MMM-YYYY` (AMFI's own form). Always UTC midnight: a date built from
 * local parts on an IST box lands on the previous day in UTC, which for a
 * month-end reconciliation would compare August against a July metrics row.
 */
export function parsePublishedDate(raw: string): Date | null {
  const s = raw.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    return utcDate(
      Number.parseInt(iso[1]!, 10),
      Number.parseInt(iso[2]!, 10),
      Number.parseInt(iso[3]!, 10),
    );
  }

  const dmy = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(s);
  if (dmy) {
    return utcDate(
      Number.parseInt(dmy[3]!, 10),
      Number.parseInt(dmy[2]!, 10),
      Number.parseInt(dmy[1]!, 10),
    );
  }

  const dMonY = /^(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s](\d{4})$/.exec(s);
  if (dMonY) {
    const m = MONTHS[dMonY[2]!.toLowerCase()];
    if (m === undefined) return null;
    return utcDate(Number.parseInt(dMonY[3]!, 10), m + 1, Number.parseInt(dMonY[1]!, 10));
  }

  return null;
}

// ---------------------------------------------------------------------------
// Field aliases — the whole tolerated vocabulary, in one place
// ---------------------------------------------------------------------------

const SCHEME_CODE_KEYS = ['scheme_code', 'schemeCode', 'code'] as const;
const SCHEME_NAME_KEYS = ['scheme_name', 'schemeName', 'name'] as const;
const AS_ON_KEYS = ['as_on', 'asOn', 'as_on_date', 'date', 'nav_date'] as const;
const RETURNS_BLOCK_KEYS = [
  'returns',
  'trailing_returns',
  'trailingReturns',
  'performance',
] as const;
const TER_KEYS = ['expense_ratio', 'expenseRatio', 'ter', 'ter_pct', 'terPct'] as const;
const AUM_KEYS = ['aum_cr', 'aumCr', 'aum_crore', 'aumCrore', 'aum'] as const;

function horizonKeys(h: PublishedHorizon): readonly string[] {
  const word = h === 1 ? 'one' : h === 3 ? 'three' : 'five';
  return [`${h}y`, `return_${h}y`, `${h}yr`, `${h}_year`, `${word}Year`, `${word}_year`];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface ParsePublishedReturnsArgs {
  /**
   * The scheme we asked about. A payload for a different scheme is rejected,
   * not silently reconciled — a mismatched code is exactly how a reconciliation
   * job ends up cheerfully comparing a gilt fund against a small cap and
   * reporting a 9-point "drift" in our engine.
   */
  expectedSchemeCode: string;
}

export function parseMfPublishedReturns(
  body: string,
  args: ParsePublishedReturnsArgs,
): MfPublishedReturnsParseOutcome {
  const sample = body.trimStart().slice(0, 300);

  let json: unknown;
  try {
    json = JSON.parse(body) as unknown;
  } catch (err) {
    // Typed failure, neither thrown nor swallowed: an endpoint serving an HTML
    // error page is an expected operational state for a scraped feed.
    return {
      ok: false,
      reason: 'not_json',
      detail: `Response is not JSON: ${err instanceof Error ? err.message : String(err)}`,
      bodySample: sample,
    };
  }

  const root = asRecord(json);
  if (root === null) {
    return {
      ok: false,
      reason: 'not_an_object',
      detail: 'Response parsed as JSON but is not an object envelope.',
      bodySample: sample,
    };
  }

  const meta = asRecord(root['meta']) ?? root;

  const schemeCode = readString(pick(meta, SCHEME_CODE_KEYS) ?? pick(root, SCHEME_CODE_KEYS));
  if (schemeCode === null) {
    return {
      ok: false,
      reason: 'missing_scheme_code',
      detail:
        `No scheme code in the payload (looked for ${SCHEME_CODE_KEYS.join(', ')}). ` +
        `Cannot prove whose returns these are.`,
      bodySample: sample,
    };
  }
  if (schemeCode !== args.expectedSchemeCode) {
    return {
      ok: false,
      reason: 'scheme_code_mismatch',
      detail: `Asked for scheme ${args.expectedSchemeCode}, payload is for ${schemeCode}.`,
      bodySample: sample,
    };
  }

  const asOnRaw = readString(pick(meta, AS_ON_KEYS) ?? pick(root, AS_ON_KEYS));
  if (asOnRaw === null) {
    return {
      ok: false,
      reason: 'missing_as_on',
      detail:
        `No as-at date (looked for ${AS_ON_KEYS.join(', ')}). An undated comparison ` +
        `could be reconciling any period against our month-end.`,
      bodySample: sample,
    };
  }
  const asOn = parsePublishedDate(asOnRaw);
  if (asOn === null) {
    return {
      ok: false,
      reason: 'bad_as_on',
      detail: `Unreadable as-at date "${asOnRaw}". Accepted forms: YYYY-MM-DD, DD-MM-YYYY, DD-MMM-YYYY.`,
      bodySample: sample,
    };
  }

  // The returns block is either nested or flat on the root. Both are read
  // through the same alias table, so a source that moves it is a fixture
  // change rather than a code change.
  const returnsBlock = asRecord(pick(root, RETURNS_BLOCK_KEYS)) ?? root;
  const returnsPct: Partial<Record<PublishedHorizon, PublishedFigure>> = {};
  for (const h of PUBLISHED_HORIZONS) {
    const fig = figureFromJson(pick(returnsBlock, horizonKeys(h)));
    if (fig !== null) returnsPct[h] = fig;
  }

  const terPct = figureFromJson(pick(root, TER_KEYS) ?? pick(meta, TER_KEYS));
  const aumCrore = figureFromJson(pick(root, AUM_KEYS) ?? pick(meta, AUM_KEYS));

  if (Object.keys(returnsPct).length === 0 && terPct === null && aumCrore === null) {
    return {
      ok: false,
      reason: 'no_usable_figures',
      detail:
        `Payload for scheme ${schemeCode} carries no readable return, TER or AUM figure. ` +
        `Reported as a failure rather than "nothing to compare" — a reconciliation that ` +
        `silently compares nothing reports a clean bill of health it never earned.`,
      bodySample: sample,
    };
  }

  return {
    ok: true,
    data: {
      schemeCode,
      schemeName: readString(pick(meta, SCHEME_NAME_KEYS) ?? pick(root, SCHEME_NAME_KEYS)),
      asOn,
      returnsPct,
      terPct,
      aumCrore,
    },
  };
}
