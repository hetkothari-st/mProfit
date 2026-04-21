/**
 * PII redaction before LLM calls (CLAUDE.md §15.9).
 *
 * Every email body that leaves this process toward the Claude API MUST go
 * through {@link redactForLlm} first. The intent is defence-in-depth: even
 * with Anthropic's zero-retention header set, the fewer raw PAN / Aadhaar /
 * account numbers we ship off-box, the smaller the blast radius if anything
 * upstream is ever mis-configured.
 *
 * The redactor preserves enough context for the model to still parse the
 * event correctly — amounts, dates, ISINs, institution names, symbols stay
 * untouched. Only identifiers that uniquely tie back to a human (or that
 * aid account takeover — CVV/OTP/PIN) are masked.
 *
 * Match rules are conservative: we keep the last 4 digits of long
 * identifiers because that's already standard practice in every bank
 * statement ("A/c XXXX1234") and it helps the model disambiguate between
 * multiple accounts in the same email. For truly sensitive tokens
 * (CVV/PIN/OTP) we blank entirely.
 */

export interface RedactionResult {
  text: string;
  /** Per-category count of matches replaced. Useful for audit log telemetry. */
  stats: Record<RedactionCategory, number>;
}

export type RedactionCategory =
  | 'pan'
  | 'aadhaar'
  | 'account'
  | 'phone'
  | 'cvv'
  | 'pin'
  | 'otp';

/** PAN format: 5 letters + 4 digits + 1 letter (ABCDE1234F). */
const PAN_RE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;

/**
 * Aadhaar: 12 digits as 3 groups of 4, optionally separated by space/hyphen.
 * Uses digit-lookaround boundaries (not `\b`) so the pattern still catches
 * runs that sit flush against letters (SMS-style `Aadhaar123456789012`)
 * while refusing to partial-match the first 12 digits of a 14-digit number.
 */
const AADHAAR_RE = /(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g;

/**
 * Long account-number-ish digit runs. We only match inside a labelled
 * context ("A/c", "account", "acct", "a/c no") so we don't accidentally
 * nuke a transaction ID, order number, or any other benign digit string
 * that happens to be 9–16 digits long. The last 4 are preserved.
 *
 * The regex matches the label + some glue + a 9-16 digit run, and the
 * replacement callback rewrites the digit run only — keeping the label
 * intact so the model still knows what the number referred to.
 */
const ACCOUNT_LABEL_RE =
  /((?:a\/c|account|acct|a\/c\s*no\.?|account\s*number)[^\d\n]{0,10})(\d{9,16})\b/gi;

/**
 * Phone: Indian mobile — 10 digits starting 6-9, optionally prefixed with
 * +91 / 91 / 0. Separators (space or hyphen) may appear anywhere between
 * digits, so we match "digit + optional-separator" 10 times instead of
 * hard-coding a 3-3-4 split — some banks emit 5-5 ("98765-43210") and
 * others write the whole thing flush. Digit-lookaround boundaries
 * prevent us from pulling a 10-digit subsequence out of a longer
 * transaction / order number.
 */
const PHONE_RE = /(?<!\d)(?:\+?91[\s-]?|0)?[6-9](?:[\s-]?\d){9}(?!\d)/g;

/**
 * Credit-card CVV: 3 or 4 digits *inside* a labelled context. Blanked
 * entirely — the model gains nothing from seeing a CVV and it's the
 * highest-blast-radius token in a payment alert.
 */
const CVV_RE = /(cvv\s*(?:no\.?|number)?\s*[:=]?\s*)\d{3,4}\b/gi;

/**
 * PIN: similar treatment. Matches "PIN" / "ATM PIN" / "card PIN" optionally
 * followed by "no./number/is/:/=" glue then 4-6 digits. Blanked entirely.
 */
const PIN_RE =
  /((?:atm|card)?\s*pin\s*(?:(?:no\.?|number|is|=|:)\s*)*)\d{4,6}\b/gi;

/**
 * OTP: 4-8 digit codes introduced by "OTP" keyword. Blanked entirely so
 * a leaked email body + leaked LLM prompt can never combine into an
 * auth-bypass.
 */
const OTP_RE = /(otp\s*(?:is|:|=)?\s*)\d{4,8}\b/gi;

/** Keep last 4 of a digit run, mask the rest with X's. */
function maskKeepLast4(digits: string, maskChar = 'X'): string {
  if (digits.length <= 4) return digits;
  return maskChar.repeat(digits.length - 4) + digits.slice(-4);
}

/**
 * Redact PII from text headed to the LLM. Returns new text plus a
 * per-category match count (for audit log / cost reasoning).
 *
 * The function runs each pattern once, independently — we don't bother
 * composing them because a PAN inside an account-label context is
 * nonsensical, and cascading replacements on already-masked text would
 * just waste cycles.
 */
export function redactForLlm(input: string): RedactionResult {
  const stats: Record<RedactionCategory, number> = {
    pan: 0,
    aadhaar: 0,
    account: 0,
    phone: 0,
    cvv: 0,
    pin: 0,
    otp: 0,
  };

  let s = input;

  // PAN — keep last 4 digits + the trailing letter. Full PAN has 10 chars
  // (5 letters + 4 digits + 1 letter); we mask the first 5 letters and
  // show digits+letter so the last 4 characters remain a meaningful tag.
  s = s.replace(PAN_RE, (m) => {
    stats.pan++;
    return 'XXXXX' + m.slice(5);
  });

  // Aadhaar — 12 digits. Show last 4 only.
  s = s.replace(AADHAAR_RE, (m) => {
    stats.aadhaar++;
    const digits = m.replace(/[\s-]/g, '');
    return 'XXXX XXXX ' + digits.slice(-4);
  });

  // Account numbers (labelled context). Preserve the label prefix,
  // mask the digits to keep-last-4.
  s = s.replace(ACCOUNT_LABEL_RE, (_m, label: string, digits: string) => {
    stats.account++;
    return label + maskKeepLast4(digits);
  });

  // CVV / PIN / OTP — blank the value entirely.
  s = s.replace(CVV_RE, (_m, label: string) => {
    stats.cvv++;
    return label + '[REDACTED]';
  });
  s = s.replace(PIN_RE, (_m, label: string) => {
    stats.pin++;
    return label + '[REDACTED]';
  });
  s = s.replace(OTP_RE, (_m, label: string) => {
    stats.otp++;
    return label + '[REDACTED]';
  });

  // Phone — do this LAST because the account-number regex could have
  // pre-consumed digit runs that live in phone-shaped positions (unlikely
  // but worth ordering for determinism).
  s = s.replace(PHONE_RE, (m) => {
    stats.phone++;
    const digits = m.replace(/\D/g, '');
    return 'XXXXXXX' + digits.slice(-4);
  });

  return { text: s, stats };
}

/**
 * Shortcut for callers that only need the redacted string and don't want
 * to destructure stats. Prefer {@link redactForLlm} when you plan to log
 * the category counts.
 */
export function redactText(input: string): string {
  return redactForLlm(input).text;
}
