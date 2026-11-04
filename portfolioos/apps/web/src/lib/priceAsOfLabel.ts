import { formatDistanceToNow } from 'date-fns';

import { formatDateIST, formatDateTimeIST, istCalendarDate } from '@everypaisa/shared';

/**
 * What the as-of stamp should say. Most price feeds store one row per trading
 * day — the intraday price overwrites that day's close — so their as-of is a
 * calendar date at UTC midnight, not a moment. Reading it as a moment printed
 * "as of about 9 hours ago" beside a price fetched minutes earlier. A date
 * reads as a date; a real timestamp (crypto, FX) keeps its relative time.
 */
export function priceAsOfLabel(asOf: string, now: Date = new Date()): { text: string; title: string } {
  const d = new Date(asOf);
  const dateOnly =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  if (dateOnly) {
    const day = asOf.slice(0, 10);
    const today = istCalendarDate(now);
    const text = day === today ? "today's price" : `price of ${formatDateIST(day)}`;
    return { text, title: `Price for trading day ${formatDateIST(day)}` };
  }
  return {
    text: `as of ${formatDistanceToNow(d, { addSuffix: true })}`,
    title: `Price as of ${formatDateTimeIST(asOf)}`,
  };
}
