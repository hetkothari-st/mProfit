import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  decryptSecret,
  decryptSecretWithKeyInfo,
  encryptSecret,
  isCurrentFormat,
} from '../../src/lib/secrets.js';
import { env } from '../../src/config/env.js';

/**
 * Production ran without SECRETS_KEY (confirmed against the Railway service's
 * variables on 2026-09-16), so every stored third-party secret there is an
 * unversioned payload encrypted under the development key committed to this
 * repo. Setting a real key must neither break those values nor leave them on
 * the public key.
 */

/** Build a pre-change (v1, unversioned) payload under the legacy dev key. */
function legacyV1(plain: string): string {
  const key = crypto
    .createHash('sha256')
    .update('dev-insecure-key-please-override-in-production-32b!')
    .digest();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}

describe('legacy dev-key ciphertext stays readable after SECRETS_KEY is set', () => {
  it('decrypts a v1 value written under the old dev key, and says so', () => {
    const payload = legacyV1('gmail-refresh-token');
    const r = decryptSecretWithKeyInfo(payload);
    expect(r.plain).toBe('gmail-refresh-token');
    expect(r.usedLegacyKey).toBe(true);
  });

  it('re-encrypting moves it to the current format under the real key', () => {
    const rotated = encryptSecret(decryptSecret(legacyV1('broker-api-secret')));
    expect(isCurrentFormat(rotated)).toBe(true);
    const r = decryptSecretWithKeyInfo(rotated);
    expect(r.plain).toBe('broker-api-secret');
    expect(r.usedLegacyKey).toBe(false);
  });

  it('never falls back to the legacy key for current-format (v2) values', () => {
    // A v2 payload built under the dev key must NOT decrypt: v2 means "written
    // after SECRETS_KEY existed", so accepting the public key there would let
    // anyone who knows it forge stored secrets.
    const v1 = legacyV1('forged');
    expect(() => decryptSecret(`v2.${v1}`)).toThrow();
  });

  it('rejects a value under neither key rather than returning garbage', () => {
    const otherKey = crypto.createHash('sha256').update('some-other-key').digest();
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', otherKey, iv);
    const enc = Buffer.concat([c.update('x', 'utf8'), c.final()]);
    const payload = `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
    expect(() => decryptSecret(payload)).toThrow();
  });
});

describe('a secret saved before SECRETS_KEY is set survives the key being set', () => {
  /**
   * The exact sequence production will go through: deploy without the key,
   * users keep saving broker/Gmail credentials, then the key is set.
   */
  it('writes the legacy format without a key, so rotation can still reach it', () => {
    const real = env.SECRETS_KEY;
    try {
      (env as { SECRETS_KEY?: string }).SECRETS_KEY = undefined;
      const savedWithoutKey = encryptSecret('saved-before-key');
      // Must NOT be tagged v2 — v2 never falls back to the legacy key.
      expect(isCurrentFormat(savedWithoutKey)).toBe(false);

      (env as { SECRETS_KEY?: string }).SECRETS_KEY = real;
      const r = decryptSecretWithKeyInfo(savedWithoutKey);
      expect(r.plain).toBe('saved-before-key');
      expect(r.usedLegacyKey).toBe(true);
    } finally {
      (env as { SECRETS_KEY?: string }).SECRETS_KEY = real;
    }
  });
});
