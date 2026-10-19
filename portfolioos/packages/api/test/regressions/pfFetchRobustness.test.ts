import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// R-02: the scraper's synchronous emit() fired `void transition(...)`; a failed
// status write (session gone → P2025, or a DB blip) was an unhandled rejection,
// which exits the API process for every user.
// R-06: the PF enqueue awaited Bull's add() unbounded, so with Redis down the
// request hung and the session stayed open.

const update = vi.fn();
vi.mock('../../src/lib/prisma.js', async (orig) => {
  const real = await orig<typeof import('../../src/lib/prisma.js')>();
  return { ...real, prisma: { ...real.prisma, pfFetchSession: { update } } };
});

const queueAdd = vi.fn();
vi.mock('../../src/jobs/pfFetchWorker.js', () => ({ pfFetchQueue: { add: queueAdd } }));
vi.mock('../../src/services/pf/uanLookup.service.js', () => ({
  startUanLookup: vi.fn(async () => ({ sessionId: 'sess-1' })),
  startPasswordReset: vi.fn(async () => ({ sessionId: 'sess-2' })),
}));

const { reportStatus } = await import('../../src/services/pfFetchSessions.service.js');
const { startUanLookupHandler } = await import('../../src/controllers/pf.controller.js');

function fakeRes() {
  const res = { statusCode: 200, body: undefined as unknown } as Response & { body: unknown };
  res.status = vi.fn((c: number) => {
    res.statusCode = c;
    return res;
  }) as unknown as Response['status'];
  res.json = vi.fn((b: unknown) => {
    res.body = b;
    return res;
  }) as unknown as Response['json'];
  return res;
}

beforeEach(() => {
  update.mockReset();
  queueAdd.mockReset();
});

describe('reportStatus', () => {
  it('swallows a failed status write instead of rejecting', async () => {
    update.mockRejectedValue(Object.assign(new Error('Record to update not found.'), { code: 'P2025' }));
    await expect(reportStatus('gone', 'SCRAPING')).resolves.toBeUndefined();
  });
});

describe('PF enqueue with the queue unavailable', () => {
  it('answers 503 and closes the session instead of hanging', async () => {
    queueAdd.mockResolvedValue(false);
    update.mockResolvedValue({});
    const req = {
      user: { id: 'u1' },
      body: { mobile: '9999999999', name: 'Test User', dob: '1990-01-01', source: 'SERVER_HEADLESS' },
    } as unknown as Request;
    const res = fakeRes();

    await startUanLookupHandler(req, res);

    expect(res.statusCode).toBe(503);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sess-1' }, data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });
});
