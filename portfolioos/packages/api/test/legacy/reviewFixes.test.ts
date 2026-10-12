/**
 * Regressions for the final branch review (C1, C2, I1–I4). Each test failed
 * before its fix.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { runInTransaction } from '../../src/lib/prisma.js';
import { encryptSecret } from '../../src/lib/secrets.js';
import { isAccountRoute } from '../../src/services/family/managedProfile.service.js';
import { revoke } from '../../src/services/legacy/plan.service.js';
import { runLegacyTick, applyStep } from '../../src/services/legacy/runner.service.js';
import { answerVerify } from '../../src/services/legacy/publicLinks.service.js';
import { createLinkToken, issueNomineeOtp, verifyNomineeOtp } from '../../src/services/legacy/tokens.service.js';
import { enqueue, flushOutbox } from '../../src/services/legacy/outbox.service.js';

const okSend = async () => ({ sent: true as const, messageId: 'm' });
const failSend = async () => ({ sent: false as const, reason: 'smtp down' });
const wrong = (code: string) => (code === '000000' ? '111111' : '000000');

describe('legacy review fixes', () => {
  let s: TestScope; let planId: string; let nomineeId: string;
  beforeEach(async () => {
    s = await createTestScope('legacy-fix');
    planId = (await runAsSystem(() => prisma.legacyPlan.create({ data: {
      userId: s.userId, status: 'ARMED', clockResetAt: new Date(), activatedAt: new Date(),
    } }))).id;
    nomineeId = (await runAsSystem(() => prisma.legacyNominee.create({ data: {
      planId, userId: s.userId, nameEnc: encryptSecret('Ravi'), emailEnc: encryptSecret('ravi@test.local'),
      relationship: 'Brother', priority: 1, categories: ['INSURANCE'], isVerifier: true,
    } }))).id;
  });
  afterEach(async () => {
    await runAsSystem(async () => {
      await prisma.legacyCode.deleteMany({ where: { userId: s.userId } });
      await prisma.legacyPlan.deleteMany({ where: { userId: s.userId } });
    });
    await s.cleanup();
  });
  const plan = () => runAsSystem(() => prisma.legacyPlan.findUniqueOrThrow({ where: { id: planId } }));

  it('C1: revoking a released scheduled plan does not re-release it on the next tick', async () => {
    await runAsSystem(() => prisma.legacyPlan.update({ where: { id: planId }, data: {
      status: 'RELEASED', releasedAt: new Date(), triggerMode: 'SCHEDULED', scheduledFor: new Date('2020-01-01T00:00:00Z'),
    } }));
    await s.runAs(() => revoke(s.userId));
    await runLegacyTick(new Date(), okSend);
    const p = await plan();
    expect(p.status).toBe('ARMED');
    expect(p.scheduledFor).toBeNull();
    expect(p.triggerMode).toBe('INACTIVITY');
  });

  it('C2: re-requesting an OTP does not reset the failed-attempt count', async () => {
    const now = new Date('2027-01-01T00:00:00Z');
    let code = await issueNomineeOtp(nomineeId, s.userId, now);
    for (let i = 0; i < 4; i++) expect(await verifyNomineeOtp(nomineeId, wrong(code), now)).toBe('bad');
    code = await issueNomineeOtp(nomineeId, s.userId, now);
    expect(await verifyNomineeOtp(nomineeId, wrong(code), now)).toBe('bad'); // 5th failure overall
    expect(await verifyNomineeOtp(nomineeId, code, now)).toBe('locked');
  });

  it('C2: parallel wrong guesses are all counted', async () => {
    const now = new Date('2027-01-01T00:00:00Z');
    const code = await issueNomineeOtp(nomineeId, s.userId, now);
    await Promise.all(Array.from({ length: 5 }, () => verifyNomineeOtp(nomineeId, wrong(code), now)));
    expect(await verifyNomineeOtp(nomineeId, code, now)).toBe('locked');
  });

  it('I1: a stale release step is not applied to a plan the owner turned off', async () => {
    await runAsSystem(() => prisma.legacyPlan.update({ where: { id: planId }, data: { status: 'DRAFT' } }));
    await applyStep(planId, { kind: 'advance', to: 'RELEASED', reason: 'inactivity' }, new Date());
    expect((await plan()).status).toBe('DRAFT');
  });

  it('I2: verifier CONFIRM is refused once the owner has been active during GRACE', async () => {
    const stage = new Date(Date.now() - 2 * 3_600_000);
    const p = await runAsSystem(() => prisma.legacyPlan.update({ where: { id: planId }, data: { status: 'GRACE', stageEnteredAt: stage } }));
    await runAsSystem(() => prisma.user.update({ where: { id: s.userId }, data: { lastActiveAt: new Date(Date.now() - 3_600_000) } }));
    const token = await runAsSystem(() => runInTransaction((tx) =>
      createLinkToken(tx, { planId, userId: s.userId, nomineeId, purpose: 'VERIFY', cycle: p.cycle, now: new Date() })));
    expect(await answerVerify(token, 'CONFIRM')).toEqual({ ok: false });
    expect((await plan()).status).not.toBe('RELEASED');
  });

  it('I3: a failing mail is retried with backoff and never abandoned', async () => {
    await runAsSystem(() => runInTransaction((tx) =>
      enqueue(tx, { planId, userId: s.userId, kind: 'RESET_NOMINEE', cycle: 1, recipientKey: nomineeId })));
    let t = Date.now();
    for (let i = 0; i < 8; i++) {
      expect((await flushOutbox(failSend, new Date(t))).failed).toBe(1);
      expect((await flushOutbox(failSend, new Date(t + 1000))).failed).toBe(0); // backing off
      t += 7 * 3_600_000; // past the longest backoff
    }
    expect(await flushOutbox(okSend, new Date(t))).toEqual({ sent: 1, failed: 0 });
  });

  it('I3: two concurrent flushes send a row once', async () => {
    await runAsSystem(() => runInTransaction((tx) =>
      enqueue(tx, { planId, userId: s.userId, kind: 'RESET_NOMINEE', cycle: 1, recipientKey: nomineeId })));
    let sends = 0;
    const slow = async () => { sends++; await new Promise((r) => setTimeout(r, 50)); return { sent: true as const, messageId: 'm' }; };
    await Promise.all([flushOutbox(slow), flushOutbox(slow)]);
    expect(sends).toBe(1);
  });

  it('I4: /api/legacy is refused while acting for a managed profile', () => {
    expect(isAccountRoute('/api/legacy')).toBe(true);
    expect(isAccountRoute('/api/legacy/nominees')).toBe(true);
  });
});
