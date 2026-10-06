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
import {
  decryptIdentifier,
  decryptIdentifierSync,
  encryptIdentifier,
  hashIdentifier,
  last4,
} from './pfCredentials.service.js';

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

/**
 * One encrypted free-text field: `<field>` (legacy plaintext) beside
 * `<field>Enc`. Once a key exists the plaintext is never written, so every
 * reader must go through {@link openText}.
 */
export async function sealText(
  raw: string | null | undefined,
): Promise<{ plain: string | null; enc: string | null }> {
  const value = raw?.trim();
  if (!value) return { plain: null, enc: null };
  if (!canEncrypt()) return { plain: value, enc: null };
  return { plain: null, enc: await encryptIdentifier(value) };
}

/** The value of a sealed field, from ciphertext or legacy plaintext. */
export function openText(enc: string | null | undefined, plain: string | null | undefined): string | null {
  if (enc) return decryptIdentifierSync(enc);
  return plain ?? null;
}

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
 * Columns to write for a registration number. The plaintext plate is no
 * longer written once a key exists: every reader goes through plateOf /
 * revealVehicle, and lookups go through the fingerprint (findVehicleByPlate).
 * Spread these AFTER any `registrationNo` the caller sets.
 */
export async function registrationNoColumns(raw: string) {
  const value = normalizeRegistrationNo(raw);
  if (!canEncrypt()) {
    return {
      registrationNo: value,
      registrationNoEnc: null,
      registrationNoHash: null,
      registrationNoLast4: value.slice(-4),
    };
  }
  return {
    registrationNo: null,
    registrationNoEnc: await encryptIdentifier(value),
    registrationNoHash: hashIdentifier(value, REG_NO_PURPOSE),
    registrationNoLast4: value.slice(-4),
  };
}

/** Columns to write for a vehicle's engine number. */
export async function engineNoColumns(raw: string | null | undefined) {
  const { plain, enc } = await sealText(raw);
  return { engineNo: plain, engineNoEnc: enc };
}

/** Select these wherever a vehicle's plate is read. */
export const PLATE_SELECT = { registrationNo: true, registrationNoEnc: true } as const;

/** The plate of a vehicle row selected with {@link PLATE_SELECT}. */
export function plateOf(v: { registrationNo?: string | null; registrationNoEnc?: string | null }): string {
  return openText(v.registrationNoEnc, v.registrationNo) ?? '';
}

type VehicleSecrets = {
  registrationNo: string | null;
  registrationNoEnc: string | null;
  registrationNoHash?: string | null;
  engineNo?: string | null;
  engineNoEnc?: string | null;
};

/**
 * A vehicle row as it may leave the API: plate (and engine number, when the
 * row carries it) decrypted, ciphertext and fingerprint dropped. Works on a
 * full row or a `select` that includes {@link PLATE_SELECT}.
 */
export function revealVehicle<T extends VehicleSecrets>(
  v: T,
): Omit<T, 'registrationNoEnc' | 'registrationNoHash' | 'engineNoEnc'> & { registrationNo: string } {
  const { registrationNoEnc, registrationNoHash: _hash, engineNoEnc, ...rest } = v;
  const out = { ...rest, registrationNo: openText(registrationNoEnc, v.registrationNo) ?? '' };
  if ('engineNo' in v || engineNoEnc !== undefined) {
    (out as { engineNo?: string | null }).engineNo = openText(engineNoEnc, v.engineNo);
  }
  return out;
}

/**
 * Find a user's vehicle by plate. Matches the fingerprint, and the legacy
 * plaintext for rows written without a key or not yet backfilled.
 */
export async function findVehicleByPlate(userId: string, raw: string) {
  const plate = normalizeRegistrationNo(raw);
  const or: Array<Record<string, string>> = [{ registrationNo: plate }];
  if (canEncrypt()) or.push({ registrationNoHash: hashIdentifier(plate, REG_NO_PURPOSE) });
  return prisma.vehicle.findFirst({ where: { userId, OR: or } });
}

export function registrationNoHash(raw: string): string {
  return hashIdentifier(normalizeRegistrationNo(raw), REG_NO_PURPOSE);
}

/**
 * Columns to write for a loan account number. Plaintext is not written once
 * a key is present: every reader goes through readLoanAccountNumber or the
 * last-4 column.
 */
export async function loanAccountNumberColumns(raw: string | null | undefined) {
  const value = raw?.trim();
  if (!value) return { accountNumber: null, accountNumberEnc: null, accountNumberLast4: null };
  const tail = last4(value);
  if (!canEncrypt()) return { accountNumber: value, accountNumberEnc: null, accountNumberLast4: tail };
  return { accountNumber: null, accountNumberEnc: await encryptIdentifier(value), accountNumberLast4: tail };
}

export async function readLoanAccountNumber(row: {
  accountNumber?: string | null;
  accountNumberEnc?: string | null;
}): Promise<string | null> {
  if (row.accountNumberEnc) return decryptIdentifier(row.accountNumberEnc);
  return row.accountNumber ?? null;
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

/** Columns to write for a tenant's contact fields. */
export async function tenantContactColumns(input: {
  tenantPhone?: string | null;
  tenantEmail?: string | null;
  tenantContact?: string | null;
}) {
  const out: Record<string, string | null> = {};
  for (const key of ['tenantPhone', 'tenantEmail', 'tenantContact'] as const) {
    if (input[key] === undefined) continue;
    const { plain, enc } = await sealText(input[key]);
    out[key] = plain;
    out[`${key}Enc`] = enc;
  }
  return out;
}

type TenancySecrets = {
  tenantPhone?: string | null;
  tenantPhoneEnc?: string | null;
  tenantEmail?: string | null;
  tenantEmailEnc?: string | null;
  tenantContact?: string | null;
  tenantContactEnc?: string | null;
};

/**
 * A tenancy row as it may leave the API or feed a reminder: contact fields
 * decrypted, ciphertext dropped. Fields the row does not carry stay absent.
 */
export function revealTenancy<T extends TenancySecrets>(
  t: T,
): Omit<T, 'tenantPhoneEnc' | 'tenantEmailEnc' | 'tenantContactEnc'> {
  const { tenantPhoneEnc, tenantEmailEnc, tenantContactEnc, ...rest } = t;
  const out: Record<string, unknown> = { ...rest };
  if ('tenantPhone' in t || tenantPhoneEnc !== undefined) out.tenantPhone = openText(tenantPhoneEnc, t.tenantPhone);
  if ('tenantEmail' in t || tenantEmailEnc !== undefined) out.tenantEmail = openText(tenantEmailEnc, t.tenantEmail);
  if ('tenantContact' in t || tenantContactEnc !== undefined)
    out.tenantContact = openText(tenantContactEnc, t.tenantContact);
  return out as Omit<T, 'tenantPhoneEnc' | 'tenantEmailEnc' | 'tenantContactEnc'>;
}

/** Select these wherever a tenant's contact details are read. */
export const TENANT_CONTACT_SELECT = {
  tenantPhone: true,
  tenantPhoneEnc: true,
  tenantEmail: true,
  tenantEmailEnc: true,
  tenantContact: true,
  tenantContactEnc: true,
} as const;

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
  loans: number;
  sealedFields: number;
  failed: number;
}> {
  if (!canEncrypt()) return { users: 0, clients: 0, vehicles: 0, loans: 0, sealedFields: 0, failed: 0 };
  const clear = clearPlaintextEnabled();
  let users = 0;
  let clients = 0;
  let vehicles = 0;
  let loans = 0;
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
          if (!row.registrationNo) throw new Error('no plate to encrypt');
          const value = normalizeRegistrationNo(row.registrationNo);
          const cols = await registrationNoColumns(value);
          // Unreachable while backfillPiiAtRest returns early without a key,
          // but stated rather than asserted with `!`.
          if (!cols.registrationNoEnc) throw new Error('encryption unavailable');
          if ((await decryptIdentifier(cols.registrationNoEnc)) !== value) {
            throw new Error('encrypted registration did not read back');
          }
          // Every plate reader goes through plateOf / revealVehicle now, so
          // the plate clears like PAN: only under PII_BACKFILL_CLEAR_PLAINTEXT.
          await prisma.vehicle.update({
            where: { id: row.id },
            data: { ...cols, registrationNo: clear ? null : row.registrationNo },
          });
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

  // Rows encrypted while the plate was still dual-written keep their
  // plaintext until clearing is switched on.
  if (clear) {
    await prisma.vehicle.updateMany({
      where: { registrationNoEnc: { not: null }, registrationNo: { not: null } },
      data: { registrationNo: null },
    });
  }

  // ── Loan.accountNumber ──
  {
    const skipped: string[] = [];
    for (;;) {
      const batch = await prisma.loan.findMany({
        where: {
          accountNumberEnc: null,
          accountNumber: { not: null },
          ...(skipped.length > 0 && { id: { notIn: skipped } }),
        },
        select: { id: true, accountNumber: true },
        take: 200,
      });
      if (batch.length === 0) break;
      for (const row of batch) {
        try {
          const value = row.accountNumber!.trim();
          const cols = await loanAccountNumberColumns(value);
          if (!cols.accountNumberEnc) throw new Error('encryption unavailable');
          if ((await decryptIdentifier(cols.accountNumberEnc)) !== value) {
            throw new Error('encrypted loan account number did not read back');
          }
          await prisma.loan.update({
            where: { id: row.id },
            data: { ...cols, accountNumber: clear ? null : row.accountNumber },
          });
          loans += 1;
        } catch (err) {
          failed += 1;
          skipped.push(row.id);
          logger.warn(
            { loanId: row.id, err: err instanceof Error ? err.message : String(err) },
            '[pii] could not encrypt a saved loan account number',
          );
        }
      }
    }
  }

  // ── Free-text identifiers sealed with sealText ──
  let sealedFields = 0;
  for (const [model, field] of SEALED_FIELDS) {
    const r = await backfillSealedField(model, field, clear);
    sealedFields += r.done;
    failed += r.failed;
  }

  return { users, clients, vehicles, loans, sealedFields, failed };
}

const SEALED_FIELDS = [
  ['vehicle', 'engineNo'],
  ['bankAccount', 'customerId'],
  ['tenancy', 'tenantPhone'],
  ['tenancy', 'tenantEmail'],
  ['tenancy', 'tenantContact'],
] as const;

/**
 * Encrypt one `<field>` into `<field>Enc` for rows not yet done, verifying
 * each ciphertext reads back, and clear the plaintext only when `clear`.
 */
async function backfillSealedField(
  model: (typeof SEALED_FIELDS)[number][0],
  field: string,
  clear: boolean,
): Promise<{ done: number; failed: number }> {
  // The models differ only in which column is sealed; a typed delegate per
  // pair would repeat this loop five times.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as unknown as Record<string, any>)[model];
  const encField = `${field}Enc`;
  const skipped: string[] = [];
  let done = 0;
  let failed = 0;
  for (;;) {
    const batch: Array<{ id: string } & Record<string, string | null>> = await delegate.findMany({
      where: {
        [encField]: null,
        [field]: { not: null },
        ...(skipped.length > 0 && { id: { notIn: skipped } }),
      },
      select: { id: true, [field]: true },
      take: 200,
    });
    if (batch.length === 0) break;
    for (const row of batch) {
      try {
        const value = row[field]?.trim();
        if (!value) {
          // Blank text: nothing worth encrypting, just stop storing it.
          await delegate.update({ where: { id: row.id }, data: { [field]: null } });
          continue;
        }
        const { enc } = await sealText(value);
        if (!enc) throw new Error('encryption unavailable');
        if (decryptIdentifierSync(enc) !== value) throw new Error(`encrypted ${field} did not read back`);
        await delegate.update({
          where: { id: row.id },
          data: { [encField]: enc, [field]: clear ? null : row[field] },
        });
        done += 1;
      } catch (err) {
        failed += 1;
        skipped.push(row.id);
        logger.warn(
          { model, field, id: row.id, err: err instanceof Error ? err.message : String(err) },
          '[pii] could not encrypt a saved identifier',
        );
      }
    }
  }
  if (clear) {
    await delegate.updateMany({
      where: { [encField]: { not: null }, [field]: { not: null } },
      data: { [field]: null },
    });
  }
  return { done, failed };
}
