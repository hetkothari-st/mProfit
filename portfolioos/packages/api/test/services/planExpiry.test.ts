import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { User } from '@prisma/client';

// A paid plan used to last forever: checkout wrote `planExpiresAt` and nothing
// ever read it. Every place that turns a stored plan into access must treat an
// expired plan as FREE.
const { userFind } = vi.hoisted(() => ({ userFind: vi.fn() }));
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    refreshToken: { create: vi.fn().mockResolvedValue({}) },
    user: { findUnique: (...a: unknown[]) => userFind(...a) },
    aiUsage: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

import { issueSession } from '../../src/services/auth.service.js';
import { authenticate } from '../../src/middleware/authenticate.js';
import { requireFeature } from '../../src/middleware/requirePlan.js';
import { checkQuota } from '../../src/ai/rateLimit.js';
import { effectivePlan } from '../../src/lib/effectivePlan.js';

const DAY = 86_400_000;

function makeUser(plan: User['plan'], planExpiresAt: Date | null): User {
  return {
    id: 'u1',
    email: 'paid@example.com',
    name: 'Paid',
    role: 'INVESTOR',
    plan,
    planExpiresAt,
    isActive: true,
    passwordHash: 'x',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  } as unknown as User;
}

function reqWithToken(token: string): Request {
  return {
    header: (name: string) =>
      name.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined,
  } as unknown as Request;
}

describe('effectivePlan', () => {
  it('keeps a paid plan before it expires, and one with no expiry', () => {
    expect(effectivePlan({ plan: 'PLUS', planExpiresAt: new Date(Date.now() + DAY) })).toBe('PLUS');
    expect(effectivePlan({ plan: 'PRO_ADVISOR', planExpiresAt: null })).toBe('PRO_ADVISOR');
  });

  it('drops an expired paid plan to FREE', () => {
    expect(effectivePlan({ plan: 'PLUS', planExpiresAt: new Date(Date.now() - 1000) })).toBe('FREE');
  });
});

describe('an expired plan loses its access', () => {
  it('mints a FREE token and payload, so tier gates refuse', async () => {
    const { user, tokens } = await issueSession(makeUser('PLUS', new Date(Date.now() - DAY)));
    expect(user.plan).toBe('FREE');

    const req = reqWithToken(tokens.accessToken);
    authenticate(req, {} as Response, vi.fn() as NextFunction);
    expect(req.user?.plan).toBe('FREE');

    const next = vi.fn();
    requireFeature('ACCOUNTING_MODULE')(req, {} as Response, next as NextFunction);
    expect(next.mock.calls[0]![0]).toBeTruthy();
  });

  it('locks the AI assistant quota', async () => {
    userFind.mockResolvedValueOnce({ plan: 'PLUS', planExpiresAt: new Date(Date.now() - DAY) });
    const q = await checkQuota('u1');
    expect(q.allowed).toBe(false);
    expect(q.reason).toBe('tier_locked');
  });
});
