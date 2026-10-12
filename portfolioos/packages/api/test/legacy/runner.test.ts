import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { encryptSecret } from '../../src/lib/secrets.js';
import { runLegacyTick } from '../../src/services/legacy/runner.service.js';

const D = (s: string) => new Date(`${s}T04:30:00Z`);
const okSend = async () => ({ sent: true as const, messageId: 'm' });

describe('runLegacyTick', () => {
  let s: TestScope; let planId: string;
  beforeEach(async () => {
    s = await createTestScope('legacy-run');
    await runAsSystem(() => prisma.user.update({ where: { id: s.userId }, data: { lastActiveAt: D('2027-01-01'), plan: 'PLUS' } }));
    planId = (await runAsSystem(() => prisma.legacyPlan.create({ data: {
      userId: s.userId, status: 'ARMED', inactivityDays: 30, clockResetAt: D('2027-01-01'), activatedAt: D('2027-01-01'),
    } }))).id;
    await runAsSystem(() => prisma.legacyNominee.create({ data: {
      planId, userId: s.userId, nameEnc: encryptSecret('Ravi'), emailEnc: encryptSecret('ravi@test.local'),
      relationship: 'Brother', priority: 1, categories: ['INSURANCE'], isVerifier: true,
    } }));
  });
  afterEach(async () => { await runAsSystem(() => prisma.legacyPlan.deleteMany({ where: { userId: s.userId } })); await s.cleanup(); });

  const plan = () => runAsSystem(() => prisma.legacyPlan.findUniqueOrThrow({ where: { id: planId } }));
  // Rows from one transaction share createdAt (Postgres now() is per-transaction), so compare sorted.
  const kinds = () => runAsSystem(() => prisma.legacyOutbox.findMany({ where: { planId } })).then((r) => r.map((x) => x.kind).sort());

  it('walks ARMED → … → RELEASED one stage per run, with the right emails', async () => {
    const days = ['2027-01-31', '2027-02-07', '2027-02-14', '2027-02-21', '2027-02-28'];
    const want = ['WARNING_1', 'WARNING_2', 'FINAL_WARNING', 'GRACE', 'RELEASED'];
    for (let i = 0; i < days.length; i++) {
      await runLegacyTick(D(days[i]!), okSend);
      await runLegacyTick(D(days[i]!), okSend); // same-day rerun is a no-op
      expect((await plan()).status).toBe(want[i]);
    }
    expect(await kinds()).toEqual(['WARNING_1', 'WARNING_2', 'FINAL_WARNING', 'GRACE_OWNER', 'GRACE_NOMINEE', 'VERIFY', 'RELEASED_NOMINEE', 'RELEASED_OWNER'].sort());
    expect((await plan()).releasedAt).not.toBeNull();
  });

  it('owner activity during GRACE resets and tells nominees', async () => {
    await runAsSystem(() => prisma.legacyPlan.update({ where: { id: planId }, data: { status: 'GRACE', stageEnteredAt: D('2027-02-21') } }));
    await runAsSystem(() => prisma.user.update({ where: { id: s.userId }, data: { lastActiveAt: D('2027-02-25') } }));
    await runLegacyTick(D('2027-02-28'), okSend);
    const p = await plan();
    expect(p.status).toBe('ARMED');
    expect(p.cycle).toBe(2);
    expect(await kinds()).toContain('RESET_NOMINEE');
  });

  it('lapsed owner plan still releases', async () => {
    await runAsSystem(() => prisma.user.update({ where: { id: s.userId }, data: { plan: 'FREE' } }));
    await runAsSystem(() => prisma.legacyPlan.update({ where: { id: planId }, data: { status: 'GRACE', stageEnteredAt: D('2027-02-21') } }));
    await runLegacyTick(D('2027-02-28'), okSend);
    expect((await plan()).status).toBe('RELEASED');
  });
});
