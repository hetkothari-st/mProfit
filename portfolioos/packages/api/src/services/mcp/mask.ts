import { redactText } from '../../ingestion/pii.js';

/**
 * The one masking layer every connector tool result passes through before it
 * leaves for OpenAI/Anthropic. Tools already select explicit fields; this is
 * the backstop for identifiers that slip in through free text (a narration
 * holding an account number) or a field added later.
 */
const ID_KEY = /^(account(number|no)?|cardnumber|card(no)?|policy(number|no)|folio(number|no)?|pan|aadhaar|pran|uan|registration(number|no)?|chassis(number|no)?|engine(number|no)?|identifier|ifsc|upiid|memberid)$/i;
const DECIMAL = /^-?\d+\.\d+$/;
const BARE_LONG_INT = /^\d{9,}$/;
const LONG_DIGITS = /(?<![\d.])\d{9,}(?![\d.])/g;
const PAN_RE = /\b[A-Za-z]{5}\d{4}[A-Za-z]\b/g;
// Digit groups joined by single spaces or hyphens (phones, cards, accounts).
// Commas, dots and slashes break a group, so Indian amounts and dates survive.
const DIGIT_GROUPS = /(?<![\d.,/])\d(?:[ -]?\d){8,}(?![\d.,/])/g;
// Indian vehicle plates: MH47BT5950, MH 12 AB 1234, DL3CAF0001.
const PLATE_RE = /\b[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{0,3}[ -]?\d{4}\b/gi;
const EMAIL_OR_UPI = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)/g;
const AADHAAR_RE = /\b\d{4}\s\d{4}\s\d{4}\b/g;

export function last4(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, '');
  return `XXXX${s.slice(-4)}`;
}

function maskText(s: string): string {
  if (DECIMAL.test(s)) return s;
  if (BARE_LONG_INT.test(s)) return last4(s)!;
  // Whole digit groups first (a 16-digit card must not be split by the
  // Aadhaar rule into 12 + 4), then the shared LLM redactor (PAN, Aadhaar,
  // labelled accounts, CVV/PIN/OTP, phones), then the shapes it does not cover.
  const grouped = s.replace(DIGIT_GROUPS, (m) => last4(m.replace(/\D/g, ''))!);
  return redactText(grouped)
    .replace(EMAIL_OR_UPI, (_m, domain: string) => `XXXX@${domain}`)
    .replace(PAN_RE, (m) => last4(m)!)
    .replace(PLATE_RE, (m) => last4(m.replace(/[ -]/g, ''))!)
    .replace(AADHAAR_RE, (m) => last4(m)!)
    .replace(LONG_DIGITS, (m) => last4(m)!);
}

function walk(v: unknown, key: string | null): unknown {
  if (typeof v === 'string') {
    if (key !== null && ID_KEY.test(key)) return last4(v);
    return maskText(v);
  }
  if (Array.isArray(v)) return v.map((x) => walk(x, null));
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = walk(x, k);
    return out;
  }
  return v;
}

export function maskForChatbot<T>(value: T): T {
  return walk(value, null) as T;
}
