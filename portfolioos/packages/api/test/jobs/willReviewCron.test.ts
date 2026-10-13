import { describe, it, expect, vi, afterEach } from 'vitest';

const schedule = vi.fn();
vi.mock('node-cron', () => ({ default: { schedule } }));

const { startWillReviewJob } = await import('../../src/jobs/willReviewJob.js');

afterEach(() => {
  schedule.mockClear();
  vi.unstubAllEnvs();
});

describe('startWillReviewJob', () => {
  it('registers nothing when ENABLE_ALERT_CRONS=false', () => {
    vi.stubEnv('ENABLE_ALERT_CRONS', 'false');
    startWillReviewJob();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('registers the daily 09:15 IST run otherwise', () => {
    vi.stubEnv('ENABLE_ALERT_CRONS', 'true');
    startWillReviewJob();
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0]?.[0]).toBe('15 9 * * *');
    expect(schedule.mock.calls[0]?.[2]).toEqual({ timezone: 'Asia/Kolkata' });
  });
});
