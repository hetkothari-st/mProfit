import { EmiError } from './emi.types.js';

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Add calendar months to a 'YYYY-MM-DD' date without any timezone. The day
 * is clamped to the target month's length, always from the ORIGINAL day, so
 * a 31st schedule goes 31 Jan -> 28 Feb -> 31 Mar rather than sticking at 28.
 */
export function addMonthsIso(iso: string, months: number): string {
  const m = ISO.exec(iso);
  if (!m) throw new EmiError('INVALID_INPUT', 'Invalid date, expected YYYY-MM-DD', 'firstEmiDate');
  const y = Number(m[1]);
  const mo0 = Number(m[2]) - 1 + months;
  const day = Number(m[3]);
  const year = y + Math.floor(mo0 / 12);
  const month0 = ((mo0 % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** Indian financial year label for a 'YYYY-MM-DD' date, e.g. '2026-27'. */
export function indianFy(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const mo = Number(iso.slice(5, 7));
  const start = mo >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
