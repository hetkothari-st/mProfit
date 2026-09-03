/**
 * The guard that stops the LLM inventing figures.
 *
 * The advisor engine computes every number deterministically and writes them
 * into a rule's `rationale`. The LLM's only job is to narrate that rationale in
 * readable prose. It is not allowed to introduce a figure of its own — not a
 * rounded one, not an "approximately", not a helpful extrapolation — because a
 * user cannot tell a computed rupee amount from a plausible-sounding one, and
 * neither can the adviser who signs off on it.
 *
 * So: extract every number-bearing token from both strings, normalise them to a
 * common form, and reject the prose if it contains a value the rationale does
 * not. Comparison is deliberately unit-blind (₹3,20,000, 3.2 lakh and 320000
 * all normalise to the same token): the failure this guard is built to catch is
 * a *fabricated value*, and being strict about formatting would only produce
 * false rejections that block legitimate output.
 *
 * Pure: no DB, no I/O.
 */

import { Decimal } from 'decimal.js';

/**
 * A number, optionally prefixed by a currency marker and optionally suffixed by
 * a scale word, a percent sign, or an ordinal suffix.
 *
 * The lookbehind keeps us out of identifiers and version strings: the "1" in
 * "ISIN123" or the "2" in "v1.2.3" is not a figure anyone is claiming.
 */
const TOKEN_RE =
  /(?:(?:₹|rs\.?|inr)\s*)?(?<![\w.])(\d[\d,]*(?:\.\d+)?)(?:\s*(%|percent|per\s?cent|lakhs?|lacs?|crores?|cr|st|nd|rd|th)(?![a-z]))?/gi;

const LAKH = new Decimal(100_000);
const CRORE = new Decimal(10_000_000);

/**
 * The ONLY exemption. `1st`, `2nd`, `3rd`, `4th` are positional words, not
 * figures: no rupee amount, percentage or unit count can be expressed as an
 * ordinal, so an ordinal in the prose can never be a fabricated money claim.
 *
 * Note what is deliberately NOT exempted: bare years. "by 2035" is exactly the
 * kind of claim this guard exists to catch — a horizon the engine never
 * computed is as misleading as an amount it never computed — so if the prose
 * names a year, the rationale must too.
 */
const ORDINAL_SUFFIXES = new Set(['st', 'nd', 'rd', 'th']);

interface ScannedToken {
  /** The text exactly as it appeared, e.g. "₹3,20,000". */
  surface: string;
  /** Canonical value, e.g. "320000". */
  normalized: string;
}

function scan(text: string): ScannedToken[] {
  if (typeof text !== 'string' || text.length === 0) return [];
  const out: ScannedToken[] = [];
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    // Zero-length matches are impossible (the digit group is required), but
    // guard the loop anyway rather than risk spinning on pathological input.
    if (match[0].length === 0) {
      TOKEN_RE.lastIndex += 1;
      continue;
    }
    const digits = match[1];
    if (!digits) continue;
    const suffix = (match[2] ?? '').toLowerCase().replace(/\s+/g, '');
    if (ORDINAL_SUFFIXES.has(suffix)) continue;

    const normalized = normalise(digits, suffix);
    if (normalized == null) continue;
    out.push({ surface: match[0].trim(), normalized });
  }
  return out;
}

function normalise(digits: string, suffix: string): string | null {
  const cleaned = digits.replace(/,/g, '');
  let value: Decimal;
  try {
    value = new Decimal(cleaned);
  } catch {
    return null;
  }
  if (!value.isFinite()) return null;

  if (suffix.startsWith('lakh') || suffix.startsWith('lac')) value = value.times(LAKH);
  else if (suffix.startsWith('crore') || suffix === 'cr') value = value.times(CRORE);

  // Decimal.toString() already drops trailing zeros, so "3,20,000", "320000.00"
  // and "3.2 lakh" all land on "320000".
  return value.toString();
}

/**
 * Every number-bearing token in `text`, normalised and de-duplicated, in order
 * of first appearance. Rupee markers, commas, scale words, percent signs and
 * trailing zeros are all stripped, so tokens compare by value alone.
 */
export function extractNumericTokens(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of scan(text)) {
    if (seen.has(token.normalized)) continue;
    seen.add(token.normalized);
    out.push(token.normalized);
  }
  return out;
}

/**
 * True when `prose` narrates only figures that `rationale` already contains.
 *
 * `offending` lists the tokens AS THEY APPEAR IN THE PROSE (one entry per
 * distinct value, first appearance wins) so the failure can be quoted straight
 * back into an error or a log and found by eye in the offending text.
 *
 * The check is one-directional on purpose: prose is allowed to leave figures
 * out — a good narration will — but never to add one.
 */
export function assertProseConsistency(
  rationale: string,
  prose: string,
): { ok: boolean; offending: string[] } {
  const allowed = new Set(extractNumericTokens(rationale));
  const offending: string[] = [];
  const reported = new Set<string>();

  for (const token of scan(prose)) {
    if (allowed.has(token.normalized)) continue;
    if (reported.has(token.normalized)) continue;
    reported.add(token.normalized);
    offending.push(token.surface);
  }

  return { ok: offending.length === 0, offending };
}
