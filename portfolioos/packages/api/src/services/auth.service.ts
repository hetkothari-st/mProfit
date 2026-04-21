import crypto from 'node:crypto';
import type { User } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../lib/errors.js';
import { hashPassword, verifyPassword } from './password.service.js';
import {
  generateRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
} from './jwt.service.js';

interface IssueTokensResult {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
}

export function toAuthUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    pan: user.pan,
    dob: user.dob ? user.dob.toISOString().slice(0, 10) : null,
    role: user.role,
    plan: user.plan,
    planExpiresAt: user.planExpiresAt?.toISOString() ?? null,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
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
      token: refreshToken,
      userId: user.id,
      expiresAt: refreshTokenExpiry(),
    },
  });
  return { accessToken, refreshToken, accessTokenExpiresAt };
}

export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
  phone?: string;
  role?: User['role'];
  plan?: User['plan'];
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError('Email already registered');

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      phone: input.phone,
      role: input.role ?? 'INVESTOR',
      plan: input.plan ?? 'FREE',
    },
  });

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

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) throw new UnauthorizedError('Invalid credentials');
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new UnauthorizedError('Invalid credentials');

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

export async function refreshSession(refreshToken: string) {
  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
  if (!stored.user.isActive) throw new UnauthorizedError('Account deactivated');

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const tokens = await issueTokens(stored.user);
  return {
    user: toAuthUser(stored.user),
    tokens: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
    },
  };
}

export async function logoutSession(refreshToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { token: refreshToken, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function logoutAllSessions(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function requestPasswordReset(email: string): Promise<{ token: string } | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: {
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return { token };
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const record = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new BadRequestError('Invalid or expired reset token');
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  return toAuthUser(user);
}

export async function updateProfile(
  userId: string,
  patch: { name?: string; phone?: string; pan?: string; dob?: string },
) {
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.phone !== undefined) data.phone = patch.phone;
  if (patch.pan !== undefined) data.pan = patch.pan || null;
  if (patch.dob !== undefined) data.dob = patch.dob ? new Date(patch.dob) : null;
  const user = await prisma.user.update({
    where: { id: userId },
    data,
  });
  return toAuthUser(user);
}
