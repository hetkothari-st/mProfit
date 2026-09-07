/**
 * NAV ingest validation — `docs/mf-analytics/01-DATA-FOUNDATION.md §6`.
 *
 * Pure functions. No Prisma, no network, no clock. The job half
 * (`jobs/mfNavAdjustmentJob.ts`) loads rows, calls in here, and persists the
 * verdict onto `MFNav.isQuarantined` / `MFNav.quarantineReason`.
 *
 * WHY quarantine instead of delete: a bad NAV that is dropped closes the gap
 * silently — the series looks continuous and every return, drawdown and
 * volatility number computed from it is quietly wrong. A row that is kept but
 * flagged makes the hole visible to the metrics layer (which filters it out and
 * degrades the horizon to INSUFFICIENT_DATA) and leaves the row available to be
 * un-quarantined when AMFI publishes a correction.
 *
 * These functions NEVER throw and NEVER drop a row. Every input row comes back
 * in exactly one of `clean` or `quarantined`; `clean.length +
 * quarantined.length === rows.length` is asserted by the tests.
 */

import { Decimal } from 'decimal.js';

/** The `quarantineReason` values written to `MFNav`. Stable strings — they are persisted. */
export type NavQuarantineReason =
  /** NAV missing, unparseable, or <= 0 (`01 §6`: "NAV <= 0 or missing"). */
  | 'nav_nonpositive'
  /** Day-over-day move > 20% with no corporate action / IDCW record to explain it. */
  | 'nav_jump'
  /** A weekend-dated NAV whose value differs from the previous published one. */
  | 'nav_weekend_anomaly';

/**
 * The minimum shape this module needs. Callers pass their own richer row type
 * (Prisma `MFNav`, a parsed AMFI row, …) and get the same objects back, so no
 * identity is lost on the way through.
 *
 * `nav` is deliberately `unknown`-ish (`Decimal | string | number | null`)
 * because the whole point of the `nav_nonpositive` rule is to catch values that
 * did not survive parsing. Converting here rather than at the call site means a
 * malformed value produces a quarantine verdict instead of a thrown error that
 * would take down the whole fund's batch.
 */
export interface NavPointInput {
  date: Date;
  nav: Decimal | string | number | null | undefined | { toString(): string };
}

export interface QuarantinedNavRow<T> {
  row: T;
  reason: NavQuarantineReason;
  /** Human-readable evidence, persisted into the `IngestionFailure` message. */
  detail: string;
}

export interface NavQuarantineResult<T> {
  /** Rows that passed every rule, in ascending date order. */
  clean: T[];
  /** Rows that failed a rule, in ascending date order. */
  quarantined: QuarantinedNavRow<T>[];
}

export interface NavQuarantineOptions {
  /**
   * Dates on which a NAV discontinuity is legitimately explained — a scheme
   * merger/split recorded in `CorporateAction`, or an IDCW ex-date. A jump
   * landing on (or just after) one of these is NOT quarantined.
   *
   * Passed in rather than queried so this module stays pure and so the caller
   * decides how wide to cast the net (we currently feed it users' recorded
   * DIVIDEND_PAYOUT / DIVIDEND_REINVEST transaction dates for the fund).
   */
  knownActionDates?: readonly Date[];
  /** Fractional day-over-day move above which a jump is suspicious. `01 §6` says 20%. */
  jumpThreshold?: Decimal;
}

/** `01 §6`: "day-over-day change > 20%". */
export const DEFAULT_NAV_JUMP_THRESHOLD = new Decimal('0.20');

/**
 * Normalise any Date to the UTC-midnight epoch ms of its calendar day.
 *
 * `MFNav.date` is `@db.Date` so Prisma already hands back UTC midnight, but
 * callers building fixtures or reading a parsed feed may not, and a stray
 * time-of-day would silently break every date-set lookup below.
 */
export function utcDayKey(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Saturday or Sunday in UTC.
 *
 * DELIBERATELY WEEKEND-ONLY. `01 §6` says "weekend/holiday", but this repo has
 * no Indian market holiday calendar, and guessing one (Diwali moves every year,
 * Muhurat trading adds a session on a day the exchange is otherwise shut, RBI
 * and AMFI holiday lists differ) would quarantine perfectly good NAVs. A false
 * quarantine is strictly worse than a missed one here: a missed one leaves a
 * mildly suspect row in the series, a false one punches a hole in it and can
 * push a whole horizon to INSUFFICIENT_DATA. So we check only the two days that
 * are unambiguous everywhere and never need a calendar. If a real holiday
 * calendar is ever seeded, widen `isNonBusinessDay` — nothing else changes.
 */
export function isNonBusinessDay(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Coerce a raw NAV into a strictly-positive Decimal, or `null` with a reason.
 *
 * Not using `toDecimal()` from `@portfolioos/shared` directly at the call site
 * because it throws on null/garbage by design, and this module's contract is
 * that garbage becomes a quarantine verdict rather than an exception.
 */
function coerceNav(raw: NavPointInput['nav']): { nav: Decimal } | { nav: null; detail: string } {
  if (raw === null || raw === undefined) {
    return { nav: null, detail: 'NAV is missing (null)' };
  }
  let d: Decimal;
  try {
    d = raw instanceof Decimal ? raw : new Decimal(String(raw));
  } catch {
    // Not a silent catch: the failure is returned as a typed verdict that the
    // caller turns into a quarantine row plus an IngestionFailure (§3.5).
    return { nav: null, detail: `NAV is unparseable (${String(raw)})` };
  }
  if (!d.isFinite()) return { nav: null, detail: `NAV is not finite (${d.toString()})` };
  if (d.lte(0)) return { nav: null, detail: `NAV is <= 0 (${d.toString()})` };
  return { nav: d };
}

/**
 * Apply the `01 §6` NAV rules to one fund's series.
 *
 * Rule order per row is nonpositive -> jump -> weekend, and the FIRST match
 * wins. A 25% move that also lands on a Saturday is reported as `nav_jump`
 * because that is the more actionable diagnosis; the weekend rule exists to
 * catch stale-value republishing, not price moves.
 *
 * The comparison baseline is the last CLEAN row, not the last row. Otherwise a
 * single bad spike (100 -> 200 -> 100) is quarantined twice: once going up and
 * once coming back down. Anchoring on the last trusted value quarantines only
 * the spike itself.
 */
export function quarantineNavSeries<T extends NavPointInput>(
  rows: readonly T[],
  options: NavQuarantineOptions = {},
): NavQuarantineResult<T> {
  const threshold = options.jumpThreshold ?? DEFAULT_NAV_JUMP_THRESHOLD;
  const actionDays = new Set<number>((options.knownActionDates ?? []).map(utcDayKey));

  // Copy before sorting: mutating a caller's array is a nasty action-at-a-distance
  // bug when the same rows are also used to build the adjusted-NAV series.
  const sorted = [...rows].sort((a, b) => utcDayKey(a.date) - utcDayKey(b.date));

  const clean: T[] = [];
  const quarantined: QuarantinedNavRow<T>[] = [];

  let prevCleanNav: Decimal | null = null;
  let prevCleanDayKey: number | null = null;

  for (const row of sorted) {
    const coerced = coerceNav(row.nav);
    if (coerced.nav === null) {
      quarantined.push({ row, reason: 'nav_nonpositive', detail: coerced.detail });
      continue;
    }
    const nav = coerced.nav;
    const dayKey = utcDayKey(row.date);

    if (prevCleanNav !== null && prevCleanDayKey !== null) {
      const move = nav.minus(prevCleanNav).abs().div(prevCleanNav);
      if (move.gt(threshold)) {
        // A corporate action or IDCW ex-date anywhere in the (exclusive, inclusive]
        // window since the last clean observation explains the move. The window
        // is open at the start because a distribution on the PREVIOUS day was
        // already reflected in that day's NAV.
        const explained = hasActionInWindow(actionDays, prevCleanDayKey, dayKey);
        if (!explained) {
          quarantined.push({
            row,
            reason: 'nav_jump',
            detail:
              `NAV moved ${move.times(100).toFixed(2)}% from ${prevCleanNav.toString()} ` +
              `to ${nav.toString()} with no corporate action or IDCW record in the window`,
          });
          continue;
        }
      }

      // Weekend rule: AMFI publishes on non-business days for some scheme types
      // (liquid/overnight funds accrue daily and legitimately move on a Sunday),
      // so a weekend row is only anomalous when it REPEATS a value it should not
      // have, i.e. differs from the last published NAV. Equality means a stale
      // republish, which is harmless and stays clean.
      if (isNonBusinessDay(row.date) && !nav.eq(prevCleanNav)) {
        quarantined.push({
          row,
          reason: 'nav_weekend_anomaly',
          detail:
            `NAV dated ${row.date.toISOString().slice(0, 10)} falls on a weekend and ` +
            `differs from the previous published NAV (${prevCleanNav.toString()} -> ${nav.toString()})`,
        });
        continue;
      }
    }

    clean.push(row);
    prevCleanNav = nav;
    prevCleanDayKey = dayKey;
  }

  return { clean, quarantined };
}

/** Any known action date in `(afterExclusive, upToInclusive]`. */
function hasActionInWindow(
  actionDays: ReadonlySet<number>,
  afterExclusive: number,
  upToInclusive: number,
): boolean {
  if (actionDays.size === 0) return false;
  for (const day of actionDays) {
    if (day > afterExclusive && day <= upToInclusive) return true;
  }
  return false;
}
