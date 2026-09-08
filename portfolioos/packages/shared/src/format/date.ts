const IST_LOCALE = 'en-IN';
const IST_TZ = 'Asia/Kolkata';

export function formatDateIST(
  input: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
): string {
  if (!input) return '-';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat(IST_LOCALE, { ...opts, timeZone: IST_TZ }).format(d);
}

export function formatDateTimeIST(input: string | Date | null | undefined): string {
  return formatDateIST(input, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toISODateString(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return d.toISOString().slice(0, 10);
}

export function financialYearOf(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = d.getMonth();
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
export function financialYearRange(fy: string): { from: string; to: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(fy.trim());
  if (!match) {
    throw new Error(`Invalid financial year "${fy}" — expected the form 2025-26`);
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
