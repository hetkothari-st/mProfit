/**
 * MFAPI daily-NAV history parser — PURE half
 * (`docs/mf-analytics/01-DATA-FOUNDATION.md §2`, `07-IMPLEMENTATION-PLAN.md`
 * Task 1.4; `.parse.ts` / `.v1.ts` split per `CONTEXT.md §14`).
 *
 * No Prisma, no network, no filesystem, no clock. The fetch lives in
 * `mfapiNavHistory.v1.ts` and the writes in `jobs/mfNavHistoryBackfillJob.ts`.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 *
 * `amfi.service.ts` ingests AMFI's `NAVAll.txt`, which is a SINGLE DAY's
 * snapshot. So `MFNav` only has history from the day the daily cron first ran.
 * The whole analytics layer needs years of it: `mfMetricsJob` computes 1/3/5/
 * 7/10-year returns, volatility and drawdown from `MFNav.adjustedNav`, and the
 * Task 2.7 backtest needs monthly metric rows from 2016 with 3-year forward
 * windows. AMFI publishes no free historical bulk file. `api.mfapi.in` mirrors
 * the AMFI archive per scheme and is the only free source of that history.
 *
 * There is an older `backfillMfNavHistory()` in `amfi.service.ts` that also
 * reads this endpoint. It is inlined in a service, has no adapter/version, no
 * failure reporting, and — the reason this module exists rather than a patch —
 * it accepts `nav <= 0` filtering only, silently dropping everything else with
 * no record. That function is left alone (it has a live caller in
 * `analytics.priceBackfill.ts`); new work should use this module.
 *
 * ---------------------------------------------------------------------------
 * THE OBSERVED RESPONSE SHAPE — verified live 2026-09-07, not from docs
 * ---------------------------------------------------------------------------
 *
 *   GET https://api.mfapi.in/mf/120465  ->  200, application/json
 *
 *   {
 *     "meta": {
 *       "fund_house": "Axis Mutual Fund",
 *       "scheme_type": "Open Ended Schemes",
 *       "scheme_category": "Equity Schemes - Large Cap Fund",
 *       "scheme_code": 120465,                 <- NUMBER, not a string
 *       "scheme_name": "Axis Large Cap Fund - Direct Plan - Growth Option",
 *       "isin_growth": "INF846K01DP8",
 *       "isin_div_reinvestment": null
 *     },
 *     "data": [ { "date": "04-09-2026", "nav": "69.66000" }, … ],
 *     "status": "SUCCESS"
 *   }
 *
 * Facts that the code below depends on, each measured against the live API
 * over two real schemes (120465 equity/growth, 119551 debt/IDCW-reinvest)
 * rather than assumed:
 *
 *   - `data` is ordered NEWEST FIRST. 3,375 points for 120465, spanning
 *     04-09-2026 back to 02-01-2013. We re-sort ascending; nothing downstream
 *     should depend on the API's ordering staying what it is today.
 *   - A point has exactly two keys, `date` and `nav`. Both are STRINGS —
 *     including the NAV, which is what makes this feed safe for money.
 *   - NAVs arrive with 5 decimal places ("69.66000"). `MFNav.nav` is
 *     `Decimal(18,4)`, so `serializeMoney` rounds to 4 — banker's rounding,
 *     the repo-wide rule (`CONTEXT.md §14.3`). The 5th digit AMFI publishes is
 *     always 0 in the observed data, so this is lossless in practice, but the
 *     rounding is stated rather than assumed.
 *   - `scheme_code` in `meta` is a JSON NUMBER while every scheme code in this
 *     repo is a string. Coerced once, here, so no caller has to remember.
 *
 * ---------------------------------------------------------------------------
 * DD-MM-YYYY IS DAY-FIRST. THIS IS THE BUG THIS FILE EXISTS TO PREVENT.
 * ---------------------------------------------------------------------------
 *
 * MFAPI dates are `DD-MM-YYYY`. AMFI's own `NAVAll.txt` is `DD-MMM-YYYY`
 * ("31-Dec-2025") — unambiguous, because the month is alphabetic. MFAPI's is
 * all-numeric and therefore ambiguous to a reader who does not check.
 *
 * Reading it as MM-DD-YYYY does not throw and does not look wrong. For the
 * first 12 days of every month it silently TRANSPOSES day and month —
 * "07-04-2013" becomes 4 July instead of 7 April — while every date with a
 * day > 12 parses correctly. The result is a NAV series in which ~40% of
 * points are on the right date and ~5% are scattered up to 11 months away,
 * with no gap, no duplicate and no exception to notice. Every return,
 * volatility and drawdown computed from it would be wrong by an amount that
 * looks like market noise.
 *
 * The measurement that settles it: across 3,375 real points for scheme 120465,
 * the FIRST field exceeds 12 on 2,039 of them and the SECOND field exceeds 12
 * on ZERO. A month-first reading would require the second field to exceed 12
 * sometimes; it never does. Day-first it is. `assertDayFirstOrdering` below
 * re-runs that same check on every payload at parse time so a silent format
 * flip at the source becomes a loud failure here instead of a wrong number
 * three layers downstream.
 *
 * ---------------------------------------------------------------------------
 * WHY POINTS ARE REJECTED RATHER THAN DROPPED OR THROWN
 * ---------------------------------------------------------------------------
 *
 * Live data contains genuinely invalid points. Scheme 120465 publishes
 * `{"date":"07-04-2013","nav":"0.00000"}` sitting between 11.98 and 11.97 —
 * a real zero in a real series from the real API today.
 *
 * Writing it would put a 0 in the middle of the NAV series, which reads as a
 * -100% day followed by a +infinity day: it destroys the volatility and
 * max-drawdown of every horizon that spans it, and `mfMetricsJob` has no way
 * to tell that number from a real crash. Throwing on it would abandon 3,374
 * good points because of one bad one. So each point is validated
 * independently, bad ones are returned as `NavPointFailure` with a reason the
 * job puts in the DLQ, and the good ones are ingested (`CONTEXT.md §3.5`).
 */

import { toDecimal, serializeMoney, type Money } from '@portfolioos/shared';

export const MFAPI_NAV_HISTORY_ADAPTER_ID = 'mfapi.navHistory';
export const MFAPI_NAV_HISTORY_ADAPTER_VERSION = '1';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type NavPointFailureReason =
  /** Not an object, or `date`/`nav` missing or not strings. */
  | 'malformed_point'
  /** Not `DD-MM-YYYY`, or not a real calendar day (31-02-2020). */
  | 'malformed_date'
  /** Present but not a plain decimal — "N.A.", "-", "1,234.5". */
  | 'malformed_nav'
  /**
   * Parsed fine but is <= 0. Kept as its own reason rather than folded into
   * `malformed_nav` because it is the one that occurs in real AMFI-sourced
   * data and its DLQ rows are expected, not a parser bug to chase.
   */
  | 'non_positive_nav'
  /** The same date appeared earlier in this payload. The FIRST wins. */
  | 'duplicate_date';

export interface NavPointFailure {
  /** 0-based index in the source `data` array, for the DLQ's `sourceRef`. */
  index: number;
  /** The offending element, JSON-stringified and truncated. Public data. */
  raw: string;
  reason: NavPointFailureReason;
  detail?: string;
}

export interface ParsedNavPoint {
  /** UTC midnight, so it round-trips through Postgres `@db.Date` unshifted. */
  date: Date;
  /** Money string at `MFNav.nav`'s `Decimal(18,4)`. Never a JS number. */
  nav: Money;
}

/** `meta`, normalised. Every field optional — MFAPI blanks them all on a miss. */
export interface ParsedNavHistoryMeta {
  /** Coerced to string; MFAPI sends a JSON number. `null` when 0/absent. */
  schemeCode: string | null;
  schemeName: string | null;
  fundHouse: string | null;
  schemeType: string | null;
  schemeCategory: string | null;
  isinGrowth: string | null;
  isinDivReinvestment: string | null;
}

export interface NavHistoryParseResult {
  meta: ParsedNavHistoryMeta;
  /** MFAPI's own `status` string, verbatim. Observed: "SUCCESS". */
  status: string | null;
  /** ASCENDING by date, deduplicated, every point valid and > 0. */
  points: ParsedNavPoint[];
  failures: NavPointFailure[];
  /**
   * Well-formed envelope carrying no usable history.
   *
   * This is MFAPI's "I do not have this scheme" — see the fetcher's header:
   * an unknown numeric scheme code returns 200 with a blank `meta` and an
   * empty `data`, NOT a 404. Callers must branch on this, because "the fetch
   * succeeded" and "we got history" are different questions here.
   */
  isEmpty: boolean;
  /**
   * Set when the day-first ordering check failed — i.e. some date's SECOND
   * field exceeded 12, which cannot happen in `DD-MM-YYYY`. Non-null means
   * the source format may have changed and the dates in `points` are not
   * trustworthy; the job refuses to write and DLQs the scheme.
   */
  dateFormatWarning: string | null;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** `DD-MM-YYYY`, zero-padded in the observed data; `\d{1,2}` is tolerated. */
const RE_MFAPI_DATE = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;

/**
 * Parse MFAPI's `DD-MM-YYYY` to UTC midnight. DAY FIRST — see the file header
 * for the measurement that proves it and for what a month-first reading does.
 *
 * Returns `null` rather than throwing so one bad date costs one point.
 */
export function parseMfapiDate(raw: string): Date | null {
  const m = RE_MFAPI_DATE.exec(raw.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;

  // Non-monetary integers: `Number.parseInt` is the form the no-money-coercion
  // lint rule permits. These are calendar components, never money.
  const day = Number.parseInt(dd ?? '', 10);
  const month = Number.parseInt(mm ?? '', 10);
  const year = Number.parseInt(yyyy ?? '', 10);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const d = new Date(Date.UTC(year, month - 1, day));
  // Rejects 31-02-2020 and friends, which `Date.UTC` silently rolls forward
  // into March rather than refusing.
  if (d.getUTCDate() !== day || d.getUTCMonth() !== month - 1 || d.getUTCFullYear() !== year) {
    return null;
  }
  return d;
}

/**
 * A plain decimal, optionally signed. Rejects "N.A.", "-", "1,234.50", "1e3".
 *
 * The leading `-` is accepted at the SYNTAX level so that a negative NAV is
 * classified as `non_positive_nav` (a value problem, which is what it is)
 * rather than `malformed_nav` (a format problem, which it is not). The DLQ
 * reason is what a human triages on, and "AMFI published a negative NAV" and
 * "AMFI published the string N.A." need different responses. It is still
 * rejected — just below, and with the right label. Matches
 * `amfiSchemeMaster.parse.ts`'s `RE_NAV` deliberately: two NAV parsers
 * disagreeing about what a NAV looks like is its own bug.
 */
const RE_NAV = /^-?\d+(\.\d+)?$/;

/**
 * Guard against the source silently switching to `MM-DD-YYYY`.
 *
 * In `DD-MM-YYYY` the second field is a month and can never exceed 12. If it
 * ever does, either the format flipped or the payload is corrupt — and in both
 * cases every date we just parsed is wrong in a way no downstream check would
 * catch (see the file header). Cheap linear scan over strings we already have.
 *
 * The converse is deliberately NOT asserted: a scheme with under ~two weeks of
 * history can legitimately have no date whose first field exceeds 12, so
 * "looks month-first" is not evidence of anything. Only the impossible
 * direction is treated as a failure.
 */
function assertDayFirstOrdering(rawDates: readonly string[]): string | null {
  for (const raw of rawDates) {
    const m = RE_MFAPI_DATE.exec(raw.trim());
    if (!m) continue;
    const second = Number.parseInt(m[2] ?? '', 10);
    if (Number.isFinite(second) && second > 12) {
      return (
        `date "${raw}" has ${second} in the month position; MFAPI is documented and ` +
        `measured as DD-MM-YYYY, so the source format may have changed. Refusing to ` +
        `trust any date in this payload.`
      );
    }
  }
  return null;
}

function nullIfBlank(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const t = x.trim();
  return t.length === 0 ? null : t;
}

/** Bounded so a hostile or broken payload cannot write a megabyte into the DLQ. */
function rawOf(value: unknown): string {
  let s: string;
  try {
    s = JSON.stringify(value) ?? String(value);
  } catch {
    // Circular or otherwise unserialisable. Not fatal — the DLQ only needs
    // something a human can look at — but never swallowed into nothing.
    s = `[unserialisable ${typeof value}]`;
  }
  return s.length > 300 ? `${s.slice(0, 300)}…` : s;
}

// ---------------------------------------------------------------------------
// meta
// ---------------------------------------------------------------------------

/**
 * MFAPI sends `scheme_code` as a JSON NUMBER while this repo keys schemes by
 * string everywhere (`MfSchemeMeta.schemeCode`, `MutualFundMaster.schemeCode`).
 * Normalised once here so no caller re-derives it and gets `"120465"` vs
 * `120465` wrong in a Map lookup.
 *
 * `0` becomes `null`: that is the value MFAPI puts in the blank `meta` of an
 * unknown-scheme response, and it is not a scheme code.
 */
function parseMeta(raw: unknown): ParsedNavHistoryMeta {
  const m = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  let schemeCode: string | null = null;
  const rawCode = m['scheme_code'];
  if (typeof rawCode === 'number' && Number.isFinite(rawCode) && rawCode > 0) {
    schemeCode = String(rawCode);
  } else if (typeof rawCode === 'string') {
    const t = rawCode.trim();
    if (t.length > 0 && t !== '0') schemeCode = t;
  }

  return {
    schemeCode,
    schemeName: nullIfBlank(m['scheme_name']),
    fundHouse: nullIfBlank(m['fund_house']),
    schemeType: nullIfBlank(m['scheme_type']),
    schemeCategory: nullIfBlank(m['scheme_category']),
    isinGrowth: nullIfBlank(m['isin_growth']),
    isinDivReinvestment: nullIfBlank(m['isin_div_reinvestment']),
  };
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

const EMPTY_META: ParsedNavHistoryMeta = {
  schemeCode: null,
  schemeName: null,
  fundHouse: null,
  schemeType: null,
  schemeCategory: null,
  isinGrowth: null,
  isinDivReinvestment: null,
};

/**
 * Parse one MFAPI scheme response.
 *
 * Takes `unknown` on purpose: the input is a decoded HTTP body from a
 * third-party service, so its shape is a claim rather than a fact, and typing
 * the parameter as the happy shape would push the narrowing onto every caller.
 * Never throws — a payload that is not even an object comes back as
 * `isEmpty: true` with one `malformed_point` failure.
 */
export function parseMfapiNavHistory(payload: unknown): NavHistoryParseResult {
  const failures: NavPointFailure[] = [];

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return {
      meta: EMPTY_META,
      status: null,
      points: [],
      failures: [
        {
          index: -1,
          raw: rawOf(payload),
          reason: 'malformed_point',
          detail: `expected a JSON object envelope, got ${Array.isArray(payload) ? 'array' : typeof payload}`,
        },
      ],
      isEmpty: true,
      dateFormatWarning: null,
    };
  }

  const envelope = payload as Record<string, unknown>;
  const meta = parseMeta(envelope['meta']);
  const status = nullIfBlank(envelope['status']);
  const rawData = envelope['data'];

  if (!Array.isArray(rawData)) {
    // `data` absent entirely is a different failure from `data: []` — the
    // latter is MFAPI's normal "unknown scheme", the former is a shape change.
    return {
      meta,
      status,
      points: [],
      failures: [
        {
          index: -1,
          raw: rawOf(rawData),
          reason: 'malformed_point',
          detail: `"data" is ${rawData === undefined ? 'absent' : typeof rawData}, expected an array`,
        },
      ],
      isEmpty: true,
      dateFormatWarning: null,
    };
  }

  // Collect the raw date strings first so the format guard runs over the whole
  // payload BEFORE any date is trusted, rather than per-point where a flip
  // would already have produced wrong `Date`s by the time it was noticed.
  const rawDates: string[] = [];
  for (const item of rawData) {
    if (typeof item === 'object' && item !== null) {
      const d = (item as Record<string, unknown>)['date'];
      if (typeof d === 'string') rawDates.push(d);
    }
  }
  const dateFormatWarning = assertDayFirstOrdering(rawDates);

  /** Keyed by epoch-ms of UTC midnight so duplicates collide exactly. */
  const byDate = new Map<number, ParsedNavPoint>();

  for (let i = 0; i < rawData.length; i += 1) {
    const item = rawData[i];

    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      failures.push({
        index: i,
        raw: rawOf(item),
        reason: 'malformed_point',
        detail: `expected an object, got ${Array.isArray(item) ? 'array' : typeof item}`,
      });
      continue;
    }

    const point = item as Record<string, unknown>;
    const rawDate = point['date'];
    const rawNav = point['nav'];

    if (typeof rawDate !== 'string' || typeof rawNav !== 'string') {
      // Both are strings in every observed response. A number here would still
      // "work" via coercion, and that is exactly why it is refused: a JSON
      // number NAV has already been through IEEE-754 before we ever see it
      // (`CONTEXT.md §3.1`), so accepting one would launder a rounded value
      // into a Decimal column and look perfectly fine.
      failures.push({
        index: i,
        raw: rawOf(item),
        reason: 'malformed_point',
        detail:
          `expected string "date" and string "nav", got ` +
          `date=${typeof rawDate}, nav=${typeof rawNav}`,
      });
      continue;
    }

    const date = parseMfapiDate(rawDate);
    if (date === null) {
      failures.push({
        index: i,
        raw: rawOf(item),
        reason: 'malformed_date',
        detail: `"${rawDate}" is not a valid DD-MM-YYYY calendar date`,
      });
      continue;
    }

    const navText = rawNav.trim();
    if (!RE_NAV.test(navText)) {
      failures.push({
        index: i,
        raw: rawOf(item),
        reason: 'malformed_nav',
        detail: `"${rawNav}" is not a plain decimal`,
      });
      continue;
    }

    // Money never touches `Number`. `toDecimal` parses the string exactly and
    // `serializeMoney` fixes it at the `Decimal(18,4)` of `MFNav.nav`.
    const navDecimal = toDecimal(navText);
    if (!navDecimal.isFinite() || navDecimal.lte(0)) {
      // The real one: scheme 120465 publishes "0.00000" for 07-04-2013. See
      // the file header for why this must never reach the series.
      failures.push({
        index: i,
        raw: rawOf(item),
        reason: 'non_positive_nav',
        detail: `NAV ${navText} is not > 0`,
      });
      continue;
    }

    const key = date.getTime();
    if (byDate.has(key)) {
      // FIRST occurrence wins. MFAPI returns newest-first, so the first
      // occurrence is the later-published value for that date — the one AMFI
      // most recently stood behind. Picking deterministically matters more
      // than which side is picked: `MFNav` is unique on `(fundId, date)`, so
      // an order-dependent choice would make a re-ingest able to change a
      // stored NAV for no reason.
      failures.push({
        index: i,
        raw: rawOf(item),
        reason: 'duplicate_date',
        detail: `${rawDate} already seen earlier in this payload; keeping the first`,
      });
      continue;
    }

    byDate.set(key, { date, nav: serializeMoney(navDecimal) });
  }

  // Ascending. MFAPI ships newest-first today; every consumer in this repo
  // (adjustedNav reconstruction, quarantine's day-over-day jump test, the
  // metrics windows) reads a chronological series, and re-sorting here means
  // none of them carries a dependency on the API's ordering.
  const points = Array.from(byDate.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    meta,
    status,
    points,
    failures,
    isEmpty: points.length === 0,
    dateFormatWarning,
  };
}
