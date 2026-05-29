/**
 * XIRR annualizes a return. Over a very short holding window a small absolute
 * move explodes into an absurd annualized rate (a -6% move over ~3 weeks →
 * a -78% "XIRR"). We surface a reliability flag so the UI can show the
 * absolute return instead until enough history exists.
 */
export const MIN_XIRR_DAYS = 90;

export function spanDays(dates: Date[]): number {
  if (dates.length < 2) return 0;
  let min = dates[0]!.getTime();
  let max = min;
  for (const dt of dates) {
    const t = dt.getTime();
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return Math.round((max - min) / (24 * 60 * 60 * 1000));
}

export function isXirrReliable(span: number): boolean {
  return span >= MIN_XIRR_DAYS;
}
