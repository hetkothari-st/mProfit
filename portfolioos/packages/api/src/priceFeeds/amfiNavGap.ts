/**
 * Where the NAV history stops and starts again.
 *
 * Pure, and separate from the backfill script, because "when did the feed go
 * quiet" is a question worth being able to answer — and test — without a
 * database connection or a network call.
 */

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface DayCount {
  date: Date;
  funds: number;
}

export interface GapReport {
  /** First date the sync stopped importing a normal number of rows. */
  start: Date | null;
  /** Last such date. */
  end: Date | null;
  /** Typical healthy day, used as the yardstick. */
  healthyDailyFunds: number;
  /** Days inside the window with no MFNav rows at all. */
  emptyDays: number;
  /** Days inside the window that have some rows, but far too few. */
  thinDays: number;
  /** What the detector used to decide. */
  basis: string;
}

/**
 * A day is "quiet" when it holds less than a fifth of what a healthy day
 * holds. That is the same 20% proportion the live feed canary uses, applied
 * backwards over history rather than forwards over one run.
 */
const QUIET_FRACTION = 0.2;

export function findNavGap(days: DayCount[]): GapReport {
  const empty: GapReport = {
    start: null,
    end: null,
    healthyDailyFunds: 0,
    emptyDays: 0,
    thinDays: 0,
    basis: 'no MFNav rows at all',
  };
  if (days.length === 0) return empty;

  const sorted = [...days].sort((a, b) => a.date.getTime() - b.date.getTime());
  // The yardstick is the best day we have ever seen, not the mean: the mean is
  // dragged down by exactly the outage we are looking for.
  const healthy = Math.max(...sorted.map((d) => d.funds));
  if (healthy === 0) return empty;
  const floor = healthy * QUIET_FRACTION;

  const byDate = new Map(sorted.map((d) => [iso(d.date), d.funds]));

  // A gap is bounded on BOTH sides by a day the sync demonstrably worked.
  // Without the left-hand bound the walk runs off the start of the table and
  // reports "the gap began in 2008" on any database whose early history was
  // seeded rather than synced — which is true of every one of ours.
  const healthyDays = sorted.filter((d) => d.funds >= floor).map((d) => d.date);
  if (healthyDays.length < 2) {
    return {
      ...empty,
      healthyDailyFunds: healthy,
      basis:
        `only ${healthyDays.length} day on record carries a full NAV set ` +
        `(~${healthy} funds), so a gap cannot be bounded — pass --from/--to`,
    };
  }

  const lastHealthy = healthyDays[healthyDays.length - 1]!;
  const previousHealthy = healthyDays[healthyDays.length - 2]!;

  let start: Date | null = null;
  let end: Date | null = null;
  let emptyDays = 0;
  let thinDays = 0;

  for (
    let d = new Date(previousHealthy.getTime() + DAY);
    d < lastHealthy;
    d = new Date(d.getTime() + DAY)
  ) {
    // Weekends have no NAV and never did — an empty Sunday is not an outage.
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const count = byDate.get(iso(d)) ?? 0;
    if (weekend && count === 0) continue;
    if (start === null) start = d;
    end = d;
    if (count === 0) emptyDays++;
    else thinDays++;
  }

  if (start === null || end === null) {
    return {
      ...empty,
      healthyDailyFunds: healthy,
      basis: `consecutive healthy days ${iso(previousHealthy)} and ${iso(lastHealthy)} — no gap`,
    };
  }

  return {
    start,
    end,
    healthyDailyFunds: healthy,
    emptyDays,
    thinDays,
    basis:
      `a healthy day carries ~${healthy} funds; the sync last managed that on ` +
      `${iso(previousHealthy)} and not again until ${iso(lastHealthy)}`,
  };
}

/** Calendar-month slices of [from, to]; AMFI serves ~24 MB per month. */
export function monthWindows(from: Date, to: Date): Array<{ from: Date; to: Date }> {
  const out: Array<{ from: Date; to: Date }> = [];
  let cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (cur <= to) {
    const monthEnd = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0));
    const sliceEnd = monthEnd < to ? monthEnd : to;
    out.push({ from: cur, to: sliceEnd });
    cur = new Date(sliceEnd.getTime() + DAY);
  }
  return out;
}
