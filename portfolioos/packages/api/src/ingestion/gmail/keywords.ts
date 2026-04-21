/**
 * §6.6 keyword scoring for inbox discovery.
 *
 * Given the subjects + snippets from a sender's recent mail, the scorer
 * returns an integer ≥ 0 indicating how "financial" that sender's
 * content looks. The UI shows senders above `DISCOVERY_THRESHOLD` sorted
 * by score so the user can cherry-pick the ones worth monitoring.
 *
 * The keyword list follows the spec verbatim (English + transliterated
 * Hindi). Weights are assigned by signal strength — a message that says
 * "contract note" is almost certainly a broker email; a message that
 * merely mentions "premium" could be anything. Institution names
 * (HDFC, ICICI, Zerodha, ...) boost the score even when the subject
 * doesn't explicitly contain a transaction keyword, because they come
 * from senders whose financial relevance is already established.
 *
 * The list is a module-level constant so the poller, the template
 * promoter, and the tests all see the same numbers. A single test locks
 * representative scores so a silent weight change blocks CI.
 */

/** Matching is whole-word and case-insensitive. */
export interface KeywordRule {
  /** The search term. Matched case-insensitively, at word boundaries. */
  term: string;
  /** Points added per occurrence. */
  weight: number;
}

/**
 * Minimum score a sender must achieve to surface in the discovery UI.
 * A single "statement" mention (weight 2) is not enough; the user
 * probably doesn't want "your iCloud statement is ready" to show up as
 * a portfolio source.
 */
export const DISCOVERY_THRESHOLD = 3;

/**
 * Ordered by strength: strong transaction verbs first, institutional
 * markers after. Order does not affect scoring — it's just readability.
 *
 * Whole-word matching is important. Substring matches would flag
 * "FDA" as "FD" and "nominate" as "NOMI". We compile these into a
 * single alternation regex with `\b` word boundaries below.
 */
export const FINANCIAL_KEYWORDS: readonly KeywordRule[] = [
  // Strong transaction / statement verbs (weight 3).
  { term: 'credit',           weight: 3 },
  { term: 'debit',            weight: 3 },
  { term: 'transaction',      weight: 3 },
  { term: 'txn',              weight: 3 },
  { term: 'NEFT',             weight: 3 },
  { term: 'RTGS',             weight: 3 },
  { term: 'UPI',              weight: 3 },
  { term: 'IMPS',             weight: 3 },
  { term: 'dividend',         weight: 3 },
  { term: 'EMI',              weight: 3 },
  { term: 'contract note',    weight: 4 },  // strongest — brokers only
  { term: 'trade',            weight: 3 },
  { term: 'folio',            weight: 3 },
  { term: 'NAV',              weight: 3 },
  { term: 'TDS',              weight: 3 },
  { term: 'maturity',         weight: 3 },
  { term: 'fixed deposit',    weight: 3 },
  { term: 'rent',             weight: 3 },

  // Medium signal (weight 2) — common in financial + non-financial mail.
  { term: 'scheme',           weight: 2 },
  { term: 'statement',        weight: 2 },
  { term: 'interest',         weight: 2 },
  { term: 'loan',             weight: 2 },
  { term: 'premium',          weight: 2 },
  { term: 'policy',           weight: 2 },
  { term: 'salary',           weight: 2 },
  { term: 'FD',               weight: 2 },
  { term: 'KYC',              weight: 2 },
  { term: 'nominee',          weight: 2 },

  // Institution names (weight 2 each). Matches in subject/snippet are a
  // strong signal that this sender is an FI even if transaction verbs
  // are absent (marketing mail from the same domain, statement
  // summaries, OTPs, etc.).
  { term: 'HDFC',             weight: 2 },
  { term: 'ICICI',            weight: 2 },
  { term: 'SBI',              weight: 2 },
  { term: 'Axis',             weight: 2 },
  { term: 'Kotak',            weight: 2 },
  { term: 'IndusInd',         weight: 2 },
  { term: 'RBL',              weight: 2 },
  { term: 'IDFC',             weight: 2 },
  { term: 'PNB',              weight: 2 },
  { term: 'Zerodha',          weight: 3 },  // stronger — broker name
  { term: 'Groww',            weight: 3 },
  { term: 'Dhan',             weight: 3 },
  { term: 'Upstox',           weight: 3 },
  { term: 'Angel',            weight: 2 },
  { term: '5Paisa',           weight: 3 },
  { term: 'Paytm Money',      weight: 3 },
  { term: 'CAMS',             weight: 3 },
  { term: 'KFintech',         weight: 3 },
  { term: 'LIC',              weight: 2 },
];

/**
 * Pre-compiled regex: `\b(term1|term2|...)\b` with the `i` flag. Built
 * once at module load — a single `match()` per text blob is much faster
 * than iterating 50 separate regex tests per message.
 */
const SCORING_REGEX = buildScoringRegex();

function buildScoringRegex(): RegExp {
  // Sort longest-first so "contract note" wins over "note", "Paytm Money" over "Paytm".
  const terms = [...FINANCIAL_KEYWORDS]
    .map((k) => k.term)
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(?:${terms.join('|')})\\b`, 'gi');
}

/**
 * Lookup table: lowercased term → weight. Built at module load once.
 * Used inside the scoring loop so we can resolve each regex hit back to
 * its weight in O(1) instead of re-scanning FINANCIAL_KEYWORDS.
 */
const TERM_WEIGHTS: ReadonlyMap<string, number> = new Map(
  FINANCIAL_KEYWORDS.map((k) => [k.term.toLowerCase(), k.weight]),
);

/**
 * Score a single text blob (subject, snippet, etc.). Every match is
 * counted — three mentions of "credit" in one email snippet adds 9
 * points. This is deliberate: a bank statement listing ten transactions
 * legitimately earns more points than a welcome email that uses "credit"
 * once.
 */
export function scoreText(text: string): number {
  if (!text) return 0;
  let total = 0;
  for (const match of text.matchAll(SCORING_REGEX)) {
    const lower = match[0].toLowerCase();
    total += TERM_WEIGHTS.get(lower) ?? 0;
  }
  return total;
}

/**
 * Aggregate score across all of a sender's recent subjects + snippets.
 * Subjects carry more signal per-character (authored by the FI, short,
 * keyword-dense) so we weight them 2× — a subject that says "Transaction
 * alert" is worth more than a snippet that happens to contain the word
 * in a boilerplate footer.
 */
export function scoreSender(subjects: readonly string[], snippets: readonly string[]): number {
  let total = 0;
  for (const s of subjects) total += 2 * scoreText(s);
  for (const s of snippets) total += scoreText(s);
  return total;
}
