import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// R-12: imports ran with attempts: 2 while Bull's timeout cannot cancel the
// running attempt, so the retry ran beside it.
// R-13: rescue re-added jobs with random ids (duplicates), never closed
// PROCESSING rows orphaned by Redis loss.
// R-15: Bull's own no-op `error` listener meant Redis outages logged nothing.

const findMany = vi.fn();
const updateMany = vi.fn();
vi.mock('../../src/lib/prisma.js', async (orig) => {
  const real = await orig<typeof import('../../src/lib/prisma.js')>();
  return { ...real, prisma: { ...real.prisma, importJob: { findMany, updateMany } } };
});
vi.mock('../../src/lib/requestContext.js', async (orig) => ({
  ...(await orig<typeof import('../../src/lib/requestContext.js')>()),
  runAsSystem: <T>(fn: () => T) => fn(),
}));

const { IMPORT_JOB_OPTIONS, logQueueErrors } = await import('../../src/lib/queue.js');
const { logger } = await import('../../src/lib/logger.js');
const { rescuePendingJobs, sweepOrphanedProcessingJobs } = await import('../../src/jobs/importWorker.js');

beforeEach(() => {
  findMany.mockReset();
  updateMany.mockReset();
  vi.restoreAllMocks();
});

describe('import queue options', () => {
  it('makes one attempt, so a timed-out job is never retried beside itself', () => {
    expect(IMPORT_JOB_OPTIONS.attempts).toBe(1);
    expect(IMPORT_JOB_OPTIONS.timeout).toBeGreaterThan(0);
  });
});

describe('logQueueErrors', () => {
  it('logs Redis errors, at most once a minute', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const q = new EventEmitter();
    let t = 0;
    logQueueErrors(q as never, 'imports', () => t);
    q.emit('error', new Error('ECONNREFUSED'));
    t = 10_000;
    q.emit('error', new Error('ECONNREFUSED'));
    t = 70_000;
    q.emit('error', new Error('ECONNREFUSED'));
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1]?.[0]).toMatchObject({ queue: 'imports', suppressed: 1 });
  });
});

describe('rescuePendingJobs', () => {
  it('re-adds with jobId = ImportJob id', async () => {
    findMany.mockResolvedValue([{ id: 'j1', userId: 'u1', fileName: 'a.pdf' }]);
    const add = vi.fn(async () => ({}));
    await rescuePendingJobs({ add, getJob: vi.fn() } as never);
    expect(add).toHaveBeenCalledWith({ importJobId: 'j1', userId: 'u1' }, { jobId: 'j1' });
  });
});

describe('sweepOrphanedProcessingJobs', () => {
  const job = (state: string) => ({ getState: async () => state });

  it('fails rows whose Bull job is gone or finished, and leaves live ones', async () => {
    findMany.mockResolvedValue([{ id: 'gone' }, { id: 'done' }, { id: 'live' }]);
    const getJob = vi.fn(async (id: string) =>
      id === 'gone' ? null : id === 'done' ? job('completed') : job('active'),
    );
    const swept = await sweepOrphanedProcessingJobs({ add: vi.fn(), getJob } as never);
    expect(swept).toBe(2);
    const ids = updateMany.mock.calls.map((c) => (c[0] as { where: { id: string } }).where.id);
    expect(ids).toEqual(['gone', 'done']);
    expect(updateMany.mock.calls[0]?.[0]).toMatchObject({ where: { status: 'PROCESSING' }, data: { status: 'FAILED' } });
  });

  it('changes nothing while Redis cannot answer', async () => {
    findMany.mockResolvedValue([{ id: 'x' }]);
    const getJob = vi.fn(() => Promise.reject(new Error('Connection is closed')));
    expect(await sweepOrphanedProcessingJobs({ add: vi.fn(), getJob } as never)).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
