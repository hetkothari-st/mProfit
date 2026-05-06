import { describe, it, expect, beforeAll } from 'vitest';
import {
  encryptCredentialBlob,
  decryptCredentialBlob,
  encryptIdentifier,
  decryptIdentifier,
  last4,
} from '../../src/services/pfCredentials.service.js';

beforeAll(() => {
  // 32-byte key, base64.
  process.env.APP_ENCRYPTION_KEY =
    'dGVzdC1rZXktMzItYnl0ZXMtZm9yLWVwZi1hZXMtZ2NtMTIzNDU=';
});

describe('pfCredentials', () => {
  it('round-trips a credential blob', async () => {
    const ct = await encryptCredentialBlob({ username: 'user1', password: 'pass!1' });
    expect(ct).toMatch(/^[A-Za-z0-9+/=]+$/);
    const pt = await decryptCredentialBlob(ct);
    expect(pt).toEqual({ username: 'user1', password: 'pass!1' });
  });

  it('round-trips a credential blob with optional mpin', async () => {
    const ct = await encryptCredentialBlob({ username: 'u', password: 'p', mpin: '1234' });
    const pt = await decryptCredentialBlob(ct);
    expect(pt).toEqual({ username: 'u', password: 'p', mpin: '1234' });
  });

  it('produces different ciphertexts for same plaintext (random IV)', async () => {
    const a = await encryptCredentialBlob({ username: 'u', password: 'p' });
    const b = await encryptCredentialBlob({ username: 'u', password: 'p' });
    expect(a).not.toEqual(b);
  });

  it('round-trips identifier and computes last4', async () => {
    const ct = await encryptIdentifier('123456789012');
    const pt = await decryptIdentifier(ct);
    expect(pt).toBe('123456789012');
    expect(last4('123456789012')).toBe('9012');
  });

  it('last4 strips non-digit characters', () => {
    expect(last4('AB-12-345-6789')).toBe('6789');
  });

  it('last4 falls back to last 4 chars when no digits', () => {
    expect(last4('ABCDEFG')).toBe('DEFG');
  });

  it('rejects ciphertext when key missing', async () => {
    const ct = await encryptCredentialBlob({ username: 'u', password: 'p' });
    const original = process.env.APP_ENCRYPTION_KEY;
    delete process.env.APP_ENCRYPTION_KEY;
    await expect(decryptCredentialBlob(ct)).rejects.toThrow(/APP_ENCRYPTION_KEY/);
    process.env.APP_ENCRYPTION_KEY = original;
  });

  it('rejects ciphertext that is too short', async () => {
    await expect(decryptIdentifier('YQ==')).rejects.toThrow();
  });

  it('rejects tampered ciphertext (auth tag mismatch)', async () => {
    const ct = await encryptIdentifier('123456789012');
    // Flip a byte in the ciphertext payload region (after IV+tag, i.e. position > 28)
    const buf = Buffer.from(ct, 'base64');
    if (buf.length < 30) throw new Error('Ciphertext shorter than expected');
    buf[buf.length - 1] = buf[buf.length - 1] ^ 0x01;
    const tampered = buf.toString('base64');
    await expect(decryptIdentifier(tampered)).rejects.toThrow();
  });

  it('rejects key that does not decode to 32 bytes', async () => {
    const original = process.env.APP_ENCRYPTION_KEY;
    process.env.APP_ENCRYPTION_KEY = Buffer.from('short').toString('base64');
    await expect(encryptCredentialBlob({ username: 'u', password: 'p' })).rejects.toThrow(/32 bytes/);
    process.env.APP_ENCRYPTION_KEY = original;
  });
});
