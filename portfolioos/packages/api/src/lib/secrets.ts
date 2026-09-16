import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ALGO = 'aes-256-gcm';

/**
 * Legacy key, committed to this repository. Used only when SECRETS_KEY is
 * unset — which production was confirmed to be on 2026-09-16 — and warned
 * about loudly at boot. Every broker credential, OAuth token and mailbox
 * password written without SECRETS_KEY is encrypted under it, which is why
 * decryptSecretWithKeyInfo still accepts it for pre-change (v1) payloads and
 * jobs/secretRotationJobs.ts re-encrypts them once a real key exists.
 */
const DEV_ONLY_KEY = 'dev-insecure-key-please-override-in-production-32b!';

let warnedAboutDevKey = false;

function getKey(): Buffer {
  const raw = env.SECRETS_KEY;
  if (!raw) {
    // Production without SECRETS_KEY keeps working on the legacy key — what it
    // has always done — rather than failing every broker/Gmail/mailbox call.
    // config/env.ts logs this as a SECURITY warning on every boot, and the
    // rotation job moves everything onto the real key once one is set.
    if (!warnedAboutDevKey) {
      warnedAboutDevKey = true;
      console.warn(
        '⚠️  SECRETS_KEY not set — using the insecure development key. Anything ' +
          'encrypted now is readable by anyone with this repository.',
      );
    }
    return crypto.createHash('sha256').update(DEV_ONLY_KEY).digest();
  }
  return crypto.createHash('sha256').update(raw).digest();
}

/**
 * Ciphertext layout version. Prefixing the payload means a future key rotation
 * can tell "encrypted under the previous key" apart from "corrupt", instead of
 * rotation silently turning every stored secret into an undecryptable blob.
 */
const VERSION = 'v2';

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const body = `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
  // `v2` means "encrypted under a real SECRETS_KEY". Without one, write the
  // unversioned legacy format instead. Otherwise a secret saved while running
  // on the legacy key would be tagged v2, v2 never falls back to the legacy
  // key, and the rotation job skips v2 — so setting SECRETS_KEY later would
  // strand it as permanently undecryptable.
  return env.SECRETS_KEY ? `${VERSION}.${body}` : body;
}

function decryptWith(key: Buffer, ivB64: string, tagB64: string, encB64: string): string {
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}

export function isCurrentFormat(payload: string): boolean {
  return payload.startsWith(`${VERSION}.`);
}

/**
 * Decrypt, reporting whether the legacy development key was needed.
 *
 * Production ran for a long time without SECRETS_KEY, so every value written
 * before it was set is an unversioned (v1) payload encrypted under
 * DEV_ONLY_KEY — a key published in this repository. Setting a real
 * SECRETS_KEY must not make those unreadable, and must not leave them under
 * the public key either. So:
 *
 *   - v2 payloads were written after this change, under the current key only.
 *   - v1 payloads try the current key first (a deployment that DID set
 *     SECRETS_KEY), then the legacy dev key.
 *
 * `usedLegacyKey` tells the caller the value must be re-encrypted;
 * jobs/secretRotationJobs.ts does that for every stored secret on start.
 * The GCM auth tag makes a wrong-key attempt fail loudly rather than return
 * garbage, which is what makes trying two keys safe.
 */
export function decryptSecretWithKeyInfo(payload: string): { plain: string; usedLegacyKey: boolean } {
  const parts = payload.split('.');
  const versioned = parts.length === 4;
  const [ivB64, tagB64, encB64] = versioned ? parts.slice(1) : parts;
  if (!ivB64 || !tagB64 || !encB64) throw new Error('Invalid encrypted payload');

  const current = getKey();
  if (versioned) return { plain: decryptWith(current, ivB64, tagB64, encB64), usedLegacyKey: false };

  try {
    return { plain: decryptWith(current, ivB64, tagB64, encB64), usedLegacyKey: false };
  } catch (err) {
    const legacy = crypto.createHash('sha256').update(DEV_ONLY_KEY).digest();
    if (legacy.equals(current)) throw err; // already tried it
    return { plain: decryptWith(legacy, ivB64, tagB64, encB64), usedLegacyKey: true };
  }
}

export function decryptSecret(payload: string): string {
  return decryptSecretWithKeyInfo(payload).plain;
}
