const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written YYYY-MM-DD (rejects 2026-02-31, 2026-13-01). Never throws, never reads the clock. */
export function isRealIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_DATE_RE.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  const t = new Date(Date.UTC(y, m - 1, d));
  // Date.UTC maps years 0-99 to 1900-1999, so setUTCFullYear restores the literal year before the round trip.
  t.setUTCFullYear(y);
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
