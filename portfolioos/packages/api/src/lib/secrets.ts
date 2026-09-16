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

export function decryptSecret(payload: string): string {
  const parts = payload.split('.');
  // v2 carries a leading version tag; rows written before this change do not.
  // Both are the same cipher under the same key, so existing rows stay
  // readable in place — no backfill — and re-encrypt to v2 next time they are
  // written.
  const [ivB64, tagB64, encB64] = parts.length === 4 ? parts.slice(1) : parts;
  if (!ivB64 || !tagB64 || !encB64) throw new Error('Invalid encrypted payload');
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}
