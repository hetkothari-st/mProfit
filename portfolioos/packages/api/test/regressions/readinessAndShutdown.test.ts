import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkReadiness } from '../../src/lib/health.js';
import { createShutdown, type ShutdownDeps } from '../../src/lib/shutdown.js';

// R-10: /health never touched the database, so a deploy that could not reach
// Postgres passed the healthcheck. R-11: shutdown waited on SSE/keep-alive
// sockets until its forced exit(1), with crons still firing.

describe('checkReadiness', () => {
  it('is ready when the database answers', async () => {
    expect(await checkReadiness(async () => 1)).toEqual({ ok: true });
  });

  it('is not ready when the database errors', async () => {
    expect((await checkReadiness(() => Promise.reject(new Error('ECONNREFUSED')))).ok).toBe(false);
  });

  it('is not ready when the database hangs', async () => {
    const r = await checkReadiness(() => new Promise(() => {}), 50);
    expect(r).toEqual({ ok: false, reason: 'database timeout' });
  });
});

describe('createShutdown', () => {
  afterEach(() => vi.useRealTimers());

  function deps(over: Partial<ShutdownDeps> = {}) {
    const order: string[] = [];
    let onClose: (() => void) | undefined;
    const d: ShutdownDeps = {
      server: {
        close: vi.fn((cb?: () => void) => {
          order.push('close');
          onClose = cb;
          return undefined as never;
        }),
        closeIdleConnections: vi.fn(() => order.push('idle')),
        closeAllConnections: vi.fn(() => order.push('all')),
      },
      stopSchedulers: vi.fn(() => order.push('schedulers')),
      closeQueues: vi.fn(async () => {
        order.push('queues');
      }),
      disconnect: vi.fn(async () => {
        order.push('db');
      }),
      exit: vi.fn((code: number) => order.push(`exit:${code}`)),
      graceMs: 100,
      hardMs: 1_000,
      ...over,
    };
    return { d, order, finishClose: () => onClose?.() };
  }

  it('stops schedulers first, then drains, then exits 0', async () => {
    const { d, order, finishClose } = deps();
    createShutdown(d)('SIGTERM');
    finishClose();
    await vi.waitFor(() => expect(d.exit).toHaveBeenCalledWith(0));
    expect(order.slice(0, 3)).toEqual(['schedulers', 'close', 'idle']);
    expect(order).toContain('queues');
    expect(order.indexOf('queues')).toBeLessThan(order.indexOf('db'));
  });

  it('cuts long-lived sockets after the grace period', () => {
    vi.useFakeTimers();
    const { d } = deps();
    createShutdown(d)('SIGTERM');
    vi.advanceTimersByTime(150);
    expect(d.server.closeAllConnections).toHaveBeenCalled();
  });

  it('ignores a second signal', () => {
    const { d } = deps();
    const shutdown = createShutdown(d);
    shutdown('SIGTERM');
    shutdown('SIGINT');
    expect(d.server.close).toHaveBeenCalledTimes(1);
  });
});
