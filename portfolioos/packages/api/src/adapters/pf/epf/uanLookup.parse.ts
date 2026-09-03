/**
 * Pure input validation and response parsing for EPFO's "Know your UAN".
 *
 * Deliberately separate from the browser automation. The DOM half of a portal
 * adapter cannot be tested without the portal, and EPFO changes its markup
 * without notice; everything that CAN be checked offline lives here so it is
 * covered by tests that do not depend on a government website being up or
 * unchanged. The adapter's job is reduced to fetching strings and handing them
 * to these functions.
 */

/** What the portal asks for, minus the captcha and OTP it collects itself. */
export interface UanLookupInput {
  /** Must be the number registered with EPFO — the OTP goes there. */
  mobile: string;
  /** PAN is preferred over Aadhaar: same result, far lighter obligations. */
  pan?: string;
  aadhaar?: string;
  memberId?: string;
  name: string;
  /** ISO date, yyyy-mm-dd. */
  dob: string;
}

export type UanLookupFailure =
  /** The portal found no UAN for these details. */
  | 'NO_RECORD'
  /** The mobile is not the one EPFO holds, so no OTP can reach the member. */
  | 'MOBILE_NOT_REGISTERED'
  /** Wrong captcha, retryable. */
  | 'CAPTCHA_REJECTED'
  /** Wrong or expired OTP, retryable. */
  | 'OTP_REJECTED'
  /** We no longer recognise the page. Adapter needs updating; fall back to
   *  manual entry and alert, rather than telling the user they have no UAN. */
  | 'PORTAL_CHANGED';

export type UanLookupOutcome =
  | { ok: true; uan: string; maskedName: string | null }
  | { ok: false; reason: UanLookupFailure; detail?: string };

const MOBILE = /^[6-9]\d{9}$/;
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
const AADHAAR = /^\d{12}$/;
/** EPFO UANs are 12 digits and, in practice, start with 1. */
const UAN = /\b(1\d{11})\b/;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  /** Normalised copy — trimmed, PAN upper-cased, digits stripped of spacing. */
  value?: UanLookupInput;
}

/**
 * Validate before touching the portal. Every rejected submission burns a
 * captcha and, worse, an OTP to the member's phone — so the cheap checks
 * belong on our side.
 */
export function validateLookupInput(raw: UanLookupInput): ValidationResult {
  const errors: string[] = [];

  const mobile = (raw.mobile ?? '').replace(/[\s-]/g, '').replace(/^\+?91/, '');
  if (!MOBILE.test(mobile)) {
    errors.push('Enter the 10-digit mobile number registered with EPFO.');
  }

  const name = (raw.name ?? '').trim();
  if (name.length < 2) errors.push('Enter the name as it appears in EPFO records.');

  const dob = (raw.dob ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(dob))) {
    errors.push('Enter the date of birth as yyyy-mm-dd.');
  }

  const pan = raw.pan ? raw.pan.trim().toUpperCase() : undefined;
  const aadhaar = raw.aadhaar ? raw.aadhaar.replace(/\s/g, '') : undefined;
  const memberId = raw.memberId ? raw.memberId.trim().toUpperCase() : undefined;

  if (pan && !PAN.test(pan)) errors.push('That does not look like a PAN.');
  if (aadhaar && !AADHAAR.test(aadhaar)) errors.push('An Aadhaar number is 12 digits.');

  // The portal needs exactly one of the three to identify the member.
  const provided = [pan, aadhaar, memberId].filter(Boolean).length;
  if (provided === 0) errors.push('Provide a PAN, Aadhaar or member ID.');
  if (provided > 1) errors.push('Provide only one of PAN, Aadhaar or member ID.');

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    value: { mobile, name, dob, ...(pan && { pan }), ...(aadhaar && { aadhaar }), ...(memberId && { memberId }) },
  };
}

/**
 * Read the portal's answer.
 *
 * Matched on the visible message rather than on markup, because the wording
 * survives redesigns far better than element ids do, and a wrong answer here
 * is worse than no answer: telling someone "you have no UAN" when the page
 * actually said "wrong captcha" sends them to an EPFO office for nothing.
 * Anything unrecognised is PORTAL_CHANGED, never NO_RECORD.
 */
export function parseLookupResponse(pageText: string): UanLookupOutcome {
  const text = (pageText ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, reason: 'PORTAL_CHANGED', detail: 'empty response' };

  const lower = text.toLowerCase();

  if (lower.includes('captcha') && /invalid|incorrect|wrong|not match/.test(lower)) {
    return { ok: false, reason: 'CAPTCHA_REJECTED' };
  }
  if (/otp/.test(lower) && /invalid|incorrect|expired|wrong/.test(lower)) {
    return { ok: false, reason: 'OTP_REJECTED' };
  }
  if (/mobile.*(not|isn'?t).*(register|match)|no.*mobile.*found/.test(lower)) {
    return { ok: false, reason: 'MOBILE_NOT_REGISTERED' };
  }
  if (/(no|not).*(uan|record).*(found|available|exist)|record not found/.test(lower)) {
    return { ok: false, reason: 'NO_RECORD' };
  }

  // Only accept a UAN when the page is actually presenting one. A bare
  // 12-digit number elsewhere on the page is not a result.
  if (/uan/.test(lower)) {
    const m = UAN.exec(text);
    if (m) {
      // Raw text, not the whitespace-normalised copy: the portal separates
      // fields with runs of whitespace, and that is the only reliable signal
      // for where the name ends.
      return { ok: true, uan: m[1]!, maskedName: extractMaskedName(pageText) };
    }
  }

  return { ok: false, reason: 'PORTAL_CHANGED', detail: text.slice(0, 200) };
}

/**
 * The portal echoes a partly-masked name back, which is worth showing so the
 * member can confirm it is really their record before we store the UAN.
 */
function extractMaskedName(text: string): string | null {
  // Stop at two or more whitespace characters, or the end — a single space is
  // part of the name, a run of them is the next field on the page.
  const m = /name[:\s]+([A-Za-z*.]+(?:[^\S\r\n][A-Za-z*.]+)*?)(?=\s{2,}|$)/i.exec(text);
  if (!m) return null;
  const name = m[1]!.trim().replace(/\s+/g, ' ');
  return name.length >= 2 ? name : null;
}

/** Never log or display a whole UAN; the last four are enough to identify it. */
export function maskUan(uan: string): string {
  return uan.length <= 4 ? uan : `${'•'.repeat(uan.length - 4)}${uan.slice(-4)}`;
}
