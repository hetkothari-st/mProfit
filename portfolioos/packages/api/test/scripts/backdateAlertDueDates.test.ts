import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backdateAlertDueDates } from '../../scripts/backdateAlertDueDates.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/** One-off re-dating of old reminder alerts (launch review B6). Synthetic rows. */
describe('backdateAlertDueDates', () => {
  let scope: TestScope;
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

  beforeEach(async () => {
    scope = await createTestScope('alert-backdate');
    await runAsSystem(async () => {
      await prisma.alert.createMany({
        data: [
          // Scan-dated reminder: moves to its due date.
          { userId: scope.userId, type: 'INSURANCE_PREMIUM', title: 'due in 15 days', triggerDate: day('2026-01-01'), metadata: { key: 'k1', dueDate: '2026-01-16' } },
          // Already dated by its due date: untouched.
          { userId: scope.userId, type: 'CREDIT_CARD_DUE', title: 'due', triggerDate: day('2026-02-20'), metadata: { key: 'k2', dueDate: '2026-02-20' } },
          // No due date: untouched.
          { userId: scope.userId, type: 'CUSTOM', title: 'note', triggerDate: day('2026-03-01'), metadata: { key: 'k3' } },
          // Closed: untouched.
          { userId: scope.userId, type: 'LOAN_GIVEN_DUE', title: 'old', triggerDate: day('2026-01-01'), isActive: false, metadata: { key: 'k4', dueDate: '2026-01-10' } },
        ],
      });
    });
  });
  afterEach(async () => {
    await scope.cleanup();
  });

  const dates = () =>
    runAsSystem(async () =>
      (await prisma.alert.findMany({ where: { userId: scope.userId }, orderBy: { title: 'asc' } })).map((a) => [a.title, a.triggerDate.toISOString().slice(0, 10)]),
    );

  it('a dry run counts but writes nothing', async () => {
    const before = await dates();
    const r = await backdateAlertDueDates({ apply: false, userId: scope.userId });
    expect(r).toEqual({ dryRun: true, candidates: 1, updated: 0, byType: { INSURANCE_PREMIUM: 1 } });
    expect(await dates()).toEqual(before);
  });

  it('--apply moves only open alerts whose due date differs', async () => {
    const r = await backdateAlertDueDates({ apply: true, userId: scope.userId });
    expect(r.updated).toBe(1);
    expect(Object.fromEntries(await dates())).toEqual({
      'due in 15 days': '2026-01-16',
      due: '2026-02-20',
      note: '2026-03-01',
      old: '2026-01-01',
    });
    // Running it again finds nothing.
    expect((await backdateAlertDueDates({ apply: true, userId: scope.userId })).candidates).toBe(0);
  });
});
