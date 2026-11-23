import { describe, it, expect } from 'vitest';
import { resolveProcessRole } from '../../src/lib/processRole.js';

describe('resolveProcessRole', () => {
  it('all: serves HTTP and runs jobs (the default layout)', () => {
    expect(resolveProcessRole('all')).toEqual({ runsHttp: true, runsJobs: true });
  });
  it('web: HTTP only, so replicas never duplicate scheduled work', () => {
    expect(resolveProcessRole('web')).toEqual({ runsHttp: true, runsJobs: false });
  });
  it('worker: jobs only', () => {
    expect(resolveProcessRole('worker')).toEqual({ runsHttp: false, runsJobs: true });
  });
});
