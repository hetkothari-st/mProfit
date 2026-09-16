import rateLimit, { type Store } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
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
 * it. If Redis is unreachable we fall back to the in-memory store rather than
 * failing every request: a degraded limiter beats a dead API.
 */
function makeStore(prefix: string): Store | undefined {
  try {
    const client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    client.on('error', (err) => {
      // Logged, not thrown — ioredis reconnects on its own, and an unhandled
      // 'error' event on a Redis client takes the process down.
      logger.warn({ err, prefix }, 'ratelimit.redis.error');
    });
    return new RedisStore({
      prefix: `rl:${prefix}:`,
      sendCommand: (...args: string[]) => client.call(...(args as [string, ...string[]])) as Promise<never>,
    });
  } catch (err) {
    logger.warn({ err, prefix }, 'ratelimit.redis.unavailable — falling back to in-memory store');
    return undefined;
  }
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
  store: makeStore('std'),
  message: { success: false, error: 'Too many requests', code: 'RATE_LIMITED' },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
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
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
  store: makeStore('pii'),
  message: { success: false, error: 'Too many reveal requests', code: 'RATE_LIMITED' },
});

export const importLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
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
  keyGenerator: userOrIp,
  store: makeStore('scrape'),
  message: {
    success: false,
    error: 'Too many vehicle lookups. Please wait a minute.',
    code: 'RATE_LIMITED',
  },
});
