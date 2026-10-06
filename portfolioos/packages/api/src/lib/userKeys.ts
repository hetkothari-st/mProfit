/**
 * Per-user data keys (envelope encryption).
 *
 * Each user gets a random 256-bit data key (DEK). Their files are encrypted
 * with it; the DEK itself is stored only wrapped (encrypted) by a key-
 * encryption key (KEK) held outside the database. Today the KEK is derived
 * from APP_ENCRYPTION_KEY with HKDF; a KMS-backed provider can replace
 * `envKeyProvider` without touching any caller.
 *
 * What this buys over one global key:
 *   - one user's key decrypts only that user's data;
 *   - rotating the KEK re-wraps one small row per user instead of
 *     re-encrypting every file;
 *   - deleting a user's key row makes everything sealed under it unreadable
 *     (crypto-shredding). Full protection of old database backups needs the
 *     KEK, or the wrapped keys, kept outside those backups — i.e. a KMS.
 *
 * Wire format of a sealed buffer: version(1) | iv(12) | tag(16) | ciphertext.
 * The AAD binds a ciphertext to its owner and slot, so a blob copied into
 * another user's row (or another slot) fails to open instead of decrypting.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { prisma } from './prisma.js';
import { runAsSystem } from './requestContext.js';

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
export const SEAL_OVERHEAD = 1 + IV_BYTES + TAG_BYTES;

export interface KeyProvider {
  /** Identifies the KEK a wrapped key was made with, for rotation. */
  readonly kekVersion: number;
  wrap(dek: Buffer): string;
  unwrap(wrapped: string, kekVersion: number): Buffer;
}

function deriveKek(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error('APP_ENCRYPTION_KEY not set — per-user keys unavailable');
  const ikm = Buffer.from(raw, 'base64');
  // A separate subkey: the identifier ciphers and fingerprints that also use
  // APP_ENCRYPTION_KEY never share key material with key wrapping.
  return Buffer.from(hkdfSync('sha256', ikm, Buffer.from('everypaisa'), Buffer.from('user-dek-kek-v1'), 32));
}

function gcmEncrypt(key: Buffer, plain: Buffer, aad: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(aad);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, c.getAuthTag(), ct]);
}

function gcmDecrypt(key: Buffer, sealed: Buffer, aad: Buffer): Buffer {
  if (sealed.length < SEAL_OVERHEAD || sealed[0] !== VERSION) throw new Error('Not a sealed buffer');
  const iv = sealed.subarray(1, 1 + IV_BYTES);
  const tag = sealed.subarray(1 + IV_BYTES, SEAL_OVERHEAD);
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAAD(aad);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(sealed.subarray(SEAL_OVERHEAD)), d.final()]);
}

export const envKeyProvider: KeyProvider = {
  kekVersion: 1,
  wrap(dek) {
    return gcmEncrypt(deriveKek(), dek, Buffer.from('dek')).toString('base64');
  },
  unwrap(wrapped, kekVersion) {
    if (kekVersion !== 1) throw new Error(`Unknown KEK version ${kekVersion}`);
    return gcmDecrypt(deriveKek(), Buffer.from(wrapped, 'base64'), Buffer.from('dek'));
  },
};

let provider: KeyProvider = envKeyProvider;
/** Tests and a future KMS provider swap the provider here. */
export function setKeyProvider(p: KeyProvider): void {
  provider = p;
  cache.clear();
}

export function userKeysAvailable(): boolean {
  return !!process.env.APP_ENCRYPTION_KEY;
}

// Unwrapped keys, briefly: a page of thumbnails should not unwrap once each.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { dek: Buffer; at: number }>();

/** The user's data key, created on first use. */
export async function getUserDek(userId: string): Promise<Buffer> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.dek;
  // System context: keys are fetched for the file's owner, which on some
  // paths (OnlyOffice download, background backfill) is not the caller.
  let row = await runAsSystem(() => prisma.userDataKey.findUnique({ where: { userId } }));
  if (!row) {
    const wrapped = provider.wrap(randomBytes(32));
    // Two requests can race to create the first key; the loser reads the
    // winner's row instead of overwriting it (which would orphan data).
    await runAsSystem(() =>
      prisma.userDataKey.createMany({
        data: [{ userId, wrappedKey: wrapped, kekVersion: provider.kekVersion }],
        skipDuplicates: true,
      }),
    );
    row = await runAsSystem(() => prisma.userDataKey.findUniqueOrThrow({ where: { userId } }));
  }
  const dek = provider.unwrap(row.wrappedKey, row.kekVersion);
  cache.set(userId, { dek, at: Date.now() });
  return dek;
}

/** Forget cached keys for a user (after their key row is deleted). */
export function forgetUserDek(userId: string): void {
  cache.delete(userId);
}

export async function sealForUser(userId: string, slot: string, plain: Buffer): Promise<Buffer> {
  return gcmEncrypt(await getUserDek(userId), plain, Buffer.from(`${userId}:${slot}`));
}

export async function openForUser(userId: string, slot: string, sealed: Buffer): Promise<Buffer> {
  return gcmDecrypt(await getUserDek(userId), sealed, Buffer.from(`${userId}:${slot}`));
}
