/**
 * Two-factor sign-in: an authenticator app (TOTP) plus one-time backup codes.
 *
 * Setup: beginSetup() stores a pending secret and returns the otpauth URI for
 * the QR code; enable() turns it on only once a code from the app proves the
 * user saved it, and returns 10 backup codes (shown once, stored hashed).
 *
 * Sign-in: once the password (or Google) step succeeds for an account with
 * 2FA on, the caller gets a challenge token instead of a session
 * (createChallenge). completeChallenge() exchanges token + code for the user.
 * A challenge lives 5 minutes, allows 5 wrong codes, and works once. The
 * token is a JWT of type 'mfa', which verifyAccessToken refuses, so it can't
 * be used as a session.
 *
 * Secrets are encrypted under SECRETS_KEY (lib/secrets, covered by the key
 * rotation job). Codes and challenges are system-only under RLS.
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import type { User } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import { env } from '../config/env.js';
import { BadRequestError, UnauthorizedError } from '../lib/errors.js';
import { decryptSecret, encryptSecret } from '../lib/secrets.js';
import { writeAuditLog } from '../lib/audit.js';
import { logger } from '../lib/logger.js';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../lib/totp.js';
import { sendEmail } from './notifications/email.service.js';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGE_ATTEMPTS = 5;
const BACKUP_CODE_COUNT = 10;

const sys = runAsSystem;

function hashBackupCode(userId: string, code: string): string {
  return crypto.createHmac('sha256', env.JWT_SECRET).update(`${userId}:${normalizeBackupCode(code)}`).digest('hex');
}

function normalizeBackupCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

/** "ABCD-EFGH": 40 bits from a 32-letter alphabet without look-alikes. */
function newBackupCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  const chars = [...bytes].map((b) => alphabet[b % 32]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

async function replaceBackupCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, newBackupCode);
  await sys(async () => {
    await prisma.twoFactorBackupCode.deleteMany({ where: { userId } });
    await prisma.twoFactorBackupCode.createMany({
      data: codes.map((c) => ({ userId, codeHash: hashBackupCode(userId, c) })),
    });
  });
  return codes;
}

function notify(user: { email: string; name: string }, subject: string, line: string): void {
  void sendEmail({
    to: user.email,
    subject,
    html: `<p>Hi ${user.name.replace(/[<>&]/g, '')},</p><p>${line}</p><p>If this wasn't you, reset your password now and contact support.</p>`,
    text: `Hi ${user.name},\n\n${line}\n\nIf this wasn't you, reset your password now and contact support.`,
  }).catch((err: unknown) => logger.warn({ err }, '[2fa] notice email failed'));
}

export function isTwoFactorEnabled(user: Pick<User, 'twoFactorEnabledAt' | 'twoFactorSecretEnc'>): boolean {
  return !!user.twoFactorEnabledAt && !!user.twoFactorSecretEnc;
}

export async function twoFactorStatus(userId: string) {
  const user = await sys(() => prisma.user.findUniqueOrThrow({ where: { id: userId } }));
  const remaining = await sys(() =>
    prisma.twoFactorBackupCode.count({ where: { userId, usedAt: null } }),
  );
  return {
    enabled: isTwoFactorEnabled(user),
    enabledAt: user.twoFactorEnabledAt?.toISOString() ?? null,
    backupCodesRemaining: isTwoFactorEnabled(user) ? remaining : 0,
  };
}

export async function beginSetup(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
  const user = await sys(() => prisma.user.findUniqueOrThrow({ where: { id: userId } }));
  if (isTwoFactorEnabled(user)) throw new BadRequestError('Two-factor sign-in is already on.');
  const secret = generateTotpSecret();
  await sys(() =>
    prisma.user.update({ where: { id: userId }, data: { twoFactorPendingSecretEnc: encryptSecret(secret) } }),
  );
  return { secret, otpauthUrl: otpauthUri(secret, user.email) };
}

export async function enableTwoFactor(userId: string, code: string, req?: Request): Promise<{ backupCodes: string[] }> {
  const user = await sys(() => prisma.user.findUniqueOrThrow({ where: { id: userId } }));
  if (isTwoFactorEnabled(user)) throw new BadRequestError('Two-factor sign-in is already on.');
  if (!user.twoFactorPendingSecretEnc) throw new BadRequestError('Start setup first.');
  const secret = decryptSecret(user.twoFactorPendingSecretEnc);
  const check = verifyTotp(secret, code);
  if (!check.ok) throw new BadRequestError("That code didn't match. Check the time on your phone and try the newest code.");
  await sys(() =>
    prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecretEnc: encryptSecret(secret),
        twoFactorPendingSecretEnc: null,
        twoFactorEnabledAt: new Date(),
        twoFactorLastStep: check.step,
      },
    }),
  );
  const backupCodes = await replaceBackupCodes(userId);
  await writeAuditLog({ userId, action: 'two_factor_enabled', resource: `User:${userId}`, req });
  notify(user, 'Two-factor sign-in turned on', 'Two-factor sign-in was just turned on for your EveryPaisa account.');
  return { backupCodes };
}

/**
 * Accept an authenticator code (never the same time step twice) or an unused
 * backup code (marked used). Returns how it matched, or null.
 */
async function acceptCode(user: User, code: string): Promise<'totp' | 'backup' | null> {
  if (!user.twoFactorSecretEnc) return null;
  const trimmed = code.trim();
  if (/^\d{6}$/.test(trimmed.replace(/\s/g, ''))) {
    const check = verifyTotp(decryptSecret(user.twoFactorSecretEnc), trimmed, { afterStep: user.twoFactorLastStep });
    if (!check.ok) return null;
    // Conditional update: two requests racing with the same code can't both win.
    const won = await sys(() =>
      prisma.user.updateMany({
        where: {
          id: user.id,
          OR: [{ twoFactorLastStep: null }, { twoFactorLastStep: { lt: check.step } }],
        },
        data: { twoFactorLastStep: check.step },
      }),
    );
    return won.count === 1 ? 'totp' : null;
  }
  const hash = hashBackupCode(user.id, trimmed);
  const used = await sys(() =>
    prisma.twoFactorBackupCode.updateMany({
      where: { userId: user.id, codeHash: hash, usedAt: null },
      data: { usedAt: new Date() },
    }),
  );
  return used.count === 1 ? 'backup' : null;
}

export async function disableTwoFactor(userId: string, code: string, req?: Request): Promise<void> {
  const user = await sys(() => prisma.user.findUniqueOrThrow({ where: { id: userId } }));
  if (!isTwoFactorEnabled(user)) return;
  // A current code, not the password: Google-only users have no password,
  // and the code proves the person still holds the second factor.
  if (!(await acceptCode(user, code))) throw new BadRequestError("That code didn't match.");
  await sys(async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecretEnc: null, twoFactorPendingSecretEnc: null, twoFactorEnabledAt: null, twoFactorLastStep: null },
    });
    await prisma.twoFactorBackupCode.deleteMany({ where: { userId } });
  });
  await writeAuditLog({ userId, action: 'two_factor_disabled', resource: `User:${userId}`, req });
  notify(user, 'Two-factor sign-in turned off', 'Two-factor sign-in was just turned off for your EveryPaisa account.');
}

export async function regenerateBackupCodes(userId: string, code: string, req?: Request): Promise<{ backupCodes: string[] }> {
  const user = await sys(() => prisma.user.findUniqueOrThrow({ where: { id: userId } }));
  if (!isTwoFactorEnabled(user)) throw new BadRequestError('Two-factor sign-in is off.');
  if (!(await acceptCode(user, code))) throw new BadRequestError("That code didn't match.");
  const backupCodes = await replaceBackupCodes(userId);
  await writeAuditLog({ userId, action: 'two_factor_codes_regenerated', resource: `User:${userId}`, req });
  return { backupCodes };
}

// ── Sign-in challenge ────────────────────────────────────────────────

export interface MfaRequired {
  mfaRequired: true;
  mfaToken: string;
  expiresAt: string;
}

export async function createChallenge(user: User, method: 'password' | 'google', restore: boolean): Promise<MfaRequired> {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const challenge = await sys(() =>
    prisma.mfaChallenge.create({ data: { userId: user.id, method, restore, expiresAt } }),
  );
  const mfaToken = jwt.sign({ type: 'mfa', cid: challenge.id }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: Math.floor(CHALLENGE_TTL_MS / 1000),
  });
  return { mfaRequired: true, mfaToken, expiresAt: expiresAt.toISOString() };
}

/**
 * Exchange a challenge token and a code for the signed-in user. Throws
 * UnauthorizedError on anything wrong; the 5th wrong code burns the
 * challenge, so the person signs in again from the start.
 */
export async function completeChallenge(
  mfaToken: string,
  code: string,
): Promise<{ user: User; restore: boolean; method: string; via: 'totp' | 'backup' }> {
  let payload: { type?: string; cid?: string; sub?: string };
  try {
    payload = jwt.verify(mfaToken, env.JWT_SECRET) as typeof payload;
  } catch {
    throw new UnauthorizedError('This sign-in has expired. Please sign in again.');
  }
  if (payload.type !== 'mfa' || !payload.cid || !payload.sub) throw new UnauthorizedError('Invalid sign-in step.');
  const challenge = await sys(() => prisma.mfaChallenge.findUnique({ where: { id: payload.cid! } }));
  if (
    !challenge ||
    challenge.userId !== payload.sub ||
    challenge.consumedAt ||
    challenge.expiresAt < new Date() ||
    challenge.attempts >= MAX_CHALLENGE_ATTEMPTS
  ) {
    throw new UnauthorizedError('This sign-in has expired. Please sign in again.');
  }
  const user = await sys(() => prisma.user.findUniqueOrThrow({ where: { id: challenge.userId } }));
  if (!user.isActive) throw new UnauthorizedError('Account deactivated');

  const via = await acceptCode(user, code);
  if (!via) {
    const attempts = challenge.attempts + 1;
    await sys(() =>
      prisma.mfaChallenge.update({
        where: { id: challenge.id },
        data: { attempts, ...(attempts >= MAX_CHALLENGE_ATTEMPTS ? { consumedAt: new Date() } : {}) },
      }),
    );
    throw new UnauthorizedError(
      attempts >= MAX_CHALLENGE_ATTEMPTS
        ? 'Too many wrong codes. Please sign in again.'
        : "That code didn't match. Try the newest code from your app, or a backup code.",
    );
  }
  // Single use, even if two requests race with valid codes.
  const consumed = await sys(() =>
    prisma.mfaChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: new Date() } }),
  );
  if (consumed.count !== 1) throw new UnauthorizedError('This sign-in has already been used. Please sign in again.');
  if (via === 'backup') {
    const left = await sys(() => prisma.twoFactorBackupCode.count({ where: { userId: user.id, usedAt: null } }));
    notify(user, 'A backup code was used to sign in', `A backup code was just used to sign in to your account. ${left} unused backup code${left === 1 ? '' : 's'} left.`);
  }
  return { user, restore: challenge.restore, method: challenge.method, via };
}
