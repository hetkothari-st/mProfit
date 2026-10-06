import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

// Ratings used to need the 15th's scheduled run before a fund page showed
// anything. Production already holds years of NAV history, so the first deploy
// rates from it: once, in the background, guarded by an AppSetting marker.
const store = new Map<string, { value: unknown }>();
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    appSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        const row = store.get(where.key);
        return row ? { key: where.key, value: row.value } : null;
      }),
      create: vi.fn(async ({ data }: { data: { key: string; value: unknown } }) => {
        if (store.has(data.key)) {
          throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 't' });
        }
        store.set(data.key, { value: data.value });
        return data;
      }),
      update: vi.fn(async ({ where, data }: { where: { key: string }; data: { value: unknown } }) => {
        store.set(where.key, { value: data.value });
        return { key: where.key, ...data };
      }),
    },
  },
}));
vi.mock('../../src/lib/requestContext.js', () => ({ runAsSystem: (fn: () => unknown) => fn() }));

const { runMfBootstrapOnce, MF_BOOTSTRAP_KEY, bootstrapMonthEnds } = await import('../../src/jobs/mfBootstrap.js');

function deps(log: string[]) {
  const step = (name: string) => vi.fn(async () => { log.push(name); return {}; });
  return {
    metadata: step('metadata'),
    benchmarks: step('benchmarks'),
    riskFree: step('riskFree'),
    navHistory: step('navHistory'),
    navAdjustment: step('navAdjustment'),
    factsheets: step('factsheets'),
    ratingChain: vi.fn(async (asOf: Date) => { log.push(`rate ${asOf.toISOString().slice(0, 10)}`); return true; }),
  };
}

const NOW = new Date('2026-10-06T12:00:00Z');

beforeEach(() => store.clear());

describe('bootstrapMonthEnds', () => {
  it('lists the last N month-ends, oldest first', () => {
    expect(bootstrapMonthEnds(NOW, 3).map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2026-07-31',
      '2026-08-31',
      '2026-09-30',
    ]);
  });
});

describe('runMfBootstrapOnce', () => {
  it('prepares the inputs, then rates each month-end in order, then marks itself done', async () => {
    const log: string[] = [];
    const r = await runMfBootstrapOnce({ now: NOW, months: 2, deps: deps(log) });
    expect(r.status).toBe('DONE');
    expect(log).toEqual([
      'metadata', 'benchmarks', 'riskFree', 'navHistory', 'navAdjustment', 'factsheets',
      'rate 2026-08-31', 'rate 2026-09-30',
    ]);
    expect((store.get(MF_BOOTSTRAP_KEY)!.value as { status: string }).status).toBe('DONE');
  });

  it('does nothing on later boots', async () => {
    store.set(MF_BOOTSTRAP_KEY, { value: { status: 'DONE' } });
    const log: string[] = [];
    const r = await runMfBootstrapOnce({ now: NOW, months: 1, deps: deps(log) });
    expect(r.status).toBe('SKIPPED');
    expect(log).toEqual([]);
  });

  it('leaves a run in progress alone', async () => {
    store.set(MF_BOOTSTRAP_KEY, { value: { status: 'RUNNING', startedAt: '2026-10-06T11:30:00Z' } });
    const log: string[] = [];
    expect((await runMfBootstrapOnce({ now: NOW, months: 1, deps: deps(log) })).status).toBe('SKIPPED');
    expect(log).toEqual([]);
  });

  it('takes over a run abandoned by a redeploy', async () => {
    store.set(MF_BOOTSTRAP_KEY, { value: { status: 'RUNNING', startedAt: '2026-10-06T02:00:00Z' } });
    const log: string[] = [];
    expect((await runMfBootstrapOnce({ now: NOW, months: 1, deps: deps(log) })).status).toBe('DONE');
    expect(log).toContain('rate 2026-09-30');
  });

  it('retries after a failed run, and records a failure without marking done', async () => {
    store.set(MF_BOOTSTRAP_KEY, { value: { status: 'FAILED' } });
    const log: string[] = [];
    const d = deps(log);
    d.metadata = vi.fn(async () => { throw new Error('AMFI down'); });
    const r = await runMfBootstrapOnce({ now: NOW, months: 1, deps: d });
    expect(r.status).toBe('FAILED');
    expect((store.get(MF_BOOTSTRAP_KEY)!.value as { status: string }).status).toBe('FAILED');
    expect(log).toEqual([]); // nothing rates on incomplete inputs
  });

  it('keeps going past a failed optional step (factsheets) — ratings do not need it', async () => {
    const log: string[] = [];
    const d = deps(log);
    d.factsheets = vi.fn(async () => { throw new Error('AMC site changed'); });
    const r = await runMfBootstrapOnce({ now: NOW, months: 1, deps: d });
    expect(r.status).toBe('DONE');
    expect(log).toContain('rate 2026-09-30');
  });

  it('fails without rating when benchmark history cannot be fetched', async () => {
    const log: string[] = [];
    const d = deps(log);
    d.benchmarks = vi.fn(async () => { throw new Error('NSE down'); });
    const r = await runMfBootstrapOnce({ now: NOW, months: 1, deps: d });
    expect(r.status).toBe('FAILED');
    expect(log.some((l) => l.startsWith('rate'))).toBe(false);
  });
});
