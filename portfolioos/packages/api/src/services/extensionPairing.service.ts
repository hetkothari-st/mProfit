/**
 * extensionPairing.service.ts
 *
 * Server-side helpers for the browser-extension pairing flow (Plan C).
 *
 * Design decisions (per plan §C1):
 *   - Pairing code: 8 chars, format "XXX-XXXX", uppercase letters + digits,
 *     ambiguous chars (I, O, 0, 1) excluded to avoid mis-reads.
 *   - Bearer: 32 random bytes, hex-encoded (64 hex chars). Never stored
 *     in plaintext. Server stores SHA-256(bearer) for indexed O(1) lookup.
 *   - `bearerLast8`: last 8 hex chars of bearer, stored for display only.
 *   - TTL: pairing code expires after 5 minutes.
 */

import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import type { ExtensionPairing } from '@prisma/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAIRING_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Alphabet: uppercase A-Z + digits 2-9, with ambiguous chars removed (I, O)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a random 8-char code in format "XXX-XXXX". */
function generatePairingCode(): string {
  const pick = () => CODE_ALPHABET[randomBytes(1)[0]! % CODE_ALPHABET.length]!;
  const part1 = Array.from({ length: 3 }, pick).join('');
  const part2 = Array.from({ length: 4 }, pick).join('');
  return `${part1}-${part2}`;
}

/** SHA-256 of a hex-encoded bearer string. */
function hashBearer(bearer: string): string {
  return createHash('sha256').update(bearer, 'hex').digest('hex');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new ExtensionPairing row with a 5-min pairing code.
 * Returns the code and expiry so the web UI can display them.
 */
export async function initPairing(userId: string): Promise<{
  id: string;
  code: string;
  expiresAt: Date;
}> {
  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);

  const pairing = await prisma.extensionPairing.create({
    data: {
      userId,
      pairingCode: code,
      pairingCodeExpiresAt: expiresAt,
    },
  });

  return { id: pairing.id, code, expiresAt };
}

/**
 * Exchange a pairing code for a bearer token.
 * Validates code exists, is not expired, and is not yet paired.
 * Generates a 32-byte random bearer, stores SHA-256, returns plaintext once.
 */
export async function completePairing(code: string): Promise<{
  bearer: string;
  userId: string;
}> {
  const pairing = await prisma.extensionPairing.findUnique({
    where: { pairingCode: code },
  });

  if (!pairing) throw new PairingError('INVALID_CODE', 'Pairing code not found');
  if (pairing.revoked) throw new PairingError('REVOKED', 'Pairing has been revoked');
  if (pairing.paired) throw new PairingError('ALREADY_PAIRED', 'Pairing code already used');
  if (new Date() > pairing.pairingCodeExpiresAt) {
    throw new PairingError('EXPIRED', 'Pairing code has expired');
  }

  // Generate bearer: 32 random bytes as hex string (64 chars)
  const bearer = randomBytes(32).toString('hex');
  const bearerHash = hashBearer(bearer);
  const bearerLast8 = bearer.slice(-8);

  await prisma.extensionPairing.update({
    where: { id: pairing.id },
    data: {
      bearerHash,
      bearerLast8,
      paired: true,
      pairedAt: new Date(),
      lastUsedAt: new Date(),
    },
  });

  return { bearer, userId: pairing.userId };
}

/**
 * Authenticate an incoming extension request by bearer token.
 * Returns the pairing row if valid and not revoked.
 */
export async function authenticateExtension(bearer: string): Promise<ExtensionPairing> {
  const bearerHash = hashBearer(bearer);
  const pairing = await prisma.extensionPairing.findUnique({
    where: { bearerHash },
  });

  if (!pairing) throw new PairingError('INVALID_BEARER', 'Invalid bearer token');
  if (pairing.revoked) throw new PairingError('REVOKED', 'Extension has been disconnected');
  if (!pairing.paired) throw new PairingError('NOT_PAIRED', 'Extension not fully paired');

  // Update lastUsedAt (fire-and-forget; don't block the request)
  void prisma.extensionPairing.update({
    where: { id: pairing.id },
    data: { lastUsedAt: new Date() },
  });

  return pairing;
}

/**
 * List all pairings for a user (including revoked, for display).
 */
export async function listPairings(userId: string): Promise<ExtensionPairing[]> {
  return prisma.extensionPairing.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Revoke a pairing by its ID, scoped to the owning user.
 */
export async function revokePairingById(userId: string, pairingId: string): Promise<void> {
  const pairing = await prisma.extensionPairing.findFirst({
    where: { id: pairingId, userId },
  });
  if (!pairing) throw new PairingError('NOT_FOUND', 'Pairing not found');
  await prisma.extensionPairing.update({
    where: { id: pairingId },
    data: { revoked: true, revokedAt: new Date() },
  });
}

/**
 * Revoke a pairing by bearer hash (called from extension's own /revoke endpoint).
 */
export async function revokePairingByBearer(bearer: string): Promise<void> {
  const bearerHash = hashBearer(bearer);
  const pairing = await prisma.extensionPairing.findUnique({ where: { bearerHash } });
  if (!pairing) return; // already gone, idempotent
  await prisma.extensionPairing.update({
    where: { id: pairing.id },
    data: { revoked: true, revokedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class PairingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PairingError';
  }
}
