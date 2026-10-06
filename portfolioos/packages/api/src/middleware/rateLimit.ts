import rateLimit, { type ClientRateLimitInfo, type Options, type Store } from 'express-rate-limit';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Rate limiting used to run on express-rate-limit's default MemoryStore. That
 * has two failure modes this deployment actually hits:
 *
 *   1. Counters live in the process, so every deploy or restart resets them —
 *      a brute-force attacker just waits for the next deploy.
 *   2. Counters are per-instance, so scaling to N instances multiplies every
 *      published limit by N.
 *
 * Redis is already a hard dependency here (Bull queues), so the limiters share
 * it. A Redis outage must not become an API outage, nor an unlimited one:
 *
 *   - While Redis is not ready (boot, outage) the store counts in process
 *     memory instead. Limits then apply per instance rather than globally,
 *     which is weaker but still bounds a brute-force run. It used to throw,
 *     and `passOnStoreError` turned that into "no limit at all", so every
 *     boot opened a window with login unthrottled.
 *   - Every limiter still sets `passOnStoreError`, so an error from a Redis
 *     that was ready but failed mid-call lets the request through instead of
 *     failing it.
 *   - The store never waits on a reconnect, so an outage adds no latency.
 *   - The store below is hand-rolled rather than `rate-limit-redis`. That
 *     library loads a Lua script from its constructor without handling the
 *     rejection, and index.ts exits on any unhandled rejection — so a Redis
 *     blip during boot put the API into a crash loop.
 */
let sharedClient: Redis | null = null;
/** The connection when it is ready, otherwise null (use the memory fallback). */
function readyClient(): Redis | null {
  const c = connection();
  return c.status === 'ready' ? c : null;
}

function connection(): Redis {
  if (sharedClient) return sharedClient;
  sharedClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    // No offline queue: while Redis is down each queued command waits out a
    // full reconnect back-off, which would add seconds to every API request.
    enableOfflineQueue: false,
  });
  sharedClient.on('error', (err: Error) => {
    // Logged, not thrown — ioredis reconnects on its own, and an unhandled
    // 'error' event on a Redis client takes the process down.
    logger.warn({ err }, 'ratelimit.redis.error');
  });
  return sharedClient;
}

/**
 * Fixed-window counter. `SET NX PX` seeds the key with its expiry and `INCR`
 * counts, inside one MULTI, so a key can never exist without a TTL — the
 * failure mode of the usual INCR-then-EXPIRE pair if the process dies between
 * them. Every command is awaited, so a Redis failure surfaces as a rejected
 * call that `passOnStoreError` turns into "allow", never as an unhandled
 * rejection.
 */
export class RedisWindowStore implements Store {
  prefix: string;
  localKeys = false;
  private windowMs = 60_000;
  /** Fixed-window counters used only while Redis is unavailable. */
  private local = new Map<string, { hits: number; resetAt: number }>();

  constructor(
    prefix: string,
    private getClient: () => Redis | null = readyClient,
  ) {
    this.prefix = `rl:${prefix}:`;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const k = this.prefix + key;
    const client = this.getClient();
    if (!client) return this.incrementLocal(k);
    const results = await client
      .multi()
      .set(k, '0', 'PX', this.windowMs, 'NX')
      .incr(k)
      .pttl(k)
      .exec();
    if (!results) throw new Error('rate limit transaction aborted');
    for (const [err] of results) if (err) throw err;
    const totalHits = Number(results[1]![1]);
    const ttl = Number(results[2]![1]);
    return { totalHits, resetTime: new Date(Date.now() + (ttl > 0 ? ttl : this.windowMs)) };
  }

  async decrement(key: string): Promise<void> {
    const k = this.prefix + key;
    const client = this.getClient();
    if (!client) {
      const entry = this.local.get(k);
      if (entry && entry.hits > 0) entry.hits -= 1;
      return;
    }
    await client.decr(k);
  }

  async resetKey(key: string): Promise<void> {
    const k = this.prefix + key;
    this.local.delete(k);
    const client = this.getClient();
    if (client) await client.del(k);
  }

  private incrementLocal(k: string): ClientRateLimitInfo {
    const now = Date.now();
    let entry = this.local.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { hits: 0, resetAt: now + this.windowMs };
      this.local.set(k, entry);
      // Expired windows are replaced as they are touched; sweep the rest so a
      // long outage under many keys (IPs) does not grow without bound.
      if (this.local.size > 10_000) {
        for (const [key, e] of this.local) if (e.resetAt <= now) this.local.delete(key);
      }
    }
    entry.hits += 1;
    return { totalHits: entry.hits, resetTime: new Date(entry.resetAt) };
  }
}

function makeStore(prefix: string): Store {
  return new RedisWindowStore(prefix);
}

/**
 * Key by authenticated user when there is one, IP otherwise.
 *
 * For authenticated endpoints this is strictly better than IP: it survives a
 * user changing networks, and it stops one NATed office from sharing a bucket.
 * `app.set('trust proxy', 1)` in index.ts is what makes the IP half correct
 * behind Railway's edge — without it every client shares the proxy's address.
 */
function userOrIp(req: { user?: { id: string }; ip?: string }): string {
  return req.user?.id ?? req.ip ?? 'unknown';
}

export const standardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  store: makeStore('std'),
  message: { success: false, error: 'Too many requests', code: 'RATE_LIMITED' },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  store: makeStore('auth'),
  message: { success: false, error: 'Too many auth attempts', code: 'RATE_LIMITED' },
});

// PII reveal endpoints (§15.7: 5/min/user). Mount after `authenticate` so the
// bucket is keyed per user rather than per IP.
export const piiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
  store: makeStore('pii'),
  message: { success: false, error: 'Too many reveal requests', code: 'RATE_LIMITED' },
});

export const importLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  keyGenerator: userOrIp,
  store: makeStore('import'),
  message: { success: false, error: 'Too many import requests', code: 'RATE_LIMITED' },
});

/**
 * Endpoints that cost real money or hit a third party's quota on every call:
 * CAS OTP requests (a paid, credit-limited API that also sends the user an
 * SMS), KFintech mailback, and Gmail scan jobs (Gmail API quota + LLM spend).
 *
 * These were covered only by `standardLimiter` at 100/min, which is not a
 * meaningful ceiling for an endpoint that bills per invocation.
 */
export const costlyOperationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  keyGenerator: userOrIp,
  store: makeStore('costly'),
  message: {
    success: false,
    error: 'Too many requests for this operation. Please wait a minute.',
    code: 'RATE_LIMITED',
  },
});

/**
 * Outbound scraping against government portals (parivahan, echallan). Keeps
 * one user from driving enough traffic to get the service's IP banned.
 */
export const scrapeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  keyGenerator: userOrIp,
  store: makeStore('scrape'),
  message: {
    success: false,
    error: 'Too many vehicle lookups. Please wait a minute.',
    code: 'RATE_LIMITED',
  },
});
