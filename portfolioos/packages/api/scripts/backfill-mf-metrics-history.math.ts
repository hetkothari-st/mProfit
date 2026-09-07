/**
 * Pure half of the historical `MfSchemeMetrics` backfill.
 *
 * No Prisma, no clock, no process.env — the same pure/shell split
 * `mf-backtest.ts` / `mf-backtest.math.ts` uses, and for the same reason: the
 * two decisions in here (which month-ends get written, and which schemes count
 * as alive at each) are the ones that silently bias the backtest if they are
 * wrong, so they must be checkable without standing a database up.
 *
 * The reasoning behind each rule lives in `backfill-mf-metrics-history.ts`'s
 * header; only the mechanics are here.
 */

import type { MfSchemeStatus } from '@prisma/client';

/**
 * The last calendar day of `monthIndex`, at UTC midnight.
 *
 * ⚠ MUST stay byte-identical to `monthEnd` in `scripts/mf-backtest.ts`, which
 * exports nothing and so cannot be imported. The backtest selects metric rows
 * with `asOf > t − 10 days AND asOf <= t` for exactly this `t`; a month-end
 * that drifts by a day in the wrong direction puts this script's rows OUTSIDE
 * that window, and the backtest then sees an empty cross-section for that
 * month without erroring. `test/scripts/backfillMfMetricsHistory.test.ts`
 * re-derives the backtest's expression by hand and asserts agreement across
 * the whole window, because a comment cannot hold two files together.
 *
 * Day 0 of the next month is the last day of this one. `Date.UTC` normalises a
 * `monthIndex` of -1 or 12, which `main` relies on when it derives "the last
 * completed month" in January.
 */
export function monthEnd(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex + 1, 0));
}

/** Every month-end in `[from, to]`, ascending. Empty for an inverted range. */
export function monthEndsBetween(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  for (;;) {
    const end = monthEnd(y, m);
    if (end.getTime() > to.getTime()) break;
    if (end.getTime() >= from.getTime()) out.push(end);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

/**
 * Status at `asOf`, reconstructed from today's `status` + `statusChangedAt`.
 *
 * Mirrors `mf-backtest.ts`'s `statusAsOf`. An ACTIVE scheme was always alive.
 * A dead one was alive before its `statusChangedAt`. A dead one with NO
 * `statusChangedAt` has an unknown death date and resolves to ALIVE — erring
 * toward inclusion, because the exclusion direction is the biased one:
 * including a fund slightly past its death adds noise, whereas excluding it
 * removes a known-bad outcome and inflates the backtest.
 *
 * Deliberately does NOT consult `inceptionDate`. That column is create-only
 * and is stamped with "today" on any database whose metadata job ran before
 * its NAV backfill (measured: 134 of 148 schemes stamped 2026 for funds with
 * real NAV back to 2013). The arrow of time is enforced by the caller's
 * `firstNavDate <= asOf` test instead, which is derived from `MFNav` itself
 * and cannot drift.
 */
export function wasAliveAt(
  scheme: { status: MfSchemeStatus; statusChangedAt: Date | null },
  asOf: Date,
): boolean {
  if (scheme.status === 'ACTIVE') return true;
  if (scheme.statusChangedAt === null) return true;
  return scheme.statusChangedAt.getTime() > asOf.getTime();
}
