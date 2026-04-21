import type { Request, Response } from 'express';
import { z } from 'zod';
import { UserRole, PlanTier } from '@prisma/client';
import {
  getCurrentUser,
  loginUser,
  logoutAllSessions,
  logoutSession,
  refreshSession,
  registerUser,
  requestPasswordReset,
  resetPassword,
  updateProfile,
} from '../services/auth.service.js';
import { created, noContent, ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const registerSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(100),
  name: z.string().min(2).max(100),
  phone: z.string().optional(),
  role: z.nativeEnum(UserRole).optional(),
  plan: z.nativeEnum(PlanTier).optional(),
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
  token: z.string().min(10),
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

export async function register(req: Request, res: Response) {
  const data = registerSchema.parse(req.body);
  const result = await registerUser(data);
  created(res, result);
}

export async function login(req: Request, res: Response) {
  const data = loginSchema.parse(req.body);
  const result = await loginUser(data.email, data.password);
  ok(res, result);
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
  noContent(res);
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = forgotPasswordSchema.parse(req.body);
  const result = await requestPasswordReset(email);
  if (result) {
    logger.info({ email, token: result.token }, 'Password reset requested');
  }
  ok(res, { message: 'If an account with that email exists, a reset link has been sent.' });
}

export async function resetPasswordHandler(req: Request, res: Response) {
  const data = resetPasswordSchema.parse(req.body);
  await resetPassword(data.token, data.newPassword);
  ok(res, { message: 'Password updated successfully.' });
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
