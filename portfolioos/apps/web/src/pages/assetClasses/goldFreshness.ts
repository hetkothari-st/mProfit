import { formatDateIST, priceFreshness } from '@everypaisa/shared';

/**
 * "Live" only while the quote is fresh and the server says it is a live quote;
 * otherwise the age and the time it was last updated (launch review B9).
 */
export function goldFreshnessLabel(fetchedAt: string, source: string | undefined, now: Date): { live: boolean; text: string } {
  const f = priceFreshness(fetchedAt, now, { source });
  if (f.live) return { live: true, text: `Live · updated ${f.ageLabel}` };
  const at = new Date(fetchedAt);
  if (!Number.isFinite(at.getTime()) || at.getTime() <= 0) return { live: false, text: 'Price not updated yet' };
  const time = at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  return { live: false, text: `Last price · ${formatDateIST(fetchedAt)} ${time} (${f.ageLabel})` };
}
