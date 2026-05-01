import crypto from 'node:crypto';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../lib/errors.js';

/**
 * Kite Connect (Zerodha) login flow:
 *   1. buildKiteLoginUrl(apiKey, state) → user opens in popup.
 *   2. Kite redirects to redirectUri?request_token=...&action=login&status=success
 *   3. exchangeKiteRequestToken(apiKey, apiSecret, requestToken) →
 *      POST /session/token with checksum = sha256(apiKey + requestToken + apiSecret)
 *      → access_token (valid until 06:00 IST next day; no refresh).
 *
 * Docs: https://kite.trade/docs/connect/v3/user/
 */

const KITE_LOGIN_BASE = 'https://kite.zerodha.com/connect/login';
const KITE_API_BASE = 'https://api.kite.trade';

export function buildKiteLoginUrl(apiKey: string, state: string): string {
  const u = new URL(KITE_LOGIN_BASE);
  u.searchParams.set('api_key', apiKey);
  u.searchParams.set('v', '3');
  // Kite forwards `state` (and any other extra params) back on redirect — we
  // round-trip it as our CSRF token so the callback can prove the redirect
  // was triggered by an oauth/start we issued.
  u.searchParams.set('state', state);
  return u.toString();
}

export interface KiteSession {
  accessToken: string;
  // Kite tokens expire at 06:00 IST on the next trading-aware day. We compute
  // a conservative 06:00 IST tomorrow and let the daily-refresh prompt take
  // over from there.
  expiresAt: Date;
  userId: string | null;
}

export async function exchangeKiteRequestToken(input: {
  apiKey: string;
  apiSecret: string;
  requestToken: string;
}): Promise<KiteSession> {
  const { apiKey, apiSecret, requestToken } = input;
  const checksum = crypto
    .createHash('sha256')
    .update(`${apiKey}${requestToken}${apiSecret}`)
    .digest('hex');

  const body = new URLSearchParams({
    api_key: apiKey,
    request_token: requestToken,
    checksum,
  });

  const res = await fetch(`${KITE_API_BASE}/session/token`, {
    method: 'POST',
    headers: {
      'X-Kite-Version': '3',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const json = (await res.json().catch(() => ({}))) as {
    status?: string;
    data?: { access_token?: string; user_id?: string };
    message?: string;
    error_type?: string;
  };

  if (!res.ok || json.status !== 'success' || !json.data?.access_token) {
    logger.warn({ kiteStatus: json.status, kiteError: json.error_type }, '[kite.oauth] exchange failed');
    throw new AppError(
      json.message ?? `Kite session exchange failed (HTTP ${res.status})`,
      400,
      'KITE_OAUTH_FAILED',
    );
  }

  return {
    accessToken: json.data.access_token,
    expiresAt: nextKiteExpiry(),
    userId: json.data.user_id ?? null,
  };
}

/**
 * Kite tokens hard-expire at 06:00 IST next day. Compute that timestamp.
 * IST = UTC+05:30 → 06:00 IST = 00:30 UTC.
 */
function nextKiteExpiry(): Date {
  const now = new Date();
  // 00:30 UTC today
  const today0030Utc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 30, 0, 0),
  );
  if (today0030Utc.getTime() <= now.getTime()) {
    today0030Utc.setUTCDate(today0030Utc.getUTCDate() + 1);
  }
  return today0030Utc;
}
