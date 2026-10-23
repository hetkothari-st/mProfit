import { describe, it, expect, vi } from 'vitest';

// The PF reminder was documented as 09:00 IST but scheduled as '30 3' in the
// Asia/Kolkata timezone, i.e. 03:30 IST.
const schedule = vi.fn();
vi.mock('node-cron', () => ({ default: { schedule } }));

const { startPfNudgeJob } = await import('../../src/jobs/pfNudgeJob.js');

describe('PF refresh reminder schedule', () => {
  it('runs at 09:00 IST', () => {
    const prev = process.env.ENABLE_PF_NUDGE_CRON;
    process.env.ENABLE_PF_NUDGE_CRON = 'true';
    try {
      startPfNudgeJob();
    } finally {
      if (prev === undefined) delete process.env.ENABLE_PF_NUDGE_CRON;
      else process.env.ENABLE_PF_NUDGE_CRON = prev;
    }
    expect(schedule).toHaveBeenCalledWith('0 9 * * *', expect.any(Function), { timezone: 'Asia/Kolkata' });
  });
});
