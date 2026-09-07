/**
 * Shared, PURE normalisation for every MF factsheet / portfolio adapter
 * (`docs/mf-analytics/01-DATA-FOUNDATION.md §4` and `§6`).
 *
 * No Prisma, no network, no filesystem, no clock. Everything here is a
 * function of its arguments, so an adapter's behaviour is reproducible from a
 * fixture forever — the same constraint `mfMetricsMath.ts` imposes on the math
 * layer, for the same reason.
 *
 * This file exists because the *format* differs per AMC but the *meaning* does
 * not. "CRISIL AA+ (CE)" is the same credit as "[ICRA]AA+" whichever AMC wrote
 * it, and a Large-cap bucket must be decided identically for every fund or the
 * cross-fund comparisons downstream are comparing methodology, not funds. Each
 * `<amc>.parse.ts` owns only its column layout and section markers; it delegates
 * every semantic decision here.
 */

import { Decimal, toDecimal, serializeMoney, serializePct } from '@portfolioos/shared';
import type { Money, Pct, MfHoldingKind } from '@portfolioos/shared';
import type { MarketCapBucket, AmfiMarketCapLookup, ParsedExitLoadRule } from './types.js';

// ---------------------------------------------------------------------------
// 1. Credit ratings — REUSED, not redefined
// ---------------------------------------------------------------------------

/**
 * The credit ladder and its normaliser live in
 * `services/mfAnalytics/mfMetricsMath.ts` and are re-exported here verbatim.
 *
 * They are NOT reimplemented. A second ordinal scale would be the worst
 * possible outcome of this task: ingest would bucket a holding one way, the
 * metrics layer would bucket the same holding another way, and
 * `creditQualitySplit` would silently disagree with `belowAAPct` computed from
 * the same rows. One ladder, one normaliser, imported by both sides.
 *
 * The re-export is here so adapters have a single import surface and never
 * reach across into `services/` themselves — if the ladder ever needs to move
 * into `@portfolioos/shared`, this is the only line that changes.
 */
export {
  CREDIT_RATING_SCALE,
  creditRatingOrdinal,
  compareCreditRating,
  normaliseCreditRating,
} from '../../services/mfAnalytics/mfMetricsMath.js';
export type { CreditRatingGrade } from '../../services/mfAnalytics/mfMetricsMath.js';

import { normaliseCreditRating as normaliseCreditRatingImpl } from '../../services/mfAnalytics/mfMetricsMath.js';
import type { CreditRatingGrade } from '../../services/mfAnalytics/mfMetricsMath.js';

/**
 * Rating normalisation for a HOLDING row, as opposed to for math.
 *
 * The difference from the math-layer function is the empty case. There, an
 * absent rating means `UNRATED` because the aggregation must place every
 * weight in some bucket. Here, an equity row simply has no rating column, and
 * writing `UNRATED` into `MfPortfolioHolding.creditRating` for 60 stocks would
 * fabricate a debt attribute the AMC never disclosed. So: `null` when the cell
 * is empty, a grade when it is not.
 *
 * The conservative-bucket property is unchanged for anything that IS a rating:
 * an unrecognised string still becomes `UNRATED`, which can only make the fund
 * look worse, never better.
 */
export function normaliseHoldingCreditRating(
  raw: string | null | undefined,
): CreditRatingGrade | null {
  if (raw === null || raw === undefined) return null;
  if (raw.trim().length === 0) return null;
  return normaliseCreditRatingImpl(raw);
}

// ---------------------------------------------------------------------------
// 2. Numbers, dates, ISINs
// ---------------------------------------------------------------------------

/**
 * Parse an Indian-format number out of a disclosure cell.
 *
 * Handles: lakh-style grouping ("1,20,00,000"), a leading ₹ or "Rs."/"INR",
 * a trailing "%" or "Cr"/"Lakhs" unit word, accounting negatives "(1,234.00)",
 * and the several dashes AMCs use for "nil" (-, –, —, NA, N.A., Nil).
 *
 * Returns `null`, never `0`, when there is no number. `0` is a real weight (a
 * fully-hedged position can round to it) and a real quantity; using it for
 * "absent" is exactly the conflation `01 §6` and `02` are built to avoid.
 *
 * `Decimal` in, `Decimal` out — never `Number(x)` (CONTEXT.md §3.1).
 */
export function parseIndianDecimal(raw: string | null | undefined): Decimal | null {
  if (raw === null || raw === undefined) return null;
  let s = raw.trim();
  if (s.length === 0) return null;

  // Explicit nil markers. Checked before stripping, because a bare "-" would
  // otherwise survive as an empty string and be indistinguishable from a blank.
  if (/^(-+|–+|—+|n\.?\s*a\.?|nil|none|not\s+applicable)$/i.test(s)) return null;

  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/^\((.*)\)$/, '$1');
  // Strip currency marks, unit words and the percent sign. The UNIT is the
  // caller's problem (see croreToInr/lakhToInr); this only removes the label.
  s = s.replace(/(₹|rs\.?|inr)/gi, '');
  s = s.replace(/\b(crores?|cr\.?|lakhs?|lacs?|lakh|mn|bn)\b/gi, '');
  s = s.replace(/%/g, '');
  s = s.replace(/,/g, '');
  s = s.replace(/[+\s]/g, '');
  s = s.replace(/^-/, '');

  if (s.length === 0) return null;
  if (!/^\d*\.?\d+$/.test(s) && !/^\d+\.?\d*$/.test(s)) return null;

  let d: Decimal;
  try {
    d = toDecimal(s);
  } catch {
    // toDecimal throws on anything Decimal.js cannot read. A single unreadable
    // cell is a row-level data-quality issue, not a reason to fail the file —
    // the caller records it as a row failure. Returning null is the typed
    // failure here, so this is not a silent catch (CONTEXT.md §3.5).
    return null;
  }
  if (!d.isFinite()) return null;
  return negative ? d.negated() : d;
}

/** Lakh → rupees. AMCs quote market values in "Rs. in Lakhs" far more often than not. */
export function lakhToInr(d: Decimal): Decimal {
  return d.times(100_000);
}

/** Crore → rupees. Factsheet AUM is almost always in crore. */
export function croreToInr(d: Decimal): Decimal {
  return d.times(10_000_000);
}

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse the date formats that appear on Indian factsheets, to UTC midnight.
 *
 * UTC midnight, not local: `MfPortfolioSnapshot.asOf` is a month-end marker,
 * and a server in IST writing `new Date('2026-03-31')` local would store
 * 2026-03-30T18:30:00Z and put the March disclosure in February for anyone
 * querying by month. `@db.Date` columns elsewhere in this repo follow the same
 * rule for the same reason.
 *
 * Two-digit years are read as 20YY: these documents do not predate 2000 and
 * will not outlive 2099.
 */
export function parseFactsheetDate(raw: string | null | undefined): Date | null {
  if (raw === null || raw === undefined) return null;
  const s = raw.trim().replace(/\s+/g, ' ');
  if (s.length === 0) return null;

  // 31-Mar-2026 | 31 Mar 26 | 31/Mar/2026
  const dmy = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ](\d{2}|\d{4})$/);
  if (dmy) {
    const month = MONTHS[(dmy[2] ?? '').slice(0, 4).toLowerCase()] ?? MONTHS[(dmy[2] ?? '').slice(0, 3).toLowerCase()];
    if (month !== undefined) return utcDate(expandYear(dmy[3] ?? ''), month, Number.parseInt(dmy[1] ?? '', 10));
  }

  // March 31, 2026 | Mar 31 2026 | Jul 31,2026
  // The space after the comma is optional: ICICI Pru writes "Portfolio as on
  // Jul 31,2026" and Nippon "as on July 31,2026" — both closed up — while SBI,
  // Axis, ABSL, Mirae and DSP write the same date with the space. Requiring it
  // silently dropped the as-of for two of the ten AMCs, which is a hard
  // MALFORMED_INPUT failure rather than a wrong value, but a failure all the same.
  const mdy = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2}),?\s*(\d{2}|\d{4})$/);
  if (mdy) {
    const month = MONTHS[(mdy[1] ?? '').slice(0, 4).toLowerCase()] ?? MONTHS[(mdy[1] ?? '').slice(0, 3).toLowerCase()];
    if (month !== undefined) return utcDate(expandYear(mdy[3] ?? ''), month, Number.parseInt(mdy[2] ?? '', 10));
  }

  // 31/03/2026 | 31-03-2026 — day-first. Indian documents are never month-first,
  // so 03/04/2026 is 3 April, and reading it as 4 March would shift a snapshot
  // into the wrong month without ever looking wrong.
  const numeric = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);
  if (numeric) {
    return utcDate(
      expandYear(numeric[3] ?? ''),
      Number.parseInt(numeric[2] ?? '', 10),
      Number.parseInt(numeric[1] ?? '', 10),
    );
  }

  // 2026-03-31 (ISO)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return utcDate(
      Number.parseInt(iso[1] ?? '', 10),
      Number.parseInt(iso[2] ?? '', 10),
      Number.parseInt(iso[3] ?? '', 10),
    );
  }

  return null;
}

function expandYear(y: string): number {
  const n = Number.parseInt(y, 10);
  return y.length === 2 ? 2000 + n : n;
}

function utcDate(year: number, month: number, day: number): Date | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Rejects 31 Feb and friends: the Date constructor rolls over silently.
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

/** ISO 6166: 2 letters, 9 alphanumerics, 1 check digit. Check digit not verified. */
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

/**
 * Normalise and validate an ISIN cell. Returns `null` for anything that is not
 * one — cells holding "-", a rating, or a footnote marker are common in the
 * ISIN column of these workbooks.
 */
export function normaliseIsin(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return ISIN_RE.test(s) ? s : null;
}

// ---------------------------------------------------------------------------
// 3. Holding kind
// ---------------------------------------------------------------------------

/**
 * The narrow view of a disclosure row that kind-classification needs. Declared
 * structurally so this stays callable from a parser that has not yet built a
 * `ParsedHoldingRow`.
 */
export interface HoldingKindInput {
  /** The instrument name as disclosed. */
  securityName: string;
  /**
   * The section heading the row sat under ("EQUITY & EQUITY RELATED", "DEBT
   * INSTRUMENTS", "MONEY MARKET INSTRUMENTS", …). The single strongest signal
   * and the reason parsers must carry section state down the rows.
   */
  section?: string | null;
  /** The Industry/Rating column, which is an industry for equity and a rating for debt. */
  industryOrRating?: string | null;
  isin?: string | null;
}

/**
 * Classify one disclosure row onto `MfHoldingKind`.
 *
 * Section heading first, instrument name second. That order matters: a row
 * named "HDFC Bank Limited" under "DEBT INSTRUMENTS" is a bond issued BY HDFC
 * Bank, not a share IN it, and classifying it as EQUITY would move a debt
 * exposure into the equity market-cap split — inflating the fund's apparent
 * equity allocation and understating its credit risk in one move.
 *
 * Everything unrecognised is `OTHER`, never dropped. A row we cannot classify
 * still carries weight, and its weight still has to reach the 97–103% check or
 * that check silently stops working.
 */
export function classifyHoldingKind(row: HoldingKindInput): MfHoldingKind {
  const name = row.securityName.toLowerCase();
  const section = (row.section ?? '').toLowerCase();
  const rating = (row.industryOrRating ?? '').toLowerCase();

  // Cash and cash-equivalents. Checked FIRST because these lines appear under
  // both debt and money-market sections depending on the AMC, and because
  // `cashPct` is computed from this bucket.
  if (
    /\b(treps|tri-?party|clearing corp|reverse repo|repo\b|cblo|net receivable|net payable|net current asset|cash (and|&) cash equivalent|cash margin|bank balance)/.test(
      name,
    ) ||
    /\b(cash|net (current )?asset|treps|repo)/.test(section)
  ) {
    return 'CASH';
  }

  if (/\b(gold|silver|bullion|edr\b|electronic gold receipt)/.test(name) || /gold|bullion/.test(section)) {
    return 'GOLD';
  }

  if (/\b(reit|invit|infrastructure investment trust|real estate investment trust)/.test(name) || /reit|invit/.test(section)) {
    return 'REIT_INVIT';
  }

  if (
    /\b(future|fut\b|option|call option|put option|swap|forward|derivative)/.test(name) ||
    /derivative|future|option/.test(section)
  ) {
    return 'DERIVATIVE';
  }

  // "Listed / Awaiting listing on the Stock Exchanges" is the sub-heading AMCs
  // put UNDER "EQUITY & EQUITY RELATED", and it is what a row's section state
  // actually holds by the time the first holding is read — the outer heading
  // has already been overwritten. So the listing sub-headings have to count as
  // equity signals too, or every equity row falls through to the ISIN
  // heuristic and a stock with an unreadable ISIN lands in OTHER.
  if (/equity|shares|stock exchange|listed/.test(section)) return 'EQUITY';

  if (/debt|bond|debenture|money market|government securit|g-?sec|state development|treasury bill|certificate of deposit|commercial paper|securitis/.test(section)) {
    return 'DEBT';
  }

  // No usable section — fall back to the instrument itself.
  if (
    // `cp`/`cd` are the standard abbreviations for commercial paper and
    // certificate of deposit and are word-bounded so they cannot fire inside an
    // issuer's name. Money-market paper is disclosed under a "Money Market
    // Instruments" section far more often than not, so this only matters for
    // exports that lost their section headings — but a treasury fund whose CPs
    // all landed in OTHER would report a zero credit-quality split.
    /\b(ncd|debenture|bond|g-?sec|gsec|goi\b|government of india|state development loan|sdl\b|treasury bill|t-?bill|certificate of deposit|commercial paper|\bcp\b|\bcd\b|zero coupon|floating rate note)/.test(
      name,
    ) ||
    /^\d+(\.\d+)?%/.test(row.securityName.trim())
  ) {
    return 'DEBT';
  }

  // A rating in the Industry/Rating column is itself the tell: industries are
  // words, ratings look like ratings. Used only as a last resort.
  if (rating.length > 0 && /^(crisil|icra|care|ind|bwr|fitch|\[)?\s*(sov|sovereign|aaa|aa|a1|a\+|a-|bbb|unrated)/.test(rating)) {
    return 'DEBT';
  }

  if (row.isin !== null && row.isin !== undefined && /^IN[A-Z0-9]{9}\d$/.test(row.isin)) {
    // Indian ISINs encode instrument type in position 5 ('0'–'9' letters vary by
    // series), which is too fragile to lean on. Default to EQUITY only when the
    // row got this far with no debt signal at all.
    return 'EQUITY';
  }

  return 'OTHER';
}

// ---------------------------------------------------------------------------
// 4. Market-cap bucket
// ---------------------------------------------------------------------------

/**
 * Resolve a holding's LARGE/MID/SMALL bucket from the SEEDED AMFI list.
 *
 * ⚠ NEVER derive this from live market cap, and the reason is not pedantry.
 *
 * SEBI's classification is published by AMFI twice a year (January and July)
 * and is the definition a fund is MEASURED AGAINST for that entire half-year: a
 * "Large Cap Fund" must hold ≥80% in the top 100 names ON THAT LIST, not in
 * whatever the top 100 happens to be today. Deriving the bucket from current
 * prices would score every fund against a universe nobody holds it to, and
 * would flip a compliant fund into apparent breach — and back — every time a
 * borderline stock drifted across the boundary mid-period. The mandate check in
 * `06-QUALITY-COMPLIANCE.md` would then be generating false compliance alerts
 * about funds that are perfectly compliant.
 *
 * `null` means "not on the published list" and is reported as `unclassified` in
 * `MfMarketCapSplit`, never redistributed into the other three buckets. An
 * unlisted or newly-listed name genuinely has no SEBI bucket, and inventing one
 * would change the very number the mandate check reads.
 */
export function resolveMarketCapBucket(
  isin: string | null | undefined,
  lookup: AmfiMarketCapLookup | null | undefined,
): MarketCapBucket | null {
  if (isin === null || isin === undefined) return null;
  if (lookup === null || lookup === undefined) return null;
  const normalised = normaliseIsin(isin);
  if (normalised === null) return null;
  return lookup.bucketForIsin(normalised);
}

/**
 * Build a lookup from seeded rows. The job layer reads `AmfiMarketCapList` for
 * one `asOf` and calls this; the pure parsers only ever see the interface, so
 * they stay free of `@prisma/client`.
 */
export function buildAmfiMarketCapLookup(
  asOf: Date,
  rows: readonly { isin: string; bucket: string }[],
): AmfiMarketCapLookup {
  const index = new Map<string, MarketCapBucket>();
  for (const row of rows) {
    const isin = normaliseIsin(row.isin);
    if (isin === null) continue;
    const bucket = row.bucket.trim().toUpperCase();
    if (bucket === 'LARGE' || bucket === 'MID' || bucket === 'SMALL') {
      index.set(isin, bucket);
    }
  }
  return {
    asOf,
    bucketForIsin: (isin: string) => index.get(isin) ?? null,
  };
}

// ---------------------------------------------------------------------------
// 5. Validation at ingest (`01 §6`)
// ---------------------------------------------------------------------------

/**
 * `01 §6` bounds, as Decimals so no comparison ever crosses into float.
 *
 * The weights band is 97–103 rather than exactly 100 because AMCs round each
 * disclosed weight to two decimals and some net out receivables/payables into a
 * line that can go slightly negative. A 3-point tolerance absorbs that. It does
 * NOT absorb a dropped section: missing the debt half of a hybrid fund moves
 * the sum by tens of points, which is exactly what this catches.
 */
export const WEIGHTS_SUM_MIN_PCT = new Decimal('97');
export const WEIGHTS_SUM_MAX_PCT = new Decimal('103');
export const TER_MIN_PCT = new Decimal('0.01');
export const TER_MAX_PCT = new Decimal('3.0');

export type SnapshotRejectReason = 'weights_sum' | 'no_holdings';

export interface SnapshotValidation {
  ok: boolean;
  /** Always reported, even on failure — the operator needs to see how far off it was. */
  weightSumPct: Pct;
  holdingCount: number;
  failures: readonly { reason: SnapshotRejectReason; detail: string }[];
}

/**
 * Validate a parsed snapshot's holdings. NEVER throws (`CONTEXT.md §3.5`).
 *
 * The whole snapshot is rejected, not the offending rows, and that is
 * deliberate — `MfPortfolioSnapshot`'s own schema comment says why: a partially
 * parsed portfolio is worse than none, because the concentration, overlap and
 * market-cap numbers computed from it look entirely plausible and are wrong. A
 * missing snapshot produces `INSUFFICIENT_DATA`, which a user can act on. A
 * wrong snapshot produces a confident number nobody questions.
 */
export function validateSnapshot(
  holdings: readonly { weightPct: Pct | string }[],
): SnapshotValidation {
  const failures: { reason: SnapshotRejectReason; detail: string }[] = [];

  let sum = new Decimal(0);
  for (const h of holdings) {
    sum = sum.plus(toDecimal(h.weightPct));
  }

  if (holdings.length === 0) {
    failures.push({
      reason: 'no_holdings',
      detail: 'Parsed zero holdings; nothing to validate or store.',
    });
  } else if (sum.lt(WEIGHTS_SUM_MIN_PCT) || sum.gt(WEIGHTS_SUM_MAX_PCT)) {
    failures.push({
      reason: 'weights_sum',
      detail:
        `Holding weights sum to ${sum.toFixed(4)}%, outside the permitted ` +
        `${WEIGHTS_SUM_MIN_PCT.toString()}–${WEIGHTS_SUM_MAX_PCT.toString()}% band ` +
        `(01 §6). ${holdings.length} rows parsed.`,
    });
  }

  return {
    ok: failures.length === 0,
    weightSumPct: serializePct(sum),
    holdingCount: holdings.length,
    failures,
  };
}

export interface TerValidation {
  ok: boolean;
  failures: readonly { reason: 'ter_range'; detail: string }[];
}

/**
 * `01 §6`: TER outside 0.01–3.0% is rejected.
 *
 * A `null` TER is NOT a failure — it means the factsheet did not disclose one,
 * which is a gap the cost pillar reports as `INSUFFICIENT_DATA`. A TER of 0,
 * by contrast, IS a failure: SEBI does not permit a zero-expense scheme, so a
 * parsed 0 is a misread column, and letting it through would rank that fund
 * first on cost forever.
 */
export function validateTerPct(terPct: Pct | string | null | undefined): TerValidation {
  if (terPct === null || terPct === undefined) return { ok: true, failures: [] };
  const ter = toDecimal(terPct);
  if (ter.lt(TER_MIN_PCT) || ter.gt(TER_MAX_PCT)) {
    return {
      ok: false,
      failures: [
        {
          reason: 'ter_range',
          detail:
            `TER ${ter.toFixed(6)}% is outside the permitted ` +
            `${TER_MIN_PCT.toString()}–${TER_MAX_PCT.toString()}% band (01 §6).`,
        },
      ],
    };
  }
  return { ok: true, failures: [] };
}

// ---------------------------------------------------------------------------
// 6. Exit load
// ---------------------------------------------------------------------------

/**
 * Parse an exit-load sentence into the `[{daysUpTo, pct}]` ladder that
 * `MfSchemeMeta.exitLoadRules` stores and `02 §8`'s `exitLoadMaxDays` reads.
 *
 * Handles the shapes AMCs actually write:
 *   "1% if redeemed within 365 days"
 *   "Exit load of 1.00% if redeemed on or before 12 months from allotment"
 *   "0.5% for redemption within 30 days; Nil thereafter"
 *   "Nil"
 *
 * Returns `null` — not `[]` — when the text is present but unparseable, so the
 * caller can tell "no load" (an empty ladder is correct) apart from "we could
 * not read it" (`[]` would claim the fund has no exit load, and a switch
 * recommendation in `05-FINDINGS-ENGINE.md` costed against a zero load would
 * understate the real cost of acting on it).
 */
export function parseExitLoad(text: string | null | undefined): ParsedExitLoadRule[] | null {
  if (text === null || text === undefined) return null;
  const s = text.trim();
  if (s.length === 0) return null;

  if (/^(nil|none|no exit load|not applicable|n\.?a\.?)\b/i.test(s)) return [];

  // AMCs write the load and the window in either order:
  //   "1% if redeemed within 365 days"           (percent first)
  //   "Upto 1 Year from allotment - 1% of NAV"   (window first)
  // Percent-first is tried first because the window-first pattern is looser and
  // would mis-bind on a percent-first sentence that also names a later window
  // ("1% within 365 days, Nil after 1 year").
  const rules: ParsedExitLoadRule[] = [];
  const pctFirst =
    /(\d+(?:\.\d+)?)\s*%[^.;\n]*?(?:within|on or before|upto|up to|before|if redeemed(?:\/switched[- ]out)? (?:on or )?(?:before|within))\s*(\d+)\s*(day|days|month|months|year|years)/gi;
  const windowFirst =
    /(?:within|on or before|upto|up to|before)\s*(\d+)\s*(day|days|month|months|year|years)[^.;\n]*?(\d+(?:\.\d+)?)\s*%/gi;

  const push = (
    pctRaw: string | undefined,
    nRaw: string | undefined,
    unitRaw: string | undefined,
  ): void => {
    const pct = parseIndianDecimal(pctRaw ?? null);
    const n = Number.parseInt(nRaw ?? '', 10);
    const unit = (unitRaw ?? '').toLowerCase();
    if (pct === null || !Number.isFinite(n)) return;
    // Months/years are converted with the conventional 30/365, which is how
    // AMCs themselves phrase "12 months" and "1 year" interchangeably for the
    // same 365-day window.
    const days = unit.startsWith('month') ? n * 30 : unit.startsWith('year') ? n * 365 : n;
    rules.push({ daysUpTo: days, pct: serializePct(pct) });
  };

  let m: RegExpExecArray | null;
  while ((m = pctFirst.exec(s)) !== null) push(m[1], m[2], m[3]);
  if (rules.length === 0) {
    while ((m = windowFirst.exec(s)) !== null) push(m[3], m[1], m[2]);
  }

  if (rules.length === 0) return null;
  rules.sort((a, b) => a.daysUpTo - b.daysUpTo);
  return rules;
}

// ---------------------------------------------------------------------------
// 7. Small shared serialisers
// ---------------------------------------------------------------------------

/** `Decimal | null` → `Pct | null`, so adapters never branch on this themselves. */
export function pctOrNull(d: Decimal | null): Pct | null {
  return d === null ? null : serializePct(d);
}

/** `Decimal | null` → `Money | null`. */
export function moneyOrNull(d: Decimal | null): Money | null {
  return d === null ? null : serializeMoney(d);
}

/**
 * Collapse a header cell to a comparison key: lowercase, alphanumerics only.
 *
 * Header matching is done on this rather than on the literal string because
 * AMCs decorate their headers with footnote markers ("Industry^ / Rating",
 * "% to NAV#", "Market/Fair Value (Rs. in Lacs)") and change the decoration
 * without changing the column. Matching literally means a superscript symbol
 * silently unmaps a column and the parser reads weights out of the quantity
 * column.
 */
export function headerKey(cell: string): string {
  return cell.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// 8. CSV → grid
// ---------------------------------------------------------------------------

/**
 * Minimal RFC-4180 CSV reader producing the ragged grid the parsers expect.
 *
 * Lives here rather than in a `.v1.ts` because AMC portfolio disclosures are
 * published as CSV about as often as XLSX, and because the fixtures are CSV — a
 * parser exercisable only through a spreadsheet library is a parser whose
 * fixtures nobody can read in a diff.
 *
 * Quoted fields are the reason this is not a `split(',')`: "1,20,000" is ONE
 * cell holding a lakh-grouped number, and splitting on its commas turns a
 * 120,000-share position into three unparseable cells. Doubled quotes inside a
 * quoted field are an escaped quote.
 */
export function csvToGrid(text: string): string[][] {
  const grid: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? '';
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      grid.push(row);
      row = [];
    } else if (ch === '\r') {
      // Swallowed; the \n that follows ends the record.
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    grid.push(row);
  }
  return grid;
}
