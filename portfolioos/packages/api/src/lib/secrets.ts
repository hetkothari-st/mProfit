import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ALGO = 'aes-256-gcm';

/**
 * Dev-only key. Production cannot reach it: config/env.ts refuses to boot when
 * SECRETS_KEY is unset with NODE_ENV=production, so by the time anything here
 * runs in production, env.SECRETS_KEY is present.
 *
 * This used to be the fallback for ALL environments, which meant a production
 * deployment that forgot the variable encrypted every broker credential, OAuth
 * token and mailbox password under a key committed to this repository.
 */
const DEV_ONLY_KEY = 'dev-insecure-key-please-override-in-production-32b!';

let warnedAboutDevKey = false;

function getKey(): Buffer {
  const raw = env.SECRETS_KEY;
  if (!raw) {
    // Belt and braces — env.ts has already exited the process in production.
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'SECRETS_KEY is not set. Refusing to encrypt or decrypt secrets with a known key.',
      );
    }
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
  return `${VERSION}.${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
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
