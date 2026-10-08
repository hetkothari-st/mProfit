const IST_LOCALE = 'en-IN';
const IST_TZ = 'Asia/Kolkata';

const DEFAULT_DATE_OPTS: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };

/**
 * Display a date as dd/mm/yyyy (Indian calendar date). Callers may pass
 * explicit `opts` for other shapes (month-year labels, weekday, etc.).
 */
export function formatDateIST(
  input: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTS,
): string {
  if (!input) return '-';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat(IST_LOCALE, { ...opts, timeZone: IST_TZ }).format(d);
}

/** dd/mm/yyyy, hh:mm am/pm in Asia/Kolkata. */
export function formatDateTimeIST(input: string | Date | null | undefined): string {
  if (!input) return '-';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '-';
  const parts = new Intl.DateTimeFormat(IST_LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: IST_TZ,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')}, ${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase()}`;
}

/**
 * Format a calendar-date string ("YYYY-MM-DD", optionally followed by a time
 * part which is ignored) as dd/mm/yyyy without any timezone shift.
 */
export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '-';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function toISODateString(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return d.toISOString().slice(0, 10);
}

const IST_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * The calendar date in India (YYYY-MM-DD) for an instant. Date-only values
 * stored as UTC midnight map to the same date; a timestamp late in the UTC day
 * maps to the next Indian date, as an Indian user would read it — regardless
 * of the server's own time zone.
 */
export function istCalendarDate(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return IST_DATE.format(d);
}

/** Whole calendar days between two instants, counted on Indian dates. */
export function calendarDaysBetweenIST(from: Date | string, to: Date | string): number {
  const a = Date.parse(`${istCalendarDate(from)}T00:00:00Z`);
  const b = Date.parse(`${istCalendarDate(to)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function financialYearOf(date: Date | string): string {
  // Indian financial year of the Indian calendar date, independent of server time zone.
  const [y, m] = istCalendarDate(date).split('-');
  const year = Number.parseInt(y!, 10);
  const month = Number.parseInt(m!, 10) - 1;
  if (month >= 3) {
    return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
  }
  return `${year - 1}-${String(year % 100).padStart(2, '0')}`;
}

/**
 * The inverse of `financialYearOf`: "2025-26" → 1 Apr 2025 to 31 Mar 2026.
 *
 * Reports take whichever of fy, from/to or asOf they were written for, so
 * anything assembling a whole year has to translate between the three. Doing
 * that in one place means a bundle and a single report can never disagree
 * about where a year starts.
 */
/** True for a financial year written as consecutive years, e.g. "2025-26". */
export function isValidFinancialYear(fy: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(fy.trim());
  if (!match) return false;
  return Number.parseInt(match[2]!, 10) === (Number.parseInt(match[1]!, 10) + 1) % 100;
}

export function financialYearRange(fy: string): { from: string; to: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(fy.trim());
  if (!match || !isValidFinancialYear(fy)) {
    throw new Error(`Invalid financial year "${fy}" — expected the form 2025-26 (consecutive years)`);
  }
  const startYear = Number.parseInt(match[1]!, 10);
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

export function daysBetween(from: Date | string, to: Date | string): number {
  const a = typeof from === 'string' ? new Date(from) : from;
  const b = typeof to === 'string' ? new Date(to) : to;
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
