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
 *
 * `x` and `pp` were added for the MF analytics surface (`05 §6.3`), where a
 * capture ratio reads "1.18x" and a drawdown gap reads "5 pp". Neither is a
 * SCALE — unlike lakh/crore they leave the value alone — so they only widen
 * the *surface* a rejection quotes back, never the value it compares. The
 * advisor's behaviour is therefore unchanged by their presence.
 */
const TOKEN_RE =
  /(?:(?:₹|rs\.?|inr)\s*)?(?<![\w.])(\d[\d,]*(?:\.\d+)?)(?:\s*(%|percent|per\s?cent|lakhs?|lacs?|crores?|cr|st|nd|rd|th|x|pp)(?![a-z]))?/gi;

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

export interface ScannedToken {
  /** The text exactly as it appeared, e.g. "₹3,20,000". */
  surface: string;
  /** Canonical value, e.g. "320000". */
  normalized: string;
  /**
   * How many decimal places the CANONICAL value carries — i.e. the precision
   * the writer actually displayed, after any scale word has been applied.
   *
   * This is the whole input to the rounding tolerance below. "1.18" claims two
   * decimals of precision about a capture ratio; "3.2 lakh" claims none at all
   * about a rupee amount (it normalises to 320000). Measuring the *normalised*
   * value rather than the surface is what makes those two cases comparable.
   */
  decimals: number;
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
    out.push({ surface: match[0].trim(), normalized, decimals: decimalsOf(normalized) });
  }
  return out;
}

/** Decimal places in a canonical (trailing-zero-free) value string. */
function decimalsOf(normalized: string): number {
  const dot = normalized.indexOf('.');
  return dot === -1 ? 0 : normalized.length - dot - 1;
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

// ===========================================================================
// MF analytics extension (`docs/mf-analytics/05-FINDINGS-ENGINE.md §6.3`)
// ===========================================================================
//
// `05 §6.3` says, in as many words, "extend `proseConsistency.ts`" — so this
// is an extension of the module above, sharing its one token grammar, and NOT
// a second verifier. That matters more than it looks: two scanners would
// drift, and the day they disagreed the weaker one would be the one guarding
// whichever surface happened to import it.
//
// What the MF surface needs that the advisor's `assertProseConsistency` does
// not give it:
//
//  1. **A value list, not a text.** The advisor compares prose against ONE
//     authoritative string (the rule's `rationale`). An MF verdict's allowed
//     figures come from a structure — evidence rows, score pillars, a holding
//     summary — and rendering that to text first, then scanning the text,
//     would silently admit every incidental number in the rendering (the
//     `2026` and the `08` of an ISO date, an array index, a digit inside a
//     scheme code) to the allowed set. The caller assembles the list
//     explicitly instead; see `ai/prompts/mfAnalysis.prose.ts`.
//
//  2. **Rounding tolerance.** `05 §6.3`: each prose number must match
//     "(± rounding to the displayed precision) a value in the input evidence".
//     Evidence arrives at full stored precision (`serializeRatio` gives
//     "1.180000") and a narration that says "1.18" is correct, not
//     hallucinated. The advisor's exact set membership would reject it.
//
// The advisor's own entry point keeps EXACT comparison. Loosening it would
// change the compliance posture of the one prescriptive surface in the
// codebase as a side effect of a feature for a different one.

/**
 * How a prose figure is allowed to differ from the evidence figure behind it.
 *
 * - `exact` — the value must appear, to the digit. The advisor's rule.
 * - `displayed-precision` — the evidence value, rounded to the number of
 *   decimals the prose itself displayed, must equal the prose value.
 *
 * Note the asymmetry in `displayed-precision`: it is the EVIDENCE that gets
 * rounded, to a precision the PROSE chose. So dropping digits is allowed
 * ("1.18" for 1.180432) and inventing them is not ("1.1804" for a stored 1.18
 * fails, because 1.18 rounded to four places is 1.1800). A model cannot
 * manufacture precision it was never given, which is the direction the risk
 * runs in.
 */
export type ProseNumericTolerance = 'exact' | 'displayed-precision';

export interface ProseNumericVerification {
  ok: boolean;
  /**
   * Offending tokens AS THEY APPEAR IN THE PROSE, one entry per distinct
   * value, first appearance first — quotable straight into a log line and
   * findable by eye in the text that produced it. `05 §6.3` requires the
   * failure event to name the offending token; this is that name.
   */
  offending: string[];
  /** Every prose figure that DID check out, for a debug log or a test. */
  matched: string[];
}

/**
 * Rounding modes accepted when comparing at displayed precision.
 *
 * Both half-up and half-even are allowed, and only a value sitting exactly on
 * a .5 boundary can tell them apart. `CONTEXT.md §14.3` mandates banker's
 * rounding for *display*, but the model is copying figures out of headlines
 * that several different formatters produced, and discarding a whole narration
 * because a tie broke the other way would be a compliance stop over half a
 * paisa. Everything that is not an exact tie is unaffected either way.
 */
const TOLERANT_ROUNDING_MODES: readonly Decimal.Rounding[] = [
  Decimal.ROUND_HALF_UP,
  Decimal.ROUND_HALF_EVEN,
];

/**
 * Turn caller-supplied allowed values into the canonical form `scan` produces.
 *
 * Runs each value through the SAME scanner rather than `new Decimal(...)`, so
 * an allowed value is normalised by exactly the rules a prose token is:
 * commas stripped, trailing zeros dropped, sign ignored, scale words applied.
 * A second, separate parse here is precisely how the two halves of a
 * comparison start to disagree.
 *
 * A value that scans to several tokens (a headline like "Captured 118% of
 * benchmark losses (category median 96%)") contributes all of them — the
 * caller passing a whole string is asserting that the string is material the
 * model was shown and may quote.
 */
function canonicaliseAllowed(values: Iterable<string | number | null | undefined>): Decimal[] {
  const out: Decimal[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    if (raw === null || raw === undefined) continue;
    const text = typeof raw === 'number' ? String(raw) : raw;
    for (const token of scan(text)) {
      if (seen.has(token.normalized)) continue;
      seen.add(token.normalized);
      out.push(new Decimal(token.normalized));
    }
  }
  return out;
}

/**
 * The anti-hallucination check for MF verdict prose.
 *
 * Every number-bearing token in `prose` must be justified by some entry in
 * `allowed`. One unjustified token fails the WHOLE narration: a paragraph with
 * a fabricated rupee figure in it is not partially usable, and the caller's
 * only correct response is to discard the prose and render the deterministic
 * headlines instead (`05 §6.3`, `06 §6`).
 *
 * One-directional, like the advisor's: prose may leave figures out — a good
 * narration will — and may never add one.
 *
 * Sign-blind, because the scanner is: the grammar captures magnitudes and
 * leaves direction to the words around them. "gave back 22.4% at the worst
 * point", narrating a stored `-22.4`, is correct English about a correct
 * number, and a sign-sensitive comparison would reject it while catching
 * nothing — a model that flips a sign has written a false *sentence*, which is
 * the prompt's problem, not a numeric-token grammar's.
 */
export function verifyProseNumbers(input: {
  allowed: Iterable<string | number | null | undefined>;
  prose: string;
  tolerance?: ProseNumericTolerance;
}): ProseNumericVerification {
  const tolerance = input.tolerance ?? 'displayed-precision';
  const allowed = canonicaliseAllowed(input.allowed);
  const allowedExact = new Set(allowed.map((d) => d.toString()));

  const offending: string[] = [];
  const matched: string[] = [];
  const reported = new Set<string>();
  const accepted = new Set<string>();

  for (const token of scan(input.prose)) {
    if (accepted.has(token.normalized) || reported.has(token.normalized)) continue;

    if (allowedExact.has(token.normalized)) {
      accepted.add(token.normalized);
      matched.push(token.surface);
      continue;
    }

    if (tolerance === 'displayed-precision' && matchesAtDisplayedPrecision(allowed, token)) {
      accepted.add(token.normalized);
      matched.push(token.surface);
      continue;
    }

    reported.add(token.normalized);
    offending.push(token.surface);
  }

  return { ok: offending.length === 0, offending, matched };
}

function matchesAtDisplayedPrecision(allowed: readonly Decimal[], token: ScannedToken): boolean {
  const claimed = new Decimal(token.normalized);
  for (const value of allowed) {
    // Rounding a value to MORE places than it already has cannot change it, so
    // this loop can only ever accept a prose token that is a rounding or a
    // truncation of a real figure — never an extension of one.
    for (const mode of TOLERANT_ROUNDING_MODES) {
      if (value.toDecimalPlaces(token.decimals, mode).equals(claimed)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Advisory imperatives (`06 §4` compliance gating)
// ---------------------------------------------------------------------------

/**
 * The verbs that turn an observation into regulated advice.
 *
 * `06 §4` splits this layer in two: describing what a fund did is *research*
 * and needs no registration; telling someone to act on it is *advice* and
 * needs an RIA. The line is drawn by the verb, so the verb is what is
 * detected.
 */
const ADVISORY_VERB_LIST: readonly string[] = [
  'buy',
  'sell',
  'switch',
  'redeem',
  'exit',
  'invest',
  'divest',
  'liquidate',
  'book',
  'trim',
  'reduce',
  'increase',
  'add',
  'move',
  'shift',
  'replace',
  'rebalance',
  'withdraw',
  'allocate',
  'stop',
  'start',
  'purchase',
  'offload',
];

/** Base forms only — a bare sentence-opening imperative is never inflected. */
const ADVISORY_VERBS = ADVISORY_VERB_LIST.join('|');

/**
 * The same verbs, with the inflections a hedged instruction uses: "consider
 * **selling**", "we recommend **switching**", "you should **have moved**".
 *
 * Built rather than hand-listed because English drops the stem `e` before
 * `-ing` ("move" -> "moving", not "moveing") and doubles the final consonant
 * after a short vowel ("trim" -> "trimming"). A hand-written alternation gets
 * one of those wrong, and the failure is silent: the pattern still compiles,
 * still matches most cases, and quietly stops catching "consider moving to a
 * different fund" — which is advice.
 *
 * Over-matching is the safe direction here. These forms are only ever looked
 * for AFTER a modal ("you should", "we recommend", "consider"), where a word
 * that merely starts with an advisory verb is almost certainly that verb.
 */
const ADVISORY_VERBS_INFLECTED = ADVISORY_VERB_LIST.map((verb) =>
  verb.endsWith('e')
    ? `${verb.slice(0, -1)}(?:e|es|ed|ing)`
    : `${verb}(?:s|ed|ing|[pmtn]ed|[pmtn]ing)?`,
).join('|');

/**
 * A bare imperative opening a sentence: "Sell this fund.", "Switch to X."
 *
 * `\b(?!\w)` after the verb is what keeps gerunds out. "Switching to the
 * direct plan saves 4,200 a year" is a `REGULAR_PLAN_COST` counterfactual the
 * engine wrote itself, and matching it would make the compliant phrasing of a
 * deterministic finding un-narratable.
 */
const SENTENCE_IMPERATIVE_RE = new RegExp(
  String.raw`(?:^|[.!?;:]\s+|\n\s*)(?:please\s+|now\s+)?(?:VERBS)\b(?!\w)`.replace(
    'VERBS',
    ADVISORY_VERBS,
  ),
  'gi',
);

/**
 * A hedged imperative: "you should sell", "we recommend switching", "consider
 * moving to the direct plan".
 *
 * The `{0,3}` filler absorbs the words a model puts between the modal and the
 * verb ("you may want to seriously consider selling") without letting the
 * pattern span a sentence boundary — `[^.!?]*?` would have matched across two
 * unrelated clauses and produced false rejections on plainly descriptive
 * prose.
 */
const MODAL_IMPERATIVE_RE = new RegExp(
  String.raw`\b(?:you\s+(?:should|must|need\s+to|ought\s+to|may\s+want\s+to|might\s+want\s+to|could|can)|we\s+(?:recommend|suggest|advise)|it\s+(?:is|would\s+be)\s+(?:advisable|better|best|worth|sensible)\s+to|consider)\s+(?:[a-z]+\s+){0,3}?(?:VERBS)\b`.replace(
    'VERBS',
    ADVISORY_VERBS_INFLECTED,
  ),
  'gi',
);

/**
 * Every buy/sell-style instruction in `prose`, or `[]` when there is none.
 *
 * Used by the MF prose pipeline in the branch where `RIA_VERDICTS_ENABLED` is
 * false, and in the branch where it is true but this fund's verdict is not
 * `SWITCH_CANDIDATE`: the system prompt forbids imperatives there, and this is
 * the check that the model obeyed. A prompt constraint nobody verifies is a
 * comment.
 *
 * Deliberately lexical and deliberately narrow. It cannot catch a paraphrase
 * ("your money would work harder elsewhere") and does not try to — it catches
 * the plain instruction, which is the form a compliance reviewer would
 * actually object to, and a wider net would start rejecting honest
 * description, which is the output this whole layer exists to produce.
 */
export function findAdvisoryImperatives(prose: string): string[] {
  if (typeof prose !== 'string' || prose.length === 0) return [];
  const hits: string[] = [];
  const seen = new Set<string>();
  for (const re of [SENTENCE_IMPERATIVE_RE, MODAL_IMPERATIVE_RE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(prose)) !== null) {
      if (match[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      const surface = match[0].trim();
      const key = surface.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(surface);
    }
  }
  return hits;
}
