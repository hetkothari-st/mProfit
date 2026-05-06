/**
 * pfAccounts.service.ts
 *
 * CRUD for ProvidentFundAccount records plus deterministic asset-key computation.
 *
 * Asset-key format:
 *   EPF  → pf:epf:<sha256(normalised_identifier)>
 *   PPF  → pf:ppf:<institution_lowercase>:<sha256(normalised_identifier)>
 *
 * Normalisation: trim, collapse internal whitespace, uppercase.
 * Punctuation is preserved so "UAN-123" ≠ "UAN123".
 *
 * The `identifierCipher` column is `Bytes` in Prisma; we convert the
 * base64 result of `encryptIdentifier` to a `Buffer` before persisting.
 *
 * Ownership guard on forgetPfCredentials mirrors the pattern in
 * vehicles.service.ts: findFirst with userId before update so RLS
 * has defense-in-depth.
 */

import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { PfInstitution, PfType, ProvidentFundAccount } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { encryptIdentifier, last4 } from './pfCredentials.service.js';

// ---------------------------------------------------------------------------
// Asset-key computation
// ---------------------------------------------------------------------------

export interface ComputePfAssetKeyOpts {
  type: PfType;
  institution: PfInstitution;
  identifier: string;
}

/**
 * Produce a deterministic, collision-resistant asset key for a provident-fund
 * account.  Two accounts with the same type, institution, and identifier
 * (after normalisation) share the same key — which is the intended behaviour
 * for deduplication.
 */
export function computePfAssetKey(opts: ComputePfAssetKeyOpts): string {
  const { type, institution, identifier } = opts;

  // Normalise: trim outer whitespace, collapse internal runs, uppercase.
  const normalised = identifier.trim().replace(/\s+/g, ' ').toUpperCase();

  const hash = createHash('sha256').update(normalised, 'utf8').digest('hex');
  const typeLower = type.toLowerCase();

  if (type === 'EPF') {
    return `pf:${typeLower}:${hash}`;
  }

  // PPF and any future types embed the institution to distinguish
  // e.g. SBI PPF account from HDFC PPF account.
  const instLower = institution.toLowerCase();
  return `pf:${typeLower}:${instLower}:${hash}`;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export interface CreatePfAccountInput {
  userId: string;
  type: PfType;
  institution: PfInstitution;
  identifier: string; // UAN or PPF account number, plaintext
  holderName: string;
  branchCode?: string;
  portfolioId?: string;
}

/**
 * Create a new ProvidentFundAccount.
 *
 * - Computes `assetKey` deterministically.
 * - Encrypts the identifier and stores it as raw Bytes.
 * - Derives `identifierLast4` for display without decryption.
 */
export async function createPfAccount(
  input: CreatePfAccountInput,
): Promise<ProvidentFundAccount> {
  const assetKey = computePfAssetKey({
    type: input.type,
    institution: input.institution,
    identifier: input.identifier,
  });

  // encryptIdentifier returns base64; schema column is Bytes.
  const cipherBase64 = await encryptIdentifier(input.identifier);
  const identifierCipher = Buffer.from(cipherBase64, 'base64');

  const identifierLast4 = last4(input.identifier);

  return prisma.providentFundAccount.create({
    data: {
      userId: input.userId,
      type: input.type,
      institution: input.institution,
      identifierCipher,
      identifierLast4,
      holderName: input.holderName,
      branchCode: input.branchCode ?? null,
      portfolioId: input.portfolioId ?? null,
      assetKey,
    },
  });
}

/**
 * List all PF accounts for a user, most-recently-created first.
 * Includes nested `memberIds` (EPF member IDs under a UAN).
 */
export async function listPfAccounts(userId: string): Promise<ProvidentFundAccount[]> {
  return prisma.providentFundAccount.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { memberIds: true },
  });
}

/**
 * Fetch a single PF account by ID, scoped to the authenticated user.
 * Returns `null` if not found or owned by a different user.
 */
export async function getPfAccountById(
  userId: string,
  id: string,
): Promise<ProvidentFundAccount | null> {
  return prisma.providentFundAccount.findFirst({
    where: { userId, id },
    include: { memberIds: true },
  });
}

/**
 * Null-out stored credentials for a PF account.
 *
 * Ownership is verified via a prior `findFirst` before the `update` so that:
 * 1. We can return a clean "not found" error instead of a Prisma unique-mismatch.
 * 2. RLS remains the last line of defence (defence-in-depth).
 */
export async function forgetPfCredentials(
  userId: string,
  id: string,
): Promise<ProvidentFundAccount> {
  const existing = await prisma.providentFundAccount.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    throw new Error('PF account not found');
  }

  return prisma.providentFundAccount.update({
    where: { id },
    data: {
      storedCredentials: Prisma.JsonNull,
      credentialsKeyId: null,
    },
  });
}
