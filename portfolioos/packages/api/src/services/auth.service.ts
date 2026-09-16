import crypto from 'node:crypto';
import { Prisma, type User } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import { prisma, runInTransaction } from '../lib/prisma.js';
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../lib/errors.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { hashPassword, verifyPassword } from './password.service.js';
import { sendEmail } from './notifications/email.service.js';
import { renderCodeEmail } from './notifications/codeEmail.template.js';
import {
  generateRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
} from './jwt.service.js';
import { panColumns } from './piiAtRest.service.js';

interface IssueTokensResult {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
}

/**
 * Mask a PAN for display: ABCDE1234F -> XXXXX1234F.
 *
 * Keeps the trailing digits+check letter, which is what users recognise their
 * own PAN by, and drops the identifying prefix.
 */
export function maskPan(pan: string | null): string | null {
  if (!pan) return null;
  if (pan.length < 5) return 'XXXXX';
  return `XXXXX${pan.slice(5)}`;
}

export function toAuthUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    // The full PAN used to ride on every /me response. It then landed in the
    // frontend's persisted auth store, i.e. in localStorage in plaintext,
    // alongside the access and refresh tokens. A masked value covers every
    // display use; the two places that need the real thing call the audited,
    // rate-limited reveal endpoint.
    // Mask from panLast4 when the row is encrypted (plaintext may be null),
    // falling back to the plaintext for rows the backfill has not reached.
    panMasked: user.panLast4 ? `XXXXX${user.panLast4}` : maskPan(user.pan),
    hasPan: Boolean(user.panEnc || user.pan),
    dob: user.dob ? user.dob.toISOString().slice(0, 10) : null,
    role: user.role,
    plan: user.plan,
    planExpiresAt: user.planExpiresAt?.toISOString() ?? null,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}


/**
 * Digest a bearer token for storage and lookup.
 *
 * Refresh and password-reset tokens used to be stored in plaintext, so a
 * database dump yielded usable sessions and resets for every user. Only the
 * digest is stored now; the raw value exists only in the client and in the
 * reset email. Plain SHA-256 is right for 32 random bytes — there is no
 * guessable input space for a keyed hash to protect.
 */
function digestToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

async function issueTokens(user: User): Promise<IssueTokensResult> {
  const { token: accessToken, expiresAt: accessTokenExpiresAt } = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    plan: user.plan,
  });
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      tokenHash: digestToken(refreshToken),
      userId: user.id,
      expiresAt: refreshTokenExpiry(),
    },
  });
  return { accessToken, refreshToken, accessTokenExpiresAt };
}

/**
 * Mint a fresh session for `user`. Anything that changes a field the access
 * token carries (`role`, `plan`) MUST re-issue through this and hand the new
 * tokens back to the client — `authenticate` reads `plan` off the JWT, so a
 * DB-only plan change leaves the caller stuck on their old tier until the
 * token expires (see billing's plan switch / payment verification).
 */
export async function issueSession(user: User) {
  const tokens = await issueTokens(user);
  return {
    user: toAuthUser(user),
    tokens: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
    },
  };
}

// ── Signup with email verification ────────────────────────────────────
// Signup is two calls. `startRegistration` parks the details in
// PendingRegistration and emails a 6-digit code; `verifyRegistration` checks
// the code and only then creates the User. Nobody gets an account for an
// address they haven't proven they can read.

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

export interface RegistrationInput {
  email: string;
  password: string;
  name: string;
  phone?: string;
  role?: User['role'];
}

export interface PendingRegistrationResult {
  email: string;
  expiresAt: string;
  resendAvailableAt: string;
}

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

// Keyed and bound to the address, so a leaked row can't be brute-forced
// offline and a code for one signup can't be replayed against another.
function hashCode(email: string, code: string): string {
  return crypto.createHmac('sha256', env.JWT_SECRET).update(`${email}:${code}`).digest('hex');
}

function hexEqual(x: string, y: string): boolean {
  const a = Buffer.from(x, 'hex');
  const b = Buffer.from(y, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function codeMatches(email: string, code: string, storedHash: string): boolean {
  return hexEqual(hashCode(email, code), storedHash);
}

function assertCooldownElapsed(lastSentAt: Date): void {
  const availableAt = lastSentAt.getTime() + RESEND_COOLDOWN_MS;
  if (Date.now() < availableAt) {
    const seconds = Math.ceil((availableAt - Date.now()) / 1000);
    throw new TooManyRequestsError(`Please wait ${seconds}s before requesting another code`, {
      resendAvailableAt: new Date(availableAt).toISOString(),
    });
  }
}

async function sendVerificationCode(email: string, name: string, code: string): Promise<void> {
  const result = await sendEmail({
    to: email,
    // Never put the code in the subject: sendEmail logs subjects, and the
    // code is the whole proof of owning the address.
    subject: 'Your EveryPaisa verification code',
    ...renderCodeEmail({
      name,
      heading: 'Verify your email',
      intro: 'Enter this code on the sign-up page to finish creating your EveryPaisa account:',
      code,
      expiresInMinutes: CODE_TTL_MS / 60_000,
      notYouLine: `You're receiving this because someone signed up for EveryPaisa with ${email}. If that wasn't you, ignore this email — no account is created without this code.`,
    }),
  });
  if (result.sent) return;
  if (env.NODE_ENV !== 'production') {
    // No SMTP in local dev — put the code in the server log so signup stays
    // testable. Never in production: the code is the whole proof.
    logger.warn({ email, code }, '[auth.register] email not sent — dev verification code');
    return;
  }
  throw new AppError(
    'We could not send the verification email. Please try again in a few minutes.',
    503,
    'EMAIL_SEND_FAILED',
  );
}

function pendingResult(email: string, expiresAt: Date, sentAt: Date): PendingRegistrationResult {
  return {
    email,
    expiresAt: expiresAt.toISOString(),
    resendAvailableAt: new Date(sentAt.getTime() + RESEND_COOLDOWN_MS).toISOString(),
  };
}

export async function startRegistration(
  input: RegistrationInput,
): Promise<PendingRegistrationResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError('Email already registered');

  const pending = await prisma.pendingRegistration.findUnique({ where: { email: input.email } });
  if (pending) assertCooldownElapsed(pending.lastSentAt);

  const passwordHash = await hashPassword(input.password);
  const code = generateCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  const details = {
    name: input.name,
    phone: input.phone ?? null,
    passwordHash,
    // plan is never client-supplied — every new account starts FREE and
    // upgrades only through the billing flow (see requireFeature /
    // FEATURE_MIN_TIER).
    role: input.role ?? 'INVESTOR',
    codeHash: hashCode(input.email, code),
    attempts: 0,
    expiresAt,
    lastSentAt: now,
  };
  await prisma.pendingRegistration.upsert({
    where: { email: input.email },
    create: { email: input.email, ...details },
    update: details,
  });

  try {
    await sendVerificationCode(input.email, input.name, code);
  } catch (err) {
    // A code nobody received must not hold the resend cooldown.
    await prisma.pendingRegistration.deleteMany({ where: { email: input.email } });
    throw err;
  }
  return pendingResult(input.email, expiresAt, now);
}

export async function resendRegistrationCode(email: string): Promise<PendingRegistrationResult> {
  const pending = await prisma.pendingRegistration.findUnique({ where: { email } });
  if (!pending) {
    throw new BadRequestError('No signup in progress for this email. Please start again.');
  }
  assertCooldownElapsed(pending.lastSentAt);

  const code = generateCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  await prisma.pendingRegistration.update({
    where: { id: pending.id },
    data: { codeHash: hashCode(email, code), attempts: 0, expiresAt, lastSentAt: now },
  });
  await sendVerificationCode(email, pending.name, code);
  return pendingResult(email, expiresAt, now);
}

export async function verifyRegistration(email: string, code: string) {
  const pending = await prisma.pendingRegistration.findUnique({ where: { email } });
  if (!pending) {
    throw new BadRequestError('No signup in progress for this email. Please start again.');
  }
  if (pending.expiresAt < new Date()) {
    throw new BadRequestError('This code has expired. Request a new one.');
  }
  if (pending.attempts >= MAX_CODE_ATTEMPTS) {
    throw new BadRequestError('Too many incorrect attempts. Request a new code.');
  }
  if (!codeMatches(email, code, pending.codeHash)) {
    // Read the count back from the increment, not from `pending`: parallel
    // guesses each saw the old count, and the atomic increment is the truth.
    const { attempts } = await prisma.pendingRegistration.update({
      where: { id: pending.id },
      data: { attempts: { increment: 1 } },
    });
    const left = MAX_CODE_ATTEMPTS - attempts;
    throw new BadRequestError(
      left > 0
        ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.`
        : 'Too many incorrect attempts. Request a new code.',
    );
  }

  let user: User;
  try {
    user = await runInTransaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: pending.email,
          passwordHash: pending.passwordHash,
          name: pending.name,
          phone: pending.phone,
          role: pending.role,
        },
      });
      await tx.pendingRegistration.delete({ where: { id: pending.id } });
      return created;
    });
  } catch (err) {
    // The address got taken between start and verify (e.g. Google sign-in).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      await prisma.pendingRegistration.deleteMany({ where: { email } });
      throw new ConflictError('Email already registered');
    }
    throw err;
  }

  return issueSession(user);
}


/**
 * A shadow client is a real `User` row that exists so a CA's client has books
 * to own. It must never be able to authenticate.
 *
 * Its password hash is a hash of a discarded random secret, so nothing anyone
 * can type will ever match — but that is one lock, and one lock on an account
 * holding somebody's complete financial position is not enough. This is the
 * second, independent one, and it is checked at EVERY entry point rather than
 * once: password login, refresh, Google, and password reset. The reset path
 * matters most, because a CA usually enters the client's real email address
 * for correspondence — without this check, "forgot password" would happily
 * mint a token and mail it to a real person for an account they never made.
 */
function assertNotShadowClient(user: { isShadowClient: boolean }): void {
  if (user.isShadowClient) {
    // Deliberately the same message an unknown account gets. A distinct one
    // would confirm which addresses have shadow records behind them.
    throw new UnauthorizedError('Invalid credentials');
  }
}

/**
 * A real bcrypt hash, compared against when the account does not exist.
 * Without it an unknown email skipped bcrypt.compare entirely and returned
 * measurably faster than a wrong password — an account-existence oracle on
 * the login endpoint.
 *
 * Generated at runtime with the same cost factor as real passwords, not
 * hardcoded: a malformed hash makes bcrypt.compare return immediately, which
 * would quietly reintroduce exactly the timing gap this exists to close.
 */
let dummyPasswordHash: Promise<string> | null = null;
function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= hashPassword(crypto.randomBytes(32).toString('hex'));
  return dummyPasswordHash;
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    await verifyPassword(password, await getDummyPasswordHash());
    throw new UnauthorizedError('Invalid credentials');
  }
  assertNotShadowClient(user);
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new UnauthorizedError('Invalid credentials');

  return issueSession(user);
}

export async function refreshSession(refreshToken: string) {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: digestToken(refreshToken) },
    include: { user: true },
  });
  if (!stored || stored.expiresAt < new Date()) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
  if (stored.revokedAt) {
    // Reuse of a rotated-out token. Refresh tokens are single-use, so a
    // revoked one arriving again means two parties hold the same chain —
    // the legitimate client and whoever copied it. Previously this just
    // errored, and whichever party refreshed first kept a silently rotating
    // session indefinitely. Revoke every session for the user and make both
    // sign in again.
    await logoutAllSessions(stored.userId);
    throw new UnauthorizedError('Session invalidated — please sign in again');
  }
  if (!stored.user.isActive) throw new UnauthorizedError('Account deactivated');
  assertNotShadowClient(stored.user);

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return issueSession(stored.user);
}

export async function logoutSession(refreshToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: digestToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function logoutAllSessions(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ── Password reset ────────────────────────────────────────────────────
// Same shape as signup: email a 6-digit code, then accept it together with
// the new password. Every outcome a caller can observe is identical whether
// or not the address has an account — no distinct errors, no skipped delay.

const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const INVALID_RESET_CODE = 'That code is incorrect or has expired. Check it or request a new one.';

// Prefixed so a reset code can never be confused with a signup code hash.
function hashResetCode(email: string, code: string): string {
  return crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(`reset:${email}:${code}`)
    .digest('hex');
}

/**
 * Emails a reset code if `email` belongs to an account that can sign in.
 * Returns null — silently — for unknown addresses, shadow clients,
 * deactivated accounts, a request inside the resend cooldown, or a send that
 * failed, so the caller's response never reveals which of those happened.
 */
export async function requestPasswordReset(email: string): Promise<{ codeSent: true } | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || user.isShadowClient) return null;

  const latest = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });
  if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) return null;

  const code = generateCode();
  await runInTransaction(async (tx) => {
    // Only the newest code works; an older email in the inbox is dead.
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.passwordResetToken.create({
      data: {
        token: hashResetCode(email, code),
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
      },
    });
  });

  const result = await sendEmail({
    to: email,
    // Code stays out of the subject — sendEmail logs subjects.
    subject: 'Your EveryPaisa password reset code',
    ...renderCodeEmail({
      name: user.name,
      heading: 'Reset your password',
      intro: 'Enter this code on the password reset page, along with your new password:',
      code,
      expiresInMinutes: RESET_CODE_TTL_MS / 60_000,
      notYouLine: `You're receiving this because a password reset was requested for your EveryPaisa account (${email}). If that wasn't you, ignore this email — your password stays the same.`,
    }),
  });
  if (!result.sent) {
    if (env.NODE_ENV !== 'production') {
      logger.warn({ email, code }, '[auth.reset] email not sent — dev reset code');
    }
    // In production the send failure is already logged by sendEmail; the
    // response must still look like success to avoid confirming the account.
    return null;
  }
  return { codeSent: true };
}

export async function resetPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || user.isShadowClient) {
    throw new BadRequestError(INVALID_RESET_CODE);
  }
  const record = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!record || record.attempts >= MAX_CODE_ATTEMPTS) {
    throw new BadRequestError(INVALID_RESET_CODE);
  }
  if (!hexEqual(hashResetCode(email, code), record.token)) {
    await prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    throw new BadRequestError(INVALID_RESET_CODE);
  }

  const passwordHash = await hashPassword(newPassword);
  // Callback form, not the array form. Under the RLS extension each promise in
  // an array-form $transaction is already wrapped in its own transaction, so
  // the batch was not atomic either: a failure could leave the password
  // changed but the reset token still usable and old sessions still live.
  await runInTransaction(async (tx) => {
    // Claim the code first: of two concurrent submits, only one may win.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) throw new BadRequestError(INVALID_RESET_CODE);
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });
    await tx.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
}

/**
 * The raw User row, unmasked. Only for the audited reveal path — every other
 * caller should use getCurrentUser(), which masks.
 */
export async function getCurrentUserRecord(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  return user;
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  return toAuthUser(user);
}

// ── Google OAuth (identity only) ──────────────────────────────────────
// Verifies the Google-issued idToken on the server, then either logs in
// an existing user (matched by email) or creates a brand-new one with an
// unusable random password (Google users can later set one via
// "forgot password" if they want password login alongside Google).
//
// No schema migration: `passwordHash` stays NOT NULL by storing a 48-byte
// random secret hashed with Argon2. There is no path that exposes this
// secret, so it cannot be guessed or used.

let googleClient: OAuth2Client | null = null;
function getGoogleClient(): OAuth2Client {
  if (!env.GOOGLE_OAUTH_CLIENT_ID) {
    throw new BadRequestError(
      'Google sign-in is not configured. Set GOOGLE_OAUTH_CLIENT_ID on the server.',
    );
  }
  if (!googleClient) {
    googleClient = new OAuth2Client(env.GOOGLE_OAUTH_CLIENT_ID);
  }
  return googleClient;
}

export async function loginOrRegisterWithGoogle(idToken: string) {
  const client = getGoogleClient();
  let payload: import('google-auth-library').TokenPayload | undefined;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.GOOGLE_OAUTH_CLIENT_ID!,
    });
    payload = ticket.getPayload();
  } catch (err) {
    logger.warn({ err }, '[auth.google] idToken verification failed');
    throw new UnauthorizedError('Invalid Google credential');
  }
  if (!payload?.email || !payload.email_verified) {
    throw new UnauthorizedError('Google account email is not verified');
  }
  const email = payload.email.toLowerCase();
  const name = payload.name || payload.given_name || email.split('@')[0]!;

  let user = await prisma.user.findUnique({ where: { email } });
  let isNew = false;
  if (!user) {
    // Argon2/bcrypt hash of a 64-char random string. Effectively unusable as
    // a password — Google users must use Google or reset-password to sign in.
    const placeholder = crypto.randomBytes(48).toString('base64url');
    const passwordHash = await hashPassword(placeholder);
    user = await prisma.user.create({
      data: { email, name, passwordHash, role: 'INVESTOR', plan: 'FREE' },
    });
    isNew = true;
  }
  if (!user.isActive) throw new UnauthorizedError('Account deactivated');
  // A CA may have entered the client's real Google address on the shadow
  // record; signing in with it must not adopt those books.
  assertNotShadowClient(user);

  return { ...(await issueSession(user)), isNew };
}

export async function updateProfile(
  userId: string,
  patch: { name?: string; phone?: string; pan?: string; dob?: string },
) {
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.phone !== undefined) data.phone = patch.phone;
  // Encrypted columns, not plaintext — see services/piiAtRest.service.ts.
  if (patch.pan !== undefined) Object.assign(data, await panColumns(patch.pan || null));
  if (patch.dob !== undefined) data.dob = patch.dob ? new Date(patch.dob) : null;
  const user = await prisma.user.update({
    where: { id: userId },
    data,
  });
  return toAuthUser(user);
}
