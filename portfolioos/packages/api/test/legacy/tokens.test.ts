import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import {
  createLinkToken, resolveLinkToken, issueNomineeOtp, verifyNomineeOtp,
  createNomineeSession, resolveNomineeSession, startOwnerStepUp, verifyOwnerStepUp, checkOwnerGrant,
} from '../../src/services/legacy/tokens.service.js';

const wrong = (code: string) => (code === '000000' ? '111111' : '000000');

describe('legacy tokens', () => {
  let s: TestScope; let planId: string; let nomineeId: string;
  beforeAll(async () => {
    s = await createTestScope('legacy-tok');
    planId = (await runAsSystem(() => prisma.legacyPlan.create({ data: { userId: s.userId } }))).id;
    nomineeId = (await runAsSystem(() => prisma.legacyNominee.create({ data: {
      planId, userId: s.userId, nameEnc: 'n', emailEnc: 'e', relationship: 'Spouse', priority: 1, categories: ['INSURANCE'],
    } }))).id;
  });
  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.legacyCode.deleteMany({ where: { userId: s.userId } });
      await prisma.legacyPlan.deleteMany({ where: { userId: s.userId } });
    });
    await s.cleanup();
  });

  it('link token resolves by purpose, not other purposes, and expires', async () => {
    const now = new Date('2027-01-01T00:00:00Z');
    const raw = await runAsSystem(() => prisma.$transaction((tx) =>
      createLinkToken(tx, { planId, userId: s.userId, nomineeId, purpose: 'ACCESS', cycle: 1, now })));
    expect((await resolveLinkToken(raw, 'ACCESS', now))?.nomineeId).toBe(nomineeId);
    expect(await resolveLinkToken(raw, 'IM_OK', now)).toBeNull();
    expect(await resolveLinkToken(raw, 'ACCESS', new Date('2027-04-02T00:00:00Z'))).toBeNull(); // > 90 days
    expect(await resolveLinkToken('nope', 'ACCESS', now)).toBeNull();
  });

  it('OTP: lockout after 5 wrong codes; correct code during lock rejected', async () => {
    const now = new Date('2027-01-01T00:00:00Z');
    const code = await issueNomineeOtp(nomineeId, s.userId, now);
    for (let i = 0; i < 5; i++) expect(await verifyNomineeOtp(nomineeId, wrong(code), now)).toBe('bad');
    expect(await verifyNomineeOtp(nomineeId, code, now)).toBe('locked');
    await expect(issueNomineeOtp(nomineeId, s.userId, now)).rejects.toThrow(/30 minutes/);
  });

  it('OTP: expires after 10 minutes, single use', async () => {
    const now = new Date('2027-02-01T00:00:00Z');
    const code = await issueNomineeOtp(nomineeId, s.userId, now);
    expect(await verifyNomineeOtp(nomineeId, code, new Date(now.getTime() + 11 * 60_000))).toBe('expired');
    const code2 = await issueNomineeOtp(nomineeId, s.userId, now);
    expect(await verifyNomineeOtp(nomineeId, code2, now)).toBe('ok');
    expect(await verifyNomineeOtp(nomineeId, code2, now)).toBe('expired');
  });

  it('session resolves for 30 minutes', async () => {
    const now = new Date('2027-03-01T00:00:00Z');
    const raw = await createNomineeSession(nomineeId, s.userId, now);
    expect(await resolveNomineeSession(raw, now)).toEqual({ nomineeId, userId: s.userId });
    expect(await resolveNomineeSession(raw, new Date(now.getTime() + 31 * 60_000))).toBeNull();
  });

  it('owner step-up by email code yields a 15-minute grant', async () => {
    const now = new Date();
    const r = await startOwnerStepUp(s.userId);
    expect(r.method).toBe('email');
    await expect(verifyOwnerStepUp(s.userId, wrong(r.code!), now)).rejects.toThrow();
    const grant = await verifyOwnerStepUp(s.userId, r.code!, now);
    expect(await checkOwnerGrant(s.userId, grant, now)).toBe(true);
    expect(await checkOwnerGrant(s.userId, 'forged', now)).toBe(false);
    expect(await checkOwnerGrant(s.userId, grant, new Date(now.getTime() + 16 * 60_000))).toBe(false);
    expect(await checkOwnerGrant(s.userId, undefined, now)).toBe(false);
  });
});
