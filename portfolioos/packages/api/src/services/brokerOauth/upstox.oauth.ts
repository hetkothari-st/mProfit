import { logger } from '../../lib/logger.js';
import { AppError } from '../../lib/errors.js';

/**
 * Upstox v2 OAuth2 (authorization-code grant):
 *   1. buildUpstoxLoginUrl(apiKey, redirectUri, state) → user logs in.
 *   2. Upstox redirects to redirectUri?code=...&state=...
 *   3. exchangeUpstoxAuthCode → access_token + refresh_token + expires_in.
 *   4. refreshUpstoxToken on schedule before expiry → fresh tokens.
 *
 * Docs: https://upstox.com/developer/api-documentation/authentication
 */

const UPSTOX_AUTH_URL = 'https://api.upstox.com/v2/login/authorization/dialog';
const UPSTOX_TOKEN_URL = 'https://api.upstox.com/v2/login/authorization/token';

export function buildUpstoxLoginUrl(input: {
  apiKey: string;
  redirectUri: string;
  state: string;
}): string {
  const u = new URL(UPSTOX_AUTH_URL);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', input.apiKey);
  u.searchParams.set('redirect_uri', input.redirectUri);
  u.searchParams.set('state', input.state);
  return u.toString();
}

export interface UpstoxSession {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}

export async function exchangeUpstoxAuthCode(input: {
  apiKey: string;
  apiSecret: string;
  redirectUri: string;
  code: string;
}): Promise<UpstoxSession> {
  return upstoxTokenCall({
    grant_type: 'authorization_code',
    code: input.code,
    client_id: input.apiKey,
    client_secret: input.apiSecret,
    redirect_uri: input.redirectUri,
  });
}

export async function refreshUpstoxToken(input: {
  apiKey: string;
  apiSecret: string;
  refreshToken: string;
}): Promise<UpstoxSession> {
  return upstoxTokenCall({
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
    client_id: input.apiKey,
    client_secret: input.apiSecret,
  });
}

async function upstoxTokenCall(form: Record<string, string>): Promise<UpstoxSession> {
  const body = new URLSearchParams(form).toString();
  const res = await fetch(UPSTOX_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    status?: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    errors?: Array<{ message?: string }>;
  };
  if (!res.ok || !json.access_token) {
    logger.warn({ status: res.status, errors: json.errors }, '[upstox.oauth] token call failed');
    const msg = json.errors?.[0]?.message ?? `Upstox token exchange failed (HTTP ${res.status})`;
    throw new AppError(msg, 400, 'UPSTOX_OAUTH_FAILED');
  }
  // Upstox tokens are typically valid until ~03:30 IST next day; honor
  // their expires_in if returned, else default to 23 hours.
  const ttlSec = typeof json.expires_in === 'number' && json.expires_in > 0 ? json.expires_in : 23 * 3600;
  const expiresAt = new Date(Date.now() + ttlSec * 1000);
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt,
  };
}
