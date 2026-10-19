import { describe, it, expect, vi } from 'vitest';

// R-01: the 00:30 tick used `void runMfPeerRankJob()` around a try/finally with
// no catch, so one failed universe query became an unhandled rejection and the
// process exits on those.
const schedule = vi.fn();
vi.mock('node-cron', () => ({ default: { schedule } }));
vi.mock('../../src/lib/requestContext.js', async (orig) => ({
  ...(await orig<typeof import('../../src/lib/requestContext.js')>()),
  runAsSystem: vi.fn(() => Promise.reject(new Error('db unreachable'))),
}));

const { startMfPeerRankJob, runMfPeerRankJob } = await import('../../src/jobs/mfPeerRankJob.js');

describe('mf peer rank cron tick', () => {
  it('logs a failed run instead of rejecting', async () => {
    startMfPeerRankJob();
    const tick = schedule.mock.calls[0]?.[1] as () => Promise<unknown>;
    await expect(tick()).resolves.toBeUndefined();
  });

  it('still rethrows to direct callers such as the monthly rating chain', async () => {
    await expect(runMfPeerRankJob(new Date('2026-09-30T00:00:00Z'))).rejects.toThrow('db unreachable');
  });
});
