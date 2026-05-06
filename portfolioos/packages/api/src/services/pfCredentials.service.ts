/**
 * pfCredentials.service.ts
 *
 * AES-256-GCM encryption/decryption for provident-fund credentials and identifiers.
 *
 * Wire format: [iv(12 bytes) || authTag(16 bytes) || ciphertext(n bytes)] → base64 string.
 *
 * Key source: process.env.APP_ENCRYPTION_KEY — base64-encoded 32-byte key.
 * The functions are declared async so callers can transparently migrate to a
 * secret-manager (Parameter Store, etc.) backend without a breaking API change.
 *
 * Chosen over alternatives:
 *   - `libsodium-wrappers`: larger dep, overkill for symmetric blob encryption.
 *   - `argon2` + custom KDF: unnecessary key-stretching when the env var is already
 *     a 32-byte random key from a secret store.
 *   - Node `crypto` (built-in, no extra dep) is the correct choice here.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface CredentialBlob {
  username: string;
  password: string;
  mpin?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function loadKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error('APP_ENCRYPTION_KEY env var not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `APP_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length})`,
    );
  }
  return key;
}

function encrypt(plaintext: Buffer): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Wire format: iv(12) || tag(16) || ciphertext(n)
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

function decrypt(blob: string): Buffer {
  const key = loadKey();
  const buf = Buffer.from(blob, 'base64');
  const minLen = IV_BYTES + TAG_BYTES + 1;
  if (buf.length < minLen) {
    throw new Error(
      `Ciphertext is too short: expected at least ${minLen} bytes, got ${buf.length}.`,
    );
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt a {@link CredentialBlob} (username/password/mpin) to a base64 string.
 */
export async function encryptCredentialBlob(c: CredentialBlob): Promise<string> {
  const plaintext = Buffer.from(JSON.stringify(c), 'utf8');
  return encrypt(plaintext);
}

/**
 * Decrypt a base64 string produced by {@link encryptCredentialBlob}.
 */
export async function decryptCredentialBlob(blob: string): Promise<CredentialBlob> {
  const plaintext = decrypt(blob);
  return JSON.parse(plaintext.toString('utf8')) as CredentialBlob;
}

/**
 * Encrypt a plain identifier string (UAN, PAN, account number, etc.).
 */
export async function encryptIdentifier(id: string): Promise<string> {
  return encrypt(Buffer.from(id, 'utf8'));
}

/**
 * Decrypt a base64 string produced by {@link encryptIdentifier}.
 */
export async function decryptIdentifier(blob: string): Promise<string> {
  return decrypt(blob).toString('utf8');
}

/**
 * Return the last 4 digits of a string, stripping non-digit characters first.
 * Falls back to the last 4 raw characters if no digits are present.
 *
 * Examples:
 *   last4('123456789012')   → '9012'
 *   last4('AB-12-345-6789') → '6789'
 *   last4('ABCDEFG')        → 'DEFG'
 */
export function last4(s: string): string {
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 4) {
    return digits.slice(-4);
  }
  if (digits.length > 0) {
    return digits.slice(-4);
  }
  // No digits — fall back to last 4 raw characters
  return s.slice(-4);
}
