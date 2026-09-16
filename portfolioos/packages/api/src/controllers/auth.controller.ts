import type { Request, Response } from 'express';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import {
  getCurrentUser,
  loginOrRegisterWithGoogle,
  loginUser,
  logoutAllSessions,
  logoutSession,
  refreshSession,
  requestPasswordReset,
  resendRegistrationCode,
  resetPassword,
  startRegistration,
  getCurrentUserRecord,
  updateProfile,
  verifyRegistration,
} from '../services/auth.service.js';
import { created, noContent, ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import { writeAuditLog } from '../lib/audit.js';
import { readPan } from '../services/piiAtRest.service.js';

export const registerSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(100),
  name: z.string().min(2).max(100),
  phone: z.string().optional(),
  // ADMIN is never self-assignable at registration — it bypasses every
  // plan-tier gate (see requireFeature), so granting it must stay an
  // out-of-band operation, not something a public signup form can request.
  // `plan` isn't accepted here at all: every new account starts FREE and
  // upgrades only through the billing flow, never by self-declaring a
  // paid tier at signup.
  role: z.nativeEnum(UserRole).refine((r) => r !== 'ADMIN', {
    message: 'Cannot self-register with this role',
  }).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
  everywhere: z.boolean().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export const resetPasswordSchema = z.object({
  email: z.string().email().toLowerCase(),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  newPassword: z.string().min(8).max(100),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().optional(),
  pan: z
    .string()
    .transform((v) => v.trim().toUpperCase())
    .refine((v) => v === '' || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v), {
      message: 'Invalid PAN format',
    })
    .optional(),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('')),
});

export const verifyRegistrationSchema = z.object({
  email: z.string().email().toLowerCase(),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const resendRegistrationSchema = z.object({
  email: z.string().email().toLowerCase(),
});

/** Signup step 1: stash the details and email a code. No account yet. */
export async function register(req: Request, res: Response) {
  const data = registerSchema.parse(req.body);
  const result = await startRegistration(data);
  ok(res, result);
}

/** Signup step 2: the code checks out, so create the account and sign in. */
export async function verifyRegistrationHandler(req: Request, res: Response) {
  const { email, code } = verifyRegistrationSchema.parse(req.body);
  const result = await verifyRegistration(email, code);
  created(res, result);
}

export async function resendRegistrationHandler(req: Request, res: Response) {
  const { email } = resendRegistrationSchema.parse(req.body);
  const result = await resendRegistrationCode(email);
  ok(res, result);
}

export async function login(req: Request, res: Response) {
  const data = loginSchema.parse(req.body);
  try {
    const result = await loginUser(data.email, data.password);
    await writeAuditLog({
      userId: result.user.id,
      action: 'login',
      resource: `User:${result.user.id}`,
      req,
    });
    ok(res, result);
  } catch (err) {
    // A failed sign-in is the single most useful thing to have in an audit
    // trail, so record it before rethrowing. Email only — never the password,
    // and no indication of whether the account exists.
    await writeAuditLog({ action: 'login_failed', metadata: { email: data.email }, req });
    throw err;
  }
}

export async function refresh(req: Request, res: Response) {
  const data = refreshSchema.parse(req.body);
  const result = await refreshSession(data.refreshToken);
  ok(res, result);
}

export async function logout(req: Request, res: Response) {
  const { refreshToken, everywhere } = logoutSchema.parse(req.body ?? {});
  if (everywhere && req.user) {
    await logoutAllSessions(req.user.id);
  } else if (refreshToken) {
    await logoutSession(refreshToken);
  }
  if (req.user) {
    await writeAuditLog({
      userId: req.user.id,
      action: 'logout',
      resource: `User:${req.user.id}`,
      metadata: { everywhere: Boolean(everywhere) },
      req,
    });
  }
  noContent(res);
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = forgotPasswordSchema.parse(req.body);
  // The result is deliberately unused: the response is the same whether or
  // not a code went out, so it can't be used to probe for accounts.
  await requestPasswordReset(email);
  // Audited on every request, not only when an account matched, so the audit
  // write adds no behaviour that differs by whether the address exists.
  await writeAuditLog({ action: 'password_reset_requested', metadata: { email }, req });
  ok(res, { message: 'If an account with that email exists, a reset code has been sent.' });
}

export async function resetPasswordHandler(req: Request, res: Response) {
  const data = resetPasswordSchema.parse(req.body);
  await resetPassword(data.email, data.code, data.newPassword);
  ok(res, { message: 'Password updated successfully.' });
}

/**
 * Return the caller's full PAN.
 *
 * Deliberately a separate, POST-only, rate-limited (piiLimiter) and audited
 * endpoint rather than a field on /me: the profile payload is cached and
 * persisted by the client, and a government identifier should not be along
 * for that ride. Every call leaves an AuditLog row, so "when was my PAN last
 * viewed" has an answer.
 */
export async function revealPan(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const user = await getCurrentUserRecord(req.user.id);
  await writeAuditLog({
    userId: req.user.id,
    action: 'pii_view',
    resource: `User:${req.user.id}`,
    metadata: { field: 'pan' },
    req,
  });
  ok(res, { pan: await readPan(user) });
}

export async function me(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const user = await getCurrentUser(req.user.id);
  ok(res, user);
}

export async function patchMe(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const patch = updateProfileSchema.parse(req.body);
  const user = await updateProfile(req.user.id, patch);
  ok(res, user);
}

export const googleSchema = z.object({
  idToken: z.string().min(20),
});

export async function google(req: Request, res: Response) {
  const { idToken } = googleSchema.parse(req.body);
  const result = await loginOrRegisterWithGoogle(idToken);
  if (result.isNew) created(res, result);
  else ok(res, result);
}
