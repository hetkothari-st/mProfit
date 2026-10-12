import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { runInTransaction } from '../../src/lib/prisma.js';
import { getOverview, saveSettings, addNominee, activate, pause, revoke, removeNominee } from '../../src/services/legacy/plan.service.js';
import { imOk, answerVerify } from '../../src/services/legacy/publicLinks.service.js';
import { createLinkToken, createNomineeSession, resolveNomineeSession } from '../../src/services/legacy/tokens.service.js';

const nominee = {
  name: 'Ravi', email: 'ravi@test.local', relationship: 'Brother', priority: 1, isVerifier: true,
  categories: ['INSURANCE' as const], documentIds: [], showAmounts: false,
};

describe('legacy plan service', () => {
  let s: TestScope;
  beforeEach(async () => { s = await createTestScope('legacy-plan'); });
  afterEach(async () => {
    await runAsSystem(async () => {
      await prisma.legacyCode.deleteMany({ where: { userId: s.userId } });
      await prisma.legacyPlan.deleteMany({ where: { userId: s.userId } });
    });
    await s.cleanup();
  });

  it('rejects inactivityDays below 30 and a past scheduled date', async () => {
    await expect(s.runAs(() => saveSettings(s.userId, { triggerMode: 'INACTIVITY', inactivityDays: 29, scheduledFor: null, letter: null }))).rejects.toThrow(/30/);
    await expect(s.runAs(() => saveSettings(s.userId, { triggerMode: 'SCHEDULED', inactivityDays: 90, scheduledFor: '2020-01-01', letter: null }))).rejects.toThrow(/future/);
  });

  it('activate needs a nominee, then arms and invites', async () => {
    await s.runAs(() => saveSettings(s.userId, { triggerMode: 'INACTIVITY', inactivityDays: 90, scheduledFor: null, letter: 'Locker #42' }));
    await expect(s.runAs(() => activate(s.userId))).rejects.toThrow(/nominee/i);
    await s.runAs(() => addNominee(s.userId, nominee));
    await s.runAs(() => activate(s.userId));
    const o = await s.runAs(() => getOverview(s.userId, true));
    expect(o.status).toBe('ARMED');
    expect(o.letter).toBe('Locker #42');
    expect(o.nominees[0]!.email).toBe('ravi@test.local');
    expect(await runAsSystem(() => prisma.legacyOutbox.count({ where: { kind: 'INVITE', userId: s.userId } }))).toBe(1);
  });

  it('only one verifier; duplicate email rejected', async () => {
    await s.runAs(() => addNominee(s.userId, nominee));
    await expect(s.runAs(() => addNominee(s.userId, { ...nominee, name: 'Dup' }))).rejects.toThrow(/already/i);
    await s.runAs(() => addNominee(s.userId, { ...nominee, email: 'b@test.local', name: 'B' }));
    const o = await s.runAs(() => getOverview(s.userId, true));
    expect(o.nominees.filter((n) => n.isVerifier)).toHaveLength(1);
    expect(o.nominees.find((n) => n.isVerifier)!.name).toBe('B');
  });

  it('pause is capped at 180 days', async () => {
    await s.runAs(() => addNominee(s.userId, nominee));
    await s.runAs(() => activate(s.userId));
    const far = new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10);
    await expect(s.runAs(() => pause(s.userId, far))).rejects.toThrow(/180/);
  });

  it("I'm OK in WARNING_1 resets to ARMED with a new cycle", async () => {
    await s.runAs(() => addNominee(s.userId, nominee));
    await s.runAs(() => activate(s.userId));
    const plan = await runAsSystem(() => prisma.legacyPlan.update({ where: { userId: s.userId }, data: { status: 'WARNING_1', stageEnteredAt: new Date() } }));
    const token = await runAsSystem(() => runInTransaction((tx) => createLinkToken(tx, { planId: plan.id, userId: s.userId, nomineeId: null, purpose: 'IM_OK', cycle: plan.cycle, now: new Date() })));
    expect(await imOk(token)).toEqual({ ok: true });
    const after = await runAsSystem(() => prisma.legacyPlan.findUniqueOrThrow({ where: { id: plan.id } }));
    expect(after.status).toBe('ARMED');
    expect(after.cycle).toBe(plan.cycle + 1);
  });

  it('verifier FINE fully resets; CONFIRM releases', async () => {
    const n = await s.runAs(() => addNominee(s.userId, nominee));
    await s.runAs(() => activate(s.userId));
    const mk = async () => {
      const p = await runAsSystem(() => prisma.legacyPlan.update({ where: { userId: s.userId }, data: { status: 'GRACE', stageEnteredAt: new Date() } }));
      return runAsSystem(() => runInTransaction((tx) => createLinkToken(tx, { planId: p.id, userId: s.userId, nomineeId: n.id, purpose: 'VERIFY', cycle: p.cycle, now: new Date() })));
    };
    expect(await answerVerify(await mk(), 'FINE')).toEqual({ ok: true });
    expect((await s.runAs(() => getOverview(s.userId, true))).status).toBe('ARMED');
    expect(await answerVerify(await mk(), 'CONFIRM')).toEqual({ ok: true });
    expect((await s.runAs(() => getOverview(s.userId, true))).status).toBe('RELEASED');
  });

  it('revoke invalidates an open session; removing a nominee does too', async () => {
    const n = await s.runAs(() => addNominee(s.userId, nominee));
    await s.runAs(() => activate(s.userId));
    await runAsSystem(() => prisma.legacyPlan.update({ where: { userId: s.userId }, data: { status: 'RELEASED', releasedAt: new Date() } }));
    const sess = await createNomineeSession(n.id, s.userId);
    expect(await resolveNomineeSession(sess)).not.toBeNull();
    await s.runAs(() => revoke(s.userId));
    expect(await resolveNomineeSession(sess)).toBeNull();
    expect((await s.runAs(() => getOverview(s.userId, true))).status).toBe('ARMED');
    const sess2 = await createNomineeSession(n.id, s.userId);
    await s.runAs(() => removeNominee(s.userId, n.id));
    expect(await resolveNomineeSession(sess2)).toBeNull();
  });
});
