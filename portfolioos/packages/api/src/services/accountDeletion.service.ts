/**
 * Account deletion with a 30-day grace period.
 *
 * 1. The user confirms three ways (typed DELETE, password or emailed code,
 *    and a final warning in the UI). `requestAccountDeletion` then schedules
 *    the account for erasure, signs it out everywhere, and blocks sign-in.
 * 2. Signing in during the grace period is refused with
 *    ACCOUNT_PENDING_DELETION unless the caller explicitly asks to restore.
 * 3. The daily purge job calls `purgeDueAccounts`, which erases each due
 *    account's rows and stored files for good.
 *
 * Deleting is refused while the user owns a family that other people are in,
 * so nobody else's shared view disappears without warning.
 */
import crypto from 'node:crypto';
import { rm, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { User } from '@prisma/client';
import { prisma, runInTransaction } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  TooManyRequestsError,
} from '../lib/errors.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { verifyPassword } from './password.service.js';
import { sendEmail } from './notifications/email.service.js';
import { renderCodeEmail } from './notifications/codeEmail.template.js';
import { writeAuditLog } from '../lib/audit.js';

export const DELETION_GRACE_DAYS = 30;
export const DELETE_CONFIRM_TEXT = 'DELETE';
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

// ── Blockers ─────────────────────────────────────────────────────────

export interface DeletionBlocker {
  familyId: string;
  familyName: string;
  otherMembers: number;
}

/** Families this user created that still have anyone else in them. */
export async function getDeletionBlockers(userId: string): Promise<DeletionBlocker[]> {
  const families = await prisma.family.findMany({
    where: { createdById: userId },
    select: {
      id: true,
      name: true,
      _count: { select: { members: { where: { userId: { not: userId } } } } },
    },
  });
  return families
    .filter((f) => f._count.members > 0)
    .map((f) => ({ familyId: f.id, familyName: f.name, otherMembers: f._count.members }));
}

// ── Emailed confirmation code (for accounts without a usable password) ──

function hashDeletionCode(userId: string, code: string): string {
  return crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(`delete:${userId}:${code}`)
    .digest('hex');
}

function hexEqual(x: string, y: string): boolean {
  const a = Buffer.from(x, 'hex');
  const b = Buffer.from(y, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function sendDeletionCode(userId: string): Promise<{ sentTo: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  if (user.deletionCodeExpiresAt) {
    const sentAt = user.deletionCodeExpiresAt.getTime() - CODE_TTL_MS;
    if (Date.now() - sentAt < CODE_RESEND_COOLDOWN_MS) {
      throw new TooManyRequestsError('Please wait a minute before requesting another code');
    }
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  await prisma.user.update({
    where: { id: userId },
    data: {
      deletionCodeHash: hashDeletionCode(userId, code),
      deletionCodeExpiresAt: new Date(Date.now() + CODE_TTL_MS),
      deletionCodeAttempts: 0,
    },
  });

  const result = await sendEmail({
    to: user.email,
    // No code in the subject — sendEmail logs subjects.
    subject: 'Confirm deleting your EveryPaisa account',
    ...renderCodeEmail({
      name: user.name,
      heading: 'Confirm account deletion',
      intro:
        'Enter this code to confirm you want to delete your EveryPaisa account and all its data:',
      code,
      expiresInMinutes: CODE_TTL_MS / 60_000,
      notYouLine: `You're receiving this because someone asked to delete the EveryPaisa account for ${user.email}. If that wasn't you, ignore this email and change your password — nothing is deleted without this code.`,
    }),
  });
  if (!result.sent) {
    if (env.NODE_ENV !== 'production') {
      logger.warn({ userId, code }, '[account.delete] email not sent — dev deletion code');
    } else {
      throw new AppError(
        'We could not send the confirmation email. Please try again shortly.',
        503,
        'EMAIL_SEND_FAILED',
      );
    }
  }
  return { sentTo: user.email };
}

async function verifyDeletionCode(user: User, code: string): Promise<void> {
  const invalid = new BadRequestError('That code is incorrect or has expired. Request a new one.');
  if (
    !user.deletionCodeHash ||
    !user.deletionCodeExpiresAt ||
    user.deletionCodeExpiresAt < new Date()
  ) {
    throw invalid;
  }
  if (user.deletionCodeAttempts >= MAX_CODE_ATTEMPTS) throw invalid;
  if (!hexEqual(hashDeletionCode(user.id, code), user.deletionCodeHash)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { deletionCodeAttempts: { increment: 1 } },
    });
    throw invalid;
  }
}

// ── Request / restore ────────────────────────────────────────────────

export interface DeletionRequestInput {
  confirmText: string;
  password?: string;
  code?: string;
}

export async function requestAccountDeletion(
  userId: string,
  input: DeletionRequestInput,
): Promise<{ scheduledFor: string }> {
  if (input.confirmText !== DELETE_CONFIRM_TEXT) {
    throw new BadRequestError(`Type ${DELETE_CONFIRM_TEXT} to confirm`);
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  if (user.deletionScheduledFor) {
    return { scheduledFor: user.deletionScheduledFor.toISOString() };
  }

  if (input.password) {
    if (!(await verifyPassword(input.password, user.passwordHash))) {
      throw new BadRequestError('Incorrect password');
    }
  } else if (input.code) {
    await verifyDeletionCode(user, input.code);
  } else {
    throw new BadRequestError('Enter your password, or request an email code');
  }

  const blockers = await getDeletionBlockers(userId);
  if (blockers.length > 0) {
    throw new ConflictError(
      `You own ${blockers.length === 1 ? 'a family' : 'families'} with other members (${blockers
        .map((b) => b.familyName)
        .join(', ')}). Remove the members or hand over the family before deleting your account.`,
      { blockers },
    );
  }

  const now = new Date();
  const scheduledFor = new Date(now.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
  await runInTransaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        deletionRequestedAt: now,
        deletionScheduledFor: scheduledFor,
        deletionCodeHash: null,
        deletionCodeExpiresAt: null,
        deletionCodeAttempts: 0,
      },
    });
    // Signed out everywhere: no refresh token survives the request.
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  });
  return { scheduledFor: scheduledFor.toISOString() };
}

/**
 * Called from sign-in once credentials have been verified. Refuses a
 * pending-deletion account unless `restore` is set, in which case the
 * deletion is cancelled and sign-in continues.
 */
export async function assertNotPendingDeletion(
  user: Pick<User, 'id' | 'deletionScheduledFor'>,
  restore: boolean,
): Promise<void> {
  if (!user.deletionScheduledFor) return;
  if (!restore) {
    throw new AppError(
      'This account is scheduled for deletion. Restore it to sign in.',
      403,
      'ACCOUNT_PENDING_DELETION',
      { scheduledFor: user.deletionScheduledFor.toISOString() },
    );
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { deletionRequestedAt: null, deletionScheduledFor: null },
  });
  logger.info({ userId: user.id }, '[account.delete] deletion cancelled by sign-in restore');
  await writeAuditLog({
    userId: user.id,
    action: 'account_deletion_cancelled',
    resource: `User:${user.id}`,
  });
}

// ── Purge ────────────────────────────────────────────────────────────

/** Resolve a stored path and refuse anything outside UPLOAD_DIR. */
function insideUploads(p: string): string | null {
  const root = resolve(env.UPLOAD_DIR);
  const full = isAbsolute(p) ? resolve(p) : resolve(root, p);
  const rel = relative(root, full);
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? full : null;
}

async function collectStoredFiles(userId: string): Promise<string[]> {
  const [imports, photos, gmailDocs] = await Promise.all([
    prisma.importJob.findMany({ where: { userId }, select: { filePath: true } }),
    prisma.transactionPhoto.findMany({
      where: { transaction: { portfolio: { userId } } },
      select: { filePath: true },
    }),
    prisma.gmailDiscoveredDoc.findMany({ where: { userId }, select: { storagePath: true } }),
  ]);
  return [
    ...imports.map((r) => r.filePath),
    ...photos.map((r) => r.filePath),
    ...gmailDocs.map((r) => r.storagePath),
  ].filter(Boolean);
}

async function removeStoredFiles(userId: string, files: string[]): Promise<void> {
  if (!/^[a-zA-Z0-9]+$/.test(userId)) return;
  for (const f of files) {
    const safe = insideUploads(f);
    if (!safe) continue;
    await unlink(safe).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT')
        logger.warn({ err, userId }, '[account.delete] could not remove a stored file');
    });
  }
  for (const dir of [
    join(env.UPLOAD_DIR, 'documents', `user_${userId}`),
    join(env.UPLOAD_DIR, 'imports', userId),
    join(env.UPLOAD_DIR, 'gmail-imports', userId),
  ]) {
    await rm(dir, { recursive: true, force: true }).catch((err: unknown) =>
      logger.warn({ err, userId }, '[account.delete] could not remove a user upload directory'),
    );
  }
}

/**
 * Permanently erase one user: their rows (most cascade from User) and stored
 * files. Rows whose foreign keys would otherwise block the delete are
 * removed first. A CA's shadow clients go with them, since no one else can
 * ever reach those books.
 */
export async function purgeUser(userId: string): Promise<void> {
  const shadowClients = await prisma.client.findMany({
    where: { advisorId: userId, kind: 'SHADOW', userId: { not: null } },
    select: { userId: true },
  });
  const userIds = [userId, ...shadowClients.map((c) => c.userId!).filter((id) => id !== userId)];

  const files = new Map<string, string[]>();
  for (const id of userIds) files.set(id, await collectStoredFiles(id));

  await runInTransaction(
    async (tx) => {
      for (const id of userIds) {
        // RESTRICT foreign keys: these would abort the cascade from User.
        await tx.voucherEntry.deleteMany({
          where: {
            OR: [
              { voucher: { userId: id } },
              { debitAccount: { userId: id } },
              { creditAccount: { userId: id } },
            ],
          },
        });
        await tx.gmailScanJob.deleteMany({ where: { userId: id } });
        await tx.providentFundAccount.deleteMany({ where: { userId: id } });
        await tx.familyInvitation.deleteMany({ where: { invitedById: id } });
        await tx.pendingFamilyInvite.deleteMany({ where: { createdById: id } });
        await tx.family.deleteMany({ where: { createdById: id } });
      }
      // Shadow clients first: their Client rows reference the CA.
      for (const id of userIds.slice(1)) await tx.user.delete({ where: { id } });
      await tx.user.delete({ where: { id: userId } });
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  for (const [id, list] of files) await removeStoredFiles(id, list);
}

/** Erase every account whose grace period has ended. Used by the daily job. */
export async function purgeDueAccounts(
  now = new Date(),
): Promise<{ purged: number; skipped: number; failed: number }> {
  return runAsSystem(async () => {
    const due = await prisma.user.findMany({
      where: { deletionScheduledFor: { lte: now } },
      select: { id: true },
    });
    let purged = 0;
    let skipped = 0;
    let failed = 0;
    for (const { id } of due) {
      // Re-check: someone could have joined a family during the grace period
      // via an invitation sent before the request.
      if ((await getDeletionBlockers(id)).length > 0) {
        logger.warn(
          { userId: id },
          '[account.delete] purge skipped — owns a family with other members',
        );
        skipped++;
        continue;
      }
      try {
        await purgeUser(id);
        purged++;
        logger.info({ userId: id }, '[account.delete] account purged');
        // The user row is gone, so the id lives on only in metadata.
        await writeAuditLog({ action: 'account_purged', metadata: { userId: id } });
      } catch (err) {
        failed++;
        logger.error({ err, userId: id }, '[account.delete] purge failed');
      }
    }
    return { purged, skipped, failed };
  });
}
