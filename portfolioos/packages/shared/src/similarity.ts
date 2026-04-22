/**
 * String similarity helpers for fuzzy name matching.
 *
 * Primary use: rental auto-match (§8.2 of CLAUDE.md). When a bank-alert
 * CanonicalEvent lands with `counterparty = "MR RAJESH K"` and we have a
 * Tenancy with `tenantName = "Rajesh Kumar"`, we want ≥0.5 similarity to
 * flip an EXPECTED receipt to RECEIVED. That requires normalisation
 * (case, punctuation, whitespace) before Levenshtein, otherwise casing
 * alone tanks the ratio.
 *
 * All functions are pure, no Unicode-specific behaviour beyond lowercase.
 * The normalisation is deliberately aggressive: bank messages mangle
 * names (middle-initials only, honorifics stripped or added, trailing
 * salutations). We'd rather over-match and let the user undo than
 * silently miss receipts.
 */

/**
 * Honorifics commonly tacked onto names in Indian bank alerts. Stripping
 * them is essential — without this, "MR RAJESH" vs "RAJESH" scores 0.57
 * on char Levenshtein, and "MR RAJESH K" vs "RAJESH KUMAR" drops under
 * the §8.2 0.5 threshold even though any human reading the two would
 * say they match.
 */
const HONORIFICS = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'shri', 'smt', 'sri', 'kumari', 'mst',
]);

/**
 * Lowercase, strip non-alphanumeric characters, drop honorific tokens,
 * collapse whitespace. Keeps Latin/ASCII digits; non-ASCII letters are
 * not explicitly handled (good enough for Indian names in Latin
 * transliteration, which is what bank alerts use).
 */
export function normaliseForSimilarity(s: string): string {
  const cleaned = s
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length === 0) return cleaned;
  return cleaned
    .split(' ')
    .filter((tok) => !HONORIFICS.has(tok))
    .join(' ');
}

/**
 * Classic Levenshtein distance. O(m*n) time, O(min(m,n)) space via the
 * single-row optimisation so a 100-char name × 100-char event doesn't
 * allocate 10k cells.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure `a` is the shorter string so the row we allocate is as small
  // as possible.
  if (a.length > b.length) [a, b] = [b, a];

  const prev = new Array<number>(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;

  for (let j = 1; j <= b.length; j++) {
    let prevDiag = prev[0]!;
    prev[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const current = prev[i]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[i] = Math.min(
        prev[i]! + 1,       // deletion
        prev[i - 1]! + 1,   // insertion
        prevDiag + cost,    // substitution
      );
      prevDiag = current;
    }
  }
  return prev[a.length]!;
}

/**
 * Normalised similarity in [0, 1]. `1.0` = identical after normalisation,
 * `0.0` = completely disjoint. Empty/whitespace-only inputs on both sides
 * return `0` (we have no signal — don't claim a match).
 *
 * Formula: `1 - levenshtein(a, b) / max(|a|, |b|)` on the normalised
 * forms. This is the "Levenshtein ratio" cited in §8.2.
 */
export function similarityRatio(a: string, b: string): number {
  const na = normaliseForSimilarity(a);
  const nb = normaliseForSimilarity(b);
  if (na.length === 0 || nb.length === 0) return 0;
  const maxLen = Math.max(na.length, nb.length);
  const dist = levenshtein(na, nb);
  return 1 - dist / maxLen;
}
