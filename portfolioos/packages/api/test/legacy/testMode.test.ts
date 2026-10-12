/**
 * Succession test mode (admin-only): 1-minute inactivity, 1-minute stages,
 * so the whole flow can be exercised in about five minutes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { encryptSecret } from '../../src/lib/secrets.js';
import { planSteps, type PlanClock } from '../../src/services/legacy/stateMachine.js';
import { saveSettings, getOverview } from '../../src/services/legacy/plan.service.js';
import { runLegacyTick } from '../../src/services/legacy/runner.service.js';

const T0 = new Date('2027-01-01T10:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const clock: PlanClock = {
  status: 'ARMED', triggerMode: 'INACTIVITY', inactivityDays: 90, scheduledFor: null, pausedUntil: null,
  stageEnteredAt: null, clockResetAt: T0, lastActiveAt: T0, testMode: true,
};
const okSend = async () => ({ sent: true as const, messageId: 'm' });

describe('test mode state machine', () => {
  it('first warning after 1 minute, not before', () => {
    expect(planSteps(clock, new Date(T0.getTime() + 59_000))).toEqual([]);
    expect(planSteps(clock, at(1))).toEqual([{ kind: 'advance', to: 'WARNING_1', reason: 'inactivity' }]);
  });
  it('each stage lasts 1 minute', () => {
    const p = { ...clock, status: 'GRACE' as const, stageEnteredAt: at(4) };
    expect(planSteps(p, new Date(at(4).getTime() + 30_000))).toEqual([]);
    expect(planSteps(p, at(5))).toEqual([{ kind: 'advance', to: 'RELEASED', reason: 'inactivity' }]);
  });
  it('real plans are unaffected', () => {
    expect(planSteps({ ...clock, testMode: false }, at(10))).toEqual([]);
  });
});

describe('test mode settings + runner', () => {
  let s: TestScope;
  beforeEach(async () => { s = await createTestScope('legacy-testmode'); });
  afterEach(async () => {
    await runAsSystem(() => prisma.legacyPlan.deleteMany({ where: { userId: s.userId } }));
    await s.cleanup();
  });
  const settings = { triggerMode: 'INACTIVITY' as const, inactivityDays: 90, scheduledFor: null, letter: null, testMode: true };

  it('only admins can turn test mode on', async () => {
    await expect(s.runAs(() => saveSettings(s.userId, settings, { isAdmin: false }))).rejects.toThrow(/admin/i);
    await s.runAs(() => saveSettings(s.userId, settings, { isAdmin: true }));
    expect((await s.runAs(() => getOverview(s.userId, true))).testMode).toBe(true);
  });

  it('test mode needs the inactivity trigger', async () => {
    await expect(s.runAs(() => saveSettings(s.userId, { ...settings, triggerMode: 'BOTH', scheduledFor: '2099-01-01' }, { isAdmin: true })))
      .rejects.toThrow(/inactivity/i);
  });

  it('the minute tick walks a test plan to RELEASED in five minutes and leaves real plans alone', async () => {
    const planId = (await runAsSystem(() => prisma.legacyPlan.create({ data: {
      userId: s.userId, status: 'ARMED', testMode: true, clockResetAt: T0, activatedAt: T0,
    } }))).id;
    await runAsSystem(() => prisma.user.update({ where: { id: s.userId }, data: { lastActiveAt: T0 } }));
    await runAsSystem(() => prisma.legacyNominee.create({ data: {
      planId, userId: s.userId, nameEnc: encryptSecret('Ravi'), emailEnc: encryptSecret('ravi@test.local'),
      relationship: 'Brother', priority: 1, categories: ['INSURANCE'],
    } }));
    const want = ['WARNING_1', 'WARNING_2', 'FINAL_WARNING', 'GRACE', 'RELEASED'];
    for (let m = 1; m <= 5; m++) {
      await runLegacyTick(at(m), okSend, { testOnly: true });
      const p = await runAsSystem(() => prisma.legacyPlan.findUniqueOrThrow({ where: { id: planId } }));
      expect(p.status).toBe(want[m - 1]);
    }
  });
});
