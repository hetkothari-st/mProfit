import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { User } from '@prisma/client';

// The access token is the only thing `authenticate` reads `plan` from, so a
// plan change has to mint a new one. Prisma is stubbed because the only DB
// work here is persisting the rotated refresh token.
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: { refreshToken: { create: vi.fn().mockResolvedValue({}) } },
}));

import { issueSession } from '../../src/services/auth.service.js';
import { authenticate } from '../../src/middleware/authenticate.js';
import { requireFeature } from '../../src/middleware/requirePlan.js';

function makeUser(plan: User['plan']): User {
  return {
    id: 'u1',
    email: 'admin@example.com',
    name: 'Admin',
    phone: null,
    pan: null,
    dob: null,
    role: 'ADMIN',
    plan,
    planExpiresAt: null,
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

describe('issueSession after a plan change', () => {
  it('mints an access token carrying the new plan', async () => {
    const { user, tokens } = await issueSession(makeUser('PRO_ADVISOR'));
    expect(user.plan).toBe('PRO_ADVISOR');

    const req = reqWithToken(tokens.accessToken);
    authenticate(req, {} as Response, vi.fn() as NextFunction);
    expect(req.user?.plan).toBe('PRO_ADVISOR');
  });

  it('unlocks tier-gated routes that the pre-switch token was denied', async () => {
    const gate = requireFeature('ACCOUNTING_MODULE');

    const before = await issueSession(makeUser('FREE'));
    const beforeReq = reqWithToken(before.tokens.accessToken);
    authenticate(beforeReq, {} as Response, vi.fn() as NextFunction);
    const deniedNext = vi.fn();
    gate(beforeReq, {} as Response, deniedNext as NextFunction);
    expect(deniedNext.mock.calls[0]![0]).toBeTruthy();

    const after = await issueSession(makeUser('PRO_ADVISOR'));
    const afterReq = reqWithToken(after.tokens.accessToken);
    authenticate(afterReq, {} as Response, vi.fn() as NextFunction);
    const allowedNext = vi.fn();
    gate(afterReq, {} as Response, allowedNext as NextFunction);
    expect(allowedNext).toHaveBeenCalledWith();
  });
});
