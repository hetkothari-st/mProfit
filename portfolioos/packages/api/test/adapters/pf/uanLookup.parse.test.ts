import { describe, it, expect } from 'vitest';
import {
  validateLookupInput,
  parseLookupResponse,
  maskUan,
  type UanLookupInput,
} from '../../../src/adapters/pf/epf/uanLookup.parse.js';

function input(over: Partial<UanLookupInput> = {}): UanLookupInput {
  return { mobile: '9876543210', pan: 'ABCDE1234F', name: 'Asha Rao', dob: '1990-04-12', ...over };
}

describe('validateLookupInput', () => {
  it('accepts a well-formed submission and normalises it', () => {
    const r = validateLookupInput(input({ mobile: '+91 98765 43210', pan: 'abcde1234f' }));
    expect(r.ok).toBe(true);
    // Normalised so the adapter never has to think about formatting.
    expect(r.value?.mobile).toBe('9876543210');
    expect(r.value?.pan).toBe('ABCDE1234F');
  });

  it('rejects a mobile that cannot be an Indian number', () => {
    expect(validateLookupInput(input({ mobile: '1234567890' })).ok).toBe(false);
    expect(validateLookupInput(input({ mobile: '98765' })).ok).toBe(false);
  });

  it('requires exactly one identifying document', () => {
    // Every rejected submission costs the member a real OTP, so this is
    // checked here rather than discovered at the portal.
    const none = validateLookupInput({ ...input(), pan: undefined });
    expect(none.ok).toBe(false);
    expect(none.errors.join(' ')).toMatch(/PAN, Aadhaar or member ID/);

    const both = validateLookupInput(input({ aadhaar: '123456789012' }));
    expect(both.ok).toBe(false);
    expect(both.errors.join(' ')).toMatch(/only one/);
  });

  it('rejects a malformed PAN or Aadhaar', () => {
    expect(validateLookupInput(input({ pan: 'NOTAPAN' })).ok).toBe(false);
    expect(validateLookupInput(input({ pan: undefined, aadhaar: '12345' })).ok).toBe(false);
  });

  it('rejects a date of birth that is not an ISO date', () => {
    expect(validateLookupInput(input({ dob: '12/04/1990' })).ok).toBe(false);
    expect(validateLookupInput(input({ dob: '1990-13-45' })).ok).toBe(false);
  });
});

describe('parseLookupResponse', () => {
  it('reads the UAN out of a success page', () => {
    const r = parseLookupResponse('Your UAN is 100234567890 and has been sent to your mobile.');
    expect(r).toEqual({ ok: true, uan: '100234567890', maskedName: null });
  });

  it('returns the masked name so the member can confirm the record is theirs', () => {
    const r = parseLookupResponse('UAN: 100234567890  Name: ASHA R**    Sent via SMS');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.maskedName).toBe('ASHA R**');
  });

  it('distinguishes a rejected captcha from a missing record', () => {
    expect(parseLookupResponse('Invalid captcha, please try again')).toEqual({
      ok: false,
      reason: 'CAPTCHA_REJECTED',
    });
  });

  it('distinguishes a rejected OTP from a missing record', () => {
    expect(parseLookupResponse('The OTP entered is incorrect or has expired')).toEqual({
      ok: false,
      reason: 'OTP_REJECTED',
    });
  });

  it('recognises an unregistered mobile, the common dead end', () => {
    const r = parseLookupResponse('This mobile number is not registered with EPFO');
    expect(r).toEqual({ ok: false, reason: 'MOBILE_NOT_REGISTERED' });
  });

  it('recognises a genuine no-record answer', () => {
    expect(parseLookupResponse('No UAN found for the details provided')).toEqual({
      ok: false,
      reason: 'NO_RECORD',
    });
  });

  it('treats anything unrecognised as PORTAL_CHANGED, never as NO_RECORD', () => {
    // The important one. Telling a member "you have no UAN" because the page
    // was redesigned sends them to an EPFO office for nothing.
    const r = parseLookupResponse('<div>Service temporarily unavailable</div>');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('PORTAL_CHANGED');
  });

  it('treats an empty response as PORTAL_CHANGED', () => {
    const r = parseLookupResponse('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('PORTAL_CHANGED');
  });

  it('does not mistake an unrelated 12-digit number for a UAN', () => {
    // No "UAN" anywhere on the page: this is somebody's Aadhaar echoed back,
    // and returning it as a UAN would store the wrong identifier.
    const r = parseLookupResponse('Aadhaar 123456789012 verified successfully');
    expect(r.ok).toBe(false);
  });
});

describe('maskUan', () => {
  it('shows only the last four digits', () => {
    expect(maskUan('100234567890')).toBe('••••••••7890');
  });

  it('leaves a short string alone rather than mangling it', () => {
    expect(maskUan('7890')).toBe('7890');
  });
});
