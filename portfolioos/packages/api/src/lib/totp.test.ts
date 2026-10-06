import { describe, it, expect } from 'vitest';
import { base32Decode, base32Encode, generateTotpSecret, otpauthUri, totpAt, verifyTotp } from './totp.js';

// RFC 6238 Appendix B (SHA-1): secret "12345678901234567890", 8-digit codes.
// We use 6 digits, which are the last 6 of the published 8.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const RFC_VECTORS: Array<[number, string]> = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
];

describe('totp', () => {
  it('matches the RFC 6238 test vectors', () => {
    for (const [t, code8] of RFC_VECTORS) {
      expect(totpAt(RFC_SECRET, Math.floor(t / 30))).toBe(code8.slice(-6));
    }
  });

  it('base32 round-trips', () => {
    const b = Buffer.from('any bytes \u0000ÿ');
    expect(base32Decode(base32Encode(b)).equals(b)).toBe(true);
  });

  it('accepts the current code and one step of drift, not two', () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(secret, totpAt(secret, step), { nowMs: now }).ok).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, step - 1), { nowMs: now }).ok).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, step + 2), { nowMs: now }).ok).toBe(false);
  });

  it('refuses a replayed code', () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const first = verifyTotp(secret, totpAt(secret, Math.floor(now / 30_000)), { nowMs: now });
    expect(first.ok).toBe(true);
    const again = verifyTotp(secret, totpAt(secret, Math.floor(now / 30_000)), {
      nowMs: now,
      afterStep: first.ok ? first.step : null,
    });
    expect(again.ok).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(verifyTotp(generateTotpSecret(), 'abcdef').ok).toBe(false);
    expect(verifyTotp(generateTotpSecret(), '12345').ok).toBe(false);
  });

  it('builds an otpauth URI authenticator apps accept', () => {
    const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'asha@example.com');
    expect(uri).toMatch(/^otpauth:\/\/totp\/EveryPaisa%3Aasha%40example\.com\?secret=JBSWY3DPEHPK3PXP&issuer=EveryPaisa/);
  });
});
