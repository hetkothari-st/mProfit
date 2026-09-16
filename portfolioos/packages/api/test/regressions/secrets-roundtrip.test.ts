import { describe, it, expect, beforeAll } from 'vitest';

/**
 * SEC-03 — the ciphertext format gained a version prefix so a future key
 * rotation can distinguish "encrypted under the old key" from "corrupt".
 * Rows written before that change carry no prefix and must stay readable in
 * place, because there is no backfill.
 */

let encryptSecret: (s: string) => string;
let decryptSecret: (s: string) => string;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.SECRETS_KEY = 'test-secrets-key-that-is-long-enough-32';
  const mod = await import('../../src/lib/secrets.js');
  encryptSecret = mod.encryptSecret;
  decryptSecret = mod.decryptSecret;
});

describe('SEC-03: secret encryption round-trip and format versioning', () => {
  it('round-trips a value', () => {
    const plain = 'broker-api-secret-value';
    expect(decryptSecret(encryptSecret(plain))).toBe(plain);
  });

  it('emits the v2 version prefix', () => {
    const payload = encryptSecret('x');
    expect(payload.split('.')).toHaveLength(4);
    expect(payload.startsWith('v2.')).toBe(true);
  });

  it('still decrypts unversioned v1 payloads written before the change', () => {
    // A v1 payload is exactly a v2 payload with the version segment removed —
    // same cipher, same key, same IV and tag.
    const v2 = encryptSecret('legacy-value');
    const v1 = v2.split('.').slice(1).join('.');
    expect(decryptSecret(v1)).toBe('legacy-value');
  });

  it('rejects a tampered ciphertext rather than returning garbage', () => {
    const payload = encryptSecret('sensitive');
    const parts = payload.split('.');
    // Flip a byte in the ciphertext segment; GCM's auth tag must catch it.
    const raw = Buffer.from(parts[3]!, 'base64');
    raw[0] = raw[0]! ^ 0xff;
    parts[3] = raw.toString('base64');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });

  it('rejects a malformed payload', () => {
    expect(() => decryptSecret('not-a-valid-payload')).toThrow('Invalid encrypted payload');
  });
});
