import type { SortDocType } from '@everypaisa/shared';

/**
 * Pure, local reading of extracted document text: which type of document it
 * is, whose it is, and its own date. No I/O, no LLM. The sorter only asks the
 * LLM when `confidence` is below RULES_CONFIDENCE_THRESHOLD or no name was
 * found (docs/superpowers/specs/2026-10-14-document-sorter-design.md §3).
 */

export interface RuleResult {
  docType: SortDocType;
  personName: string | null;
  /** Last 4 characters of a PAN seen on the document, e.g. "234F". */
  panLast4: string | null;
  /** YYYY-MM-DD */
  docDate: string | null;
  confidence: number;
}

export const RULES_CONFIDENCE_THRESHOLD = 0.7;

type Kw = [RegExp, number];
const TYPE_KEYWORDS: Record<Exclude<SortDocType, 'OTHER'>, Kw[]> = {
  ITR: [[/\bITR[- ]?[1-7V]\b/i, 3], [/income tax return/i, 3], [/acknowledgement (no|number)/i, 2], [/assessment year/i, 1], [/total income/i, 1]],
  FORM_16: [[/form (no\.? ?)?16\b/i, 4], [/section 203/i, 2], [/\bTAN\b/, 1], [/tax deducted at source|TDS certificate/i, 2], [/name (and address )?of the employee/i, 2]],
  INCOME_CERTIFICATE: [[/income certificate|certificate of income/i, 4], [/this is to certify/i, 2], [/tahsildar|tehsildar|revenue department/i, 2], [/annual (family )?income/i, 2]],
  BANK_STATEMENT: [[/(account|bank) statement|statement of account/i, 3], [/withdrawal|debit/i, 1], [/deposit|credit/i, 1], [/opening balance|closing balance|balance/i, 1], [/narration|particulars/i, 1]],
  SALARY_SLIP: [[/pay ?slip|salary slip|salary statement/i, 4], [/net pay|net salary/i, 2], [/\bbasic\b/i, 1], [/earnings|deductions/i, 1]],
  CAS: [[/consolidated account statement/i, 4], [/\bfolio\b/i, 1], [/demat/i, 1], [/\bCAMS\b|KFintech|NSDL|CDSL/i, 2]],
  CONTRACT_NOTE: [[/contract note/i, 4], [/trade date/i, 1], [/brokerage|\bSTT\b/i, 1]],
  INSURANCE: [[/policy ?holder/i, 2], [/premium (receipt|paid|due)|policy schedule/i, 3], [/sum (assured|insured)/i, 2]],
  FD_CERTIFICATE: [[/fixed deposit|term deposit/i, 3], [/maturity (date|amount)/i, 2], [/deposit(or)? (receipt|advice)|FDR/i, 2]],
  ID_PROOF: [[/permanent account number/i, 4], [/aadhaar|unique identification authority/i, 4], [/driving licen[cs]e|passport|election commission/i, 3]],
};

export function scoreTypes(text: string): Array<[SortDocType, number]> {
  const scores = (Object.keys(TYPE_KEYWORDS) as Array<keyof typeof TYPE_KEYWORDS>).map((t): [SortDocType, number] => [
    t,
    TYPE_KEYWORDS[t].reduce((s, [re, w]) => s + (re.test(text) ? w : 0), 0),
  ]);
  return scores.sort((a, b) => b[1] - a[1]);
}

// Labels that name the document's holder (separator optional). Anchored to a line start or a
// column gap, so "Branch Name", "Nominee Name", "Father's Name" and "Name of the Insurer" never match.
const HOLDER_LABEL =
  /(?:^\s*|\s{2,})(?:name of (?:the )?(?:assessee|employee|account holder)|name and address of the employee|name of (?:applicant|policy ?holder)|account holder(?: name)?|employee name|customer name|investor name|client name|depositor name|policy ?holder|applicant)\s*[:-]?\s*([^\n]{3,80})/i;
// A bare "Name" only counts at the start of a line and with an explicit ':' or '-'.
const BARE_LABEL = /^\s*name\s*[:-]\s*([^\n]{3,80})/i;
// Words that show a label was matched against its neighbour, not a person.
const NOT_A_NAME = new Set(['and', 'of', 'the', 'address', 'name', 'bank', 'branch', 'insurer', 'employer', 'deductor']);
const CERTIFY =
  /certif(?:y|ied)(?: that)?\s+(?:(?:shri|smt\.?|mr\.?|mrs\.?|ms\.?|kumari)\s+)?([A-Za-z][A-Za-z.' ]{2,50}?)(?=\s+(?:has|resides|is|annual|son|daughter|wife)\b)/i;
const STOP = /\s{2,}|\b(?:PAN|Date|A\/c|Account|Policy|Period|Statement|Father|Address|Mobile|AY|Assessment)\b|X{4}|\d/i;

/**
 * Untrusted text (document or LLM output) → a display-safe person name, or
 * null. Letters, spaces, dots and apostrophes only; 1–5 tokens; ≤60 chars.
 */
export function sanitizePersonName(raw: string): string | null {
  const cut = raw.split(STOP)[0] ?? '';
  const cleaned = cut
    .replace(/^\s*(?:mr|mrs|ms|shri|smt|kumari|dr)\.?\s+/i, '')
    .replace(/[^A-Za-z.' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = cleaned.split(' ').filter(Boolean);
  if (tokens.length < 1 || tokens.length > 5) return null;
  if (cleaned.length < 3 || cleaned.length > 60) return null;
  if (!tokens.every((t) => /^[A-Za-z][A-Za-z.']*$/.test(t))) return null;
  if (tokens.some((t) => NOT_A_NAME.has(t.toLowerCase()))) return null;
  return cleaned;
}

function extractName(text: string): string | null {
  const head = text.slice(0, 6000);
  const certified = CERTIFY.exec(head);
  if (certified?.[1]) {
    const n = sanitizePersonName(certified[1]);
    if (n) return n;
  }
  for (const line of head.split('\n')) {
    const m = HOLDER_LABEL.exec(line) ?? BARE_LABEL.exec(line);
    if (m?.[1]) {
      const n = sanitizePersonName(m[1]);
      // A lone word is too weak to file under (usually a fragment): leave it to the LLM / review.
      if (n && n.split(' ').length >= 2) return n;
    }
  }
  return null;
}

const PAN_RE = /\b(?:[A-Z]{5}|X{5})\d{4}[A-Z]\b/g;
const PAN_HOLDER_LINE = /employee|assessee|holder|investor|customer|applicant|client|depositor/i;
const PAN_OTHER_PARTY = /deductor|employer|\btan\b|nominee|insurer|\bbank\b|branch|company|firm/i;

/**
 * Last 4 of the PAN that belongs to the document's holder. A PAN on a
 * deductor/employer/nominee line is never taken; with no holder-labelled PAN,
 * a single PAN on the page is used and several are ambiguous (null).
 */
function extractPanLast4(text: string): string | null {
  const found: Array<{ pan: string; line: string }> = [];
  for (const line of text.slice(0, 6000).split('\n')) {
    for (const m of line.matchAll(PAN_RE)) found.push({ pan: m[0], line });
  }
  const holder = found.find((f) => PAN_HOLDER_LINE.test(f.line) && !PAN_OTHER_PARTY.test(f.line));
  if (holder) return holder.pan.slice(-4);
  const only = found.length === 1 ? found[0] : undefined;
  return only && !PAN_OTHER_PARTY.test(only.line) ? only.pan.slice(-4) : null;
}

/** Calendar parts, not money: explicit base-10 integer parse. */
const toInt = (s: string | undefined): number => Number.parseInt(s ?? '', 10);

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const iso = (y: number, m: number, d: number): string => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
/** True only for a day that exists (no 31 Feb rolling into March). */
const isRealDate = (y: number, m: number, d: number): boolean => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const lastDay =(y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

function parseAllDates(text: string): Array<{ date: string; index: number }> {
  const out: Array<{ date: string; index: number }> = [];
  const numeric = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/g;
  const named = /\b(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ ,-]+(\d{4})\b/g;
  for (const m of text.matchAll(numeric)) {
    const [d, mo, y] = [toInt(m[1]), toInt(m[2]), toInt(m[3])];
    if (isRealDate(y, mo, d)) out.push({ date: iso(y, mo, d), index: m.index ?? 0 });
  }
  for (const m of text.matchAll(named)) {
    const mo = MONTHS[(m[2] ?? '').toLowerCase()];
    if (mo && isRealDate(toInt(m[3]), mo, toInt(m[1]))) out.push({ date: iso(toInt(m[3]), mo, toInt(m[1])), index: m.index ?? 0 });
  }
  return out;
}

function extractDate(text: string, type: SortDocType, now: Date): string | null {
  const head = text.slice(0, 6000);
  if (type === 'ITR' || type === 'FORM_16') {
    // Assessment Year 2025-26 covers FY 2024-25, which ends 31 Mar 2025.
    const ay = /(?:assessment year|\bAY\b)\s*[: ]?\s*(\d{4})\s*[-–]\s*\d{2,4}/i.exec(head);
    if (ay?.[1]) return iso(toInt(ay[1]), 3, 31);
    const fy = /financial year\s*[: ]?\s*(\d{4})\s*[-–]\s*\d{2,4}/i.exec(head);
    if (fy?.[1]) return iso(toInt(fy[1]) + 1, 3, 31);
  }
  if (type === 'SALARY_SLIP') {
    const m =
      /(?:month(?: of)?|for|slip\s*[-–]?)\s*:?\s*([A-Za-z]{3})[a-z]*[ ,]+(\d{4})/i.exec(head) ??
      /\b([A-Za-z]{3})[a-z]*[ ,]+(\d{4})\b/.exec(head);
    const mo = m ? MONTHS[(m[1] ?? '').toLowerCase()] : undefined;
    if (m && mo) return iso(toInt(m[2]), mo, lastDay(toInt(m[2]), mo));
  }
  const horizon = now.getTime() + 86_400_000 * 366;
  // A maturity date is in the future by design and is never the document's own date.
  const notMaturity = (d: { index: number }): boolean => !/maturity[^\n]*$/i.test(head.slice(Math.max(0, d.index - 24), d.index));
  const dates = parseAllDates(head).filter((d) => new Date(d.date).getTime() <= horizon && notMaturity(d));
  if (dates.length === 0) return null;
  const labelled = /(?:\bto\b|statement date|as on|as of|period ending|date of (?:issue|payment|deposit)|deposit date|issued(?: on)?|trade date|dated|date)\s*:?\s*$/i;
  const hit = dates.filter((d) => labelled.test(head.slice(Math.max(0, d.index - 24), d.index)));
  const pool = hit.length > 0 ? hit : dates;
  return pool.map((d) => d.date).sort().at(-1) ?? null;
}

export function runRules(text: string, now: Date = new Date()): RuleResult {
  const scores = scoreTypes(text);
  const top = scores[0];
  const second = scores[1];
  const topScore = top?.[1] ?? 0;
  const gap = topScore - (second?.[1] ?? 0);
  const docType: SortDocType = topScore >= 2 && top ? top[0] : 'OTHER';
  const confidence = docType === 'OTHER' ? 0.2 : topScore >= 3 && gap >= 2 ? 0.9 : 0.6;
  return {
    docType,
    personName: extractName(text),
    panLast4: extractPanLast4(text),
    docDate: extractDate(text, docType, now),
    confidence,
  };
}
