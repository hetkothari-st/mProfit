import { describe, it, expect } from 'vitest';
import {
  validateResetInput,
  validateNewPassword,
  parseResetResponse,
  type PasswordResetInput,
} from '../../../src/adapters/pf/epf/passwordReset.parse.js';

function input(over: Partial<PasswordResetInput> = {}): PasswordResetInput {
  return { uan: '100234567890', mobile: '9876543210', newPassword: 'Str0ng!pass', ...over };
}

describe('validateResetInput', () => {
  it('accepts a valid submission and normalises it', () => {
    const r = validateResetInput(input({ mobile: '+91 98765 43210', uan: '1002 3456 7890' }));
    expect(r.ok).toBe(true);
    expect(r.value?.mobile).toBe('9876543210');
    expect(r.value?.uan).toBe('100234567890');
  });

  it('rejects an email in the UAN field, and says so plainly', () => {
    // The mistake the refresh dialog was inviting: EPFO has no username or
    // email login, only the UAN.
    const r = validateResetInput(input({ uan: 'someone@gmail.com' }));
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/12-digit UAN/);
    expect(r.errors.join(' ')).toMatch(/not an email/i);
  });

  it('rejects a UAN of the wrong length', () => {
    expect(validateResetInput(input({ uan: '12345' })).ok).toBe(false);
    expect(validateResetInput(input({ uan: '1002345678901' })).ok).toBe(false);
  });

  it('rejects a mobile that cannot be an Indian number', () => {
    expect(validateResetInput(input({ mobile: '1234567890' })).ok).toBe(false);
  });
});

describe('validateNewPassword', () => {
  it('accepts a password meeting every rule', () => {
    expect(validateNewPassword('Str0ng!pass')).toEqual([]);
  });

  it('states every rule the password breaks, not just the first', () => {
    // One round trip, one complete answer — the member should not have to
    // discover the policy a rule at a time.
    const errors = validateNewPassword('abc');
    expect(errors.length).toBeGreaterThan(1);
    expect(errors.join(' ')).toMatch(/7 to 20/);
    expect(errors.join(' ')).toMatch(/digit/);
    expect(errors.join(' ')).toMatch(/special/);
  });

  it('requires a letter, a digit and a special character', () => {
    expect(validateNewPassword('12345678').join(' ')).toMatch(/letter/);
    expect(validateNewPassword('abcdefg!').join(' ')).toMatch(/digit/);
    expect(validateNewPassword('abcdefg1').join(' ')).toMatch(/special/);
  });
});

describe('parseResetResponse', () => {
  it('recognises a successful reset', () => {
    expect(parseResetResponse('Your password has been changed successfully')).toEqual({ ok: true });
    expect(parseResetResponse('Password reset successfully.')).toEqual({ ok: true });
  });

  it('does not read the form itself as success', () => {
    // "password" appears on the page whether or not anything happened.
    const r = parseResetResponse('Enter your new password and confirm password');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('PORTAL_CHANGED');
  });

  it('separates a captcha rejection from an OTP one', () => {
    expect(parseResetResponse('Invalid captcha')).toEqual({ ok: false, reason: 'CAPTCHA_REJECTED' });
    expect(parseResetResponse('OTP has expired')).toEqual({ ok: false, reason: 'OTP_REJECTED' });
  });

  it('recognises a mobile that does not match the UAN', () => {
    const r = parseResetResponse('The mobile number does not match our records');
    expect(r).toEqual({ ok: false, reason: 'MOBILE_MISMATCH' });
  });

  it('recognises an unknown UAN', () => {
    expect(parseResetResponse('Invalid UAN')).toEqual({ ok: false, reason: 'UAN_NOT_FOUND' });
  });

  it('recognises a password the portal refused', () => {
    const r = parseResetResponse('Password does not meet the required criteria');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('PASSWORD_REJECTED');
  });

  it('treats anything unrecognised as PORTAL_CHANGED', () => {
    // Never guess a specific rejection: the member must not be told their UAN
    // is invalid because a page was redesigned. And after an unknown response
    // we genuinely do not know whether the password changed, which is what the
    // PORTAL_CHANGED copy says.
    const r = parseResetResponse('<html>Service unavailable</html>');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('PORTAL_CHANGED');
  });
});
