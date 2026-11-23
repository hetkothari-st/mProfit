import { describe, it, expect, vi } from 'vitest';
import { createResultCache, type CacheStore } from '../../src/lib/resultCache.js';
import { runAsUser, runAsSystem } from '../../src/lib/requestContext.js';

function fakeStore() {
  const data = new Map<string, string>();
  const ttls = new Map<string, number>();
  const store: CacheStore & { data: Map<string, string>; ttls: Map<string, number>; fail: boolean } = {
    data,
    ttls,
    fail: false,
    async mget(keys) {
      if (store.fail) throw new Error('down');
      return keys.map((k) => data.get(k) ?? null);
    },
    async get(key) {
      if (store.fail) throw new Error('down');
      return data.get(key) ?? null;
    },
    async set(key, value, ttl) {
      if (store.fail) throw new Error('down');
      data.set(key, value);
      ttls.set(key, ttl);
    },
    async incrMany(keys) {
      if (store.fail) throw new Error('down');
      for (const k of keys) data.set(k, String(Number(data.get(k) ?? '0') + 1));
    },
  };
  return store;
}

const spec = (over: Partial<Parameters<ReturnType<typeof createResultCache>['cached']>[0]> = {}) => ({
  name: 'kpis',
  params: { kind: 'user', userId: 'u1' },
  userIds: ['u1'],
  ...over,
});

describe('resultCache', () => {
  it('computes once, then serves the stored result', async () => {
    const cache = createResultCache({ store: fakeStore(), enabled: () => true });
    const compute = vi.fn(async () => ({ xirr: 12.5, label: 'a', nothing: null }));
    const a = await runAsUser('u1', () => cache.cached(spec(), compute));
    const b = await runAsUser('u1', () => cache.cached(spec(), compute));
    expect(compute).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
  });

  it('never serves one user a result computed for another, even with identical arguments', async () => {
    const cache = createResultCache({ store: fakeStore(), enabled: () => true });
    await runAsUser('alice', () => cache.cached(spec({ userIds: ['alice'] }), async () => 'alice-data'));
    // Same name, same params, same data owner: only the acting user differs.
    const seenByBob = await runAsUser('bob', () => cache.cached(spec({ userIds: ['alice'] }), async () => 'bob-sees-nothing'));
    expect(seenByBob).toBe('bob-sees-nothing');
  });

  it("drops a user's cached results the moment their data changes", async () => {
    const cache = createResultCache({ store: fakeStore(), enabled: () => true });
    let n = 0;
    const compute = async () => ++n;
    expect(await runAsUser('u1', () => cache.cached(spec(), compute))).toBe(1);
    expect(await runAsUser('u1', () => cache.cached(spec(), compute))).toBe(1);
    cache.bump('u1');
    await cache.flush();
    expect(await runAsUser('u1', () => cache.cached(spec(), compute))).toBe(2);
  });

  it("a change to the data's owner invalidates a reader's entry (shared portfolio)", async () => {
    const cache = createResultCache({ store: fakeStore(), enabled: () => true });
    let n = 0;
    const compute = async () => ++n;
    const owned = spec({ userIds: ['owner'] });
    expect(await runAsUser('reader', () => cache.cached(owned, compute))).toBe(1);
    cache.bump('owner');
    await cache.flush();
    expect(await runAsUser('reader', () => cache.cached(owned, compute))).toBe(2);
  });

  it('batches many bumps for one user into a single version move', async () => {
    const store = fakeStore();
    const incr = vi.spyOn(store, 'incrMany');
    const cache = createResultCache({ store, enabled: () => true });
    for (let i = 0; i < 500; i++) cache.bump('u1'); // a bulk import
    await cache.flush();
    expect(incr).toHaveBeenCalledTimes(1);
    expect(incr.mock.calls[0]![0]).toEqual(['rcv:u1']);
  });

  it('different arguments are different entries', async () => {
    const cache = createResultCache({ store: fakeStore(), enabled: () => true });
    const compute = vi.fn(async () => 1);
    await runAsUser('u1', () => cache.cached(spec({ params: { id: 'p1' } }), compute));
    await runAsUser('u1', () => cache.cached(spec({ params: { id: 'p2' } }), compute));
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('fails open: a broken store never breaks or slows the call', async () => {
    const store = fakeStore();
    store.fail = true;
    const cache = createResultCache({ store, enabled: () => true });
    expect(await runAsUser('u1', () => cache.cached(spec(), async () => 'fresh'))).toBe('fresh');
    cache.bump('u1');
    await expect(cache.flush()).resolves.toBeUndefined();
  });

  it('does not cache when disabled, with no store, or with no acting user', async () => {
    const compute = vi.fn(async () => 1);
    const off = createResultCache({ store: fakeStore(), enabled: () => false });
    await runAsUser('u1', () => off.cached(spec(), compute));
    await runAsUser('u1', () => off.cached(spec(), compute));
    const none = createResultCache({ store: null, enabled: () => true });
    await runAsUser('u1', () => none.cached(spec(), compute));
    const noUser = createResultCache({ store: fakeStore(), enabled: () => true });
    await noUser.cached(spec(), compute);
    await noUser.cached(spec(), compute);
    expect(compute).toHaveBeenCalledTimes(5);
  });

  it('caches system-context calls under their own identity', async () => {
    const cache = createResultCache({ store: fakeStore(), enabled: () => true });
    const compute = vi.fn(async () => 1);
    await runAsSystem(() => cache.cached(spec(), compute));
    await runAsSystem(() => cache.cached(spec(), compute));
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('shares one computation between concurrent identical requests', async () => {
    const cache = createResultCache({ store: fakeStore(), enabled: () => true });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const compute = vi.fn(async () => {
      await gate;
      return 'done';
    });
    const calls = Promise.all([1, 2, 3].map(() => runAsUser('u1', () => cache.cached(spec(), compute))));
    await new Promise((r) => setTimeout(r, 20));
    release();
    expect(await calls).toEqual(['done', 'done', 'done']);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('does not store a failure, and rethrows it', async () => {
    const store = fakeStore();
    const cache = createResultCache({ store, enabled: () => true });
    await expect(runAsUser('u1', () => cache.cached(spec(), async () => { throw new Error('boom'); }))).rejects.toThrow('boom');
    expect([...store.data.keys()].filter((k) => k.startsWith('rc:'))).toHaveLength(0);
  });

  it('applies the TTL, and skips results too large to be worth storing', async () => {
    const store = fakeStore();
    const cache = createResultCache({ store, enabled: () => true });
    await runAsUser('u1', () => cache.cached(spec({ ttlSec: 15 }), async () => 'small'));
    expect([...store.ttls.values()]).toEqual([15]);
    await runAsUser('u1', () => cache.cached(spec({ name: 'big' }), async () => 'x'.repeat(1_100_000)));
    expect([...store.data.keys()].some((k) => k.startsWith('rc:big'))).toBe(false);
  });
});
