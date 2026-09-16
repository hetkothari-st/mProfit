/**
 * PII at rest: PAN and vehicle registration numbers.
 *
 * These were stored as plain text (User.pan, Client.pan,
 * Vehicle.registrationNo), so a database dump, a backup, or any read path that
 * escaped Row-Level Security exposed them directly. Migration
 * 20260918100000_pii_at_rest_pan_regno adds encrypted, fingerprint and last-4
 * columns alongside, following the pattern policy numbers already use
 * (insurance.service policyNumberColumns / backfillPolicyNumberEncryption).
 *
 * Everything that reads or writes these fields goes through this module, for
 * two reasons:
 *
 *   1. Dual read. During the transition a row may be encrypted, plaintext, or
 *      both. `readPan` / `readRegistrationNo` prefer the ciphertext and fall
 *      back to plaintext, so every caller is correct whether or not the
 *      backfill has reached that row yet.
 *
 *   2. One place to get normalisation right. A fingerprint is only useful if
 *      "MH 47 BT 5950" and "mh47bt5950" hash identically.
 */
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { decryptIdentifier, encryptIdentifier, hashIdentifier } from './pfCredentials.service.js';

const PAN_PURPOSE = 'pan';

/**
 * Whether identifiers can be encrypted in this process.
 *
 * Production cannot reach the false branch: config/env.ts refuses to boot
 * production without APP_ENCRYPTION_KEY, because PAN storage now depends on
 * it. In development a missing key falls back to plaintext with a warning, so
 * a local setup without the key can still save a profile.
 */
let warnedNoKey = false;
function canEncrypt(): boolean {
  if (env.APP_ENCRYPTION_KEY) return true;
  if (!warnedNoKey) {
    warnedNoKey = true;
    logger.warn('[pii] APP_ENCRYPTION_KEY not set — storing PAN/registration in plaintext (non-production only)');
  }
  return false;
}
const REG_NO_PURPOSE = 'vehicle-registration';

export function normalizePan(raw: string): string {
  return raw.trim().toUpperCase();
}

export function normalizeRegistrationNo(raw: string): string {
  return raw.replace(/[\s-]+/g, '').toUpperCase();
}

/** Columns to write for a PAN. `null` clears every representation. */
export async function panColumns(raw: string | null | undefined) {
  if (!raw || !raw.trim()) {
    return { pan: null, panEnc: null, panHash: null, panLast4: null };
  }
  const value = normalizePan(raw);
  if (!canEncrypt()) {
    return { pan: value, panEnc: null, panHash: null, panLast4: value.slice(-4) };
  }
  return {
    // Plaintext is no longer written. Existing plaintext is cleared by the
    // backfill only when PII_BACKFILL_CLEAR_PLAINTEXT=true.
    pan: null,
    panEnc: await encryptIdentifier(value),
    panHash: hashIdentifier(value, PAN_PURPOSE),
    panLast4: value.slice(-4),
  };
}

/**
 * Encrypted columns for a registration number, to write ALONGSIDE the
 * plaintext `registrationNo` — not instead of it.
 *
 * Unlike PAN this is dual-write for now: roughly twenty call sites still read
 * the plaintext plate (challan scans, alerts, cron jobs, labels, reports) and
 * clearing it before they move to readRegistrationNo would blank the plate
 * across the app. The caller keeps setting `registrationNo` itself.
 */
export async function registrationNoColumns(raw: string) {
  const value = normalizeRegistrationNo(raw);
  if (!canEncrypt()) {
    return {
      registrationNoEnc: null,
      registrationNoHash: null,
      registrationNoLast4: value.slice(-4),
    };
  }
  return {
    registrationNoEnc: await encryptIdentifier(value),
    registrationNoHash: hashIdentifier(value, REG_NO_PURPOSE),
    registrationNoLast4: value.slice(-4),
  };
}

export function registrationNoHash(raw: string): string {
  return hashIdentifier(normalizeRegistrationNo(raw), REG_NO_PURPOSE);
}

/** Read a PAN from a row that may be encrypted, plaintext, or both. */
export async function readPan(row: {
  pan?: string | null;
  panEnc?: string | null;
} | null | undefined): Promise<string | null> {
  if (!row) return null;
  if (row.panEnc) return decryptIdentifier(row.panEnc);
  return row.pan ? normalizePan(row.pan) : null;
}

export async function readRegistrationNo(row: {
  registrationNo?: string | null;
  registrationNoEnc?: string | null;
}): Promise<string | null> {
  if (row.registrationNoEnc) return decryptIdentifier(row.registrationNoEnc);
  return row.registrationNo ?? null;
}

/** Convenience: the full PAN for a user id. */
export async function getUserPan(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pan: true, panEnc: true },
  });
  return readPan(user);
}

function clearPlaintextEnabled(): boolean {
  return process.env.PII_BACKFILL_CLEAR_PLAINTEXT === 'true';
}

/**
 * Encrypt existing plaintext rows. Idempotent, batched, and verified: each
 * ciphertext is decrypted and compared before it is saved.
 *
 * Plaintext is left in place unless PII_BACKFILL_CLEAR_PLAINTEXT=true. Clearing
 * it is what actually delivers protection at rest, but it is irreversible if
 * APP_ENCRYPTION_KEY is ever lost, so it is an explicit operator decision
 * rather than something a deploy does implicitly.
 */
export async function backfillPiiAtRest(): Promise<{
  users: number;
  clients: number;
  vehicles: number;
  failed: number;
}> {
  if (!canEncrypt()) return { users: 0, clients: 0, vehicles: 0, failed: 0 };
  const clear = clearPlaintextEnabled();
  let users = 0;
  let clients = 0;
  let vehicles = 0;
  let failed = 0;

  // ── User.pan ──
  {
    const skipped: string[] = [];
    for (;;) {
      const batch = await prisma.user.findMany({
        where: {
          panEnc: null,
          pan: { not: null },
          ...(skipped.length > 0 && { id: { notIn: skipped } }),
        },
        select: { id: true, pan: true },
        take: 200,
      });
      if (batch.length === 0) break;
      for (const row of batch) {
        try {
          const value = normalizePan(row.pan!);
          const cols = await panColumns(value);
          if ((await decryptIdentifier(cols.panEnc!)) !== value) {
            throw new Error('encrypted PAN did not read back');
          }
          await prisma.user.update({
            where: { id: row.id },
            data: { ...cols, pan: clear ? null : row.pan },
          });
          users += 1;
        } catch (err) {
          failed += 1;
          skipped.push(row.id);
          logger.warn(
            { userId: row.id, err: err instanceof Error ? err.message : String(err) },
            '[pii] could not encrypt a saved PAN',
          );
        }
      }
    }
  }

  // ── Client.pan ──
  {
    const skipped: string[] = [];
    for (;;) {
      const batch = await prisma.client.findMany({
        where: {
          panEnc: null,
          pan: { not: null },
          ...(skipped.length > 0 && { id: { notIn: skipped } }),
        },
        select: { id: true, pan: true },
        take: 200,
      });
      if (batch.length === 0) break;
      for (const row of batch) {
        try {
          const value = normalizePan(row.pan!);
          const cols = await panColumns(value);
          if ((await decryptIdentifier(cols.panEnc!)) !== value) {
            throw new Error('encrypted PAN did not read back');
          }
          // Never clears Client.pan: the CA client list still renders it.
          await prisma.client.update({
            where: { id: row.id },
            data: { panEnc: cols.panEnc, panHash: cols.panHash, panLast4: cols.panLast4 },
          });
          clients += 1;
        } catch (err) {
          failed += 1;
          skipped.push(row.id);
          logger.warn(
            { clientId: row.id, err: err instanceof Error ? err.message : String(err) },
            '[pii] could not encrypt a saved client PAN',
          );
        }
      }
    }
  }

  // ── Vehicle.registrationNo ──
  {
    const skipped: string[] = [];
    for (;;) {
      const batch = await prisma.vehicle.findMany({
        where: {
          registrationNoEnc: null,
          ...(skipped.length > 0 && { id: { notIn: skipped } }),
        },
        select: { id: true, registrationNo: true },
        take: 200,
      });
      if (batch.length === 0) break;
      for (const row of batch) {
        try {
          const value = normalizeRegistrationNo(row.registrationNo);
          const cols = await registrationNoColumns(value);
          // Unreachable while backfillPiiAtRest returns early without a key,
          // but stated rather than asserted with `!`.
          if (!cols.registrationNoEnc) throw new Error('encryption unavailable');
          if ((await decryptIdentifier(cols.registrationNoEnc)) !== value) {
            throw new Error('encrypted registration did not read back');
          }
          // Never clears the plate, even with PII_BACKFILL_CLEAR_PLAINTEXT:
          // plate readers have not all moved to readRegistrationNo yet.
          await prisma.vehicle.update({ where: { id: row.id }, data: cols });
          vehicles += 1;
        } catch (err) {
          failed += 1;
          skipped.push(row.id);
          logger.warn(
            { vehicleId: row.id, err: err instanceof Error ? err.message : String(err) },
            '[pii] could not encrypt a saved registration number',
          );
        }
      }
    }
  }

  return { users, clients, vehicles, failed };
}
