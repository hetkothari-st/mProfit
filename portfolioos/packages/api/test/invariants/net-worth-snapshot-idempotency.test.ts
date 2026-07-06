import { describe, it, expect, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { runNetWorthSnapshotForUser } from '../../src/jobs/netWorthSnapshotJob.js';

/**
 * INVARIANT: running the daily net-worth snapshot job twice for the same
 * user on the same day must upsert, never duplicate (§3.3 / spec Task 4).
 */
describe('net worth snapshot idempotency', () => {
  let scope: TestScope;

  afterAll(async () => {
    await runAsSystem(() => prisma.netWorthSnapshot.deleteMany({ where: { userId: scope.userId } }));
    await scope.cleanup();
  });

  it('running the job twice the same day yields exactly one row', async () => {
    scope = await createTestScope('nw-snapshot-idem');
    const fixedAsOf = new Date(Date.UTC(2026, 5, 1)); // 2026-06-01, fixed so re-runs land on the same day

    await runNetWorthSnapshotForUser(scope.userId, fixedAsOf);
    await runNetWorthSnapshotForUser(scope.userId, fixedAsOf);

    const rows = await runAsSystem(() =>
      prisma.netWorthSnapshot.findMany({ where: { userId: scope.userId } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.asOf.toISOString().slice(0, 10)).toBe('2026-06-01');
  });
});
