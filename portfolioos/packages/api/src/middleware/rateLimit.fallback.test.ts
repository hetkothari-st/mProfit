import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/env.js', () => ({ env: { REDIS_URL: 'redis://127.0.0.1:1' } }));

const { RedisWindowStore } = await import('./rateLimit.js');

/**
 * While Redis is not ready the limiter used to throw, and `passOnStoreError`
 * turned that into "no limit": every boot opened a window with login
 * unthrottled. It now counts in memory until Redis is back.
 */
describe('rate limit store without Redis', () => {
  function store() {
    const s = new RedisWindowStore('test', () => null);
    s.init({ windowMs: 60_000 } as never);
    return s;
  }

  it('still counts hits per key', async () => {
    const s = store();
    for (let i = 1; i <= 21; i++) {
      expect((await s.increment('1.2.3.4')).totalHits).toBe(i);
    }
    expect((await s.increment('5.6.7.8')).totalHits).toBe(1);
  });

  it('starts a fresh window once the old one expires', async () => {
    vi.useFakeTimers();
    try {
      const s = store();
      await s.increment('k');
      await s.increment('k');
      vi.advanceTimersByTime(60_001);
      expect((await s.increment('k')).totalHits).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('decrement and reset work on the fallback counters', async () => {
    const s = store();
    await s.increment('k');
    await s.increment('k');
    await s.decrement('k');
    expect((await s.increment('k')).totalHits).toBe(2);
    await s.resetKey('k');
    expect((await s.increment('k')).totalHits).toBe(1);
  });
});
