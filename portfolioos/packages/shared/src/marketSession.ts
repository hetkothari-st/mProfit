/**
 * When an Indian exchange price is out of date, judged by trading sessions
 * rather than by hours (launch review follow-up). A Friday close read on
 * Sunday is the latest price there is, not a stale one; the same price read on
 * Tuesday evening is two sessions behind.
 *
 * Sessions are NSE weekdays. The holiday calendar is not modelled, so one
 * missed session is allowed before a price counts as stale — a single market
 * holiday never flags a correct price.
 */

/** NSE closes at 15:30 IST; the end-of-day price job runs at 16:30 IST. */
export const EQUITY_CLOSE_AVAILABLE_IST = { hour: 16, minute: 30 } as const;
/** Mutual-fund NAVs for a day are published by AMFI late that evening; the NAV job runs at 22:00 IST. */
export const NAV_AVAILABLE_IST = { hour: 22, minute: 0 } as const;
/** Sessions a price may lag before it is stale: one, for an unmodelled holiday. */
export const SESSION_SLACK = 1;

const IST_OFFSET_MS = 5.5 * 3_600_000;
const DAY_MS = 86_400_000;

/** The IST calendar date (YYYY-MM-DD, as a UTC-midnight Date) and minutes past midnight. */
function istParts(now: Date): { day: Date; minutes: number } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const day = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
  return { day, minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
}

const isWeekday = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;

function previousSession(d: Date): Date {
  let x = new Date(d.getTime() - DAY_MS);
  while (!isWeekday(x)) x = new Date(x.getTime() - DAY_MS);
  return x;
}

/**
 * The latest session whose price should exist by `now`: today once the
 * day's price is published, otherwise the session before.
 */
export function latestExpectedSession(now: Date, availableAt: { hour: number; minute: number }): Date {
  const { day, minutes } = istParts(now);
  if (isWeekday(day) && minutes >= availableAt.hour * 60 + availableAt.minute) return day;
  return previousSession(day);
}

/** Weekday sessions strictly after `from` up to and including `to`. */
function sessionsBetween(from: Date, to: Date): number {
  let n = 0;
  for (let x = new Date(from.getTime() + DAY_MS); x.getTime() <= to.getTime(); x = new Date(x.getTime() + DAY_MS)) {
    if (isWeekday(x)) n++;
  }
  return n;
}

/**
 * True when a price for trading day `asOf` is more than SESSION_SLACK sessions
 * behind the latest session that should have a price by `now`.
 */
export function isSessionPriceStale(
  asOf: Date,
  now: Date,
  availableAt: { hour: number; minute: number } = EQUITY_CLOSE_AVAILABLE_IST,
): boolean {
  const asOfDay = istParts(asOf).day;
  const expected = latestExpectedSession(now, availableAt);
  if (asOfDay.getTime() >= expected.getTime()) return false;
  return sessionsBetween(asOfDay, expected) > SESSION_SLACK;
}
