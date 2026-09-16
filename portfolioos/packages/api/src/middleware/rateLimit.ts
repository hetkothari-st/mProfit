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
 * it. A Redis outage must not become an API outage, and two things guarantee
 * that — both verified against an unreachable Redis before shipping:
 *
 *   - Every limiter sets `passOnStoreError`, so a store error lets the request
 *     through (unlimited) instead of failing it. Without it, every request
 *     failed.
 *   - The store only talks to Redis when the connection is ready and throws
 *     immediately otherwise, so an outage adds no latency either.
 *   - The store below is hand-rolled rather than `rate-limit-redis`. That
 *     library loads a Lua script from its constructor without handling the
 *     rejection, and index.ts exits on any unhandled rejection — so a Redis
 *     blip during boot put the API into a crash loop.
 */
let sharedClient: Redis | null = null;
/**
 * The connection when it is ready; otherwise throw at once. The limiter's
 * `passOnStoreError` turns that into "allow", so a Redis outage costs rate
 * limiting, not latency — requests are neither failed nor delayed.
 */
function redisClient(): Redis {
  const c = connection();
  if (c.status !== 'ready') throw new Error(`rate limit store unavailable (redis ${c.status})`);
  return c;
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
class RedisWindowStore implements Store {
  prefix: string;
  localKeys = false;
  private windowMs = 60_000;

  constructor(prefix: string) {
    this.prefix = `rl:${prefix}:`;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const k = this.prefix + key;
    const results = await redisClient()
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
    await redisClient().decr(this.prefix + key);
  }

  async resetKey(key: string): Promise<void> {
    await redisClient().del(this.prefix + key);
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
