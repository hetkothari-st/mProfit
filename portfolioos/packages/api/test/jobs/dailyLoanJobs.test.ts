import { describe, it, expect } from 'vitest';
import { runDailyLoanJobs } from '../../src/jobs/loanRatesJob.js';

describe('runDailyLoanJobs (spec s6.3: checks run after the rates job)', () => {
  it('runs the loan checks after the rates job', async () => {
    const order: string[] = [];
    await runDailyLoanJobs({ rates: async () => { order.push('rates'); }, checks: async () => { order.push('checks'); } });
    expect(order).toEqual(['rates', 'checks']);
  });

  it('still runs the loan checks when the rates job fails', async () => {
    const order: string[] = [];
    await runDailyLoanJobs({
      rates: async () => { order.push('rates'); throw new Error('bank page down'); },
      checks: async () => { order.push('checks'); },
    });
    expect(order).toEqual(['rates', 'checks']);
  });

  it('logs a failing checks step instead of rejecting (one log, review fix)', async () => {
    await expect(runDailyLoanJobs({
      rates: async () => undefined,
      checks: async () => { throw new Error('db down'); },
    })).resolves.toBeUndefined();
  });
});
