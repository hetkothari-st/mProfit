import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { incCounter } from './metrics.js';
import { getCurrentUserId, isSystemContext } from './requestContext.js';

/**
 * Shared (Redis) cache for the heavy read calls that recompute a user's whole history on every request
 * (KPIs, capital-gains summary, holdings, portfolio summary, asset-class XIRR). Measured at 0.45-1.8 s
 * for a user with 12k transactions.
 *
 * Correctness rules, in order of importance:
 *
 *  1. Never serve one user's result to another. The key contains the ACTING user (the identity the
 *     database access control ran as), so a result computed under one user's access cannot be read by
 *     another, whatever the call's arguments say. No acting user (no context) means no caching.
 *  2. A user's own writes show up immediately, on every server. Each user has a version number in Redis
 *     (`rcv:<id>`), bumped by the Prisma write hook (userDataVersion.ts); the version is part of the
 *     key, so the next read misses and recomputes. Bumps are batched for 150 ms, so a bulk import does
 *     not become thousands of Redis writes.
 *  3. Writes the hook cannot attribute are bounded by the TTL instead: background jobs (price refresh,
 *     Gmail projection under system context) and a family member editing a shared portfolio. The TTL
 *     is short for that reason.
 *  4. Fail open. Redis down, slow (250 ms command timeout) or returning garbage = compute directly.
 *     The cache can make a call faster, never make it fail.
 *
 * Only for results that are plain JSON (strings, numbers, booleans, null): a hit comes back through
 * JSON.parse, so a Decimal or Date would silently turn into a string.
 */
export interface CacheStore {
  mget(keys: string[]): Promise<Array<string | null>>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  incrMany(keys: string[]): Promise<void>;
}

export interface CachedSpec {
  /** Short stable name of the call, part of the key. */
  name: string;
  /** Every argument the result depends on (JSON-serialisable). */
  params: unknown;
  /** Owners of the data read. The acting user is always added. */
  userIds: readonly string[];
  ttlSec?: number;
}

export interface ResultCache {
  cached<T>(spec: CachedSpec, compute: () => Promise<T>): Promise<T>;
  /** Record that a user's data changed. Safe to call from a hot path. */
  bump(userId: string): void;
  /** Push pending bumps now (tests, shutdown). */
  flush(): Promise<void>;
}

const DEFAULT_TTL_SEC = 60;
const MAX_PAYLOAD_BYTES = 1_000_000;
const BUMP_BATCH_MS = 150;
let lastBumpWarn = 0;

export function createResultCache(opts: { store: CacheStore | null; enabled: () => boolean }): ResultCache {
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  const inflight = new Map<string, Promise<unknown>>();

  async function flush(): Promise<void> {
    if (timer) clearTimeout(timer);
    timer = null;
    if (pending.size === 0) return;
    const keys = [...pending].map((id) => `rcv:${id}`);
    pending.clear();
    try {
      await opts.store?.incrMany(keys);
    } catch (err) {
      // The version did not move, so entries for these users may be served until their TTL ends.
      incCounter('resultCache.bump_error');
      // At most once a minute: during a Redis outage every write batch lands here.
      if (Date.now() - lastBumpWarn > 60_000) {
        lastBumpWarn = Date.now();
        logger.warn({ err, users: keys.length }, '[resultCache] could not bump versions');
      }
    }
  }

  function bump(userId: string): void {
    if (!opts.store || !opts.enabled()) return;
    pending.add(userId);
    if (!timer) {
      timer = setTimeout(() => void flush(), BUMP_BATCH_MS);
      timer.unref();
    }
  }

  async function cached<T>(spec: CachedSpec, compute: () => Promise<T>): Promise<T> {
    const store = opts.store;
    const actor = isSystemContext() ? 'system' : getCurrentUserId();
    if (!store || !opts.enabled() || !actor) return compute();

    let key: string;
    try {
      const ids = [...new Set([actor, ...spec.userIds])].sort();
      const versions = await store.mget(ids.map((id) => `rcv:${id}`));
      const paramHash = createHash('sha256').update(JSON.stringify(spec.params ?? null)).digest('hex').slice(0, 16);
      key = `rc:${spec.name}:${actor}:${paramHash}:${ids.map((id, i) => `${id}=${versions[i] ?? '0'}`).join(',')}`;
      const hit = await store.get(key);
      if (hit !== null) {
        incCounter('resultCache.hit');
        return JSON.parse(hit) as T;
      }
    } catch (err) {
      incCounter('resultCache.error');
      logger.debug({ err, name: spec.name }, '[resultCache] read failed; computing directly');
      return compute();
    }

    incCounter('resultCache.miss');
    // Concurrent identical requests share one computation.
    const running = inflight.get(key);
    if (running) return running as Promise<T>;
    const work = (async () => {
      const value = await compute();
      try {
        const payload = JSON.stringify(value);
        if (payload !== undefined && payload.length <= MAX_PAYLOAD_BYTES) {
          await store.set(key, payload, spec.ttlSec ?? DEFAULT_TTL_SEC);
        }
      } catch (err) {
        incCounter('resultCache.error');
        logger.debug({ err, name: spec.name }, '[resultCache] write failed');
      }
      return value;
    })();
    inflight.set(key, work);
    try {
      return await work;
    } finally {
      inflight.delete(key);
    }
  }

  return { cached, bump, flush };
}

// ---- Redis-backed default instance --------------------------------------------------------------

let client: Redis | null = null;
let lastWarn = 0;

function readyClient(): Redis {
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      commandTimeout: 250,
    });
    // This connection must never keep a process alive: one-off scripts write through Prisma too.
    client.on('connect', () => client?.stream?.unref?.());
    client.on('error', (err) => {
      if (Date.now() - lastWarn > 60_000) {
        lastWarn = Date.now();
        logger.warn({ err: err.message }, '[resultCache] redis error (calls compute directly meanwhile)');
      }
    });
  }
  // Not ready (boot, outage): throw, which the callers above turn into "compute directly".
  if (client.status !== 'ready') throw new Error('redis not ready');
  return client;
}

const redisStore: CacheStore = {
  async mget(keys) {
    return readyClient().mget(...keys);
  },
  async get(key) {
    return readyClient().get(key);
  },
  async set(key, value, ttlSec) {
    await readyClient().set(key, value, 'EX', ttlSec);
  },
  async incrMany(keys) {
    const pipe = readyClient().pipeline();
    for (const k of keys) {
      pipe.incr(k);
      // Versions only need to outlive the longest entry TTL; this keeps idle users from piling up.
      pipe.expire(k, 7 * 86_400);
    }
    await pipe.exec();
  },
};

/** Off in tests: writes there run outside any user context, so a cached read would never see them. */
export const resultCache: ResultCache = createResultCache({
  store: redisStore,
  enabled: () => env.RESULT_CACHE === 'on' && env.NODE_ENV !== 'test',
});
