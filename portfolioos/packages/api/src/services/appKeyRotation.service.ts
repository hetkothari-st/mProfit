/**
 * Rotate APP_ENCRYPTION_KEY.
 *
 * Operator steps (SECURITY.md → Rotation):
 *   1. Set APP_ENCRYPTION_KEY_PREVIOUS to the current value, and
 *      APP_ENCRYPTION_KEY to a new one. Deploy.
 *   2. On boot this job re-encrypts every value still under the previous key,
 *      recomputes every lookup fingerprint with the new key, and re-wraps
 *      every per-user data key. Reads keep working throughout: decryption
 *      falls back to the previous key until a value has been moved.
 *   3. When a boot logs `failed: 0`, and a second boot moves nothing
 *      (`reencrypted`, `rehashed`, `rewrappedKeys` all 0), remove
 *      APP_ENCRYPTION_KEY_PREVIOUS and deploy again.
 *
 * Fingerprints (panHash, registrationNoHash, policyNumberHash) are keyed, so
 * between the deploy and the end of this run a lookup by fingerprint (plate
 * duplicate check, premium-email policy matching) can miss a row not yet
 * recomputed. The run takes seconds at this size; schedule it off-peak.
 *
 * Idempotent: a value already under the current key is decrypted, found
 * current, and left alone.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { rewrapUserKeys } from '../lib/userKeys.js';
import {
  decryptWithKeyInfo,
  encryptCredentialBlob,
  encryptIdentifier,
  loadPreviousKey,
  type CredentialBlob,
} from './pfCredentials.service.js';
import { panHash, registrationNoHash } from './piiAtRest.service.js';
import { hashPolicyNumber } from './insurance.service.js';

type Kind = 'text' | 'bytes' | 'credentials';

interface Column {
  model: string;
  field: string;
  kind: Kind;
  /** Fingerprint column recomputed from this field's plaintext. */
  hash?: { field: string; of: (plain: string) => string };
}

const COLUMNS: Column[] = [
  { model: 'user', field: 'panEnc', kind: 'text', hash: { field: 'panHash', of: panHash } },
  { model: 'client', field: 'panEnc', kind: 'text', hash: { field: 'panHash', of: panHash } },
  {
    model: 'vehicle',
    field: 'registrationNoEnc',
    kind: 'text',
    hash: { field: 'registrationNoHash', of: registrationNoHash },
  },
  { model: 'vehicle', field: 'engineNoEnc', kind: 'text' },
  { model: 'tenancy', field: 'tenantPhoneEnc', kind: 'text' },
  { model: 'tenancy', field: 'tenantEmailEnc', kind: 'text' },
  { model: 'tenancy', field: 'tenantContactEnc', kind: 'text' },
  {
    model: 'insurancePolicy',
    field: 'policyNumberEnc',
    kind: 'text',
    hash: { field: 'policyNumberHash', of: hashPolicyNumber },
  },
  { model: 'loan', field: 'accountNumberEnc', kind: 'text' },
  { model: 'creditCard', field: 'cardNumberEnc', kind: 'text' },
  { model: 'bankAccount', field: 'accountNumberEnc', kind: 'text' },
  { model: 'bankAccount', field: 'customerIdEnc', kind: 'text' },
  { model: 'providentFundAccount', field: 'identifierCipher', kind: 'bytes' },
  { model: 'providentFundAccount', field: 'storedCredentials', kind: 'credentials' },
  { model: 'epfMemberId', field: 'memberIdCipher', kind: 'bytes' },
];

const BATCH = 200;

/** Rows that hold a value in this column (required Bytes columns always do). */
function presentFilter(col: Column): Record<string, unknown> {
  if (col.kind === 'bytes') return {};
  if (col.kind === 'credentials') return { [col.field]: { not: Prisma.AnyNull } };
  return { [col.field]: { not: null } };
}

function readCipher(kind: Kind, value: unknown): string | null {
  if (value == null) return null;
  if (kind === 'bytes') return Buffer.from(value as Uint8Array).toString('base64');
  if (kind === 'credentials') return (value as { blob?: string }).blob ?? null;
  return value as string;
}

async function writeCipher(kind: Kind, plain: Buffer): Promise<unknown> {
  if (kind === 'bytes') return Buffer.from(await encryptIdentifier(plain.toString('utf8')), 'base64');
  if (kind === 'credentials') {
    return { blob: await encryptCredentialBlob(JSON.parse(plain.toString('utf8')) as CredentialBlob) };
  }
  return encryptIdentifier(plain.toString('utf8'));
}

export interface AppKeyRotationResult {
  reencrypted: number;
  rehashed: number;
  rewrappedKeys: number;
  failed: number;
  /** Which rows could not be moved (open under neither key), first 50. */
  failures: Array<{ model: string; id: string }>;
}

/** No-op unless APP_ENCRYPTION_KEY_PREVIOUS is set. Run as system. */
export async function rotateAppEncryptionKey(): Promise<AppKeyRotationResult> {
  const result: AppKeyRotationResult = { reencrypted: 0, rehashed: 0, rewrappedKeys: 0, failed: 0, failures: [] };
  if (!loadPreviousKey()) return result;

  for (const col of COLUMNS) {
    // One loop over models that differ only in which column is rotated; a
    // typed delegate per column would repeat it fifteen times.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as unknown as Record<string, any>)[col.model];
    let afterId: string | undefined;
    for (;;) {
      const rows: Array<Record<string, unknown> & { id: string }> = await delegate.findMany({
        where: { ...presentFilter(col), ...(afterId ? { id: { gt: afterId } } : {}) },
        select: { id: true, [col.field]: true, ...(col.hash ? { [col.hash.field]: true } : {}) },
        orderBy: { id: 'asc' },
        take: BATCH,
      });
      if (rows.length === 0) break;
      afterId = rows[rows.length - 1]!.id;
      for (const row of rows) {
        try {
          const cipher = readCipher(col.kind, row[col.field]);
          if (!cipher) continue;
          const { plain, usedPreviousKey } = decryptWithKeyInfo(cipher);
          const data: Record<string, unknown> = {};
          if (usedPreviousKey) data[col.field] = await writeCipher(col.kind, plain);
          if (col.hash) {
            const fresh = col.hash.of(plain.toString('utf8'));
            if (fresh !== row[col.hash.field]) data[col.hash.field] = fresh;
          }
          if (Object.keys(data).length === 0) continue;
          await delegate.update({ where: { id: row.id }, data });
          if (usedPreviousKey) result.reencrypted += 1;
          if (col.hash && col.hash.field in data) result.rehashed += 1;
        } catch (err) {
          result.failed += 1;
          if (result.failures.length < 50) result.failures.push({ model: col.model, id: row.id });
          logger.warn(
            { model: col.model, field: col.field, id: row.id, err: err instanceof Error ? err.message : String(err) },
            '[keys] could not move a value to the new APP_ENCRYPTION_KEY',
          );
        }
      }
    }
  }

  const keys = await rewrapUserKeys();
  result.rewrappedKeys = keys.rewrapped;
  result.failed += keys.failed;
  for (const userId of keys.failedUserIds) {
    if (result.failures.length < 50) result.failures.push({ model: 'userDataKey', id: userId });
    logger.warn({ userId }, '[keys] a user data key opens under neither key — their vault files are unreadable');
  }
  return result;
}
