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
  /**
   * Apply the weekend rule to this fund. **Default false.**
   *
   * Only pass `true` for a fund that does NOT accrue value every calendar day.
   * Liquid, overnight, money-market and ultra-short funds legitimately publish
   * a moved NAV on a Saturday and Sunday, and flagging those is what put 2,858
   * Sunday rows into quarantine on the first real-data run. The caller knows
   * the SEBI sub-category; this module does not.
   */
  applyWeekendRule?: boolean;
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

/**
 * True when the NEXT usable NAV agrees with `nav` to within `threshold` --
 * i.e. the series has stepped to a new level and stayed there.
 *
 * Skips forward over unparseable rows so a single bad point between the shift
 * and its confirmation does not make a real rebasing look like a spike. The
 * last row in a series has nothing to confirm it, so it is treated as a spike:
 * that is the conservative direction, and the next day's file resolves it.
 */
function isSustainedShift(
  sorted: readonly NavPointInput[],
  index: number,
  nav: Decimal,
  threshold: Decimal,
): boolean {
  for (let j = index + 1; j < sorted.length; j += 1) {
    const next = coerceNav(sorted[j]!.nav);
    if (next.nav === null) continue;
    return next.nav.minus(nav).abs().div(nav).lte(threshold);
  }
  return false;
}

export function quarantineNavSeries<T extends NavPointInput>(
  rows: readonly T[],
  options: NavQuarantineOptions = {},
): NavQuarantineResult<T> {
  const threshold = options.jumpThreshold ?? DEFAULT_NAV_JUMP_THRESHOLD;
  const actionDays = new Set<number>((options.knownActionDates ?? []).map(utcDayKey));
  const applyWeekendRule = options.applyWeekendRule ?? false;

  // Copy before sorting: mutating a caller's array is a nasty action-at-a-distance
  // bug when the same rows are also used to build the adjusted-NAV series.
  const sorted = [...rows].sort((a, b) => utcDayKey(a.date) - utcDayKey(b.date));

  const clean: T[] = [];
  const quarantined: QuarantinedNavRow<T>[] = [];

  let prevCleanNav: Decimal | null = null;
  let prevCleanDayKey: number | null = null;

  for (let i = 0; i < sorted.length; i += 1) {
    const row = sorted[i]!;
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
        /**
         * A jump the following NAV agrees with is a LEVEL SHIFT, not a spike.
         *
         * Anchoring on the last clean row is right for a transient spike
         * (100 -> 200 -> 100 quarantines only the 200) but catastrophic for a
         * permanent rebasing. ABSL Overnight Fund really does go 10.0034 ->
         * 1000.6884 on a face-value change: the shifted row is quarantined, so
         * it never becomes the baseline, so all 2,511 rows after it are still
         * measured against 10.0034 and every one is quarantined too. On the
         * first real-data run that cost 100% of two funds and contributed to
         * 107 of 148 schemes carrying a QUARANTINED metrics row.
         *
         * One row of lookahead separates the two cases: if the NEXT published
         * NAV sits within the threshold of this one, the series has moved and
         * stayed moved, so this row is the new truth rather than an outlier.
         * A spike fails that test, because the next row returns to the old
         * level and is therefore far from the spike.
         */
        const sustained = !explained && isSustainedShift(sorted, i, nav, threshold);
        if (!explained && !sustained) {
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

      /**
       * Weekend rule -- OPT-IN, and off by default.
       *
       * `01 §6` says to quarantine a weekend NAV whose value differs from the
       * previous one. Real data says that rule cannot be applied blind: it
       * fired on 3,432 rows, 2,858 of them Sundays, concentrated in exactly
       * the liquid and overnight funds that accrue interest every calendar day
       * and therefore SHOULD move on a Sunday. The rule's own comment said as
       * much and then flagged them anyway -- the code and its justification
       * disagreed.
       *
       * A weekend NAV that moved is normal for a daily-accrual fund; one that
       * did not move is a harmless stale republish. Neither is evidence of a
       * problem without knowing the fund's type, so the caller -- which knows
       * the SEBI sub-category -- decides. Default off, because this module's
       * own governing principle (see `isNonBusinessDay`) is that a false
       * quarantine is strictly worse than a missed one: a missed one leaves a
       * mildly suspect row, a false one punches a hole in the series and can
       * push a whole horizon to INSUFFICIENT_DATA.
       */
      if (applyWeekendRule && isNonBusinessDay(row.date) && !nav.eq(prevCleanNav)) {
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
