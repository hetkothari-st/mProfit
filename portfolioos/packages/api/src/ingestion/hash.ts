import { createHash } from 'node:crypto';

/**
 * Phase 5-A ingestion hashes (CLAUDE.md §6.2, §6.3).
 *
 * Two distinct concerns live here:
 *
 * 1. **Source / event hashes** (§6.2) — deterministic per-source-record keys
 *    that make every ingestion path idempotent. Re-ingesting the same Gmail
 *    message, the same CAS file, or the same bank-statement line must never
 *    create a new CanonicalEvent row. Scope prefixes (`gmail:`, `cas:`,
 *    `statement:`) guarantee that two totally different sources that happen
 *    to share a key value can never collide.
 *
 * 2. **Body-structure hash** (§6.3) — a *template fingerprint*, not an
 *    idempotency key. Two HDFC-credit-alert emails with different amounts
 *    and dates normalise to the same canonical structure and therefore hash
 *    identically. That hit lets us cache a deterministic extraction recipe
 *    per template and skip the LLM entirely once a template is learned
 *    (§6.4 promotion). The hash is *not* security-sensitive — it's used as
 *    a bucket key, so we trim it to 16 hex chars to keep rows small.
 *
 * These are deliberately separate from `services/sourceHash.ts`, which
 * handles Transaction-layer hashes (broker natural keys, file positional
 * hashes). The CanonicalEvent layer sits upstream of Transaction and has
 * its own scopes.
 */

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Hash for a single Gmail message. Used as `CanonicalEvent.sourceHash`
 * when the whole email maps to one event. For emails that contain a
 * *list* of events (statements, multi-line transaction digests), combine
 * this with {@link eventWithinSourceHash} per line.
 */
export function gmailSourceHash(messageId: string): string {
  if (!messageId) throw new TypeError('gmailSourceHash: empty messageId');
  return sha256Hex(`gmail:${messageId}`);
}

/**
 * Hash for a CAS PDF (or any uploaded statement file). Pins to the exact
 * file byte-content, so re-uploading the same file = dedup, but uploading
 * next quarter's statement (different bytes) = new rows.
 */
export function casSourceHash(fileBytes: Buffer): string {
  const fileHash = sha256Hex(fileBytes.toString('binary'));
  return sha256Hex(`cas:${fileHash}`);
}

/**
 * Hash for one line item inside a bank statement. The natural key is
 * `(account last-4, tx date, amount, description)`. Two banks serialize
 * dates differently (DD-MMM-YYYY vs YYYY-MM-DD) — callers must
 * pre-normalise to ISO 8601 before invoking this, otherwise the same
 * logical txn across two ingestions will hash differently.
 *
 * Descriptions are whitespace-normalised here (trim + collapse internal
 * runs) because bank emails sometimes reflow the narration between mail
 * runs; anything more aggressive (e.g. removing a tail reference number)
 * is bank-specific and belongs in the adapter, not here.
 */
export function statementSourceHash(opts: {
  accountLast4: string;
  txDate: string; // ISO 8601 YYYY-MM-DD
  amount: string; // decimal string, no thousand separators
  description: string;
}): string {
  const desc = opts.description.trim().replace(/\s+/g, ' ');
  return sha256Hex(
    `statement:${opts.accountLast4}:${opts.txDate}:${opts.amount}:${desc}`,
  );
}

/**
 * Per-event hash inside a multi-event source (e.g. row N of a 50-line
 * statement). Combining the outer `sourceHash` with index + amount + date
 * is what guarantees that re-parsing the same statement produces the same
 * event-level keys even if the parser is re-run.
 */
export function eventWithinSourceHash(opts: {
  sourceHash: string;
  index: number;
  amount: string;
  eventDate: string;
}): string {
  return sha256Hex(
    `${opts.sourceHash}:event:${opts.index}:${opts.amount}:${opts.eventDate}`,
  );
}

/* -------------------------------------------------------------------------- */
/*  §6.3 — body-structure hash (template fingerprint)                         */
/* -------------------------------------------------------------------------- */

/**
 * Strip HTML tags but preserve block structure as placeholder tokens so
 * text-vs-HTML versions of the "same" email still normalise identically.
 * We keep `<br>`, `<p>`, `<tr>`, `<td>` as whitespace markers so row-wise
 * tables (bank statements) don't collapse into an unreadable single line.
 *
 * This is a structure normaliser, not a sanitiser — it's fine that it
 * doesn't handle malformed HTML perfectly; the worst case is a slightly
 * different hash and one extra LLM call per new variant.
 */
function stripHtml(input: string): string {
  return input
    // Block-level tags become newlines (preserves table/list structure).
    .replace(/<\/?(br|p|div|tr|td|th|li|h[1-6])\b[^>]*>/gi, '\n')
    // Remove <script> and <style> blocks entirely, not just their tags.
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    // Strip all remaining tags.
    .replace(/<[^>]+>/g, ' ')
    // HTML entities most likely to appear in financial mail.
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rupee;/gi, 'Rs');
}

/**
 * Currency-amount token. Match ₹, Rs, Rs., INR prefixes with an optional
 * Indian-style grouped number (1,23,456.78). Also match bare numbers
 * qualified by /- suffix (common in SMS-style emails: `Rs. 1000/-`).
 *
 * Order matters here — we replace amounts BEFORE bare numbers so "₹100"
 * becomes `<AMT>` not `₹<NUM>`.
 */
const AMT_RE =
  /(?:(?:rs\.?|inr|₹)\s*[\d,]+(?:\.\d+)?(?:\s*\/?-)?)|(?:[\d,]+(?:\.\d+)?\s*\/-)/gi;

/**
 * Date tokens. Matches ISO (2026-04-21), DD-MMM-YYYY (21-Apr-2026),
 * DD/MM/YYYY (21/04/2026), and DD-MM-YYYY. Month names match English
 * short+long forms. Two-digit years are accepted so legacy formats
 * (21-Apr-26) hash the same as full years.
 */
const DATE_RE =
  /\b(?:\d{1,2}[-/](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|\d{1,2})[-/]\d{2,4}|\d{4}-\d{2}-\d{2})\b/gi;

/** Email addresses. */
const EMAIL_RE = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;

/** URLs — http(s) or bare `www.`. */
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;

/**
 * Bare numbers (after we've already consumed amounts and dates). Uses
 * digit-lookaround boundaries instead of `\b` because `\b` is a
 * word/non-word boundary — it does NOT fire between a letter and a digit
 * (both are word chars). Without the lookaround, account-flavour tokens
 * like `XX1234` would not have their digit tail replaced, and two
 * otherwise-identical templates with different account numbers would
 * normalise to `XX1234` and `XX5678` — i.e. different hashes.
 */
const NUM_RE = /(?<!\d)\d[\d,]*(?:\.\d+)?(?!\d)/g;

/**
 * Normalise an email body into a template fingerprint. Same template,
 * different field values → same output string (and therefore same hash).
 *
 * Order of operations is load-bearing: HTML strip first, then URL/email
 * replacement (they contain dots and digits that would otherwise be eaten
 * by DATE_RE / NUM_RE), then amounts (before bare numbers), dates, and
 * finally the leftover numbers. Whitespace collapse at the end.
 */
export function normalizeForStructureHash(input: string): string {
  let s = stripHtml(input);
  s = s.replace(URL_RE, ' <URL> ');
  s = s.replace(EMAIL_RE, ' <EMAIL> ');
  s = s.replace(AMT_RE, ' <AMT> ');
  s = s.replace(DATE_RE, ' <DATE> ');
  s = s.replace(NUM_RE, ' <NUM> ');
  s = s.toLowerCase();
  // Collapse whitespace runs (including the ones the replacements
  // introduced). This is the last step so placeholder tokens stay
  // cleanly separated by single spaces.
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * 16-char hex fingerprint of an email template. Suitable as a DB bucket
 * key on `LearnedTemplate.bodyStructureHash`. 64 bits of space is plenty
 * — template collisions within one user's senders are vanishingly
 * unlikely, and a collision's worst-case outcome is one bad extraction
 * recipe which the confidence-score feedback loop will catch.
 */
export function bodyStructureHash(input: string): string {
  const normalized = normalizeForStructureHash(input);
  return sha256Hex(normalized).slice(0, 16);
}

/* -------------------------------------------------------------------------- */
/*  §6.4 — template slot extraction (promoted-recipe applier input)           */
/* -------------------------------------------------------------------------- */

/** Slot kinds that recipes can address. Mirrors the tokens produced by
 * {@link normalizeForStructureHash}. URLs and emails are intentionally
 * excluded — they aren't things a recipe ever wants to extract.
 */
export type SlotKind = 'AMT' | 'DATE' | 'NUM';

export interface ExtractedSlot {
  slot: SlotKind;
  /** 0-based position of this slot *within its slot kind*. */
  index: number;
  /** The verbatim substring that matched in the body. */
  raw: string;
  /**
   * Comparable canonical form, or `null` if the slot couldn't be parsed:
   *   AMT  → plain decimal string, no currency / commas / `/-` tail
   *   DATE → ISO-8601 `YYYY-MM-DD`
   *   NUM  → digits only (commas removed)
   */
  normalized: string | null;
}

/** Remove common amount decorations → a plain decimal string. */
function normalizeAmount(raw: string): string | null {
  // Strip currency symbols, slashes/hyphens, and thousand separators.
  const stripped = raw
    .replace(/(?:rs\.?|inr|₹)/gi, '')
    .replace(/\/-/g, '')
    .replace(/,/g, '')
    .trim();
  if (!stripped) return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(stripped)) return null;
  return stripped;
}

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  january: '01', february: '02', march: '03', april: '04',
  june: '06', july: '07', august: '08', september: '09',
  october: '10', november: '11', december: '12',
};

/** Parse the date formats that DATE_RE accepts → ISO-8601 string. */
function normalizeDate(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  // ISO `YYYY-MM-DD` — already canonical.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // `DD[-/]MONTH[-/]YY(YY)` where MONTH is name or digits.
  const m = /^(\d{1,2})[-/]([a-z]+|\d{1,2})[-/](\d{2}|\d{4})$/.exec(s);
  if (!m) return null;
  const [, dd, monToken, yyRaw] = m;
  const day = dd!.padStart(2, '0');
  let month: string;
  if (/^\d+$/.test(monToken!)) month = monToken!.padStart(2, '0');
  else {
    const key = monToken!;
    if (!(key in MONTH_MAP)) return null;
    month = MONTH_MAP[key]!;
  }
  const year = yyRaw!.length === 2 ? `20${yyRaw}` : yyRaw!;
  return `${year}-${month}-${day}`;
}

/**
 * Walk an email body in the same pattern order as
 * {@link normalizeForStructureHash} (URLs/emails stripped, then AMT, DATE,
 * NUM) and return every slot that appears, tagged with its type and
 * within-kind index. The resulting list is what {@link applyRecipe} (in
 * `templates.ts`) uses to look up `{slot, index}` references.
 *
 * The pipeline order is load-bearing: AMT must run before NUM so "₹100"
 * becomes one AMT slot rather than one AMT slot *and* a phantom NUM slot
 * on the `100`. That mirrors the normaliser exactly — if the two ever
 * drift, a recipe trained on the normaliser's slot ordering will pick
 * the wrong slot at apply time.
 */
export function extractTemplateSlots(input: string): ExtractedSlot[] {
  // Strip HTML first for parity with the normaliser. URLs/emails are
  // replaced (not collected) so their digits/dates don't leak into NUM
  // or DATE slots.
  let s = stripHtml(input);
  s = s.replace(URL_RE, ' ');
  s = s.replace(EMAIL_RE, ' ');

  const found: Array<{ slot: SlotKind; raw: string; start: number }> = [];

  const collect = (re: RegExp, slot: SlotKind, replaceWith: string): void => {
    // Build a new string where each match is replaced with `replaceWith`
    // so subsequent regex passes can't re-match the same substring. We
    // capture positions in the *pre-replacement* string so the `index`
    // ordering at the end reflects source order.
    const matches: Array<{ raw: string; start: number }> = [];
    // Reset regex state; the module-level regexes carry `g` flag.
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      matches.push({ raw: m[0]!, start: m.index });
      // Protect against zero-width matches getting stuck in the loop.
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    for (const { raw, start } of matches) found.push({ slot, raw, start });
    s = s.replace(re, () => replaceWith);
  };

  // Module-level regexes are shared with the hasher; we can't mutate
  // them (the hasher also depends on the `g` flag), but calling lastIndex
  // = 0 and re-exec'ing is safe because each call resets state explicitly.
  collect(AMT_RE, 'AMT', ' <AMT> ');
  collect(DATE_RE, 'DATE', ' <DATE> ');
  collect(NUM_RE, 'NUM', ' <NUM> ');

  // Sort strictly by source-order position so two AMT slots inside one
  // paragraph get indices 0, 1 (not 0 and something arbitrary from regex
  // alternation). Stable sort — same position means same origin.
  found.sort((a, b) => a.start - b.start);

  const perKindIndex: Record<SlotKind, number> = { AMT: 0, DATE: 0, NUM: 0 };
  const out: ExtractedSlot[] = [];
  for (const { slot, raw } of found) {
    const normalized =
      slot === 'AMT' ? normalizeAmount(raw)
      : slot === 'DATE' ? normalizeDate(raw)
      : raw.replace(/,/g, '');
    out.push({ slot, index: perKindIndex[slot]++, raw, normalized });
  }
  return out;
}
