import crypto from 'node:crypto';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Single-use CSRF state for OAuth flows that link a third-party account to
 * the signed-in user.
 *
 * Without this, the callback has no way to tell "the user I am about to link
 * this account to is the user who started the flow". An attacker completes
 * consent with their OWN third-party account, captures the resulting code or
 * request token, and gets a logged-in victim to open the callback URL. The
 * victim's browser posts it under the victim's session and the ATTACKER's
 * mailbox or broker account is bound to the VICTIM's account — after which
 * every scheduled sync pulls attacker-authored data into the victim's books.
 *
 * services/brokerOauth already did this correctly against a DB column. This
 * module is the equivalent for the flows that had no state at all (Gmail,
 * and the older Kite path in connectors.controller), kept in Redis because
 * these have no natural row to hang it on.
 */

const TTL_SECONDS = 10 * 60;

export type OAuthPurpose = 'gmail' | 'kite';

/** Fallback when Redis is unreachable — dev convenience, same semantics. */
const memory = new Map<string, { userId: string; expiresAt: number }>();

let redis: Redis | null = null;
function client(): Redis | null {
  if (redis) return redis;
  try {
    redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, enableOfflineQueue: false });
    redis.on('error', (err: Error) => logger.warn({ err }, 'oauthState.redis.error'));
    return redis;
  } catch (err) {
    logger.warn({ err }, 'oauthState.redis.unavailable — using in-memory store');
    return null;
  }
}

function key(purpose: OAuthPurpose, state: string): string {
  return `oauth:state:${purpose}:${state}`;
}

export async function issueOAuthState(userId: string, purpose: OAuthPurpose): Promise<string> {
  const state = crypto.randomBytes(32).toString('hex');
  const c = client();
  if (c) {
    try {
      await c.set(key(purpose, state), userId, 'EX', TTL_SECONDS);
      return state;
    } catch (err) {
      logger.warn({ err }, 'oauthState.set failed — falling back to memory');
    }
  }
  memory.set(key(purpose, state), { userId, expiresAt: Date.now() + TTL_SECONDS * 1000 });
  return state;
}

/**
 * Returns the userId that started the flow, or null if the state is unknown,
 * expired or already used. Single-use: a replayed state never validates twice.
 */
export async function consumeOAuthState(
  state: string,
  purpose: OAuthPurpose,
): Promise<string | null> {
  if (!state) return null;
  const k = key(purpose, state);
  const c = client();
  if (c) {
    try {
      const userId = await c.get(k);
      if (userId) {
        await c.del(k);
        return userId;
      }
    } catch (err) {
      logger.warn({ err }, 'oauthState.get failed — falling back to memory');
    }
  }
  const entry = memory.get(k);
  if (!entry) return null;
  memory.delete(k);
  if (entry.expiresAt < Date.now()) return null;
  return entry.userId;
}
