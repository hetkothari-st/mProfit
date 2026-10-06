/**
 * A shadow client must never authenticate.
 *
 * These rows exist so a CA's client has books to own. They sit in the same
 * `User` table as everyone else, and a CA will often put the client's REAL
 * email address on the accompanying `Client` record for correspondence. That
 * combination is what makes this dangerous: without an explicit refusal, a
 * password-reset request for that address would mint a token and hand a real
 * person an account they never created, holding their own complete financial
 * position as assembled by someone else.
 *
 * The unguessable password hash is one lock. This asserts the second one, at
 * every entry point, because a single lock on an account like that is not
 * enough and because the failure mode is silent.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import {
  loginUser,
  requestPasswordReset,
  refreshSession,
  issueSession,
} from '../../src/services/auth.service.js';
import { hashPassword } from '../../src/services/password.service.js';

const PASSWORD = 'Sh4dow-Test-Password!';
const realEmail = `shadow-subject-${crypto.randomUUID()}@example.com`;
let shadowId: string;

beforeAll(async () => {
  // Provisioned with a KNOWN password on purpose. If the only thing stopping
  // a login were the unguessable hash, this test would pass while the actual
  // guard was missing — so the hash is made guessable to isolate the flag.
  const passwordHash = await hashPassword(PASSWORD);
  shadowId = await runAsSystem(async () => {
    const u = await prisma.user.create({
      data: {
        email: realEmail,
        name: 'Shadow Subject',
        passwordHash,
        isShadowClient: true,
      },
    });
    return u.id;
  });
}, 120_000);

afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: shadowId } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: shadowId } });
    await prisma.user.deleteMany({ where: { id: shadowId } });
  });
}, 120_000);

describe('shadow client cannot authenticate', () => {
  it('refuses password login even with the correct password', async () => {
    await expect(loginUser(realEmail, PASSWORD)).rejects.toThrow(/invalid credentials/i);
  });

  it('refuses password reset, without revealing the account exists', async () => {
    // Null, not a throw: the same answer an unknown address gets, so this
    // cannot be used to discover which emails have shadow records behind them.
    await expect(requestPasswordReset(realEmail)).resolves.toBeNull();

    const tokens = await runAsSystem(() =>
      prisma.passwordResetToken.findMany({ where: { userId: shadowId } }),
    );
    expect(tokens).toEqual([]);
  });

  it('refuses to refresh a session, even if one was somehow issued', async () => {
    const user = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: shadowId } }));
    const session = await issueSession(user);

    await expect(refreshSession(session.tokens.refreshToken)).rejects.toThrow(
      /invalid credentials/i,
    );
  });
});
