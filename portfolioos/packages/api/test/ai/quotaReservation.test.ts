import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsUser } from '../../src/lib/requestContext.js';
import { reserveQuota, refundQuota } from '../../src/ai/rateLimit.js';

// F9: the daily cap was checked when a chat started and counted only when its
// stream finished, so parallel requests all passed the check and errored or
// aborted streams were never counted. A message is now reserved atomically
// before Claude is called.
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function person(label: string): Promise<TestScope> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  return scope;
}

async function countToday(userId: string): Promise<number> {
  const rows = await runAsUser(userId, () => prisma.aiUsage.findMany({ where: { userId } }));
  return rows.reduce((n, r) => n + r.messageCount, 0);
}

describe('reserveQuota', () => {
  it('never lets parallel requests past the daily limit', async () => {
    const u = await person('quota-race');
    const results = await Promise.all(
      Array.from({ length: 12 }, () => runAsUser(u.userId, () => reserveQuota(u.userId, 5))),
    );
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(await countToday(u.userId)).toBe(5);
  });

  it('gives a reservation back on refund', async () => {
    const u = await person('quota-refund');
    expect(await runAsUser(u.userId, () => reserveQuota(u.userId, 1))).toBe(true);
    expect(await runAsUser(u.userId, () => reserveQuota(u.userId, 1))).toBe(false);
    await runAsUser(u.userId, () => refundQuota(u.userId));
    expect(await countToday(u.userId)).toBe(0);
    expect(await runAsUser(u.userId, () => reserveQuota(u.userId, 1))).toBe(true);
  });
});
