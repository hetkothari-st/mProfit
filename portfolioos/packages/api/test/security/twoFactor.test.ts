import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

const mail = vi.hoisted(() => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true, messageId: 'm' }) }));
vi.mock('../../src/services/notifications/email.service.js', () => mail);

const { createTestScope, prisma } = await import('../helpers/db.js');
const { runAsSystem } = await import('../../src/lib/requestContext.js');
const { hashPassword } = await import('../../src/services/password.service.js');
const { loginUser, completeTwoFactorSignIn } = await import('../../src/services/auth.service.js');
const tf = await import('../../src/services/twoFactor.service.js');
const { totpAt, currentStep } = await import('../../src/lib/totp.js');
const { verifyAccessToken } = await import('../../src/services/jwt.service.js');

/**
 * Two-factor sign-in end to end against a real database (NOBYPASSRLS role).
 * Codes are generated for the step *after* the last accepted one, since a
 * time step is never accepted twice.
 */
describe('two-factor sign-in', () => {
  let scope: Awaited<ReturnType<typeof createTestScope>>;
  let email: string;
  let secret: string;
  let backupCodes: string[];
  const PASSWORD = 'Correct-Horse-Battery-9';

  // Each accepted time step is burned, so move the (Date-only) clock to the
  // next 30 s window before generating a code, as a real user would be.
  let clock = Date.now();
  async function freshCode(): Promise<string> {
    clock += 30_000;
    vi.setSystemTime(clock);
    return totpAt(secret, currentStep());
  }

  async function challenge(restore = false) {
    const r = await loginUser(email, PASSWORD, { restore });
    if (!('mfaRequired' in r)) throw new Error('expected a challenge');
    return r.mfaToken;
  }

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(clock);
    scope = await createTestScope('two-factor');
    const passwordHash = await hashPassword(PASSWORD);
    const u = await runAsSystem(() => prisma.user.update({ where: { id: scope.userId }, data: { passwordHash } }));
    email = u.email;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await runAsSystem(async () => {
      await prisma.mfaChallenge.deleteMany({ where: { userId: scope.userId } });
      await prisma.twoFactorBackupCode.deleteMany({ where: { userId: scope.userId } });
      await prisma.refreshToken.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it('turns on only after a code proves the app was set up', async () => {
    const setup = await tf.beginSetup(scope.userId);
    secret = setup.secret;
    expect(setup.otpauthUrl).toContain('otpauth://totp/');
    await expect(tf.enableTwoFactor(scope.userId, '000000')).rejects.toThrow(/didn't match/);
    const r = await tf.enableTwoFactor(scope.userId, totpAt(secret, currentStep()));
    backupCodes = r.backupCodes;
    expect(backupCodes).toHaveLength(10);
    const stored = await runAsSystem(() => prisma.twoFactorBackupCode.findMany({ where: { userId: scope.userId } }));
    expect(stored.some((c) => backupCodes.includes(c.codeHash))).toBe(false); // hashed, not stored as-is
    expect((await tf.twoFactorStatus(scope.userId)).enabled).toBe(true);
  });

  it('a correct password now yields a challenge, not a session', async () => {
    const r = await loginUser(email, PASSWORD);
    expect('mfaRequired' in r && r.mfaRequired).toBe(true);
    expect('tokens' in r).toBe(false);
  });

  it('the challenge token cannot be used as an access token', async () => {
    const token = await challenge();
    expect(() => verifyAccessToken(token)).toThrow();
  });

  it('completes with a fresh code, and the same code cannot be replayed', async () => {
    const code = await freshCode();
    const session = await completeTwoFactorSignIn(await challenge(), code);
    expect(session.tokens.accessToken).toBeTruthy();
    // Marked as signed in with a second factor (what the CA workspace needs).
    const payload = JSON.parse(Buffer.from(session.tokens.accessToken.split('.')[1]!, 'base64url').toString());
    expect(payload.mfa).toBe(true);
    await expect(completeTwoFactorSignIn(await challenge(), code)).rejects.toThrow(/didn't match/);
  });

  it('a challenge works once', async () => {
    const token = await challenge();
    await completeTwoFactorSignIn(token, await freshCode());
    await expect(completeTwoFactorSignIn(token, await freshCode())).rejects.toThrow(/expired|already/);
  });

  it('five wrong codes burn the challenge', async () => {
    const token = await challenge();
    for (let i = 0; i < 4; i++) await expect(completeTwoFactorSignIn(token, '111111')).rejects.toThrow(/didn't match/);
    await expect(completeTwoFactorSignIn(token, '111111')).rejects.toThrow(/Too many/);
    await expect(completeTwoFactorSignIn(token, await freshCode())).rejects.toThrow(/expired/);
  });

  it('a backup code signs in once, and the owner is emailed', async () => {
    mail.sendEmail.mockClear();
    const code = backupCodes[0]!.toLowerCase(); // case/format-insensitive
    expect((await completeTwoFactorSignIn(await challenge(), code)).via).toBe('backup');
    await expect(completeTwoFactorSignIn(await challenge(), code)).rejects.toThrow(/didn't match/);
    await new Promise((r) => setTimeout(r, 50));
    expect(mail.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringMatching(/backup code/i) }));
  });

  it('the password alone does not cancel a pending deletion; the second factor does', async () => {
    const when = new Date(Date.now() + 86_400_000);
    await runAsSystem(() =>
      prisma.user.update({ where: { id: scope.userId }, data: { deletionRequestedAt: new Date(), deletionScheduledFor: when } }),
    );
    await expect(loginUser(email, PASSWORD)).rejects.toThrow(/scheduled for deletion/);
    const token = await challenge(true);
    let u = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: scope.userId } }));
    expect(u.deletionScheduledFor).not.toBeNull(); // still pending after the password step
    await completeTwoFactorSignIn(token, await freshCode());
    u = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: scope.userId } }));
    expect(u.deletionScheduledFor).toBeNull();
  });

  it('turning it off needs a valid code', async () => {
    await expect(tf.disableTwoFactor(scope.userId, '123456')).rejects.toThrow(/didn't match/);
    await tf.disableTwoFactor(scope.userId, await freshCode());
    expect((await tf.twoFactorStatus(scope.userId)).enabled).toBe(false);
    const r = await loginUser(email, PASSWORD);
    expect('tokens' in r).toBe(true);
  });
});
