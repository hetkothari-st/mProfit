import crypto from 'node:crypto';
import type { LegacyCodePurpose, LegacyPlan, LegacyToken, LegacyTokenPurpose, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { inviteTokenHash } from '../../lib/inviteToken.js';
import { BadRequestError, TooManyRequestsError } from '../../lib/errors.js';
import { acceptCode, isTwoFactorEnabled } from '../auth/twoFactor.service.js';

/**
 * Legacy Transfer secrets. Link tokens and every code are bearer credentials,
 * so only their SHA-256 is stored (same as invitation tokens, PR #230).
 * Public endpoints have no user context, so lookups run privileged — the
 * hash is the credential.
 */

const MIN = 60_000;
const DAY = 86_400_000;
export const TOKEN_TTL_DAYS: Record<LegacyTokenPurpose, number> = { INVITE: 365, ACCESS: 90, IM_OK: 30, VERIFY: 14 };
const CODE_TTL = 10 * MIN;
const CODE_MAX_ATTEMPTS = 5;
const CODE_LOCK = 30 * MIN;
const SESSION_TTL = 30 * MIN;
const GRANT_TTL = 15 * MIN;

const sha = inviteTokenHash;

export function newRawToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: sha(token) };
}

function sixDigits(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function sameHash(a: string, b: string): boolean {
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export async function createLinkToken(
  tx: Prisma.TransactionClient,
  a: { planId: string; userId: string; nomineeId: string | null; purpose: LegacyTokenPurpose; cycle: number; now: Date },
): Promise<string> {
  const { token, hash } = newRawToken();
  await tx.legacyToken.create({
    data: {
      planId: a.planId, userId: a.userId, nomineeId: a.nomineeId, purpose: a.purpose, cycle: a.cycle,
      tokenHash: hash, expiresAt: new Date(a.now.getTime() + TOKEN_TTL_DAYS[a.purpose] * DAY),
    },
  });
  return token;
}

export async function resolveLinkToken(
  token: string, purpose: LegacyTokenPurpose, now: Date = new Date(), opts: { allowExpired?: boolean } = {},
): Promise<(LegacyToken & { plan: LegacyPlan }) | null> {
  const row = await runAsSystem(() =>
    prisma.legacyToken.findUnique({ where: { tokenHash: sha(token) }, include: { plan: true } }));
  if (!row || row.purpose !== purpose) return null;
  if (row.expiresAt <= now && !opts.allowExpired) return null;
  return row;
}

async function putCode(a: {
  userId: string; nomineeId: string | null; subjectId: string; purpose: LegacyCodePurpose;
  secret: string; ttl: number; now: Date;
}): Promise<void> {
  const codeHash = sha(a.secret);
  const expiresAt = new Date(a.now.getTime() + a.ttl);
  await runAsSystem(() => prisma.legacyCode.upsert({
    where: { subjectId_purpose: { subjectId: a.subjectId, purpose: a.purpose } },
    // Re-issuing keeps attempts and lockedUntil: a fresh code must not reset
    // brute-force protection. Only a correct code (row deleted) clears them.
    update: { codeHash, expiresAt },
    create: { userId: a.userId, nomineeId: a.nomineeId, subjectId: a.subjectId, purpose: a.purpose, codeHash, expiresAt },
  }));
}

export type CodeCheck = 'ok' | 'bad' | 'locked' | 'expired';

async function checkCode(subjectId: string, purpose: LegacyCodePurpose, secret: string, now: Date): Promise<CodeCheck> {
  return runAsSystem(async () => {
    const row = await prisma.legacyCode.findUnique({ where: { subjectId_purpose: { subjectId, purpose } } });
    if (!row) return 'expired';
    if (row.lockedUntil && row.lockedUntil > now) return 'locked';
    if (row.expiresAt <= now) return 'expired';
    if (sameHash(row.codeHash, sha(secret.trim()))) {
      // Single use. deleteMany so a concurrent correct submit loses cleanly.
      const used = await prisma.legacyCode.deleteMany({ where: { id: row.id } });
      return used.count === 1 ? 'ok' : 'expired';
    }
    // Atomic increment: parallel wrong guesses must each count.
    const bumped = await prisma.legacyCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    if (bumped.attempts >= CODE_MAX_ATTEMPTS) {
      await prisma.legacyCode.update({ where: { id: row.id }, data: { lockedUntil: new Date(now.getTime() + CODE_LOCK) } });
    }
    return 'bad';
  });
}

async function assertNotLocked(subjectId: string, purpose: LegacyCodePurpose, now: Date): Promise<void> {
  const row = await runAsSystem(() =>
    prisma.legacyCode.findUnique({ where: { subjectId_purpose: { subjectId, purpose } } }));
  if (row?.lockedUntil && row.lockedUntil > now) {
    throw new TooManyRequestsError('Too many attempts. Try again in 30 minutes.');
  }
}

export async function issueNomineeOtp(nomineeId: string, userId: string, now: Date = new Date()): Promise<string> {
  await assertNotLocked(nomineeId, 'NOMINEE_OTP', now);
  const code = sixDigits();
  await putCode({ userId, nomineeId, subjectId: nomineeId, purpose: 'NOMINEE_OTP', secret: code, ttl: CODE_TTL, now });
  return code;
}

export function verifyNomineeOtp(nomineeId: string, code: string, now: Date = new Date()): Promise<CodeCheck> {
  return checkCode(nomineeId, 'NOMINEE_OTP', code, now);
}

/** Sessions are keyed by subjectId = sha(token), so each device holds its own. */
export async function createNomineeSession(nomineeId: string, userId: string, now: Date = new Date()): Promise<string> {
  const { token, hash } = newRawToken();
  await runAsSystem(() => prisma.legacyCode.create({
    data: {
      userId, nomineeId, subjectId: hash, purpose: 'NOMINEE_SESSION', codeHash: hash,
      expiresAt: new Date(now.getTime() + SESSION_TTL),
    },
  }));
  return token;
}

export async function resolveNomineeSession(
  raw: string, now: Date = new Date(),
): Promise<{ nomineeId: string; userId: string } | null> {
  const row = await runAsSystem(() => prisma.legacyCode.findUnique({
    where: { subjectId_purpose: { subjectId: sha(raw), purpose: 'NOMINEE_SESSION' } },
  }));
  if (!row || !row.nomineeId || row.expiresAt <= now) return null;
  return { nomineeId: row.nomineeId, userId: row.userId };
}

/** TOTP/backup code when 2FA is on; otherwise a code the caller emails (Google-only users have no password). */
export async function startOwnerStepUp(
  userId: string, now: Date = new Date(),
): Promise<{ method: 'totp' | 'email'; code?: string }> {
  const user = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: userId } }));
  if (isTwoFactorEnabled(user)) return { method: 'totp' };
  await assertNotLocked(userId, 'OWNER_STEPUP_CODE', now);
  const code = sixDigits();
  await putCode({ userId, nomineeId: null, subjectId: userId, purpose: 'OWNER_STEPUP_CODE', secret: code, ttl: CODE_TTL, now });
  return { method: 'email', code };
}

export async function verifyOwnerStepUp(userId: string, code: string, now: Date = new Date()): Promise<string> {
  const user = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: userId } }));
  if (isTwoFactorEnabled(user)) {
    if (!(await acceptCode(user, code))) throw new BadRequestError("That code didn't match.");
  } else {
    const r = await checkCode(userId, 'OWNER_STEPUP_CODE', code, now);
    if (r === 'locked') throw new TooManyRequestsError('Too many attempts. Try again in 30 minutes.');
    if (r === 'expired') throw new BadRequestError('That code has expired. Request a new one.');
    if (r === 'bad') throw new BadRequestError("That code didn't match.");
  }
  const { token } = newRawToken();
  await putCode({ userId, nomineeId: null, subjectId: userId, purpose: 'OWNER_STEPUP_GRANT', secret: token, ttl: GRANT_TTL, now });
  return token;
}

export async function checkOwnerGrant(userId: string, raw: string | undefined, now: Date = new Date()): Promise<boolean> {
  if (!raw) return false;
  const row = await runAsSystem(() => prisma.legacyCode.findUnique({
    where: { subjectId_purpose: { subjectId: userId, purpose: 'OWNER_STEPUP_GRANT' } },
  }));
  if (!row || row.expiresAt <= now) return false;
  return sameHash(row.codeHash, sha(raw));
}

/** Kill every way a nominee can reach the view: ACCESS/VERIFY links, OTPs, live sessions. */
export async function wipeNomineeAccess(tx: Prisma.TransactionClient, planId: string): Promise<void> {
  const nominees = await tx.legacyNominee.findMany({ where: { planId }, select: { id: true } });
  await tx.legacyToken.deleteMany({ where: { planId, purpose: { in: ['ACCESS', 'VERIFY'] } } });
  await tx.legacyCode.deleteMany({ where: { nomineeId: { in: nominees.map((n) => n.id) } } });
}
