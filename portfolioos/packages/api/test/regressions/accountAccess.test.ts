/**
 * Account & access defects.
 *
 * 1. Logout ran without `authenticate`, so `req.user` was never set: no
 *    sign-out was ever audited and `everywhere: true` revoked nothing.
 * 2. The account holder's invitation email (preview / send) only existed under
 *    /api/ca, behind the professional workspace's two-factor gate, so an
 *    account holder without 2FA got a composer that spun forever.
 * 3. A paid user could buy a lower plan and it replaced the higher one; an
 *    early renewal restarted the clock instead of extending it.
 *
 * Driven over real HTTP so the route wiring (middleware order included) is
 * what is tested, not just the handler.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { authRouter } from '../../src/routes/auth.routes.js';
import { professionalAccessRouter } from '../../src/routes/ca.routes.js';
import { billingRouter } from '../../src/routes/billing.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/auth/jwt.service.js';
import { issueSession } from '../../src/services/auth/auth.service.js';
import { inviteProfessional } from '../../src/services/ca/caAccess.service.js';
import { activatePaidPlan } from '../../src/services/billing/planActivation.service.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import { env } from '../../src/config/env.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
const scopes: TestScope[] = [];

async function scope(label: string): Promise<TestScope> {
  const s = await createTestScope(label);
  scopes.push(s);
  return s;
}

async function call(method: string, path: string, headers: Record<string, string> = {}, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json: json as { data?: Record<string, unknown>; error?: unknown } | null };
}

async function userRow(id: string) {
  return runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id } }));
}

async function liveTokens(userId: string): Promise<number> {
  return runAsSystem(() => prisma.refreshToken.count({ where: { userId, revokedAt: null } }));
}

async function logoutAudits(userId: string) {
  return runAsSystem(() => prisma.auditLog.findMany({ where: { userId, action: 'logout' } }));
}

beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/me/professional-access', professionalAccessRouter);
  app.use('/api/billing', billingRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.close();
  for (const s of scopes) {
    await runAsSystem(async () => {
      await prisma.auditLog.deleteMany({ where: { userId: s.userId } });
      await prisma.billingPayment.deleteMany({ where: { userId: s.userId } });
      const clients = await prisma.client.findMany({ where: { userId: s.userId }, select: { id: true } });
      await prisma.caAuditLog.deleteMany({ where: { clientId: { in: clients.map((c) => c.id) } } });
      await prisma.client.deleteMany({ where: { userId: s.userId } });
    });
    await s.cleanup();
  }
});

describe('1. logout identifies, audits and can sign out everywhere', () => {
  it('audits a sign-out made with a live access token', async () => {
    const s = await scope('logout-audit');
    const session = await issueSession(await userRow(s.userId));
    const r = await call('POST', '/api/auth/logout', { authorization: `Bearer ${session.tokens.accessToken}` }, {
      refreshToken: session.tokens.refreshToken,
    });
    expect(r.status).toBe(204);
    expect(await liveTokens(s.userId)).toBe(0);
    expect(await logoutAudits(s.userId)).toHaveLength(1);
  });

  it('"sign out everywhere" revokes every session the user has', async () => {
    const s = await scope('logout-all');
    const user = await userRow(s.userId);
    const a = await issueSession(user);
    await issueSession(user);
    await issueSession(user);
    expect(await liveTokens(s.userId)).toBe(3);

    const r = await call('POST', '/api/auth/logout', { authorization: `Bearer ${a.tokens.accessToken}` }, {
      refreshToken: a.tokens.refreshToken,
      everywhere: true,
    });
    expect(r.status).toBe(204);
    expect(await liveTokens(s.userId)).toBe(0);
    const audits = await logoutAudits(s.userId);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.metadata).toMatchObject({ everywhere: true });
  });

  it('still succeeds, and still identifies the user, when the access token has expired', async () => {
    const s = await scope('logout-expired');
    const user = await userRow(s.userId);
    const a = await issueSession(user);
    await issueSession(user);
    const expired = jwt.sign(
      { sub: s.userId, email: user.email, role: 'INVESTOR', plan: 'FREE', type: 'access', exp: Math.floor(Date.now() / 1000) - 60 },
      env.JWT_SECRET,
    );
    const r = await call('POST', '/api/auth/logout', { authorization: `Bearer ${expired}` }, {
      refreshToken: a.tokens.refreshToken,
      everywhere: true,
    });
    expect(r.status).toBe(204);
    expect(await liveTokens(s.userId)).toBe(0);
    expect(await logoutAudits(s.userId)).toHaveLength(1);
  });

  it('a revoked refresh token alone cannot sign anyone out everywhere', async () => {
    const s = await scope('logout-stale');
    const user = await userRow(s.userId);
    const old = await issueSession(user);
    await runAsSystem(() =>
      prisma.refreshToken.update({
        where: { tokenHash: createHash('sha256').update(old.tokens.refreshToken, 'utf8').digest('hex') },
        data: { revokedAt: new Date() },
      }),
    );
    await issueSession(user);
    const r = await call('POST', '/api/auth/logout', {}, { refreshToken: old.tokens.refreshToken, everywhere: true });
    expect(r.status).toBe(204);
    expect(await liveTokens(s.userId)).toBe(1);
  });

  it('succeeds with nothing at all (the client clears its state regardless)', async () => {
    const r = await call('POST', '/api/auth/logout', {}, {});
    expect(r.status).toBe(204);
  });
});

describe('2. account holder emails their professional invitation without 2FA', () => {
  it('previews from the account holder side with a plain (no second factor) session', async () => {
    const holder = await scope('invite-holder');
    const { client } = await runAsUser(holder.userId, () =>
      inviteProfessional(holder.userId, { name: 'Asha CA', email: `ca-${holder.userId}@example.com` }),
    );
    const tok = signAccessToken({ sub: holder.userId, email: `${holder.userId}@test.local`, role: 'INVESTOR', plan: 'FREE' }).token;
    const r = await call('POST', `/api/me/professional-access/${client.id}/invite-email/preview`, {
      authorization: `Bearer ${tok}`,
    }, {});
    expect(r.status).toBe(200);
    expect(String(r.json!.data!.acceptUrl)).toContain('/professional-invitations/');
  });

  it('refuses an advisor-initiated invitation on the account holder route (that side keeps its 2FA)', async () => {
    const ca = await scope('invite-advisor');
    const row = await runAsSystem(() =>
      prisma.client.create({
        data: {
          advisorId: ca.userId,
          name: 'Someone',
          kind: 'INVITED',
          status: 'PENDING',
          invitedEmail: 'someone@example.com',
          inviteTokenHash: `h-${ca.userId}`,
          inviteExpiresAt: new Date(Date.now() + 86_400_000),
        },
      }),
    );
    try {
      const tok = signAccessToken({ sub: ca.userId, email: `${ca.userId}@test.local`, role: 'INVESTOR', plan: 'PRO_ADVISOR' }).token;
      const r = await call('POST', `/api/me/professional-access/${row.id}/invite-email/preview`, {
        authorization: `Bearer ${tok}`,
      }, {});
      expect(r.status).toBe(403);
    } finally {
      await runAsSystem(() => prisma.client.delete({ where: { id: row.id } }));
    }
  });
});

describe('3. plan purchases never downgrade, and renewals extend', () => {
  const DAY = 86_400_000;

  it('refuses checkout for a lower plan while a higher one is active', async () => {
    const s = await scope('plan-downgrade');
    const until = new Date(Date.now() + 20 * DAY);
    await runAsSystem(() => prisma.user.update({ where: { id: s.userId }, data: { plan: 'FAMILY', planExpiresAt: until } }));
    const tok = signAccessToken({ sub: s.userId, email: `${s.userId}@test.local`, role: 'INVESTOR', plan: 'FAMILY' }).token;
    const r = await call('POST', '/api/billing/checkout-intent', { authorization: `Bearer ${tok}` }, { tier: 'PLUS' });
    expect(r.status).toBe(400);
  });

  it('a lower-tier payment that still lands does not replace the higher plan', async () => {
    const s = await scope('plan-downgrade-activate');
    const until = new Date(Date.now() + 20 * DAY);
    await runAsSystem(() => prisma.user.update({ where: { id: s.userId }, data: { plan: 'FAMILY', planExpiresAt: until } }));
    const { user } = await runAsUser(s.userId, () => activatePaidPlan({
      userId: s.userId, razorpayOrderId: `o-${s.userId}`, razorpayPaymentId: `p-${s.userId}`, tier: 'PLUS', billingCycle: 'MONTHLY',
    }));
    expect(user.plan).toBe('FAMILY');
    expect(user.planExpiresAt?.getTime()).toBe(until.getTime());
  });

  it('renewing the same plan early extends from the current end date', async () => {
    const s = await scope('plan-renew');
    const until = new Date(Date.now() + 10 * DAY);
    await runAsSystem(() => prisma.user.update({ where: { id: s.userId }, data: { plan: 'PLUS', planExpiresAt: until } }));
    const { user } = await runAsUser(s.userId, () => activatePaidPlan({
      userId: s.userId, razorpayOrderId: `o2-${s.userId}`, razorpayPaymentId: `p2-${s.userId}`, tier: 'PLUS', billingCycle: 'MONTHLY',
    }));
    expect(user.plan).toBe('PLUS');
    expect(user.planExpiresAt?.getTime()).toBe(until.getTime() + 30 * DAY);
  });

  it('an upgrade, or a purchase after a lapse, starts from now', async () => {
    const s = await scope('plan-upgrade');
    await runAsSystem(() =>
      prisma.user.update({ where: { id: s.userId }, data: { plan: 'PLUS', planExpiresAt: new Date(Date.now() - DAY) } }),
    );
    const before = Date.now();
    const { user } = await runAsUser(s.userId, () => activatePaidPlan({
      userId: s.userId, razorpayOrderId: `o3-${s.userId}`, razorpayPaymentId: `p3-${s.userId}`, tier: 'PLUS', billingCycle: 'ANNUAL',
    }));
    expect(user.planExpiresAt!.getTime()).toBeGreaterThanOrEqual(before + 365 * DAY);
    expect(user.planExpiresAt!.getTime()).toBeLessThan(before + 366 * DAY);
  });
});
