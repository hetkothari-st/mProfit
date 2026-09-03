/**
 * Pure validation and response parsing for an EPFO portal password reset.
 *
 * Same split as the UAN lookup: everything checkable offline lives here and is
 * tested, and the browser file is left with nothing but "fetch a string, hand
 * it to this". EPFO changes its markup without notice, so the less judgement
 * that sits next to a selector, the less breaks when one moves.
 */

export interface PasswordResetInput {
  /** The 12-digit UAN. Not an email — the portal has no other login. */
  uan: string;
  /** Must be the number EPFO holds; the OTP goes there and nowhere else. */
  mobile: string;
  /** What the member wants the new password to be. */
  newPassword: string;
}

export type PasswordResetFailure =
  | 'UAN_NOT_FOUND'
  /** The mobile given is not the one EPFO has on file for this UAN. */
  | 'MOBILE_MISMATCH'
  | 'CAPTCHA_REJECTED'
  | 'OTP_REJECTED'
  /** The portal refused the new password on its own policy grounds. */
  | 'PASSWORD_REJECTED'
  /** Page no longer recognised — our problem, not the member's. */
  | 'PORTAL_CHANGED';

export type PasswordResetOutcome =
  | { ok: true }
  | { ok: false; reason: PasswordResetFailure; detail?: string };

const UAN = /^\d{12}$/;
const MOBILE = /^[6-9]\d{9}$/;

export interface ResetValidation {
  ok: boolean;
  errors: string[];
  value?: PasswordResetInput;
}

/**
 * EPFO's own password policy, as far as it can be checked without asking it:
 * 7-20 characters, with at least one letter, one digit and one special
 * character. Checking here means a member is told immediately, rather than
 * after spending a captcha and an OTP to find out.
 */
export function validateNewPassword(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 7 || password.length > 20) {
    errors.push('Password must be 7 to 20 characters.');
  }
  if (!/[A-Za-z]/.test(password)) errors.push('Password must include a letter.');
  if (!/\d/.test(password)) errors.push('Password must include a digit.');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Password must include a special character.');
  return errors;
}

export function validateResetInput(raw: PasswordResetInput): ResetValidation {
  const errors: string[] = [];

  const uan = (raw.uan ?? '').replace(/[\s-]/g, '');
  if (!UAN.test(uan)) {
    // The commonest mistake by far: people type the email or username they use
    // elsewhere. The portal only knows the UAN.
    errors.push('Enter your 12-digit UAN — not an email address or username.');
  }

  const mobile = (raw.mobile ?? '').replace(/[\s-]/g, '').replace(/^\+?91/, '');
  if (!MOBILE.test(mobile)) {
    errors.push('Enter the 10-digit mobile number registered with EPFO.');
  }

  errors.push(...validateNewPassword(raw.newPassword ?? ''));

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { uan, mobile, newPassword: raw.newPassword } };
}

/**
 * Read the portal's answer.
 *
 * Matched on wording rather than markup, and anything unfamiliar is
 * PORTAL_CHANGED — never a specific rejection. Telling a member their UAN does
 * not exist because a selector moved sends them somewhere they do not need to
 * go.
 */
export function parseResetResponse(pageText: string): PasswordResetOutcome {
  const text = (pageText ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, reason: 'PORTAL_CHANGED', detail: 'empty response' };

  const lower = text.toLowerCase();

  if (lower.includes('captcha') && /invalid|incorrect|wrong|not match/.test(lower)) {
    return { ok: false, reason: 'CAPTCHA_REJECTED' };
  }
  if (/otp/.test(lower) && /invalid|incorrect|expired|wrong/.test(lower)) {
    return { ok: false, reason: 'OTP_REJECTED' };
  }
  if (/mobile.*(not|does ?n'?t).*(match|register)|different mobile/.test(lower)) {
    return { ok: false, reason: 'MOBILE_MISMATCH' };
  }
  if (/uan.*(not|isn'?t).*(valid|found|exist)|invalid uan/.test(lower)) {
    return { ok: false, reason: 'UAN_NOT_FOUND' };
  }
  if (/password.*(policy|criteria|not allowed|too weak|same as)/.test(lower)) {
    return { ok: false, reason: 'PASSWORD_REJECTED', detail: text.slice(0, 200) };
  }

  // Only a clear confirmation counts. "password" appearing on the page is not
  // success — the form says that word too.
  if (/password (has been |successfully )?(changed|reset|updated)|successfully (changed|reset|updated)/.test(lower)) {
    return { ok: true };
  }

  return { ok: false, reason: 'PORTAL_CHANGED', detail: text.slice(0, 200) };
}

/** What to tell the member. Each dead end has a different next step. */
export const RESET_FAILURE_MESSAGE: Record<PasswordResetFailure, string> = {
  UAN_NOT_FOUND: 'EPFO does not recognise that UAN. Check the 12 digits against your payslip.',
  MOBILE_MISMATCH:
    'That is not the mobile number EPFO holds for this UAN, so it cannot receive the OTP. Only EPFO or a previous employer can change the registered number.',
  CAPTCHA_REJECTED: 'The captcha did not match. Try again.',
  OTP_REJECTED: 'That OTP was wrong or has expired. Request a new one.',
  PASSWORD_REJECTED: 'EPFO rejected that password. Choose a different one.',
  PORTAL_CHANGED:
    'We could not read the EPFO response, so we do not know whether the password changed. Check by signing in at the EPFO portal before trying again.',
};
