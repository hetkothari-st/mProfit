import { describe, it, expect } from 'vitest';
import { getCurrentUserId, isSystemContext } from '../../src/lib/requestContext.js';
import { runAlertScanJob } from '../../src/jobs/alertJobs.js';

// The daily scan used to run with no request context, so row-level security
// returned zero rows and no alert of any kind was ever created by the cron.
describe('runAlertScanJob', () => {
  it('lists users as system, then scans each user under their own context', async () => {
    const seen: Array<{ arg: string | undefined; ctx: string | null; system: boolean }> = [];
    let listedAsSystem = false;
    await runAlertScanJob({
      listUserIds: async () => {
        listedAsSystem = isSystemContext();
        return ['u1', 'u2'];
      },
      scan: async (userId) => {
        seen.push({ arg: userId, ctx: getCurrentUserId(), system: isSystemContext() });
        return {};
      },
    });
    expect(listedAsSystem).toBe(true);
    expect(seen).toEqual([
      { arg: 'u1', ctx: 'u1', system: false },
      { arg: 'u2', ctx: 'u2', system: false },
    ]);
  });

  it("keeps scanning other users when one user's scan fails", async () => {
    const scanned: string[] = [];
    await runAlertScanJob({
      listUserIds: async () => ['bad', 'good'],
      scan: async (userId) => {
        if (userId === 'bad') throw new Error('boom');
        scanned.push(userId!);
        return {};
      },
    });
    expect(scanned).toEqual(['good']);
  });
});
