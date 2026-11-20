import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { createTestScope, prisma, runAsVerified, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import { getCaScope } from '../../src/services/ca/caAccess.service.js';
import { issueSession, refreshSession } from '../../src/services/auth/auth.service.js';
import { encryptSecret } from '../../src/lib/secrets.js';
import { generateTotpSecret } from '../../src/lib/totp.js';

/**
 * The CA / adviser workspace needs two-factor sign-in switched on AND used to
 * sign in to the current session (lib/professionalMfa, enforced in getCaScope
 * and on the CA routes).
 */
describe('professional workspace requires two-factor sign-in', () => {
  let pro: TestScope;

  beforeAll(async () => {
    pro = await createTestScope('pro-mfa');
  });
  afterAll(async () => {
    await runAsSystem(() => prisma.refreshToken.deleteMany({ where: { userId: pro.userId } }));
    await pro.cleanup();
  });

  const anyClient = 'clnonexistent0000000000000';

  it('refuses when two-factor is off', async () => {
    await expect(runAsUser(pro.userId, () => getCaScope(pro.userId, anyClient))).rejects.toMatchObject({
      code: 'TWO_FACTOR_REQUIRED',
      details: { reason: 'not_enabled' },
    });
  });

  it('refuses a session that was not signed in with a code, even with two-factor on', async () => {
    await runAsSystem(() =>
      prisma.user.update({
        where: { id: pro.userId },
        data: { twoFactorEnabledAt: new Date(), twoFactorSecretEnc: encryptSecret(generateTotpSecret()) },
      }),
    );
    await expect(runAsUser(pro.userId, () => getCaScope(pro.userId, anyClient))).rejects.toMatchObject({
      code: 'TWO_FACTOR_REQUIRED',
      details: { reason: 'sign_in_again' },
    });
  });

  it('lets a verified session through to the normal grant check', async () => {
    // Past the gate, an unknown client is refused for the usual reason.
    await expect(runAsVerified(pro.userId, () => getCaScope(pro.userId, anyClient))).rejects.toThrow(/not yours/i);
  });

  it('a verified session stays verified across refresh; an ordinary one does not become so', async () => {
    const user = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: pro.userId } }));
    const decode = (t: string) => jwt.decode(t) as { mfa?: boolean };

    const verified = await runAsSystem(() => issueSession(user, { mfa: true }));
    expect(decode(verified.tokens.accessToken).mfa).toBe(true);
    const refreshed = await runAsSystem(() => refreshSession(verified.tokens.refreshToken));
    expect(decode(refreshed.tokens.accessToken).mfa).toBe(true);

    const plain = await runAsSystem(() => issueSession(user));
    expect(decode(plain.tokens.accessToken).mfa).toBeUndefined();
    const plainRefreshed = await runAsSystem(() => refreshSession(plain.tokens.refreshToken));
    expect(decode(plainRefreshed.tokens.accessToken).mfa).toBeUndefined();
  });
});

describe('client list: open to everyone, gated once there are clients', () => {
  it('a user with no clients gets an empty list without two-factor', async () => {
    const nobody = await createTestScope('pro-mfa-empty');
    try {
      const { listClientsHandler } = await import('../../src/controllers/ca.controller.js');
      let body: unknown;
      const res = { status: () => res, json: (b: unknown) => (body = b) } as never;
      await runAsUser(nobody.userId, () => listClientsHandler({ user: { id: nobody.userId } } as never, res));
      expect(body).toMatchObject({ data: [] });
    } finally {
      await nobody.cleanup();
    }
  });
});

describe('client count: what the sidebar polls', () => {
  const call = async (userId: string, handler: 'countClientsHandler' | 'listClientsHandler') => {
    const mod = await import('../../src/controllers/ca.controller.js');
    let body: unknown;
    const res = { status: () => res, json: (b: unknown) => (body = b) } as never;
    await runAsUser(userId, () => mod[handler]({ user: { id: userId } } as never, res));
    return body;
  };

  it('is 0 for a user with no clients, and answers without two-factor for one who has some', async () => {
    const owner = await createTestScope('pro-mfa-count');
    try {
      expect(await call(owner.userId, 'countClientsHandler')).toMatchObject({ data: { count: 0 } });

      await runAsSystem(() =>
        prisma.client.create({ data: { advisorId: owner.userId, name: 'A client', kind: 'SHADOW', status: 'PENDING' } }),
      );
      // The sidebar can ask without a verified session...
      expect(await call(owner.userId, 'countClientsHandler')).toMatchObject({ data: { count: 1 } });
      // ...while the list itself still needs one.
      await expect(call(owner.userId, 'listClientsHandler')).rejects.toMatchObject({ code: 'TWO_FACTOR_REQUIRED' });
    } finally {
      await runAsSystem(() => prisma.client.deleteMany({ where: { advisorId: owner.userId } }));
      await owner.cleanup();
    }
  });
});

describe('admin tools need two-factor sign-in too', () => {
  it('refuses an unverified session and lets a verified one through', async () => {
    const { requireSecondFactor } = await import('../../src/lib/professionalMfa.js');
    const admin = await createTestScope('admin-mfa');
    try {
      const gate = requireSecondFactor('admin tools');
      const call = () =>
        new Promise<unknown>((resolve) => gate({ user: { id: admin.userId } } as never, {} as never, resolve));
      expect(await runAsUser(admin.userId, call)).toMatchObject({ code: 'TWO_FACTOR_REQUIRED' });
      expect(await runAsVerified(admin.userId, call)).toBeUndefined();
    } finally {
      await admin.cleanup();
    }
  });
});
