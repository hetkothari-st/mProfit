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
const PAN_RE = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const AADHAAR_RE = /\b\d{4}\s\d{4}\s\d{4}\b/g;

export function last4(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, '');
  return `XXXX${s.slice(-4)}`;
}

function maskText(s: string): string {
  if (DECIMAL.test(s)) return s;
  if (BARE_LONG_INT.test(s)) return last4(s)!;
  return s
    .replace(PAN_RE, (m) => last4(m)!)
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
