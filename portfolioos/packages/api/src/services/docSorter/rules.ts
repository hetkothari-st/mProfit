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

const LABEL =
  /(?:name of (?:the )?(?:assessee|employee|account holder)|name and address of the employee|name of (?:applicant|policy ?holder|the employee)|account holder(?: name)?|employee name|customer name|investor name|client name|depositor name|policy ?holder|applicant|name)\s*[:\-]?\s*([^\n]{3,80})/i;
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
    const m = LABEL.exec(line);
    if (m?.[1]) {
      const n = sanitizePersonName(m[1]);
      if (n) return n;
    }
  }
  return null;
}

const PAN = /\b(?:[A-Z]{5}|X{5})\d{4}[A-Z]\b/;
function extractPanLast4(text: string): string | null {
  const m = PAN.exec(text.slice(0, 6000));
  return m ? m[0].slice(-4) : null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const iso = (y: number, m: number, d: number): string => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const lastDay = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

function parseAllDates(text: string): Array<{ date: string; index: number }> {
  const out: Array<{ date: string; index: number }> = [];
  const numeric = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/g;
  const named = /\b(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ ,-]+(\d{4})\b/g;
  for (const m of text.matchAll(numeric)) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) out.push({ date: iso(y, mo, d), index: m.index ?? 0 });
  }
  for (const m of text.matchAll(named)) {
    const mo = MONTHS[(m[2] ?? '').toLowerCase()];
    if (mo) out.push({ date: iso(Number(m[3]), mo, Number(m[1])), index: m.index ?? 0 });
  }
  return out;
}

function extractDate(text: string, type: SortDocType, now: Date): string | null {
  const head = text.slice(0, 6000);
  if (type === 'ITR' || type === 'FORM_16') {
    // Assessment Year 2025-26 covers FY 2024-25, which ends 31 Mar 2025.
    const ay = /(?:assessment year|\bAY\b)\s*[: ]?\s*(\d{4})\s*[-–]\s*\d{2,4}/i.exec(head);
    if (ay?.[1]) return iso(Number(ay[1]), 3, 31);
    const fy = /financial year\s*[: ]?\s*(\d{4})\s*[-–]\s*\d{2,4}/i.exec(head);
    if (fy?.[1]) return iso(Number(fy[1]) + 1, 3, 31);
  }
  if (type === 'SALARY_SLIP') {
    const m =
      /(?:month(?: of)?|for|slip\s*[-–]?)\s*:?\s*([A-Za-z]{3})[a-z]*[ ,]+(\d{4})/i.exec(head) ??
      /\b([A-Za-z]{3})[a-z]*[ ,]+(\d{4})\b/.exec(head);
    const mo = m ? MONTHS[(m[1] ?? '').toLowerCase()] : undefined;
    if (m && mo) return iso(Number(m[2]), mo, lastDay(Number(m[2]), mo));
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
