/**
 * Reading and showing dates for the app's date field (components/ui/date-input).
 *
 * The browser's own date box draws itself from the browser's language and
 * region, so an Indian user on a US-set browser saw mm/dd/yyyy. The app's field
 * is a text box that always shows dd/mm/yyyy; underneath, the value is still a
 * YYYY-MM-DD string, exactly what the native box held, so nothing that stores
 * or sends a date changes.
 */

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function valid(y: number, m: number, d: number): string | null {
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1) return null;
  // Round-trip through a real date: 31 February does not survive it.
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** What a person typed (or an ISO date) as YYYY-MM-DD, or null when it is not a real date. Day comes first. */
export function parseDateText(text: string | null | undefined): string | null {
  const t = (text ?? '').trim();
  if (!t) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t);
  if (iso) return valid(Number.parseInt(iso[1]!, 10), Number.parseInt(iso[2]!, 10), Number.parseInt(iso[3]!, 10));

  const dmy = /^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})$/.exec(t);
  if (dmy) return valid(Number.parseInt(dmy[3]!, 10), Number.parseInt(dmy[2]!, 10), Number.parseInt(dmy[1]!, 10));

  const digits = /^(\d{2})(\d{2})(\d{4})$/.exec(t);
  if (digits) return valid(Number.parseInt(digits[3]!, 10), Number.parseInt(digits[2]!, 10), Number.parseInt(digits[1]!, 10));

  return null;
}

/** A stored date as dd/mm/yyyy; empty for nothing or for anything unreadable. */
export function formatIsoAsDmy(iso: string | null | undefined): string {
  const n = parseDateText(iso);
  if (!n) return '';
  return `${n.slice(8, 10)}/${n.slice(5, 7)}/${n.slice(0, 4)}`;
}

/** A stored date as YYYY-MM-DD (a full timestamp is cut to its day); empty when unreadable. */
export function normalizeIso(value: string | null | undefined): string {
  return parseDateText(value) ?? '';
}

/**
 * Puts the slashes in as digits are typed: 0506 becomes 05/06/. Text the person
 * punctuated themselves (5/6/2026) is left alone, and deleting backwards never
 * puts a slash straight back.
 */
export function maskDateTyping(next: string, previous: string): string {
  // Backspacing over a digit leaves a trailing slash behind: take it too, so
  // the next digit typed lands where the person expects (05/0 -> 05/ -> 05).
  if (next.length < previous.length && next.endsWith('/')) return next.replace(/\/+$/, '');
  if (!/^[\d]*$/.test(next)) return next;
  const d = next.slice(0, 8);
  const deleting = next.length < previous.replace(/\//g, '').length || (previous.endsWith('/') && previous.length > next.length);
  let out = d;
  if (d.length > 4) out = `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  else if (d.length > 2) out = `${d.slice(0, 2)}/${d.slice(2)}`;
  if (!deleting) {
    if (d.length === 2) out = `${d}/`;
    else if (d.length === 4) out = `${d.slice(0, 2)}/${d.slice(2)}/`;
  }
  return out;
}
