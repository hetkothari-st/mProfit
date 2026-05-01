import crypto from 'node:crypto';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../lib/errors.js';

/**
 * Angel One SmartAPI auth:
 *   - Login with clientCode + password + TOTP (6-digit code derived from a
 *     secret seed that the user pastes once). No browser popup needed —
 *     entirely API-to-API.
 *   - Returns jwtToken + refreshToken + feedToken.
 *   - JWT lifetime ~6 hours. refreshToken extends ~30 days.
 *
 * Docs: https://smartapi.angelbroking.com/docs/User
 */

const ANGEL_LOGIN_URL =
  'https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword';
const ANGEL_REFRESH_URL =
  'https://apiconnect.angelone.in/rest/auth/angelbroking/jwt/v1/generateTokens';

export interface AngelSession {
  accessToken: string; // jwtToken
  refreshToken: string;
  feedToken: string | null;
  expiresAt: Date;
}

export async function angelLoginWithTotp(input: {
  apiKey: string;
  clientCode: string;
  password: string;
  totpSecret: string; // base32 seed
}): Promise<AngelSession> {
  const totp = generateTotp(input.totpSecret);
  const res = await fetch(ANGEL_LOGIN_URL, {
    method: 'POST',
    headers: angelHeaders(input.apiKey),
    body: JSON.stringify({
      clientcode: input.clientCode,
      password: input.password,
      totp,
    }),
  });
  return parseAngel(res);
}

export async function refreshAngelSession(input: {
  apiKey: string;
  refreshToken: string;
}): Promise<AngelSession> {
  const res = await fetch(ANGEL_REFRESH_URL, {
    method: 'POST',
    headers: angelHeaders(input.apiKey),
    body: JSON.stringify({ refreshToken: input.refreshToken }),
  });
  return parseAngel(res);
}

function angelHeaders(apiKey: string): Record<string, string> {
  return {
    'X-PrivateKey': apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    // Angel's docs require these even with placeholder values.
    'X-ClientLocalIP': '127.0.0.1',
    'X-ClientPublicIP': '127.0.0.1',
    'X-MACAddress': '00:00:00:00:00:00',
  };
}

async function parseAngel(res: Response): Promise<AngelSession> {
  const json = (await res.json().catch(() => ({}))) as {
    status?: boolean;
    message?: string;
    errorcode?: string;
    data?: { jwtToken?: string; refreshToken?: string; feedToken?: string };
  };
  if (!res.ok || !json.status || !json.data?.jwtToken || !json.data.refreshToken) {
    logger.warn({ status: res.status, code: json.errorcode }, '[angel.oauth] login failed');
    throw new AppError(
      json.message ?? `Angel login failed (HTTP ${res.status})`,
      400,
      'ANGEL_LOGIN_FAILED',
    );
  }
  // JWT typically 6h; we pick 5h to leave headroom for refresh.
  const expiresAt = new Date(Date.now() + 5 * 3600 * 1000);
  return {
    accessToken: json.data.jwtToken,
    refreshToken: json.data.refreshToken,
    feedToken: json.data.feedToken ?? null,
    expiresAt,
  };
}

/**
 * RFC 6238 TOTP, 30-second step, 6 digits, HMAC-SHA1. Standard config used
 * by Authenticator apps and SmartAPI.
 */
export function generateTotp(base32Secret: string, atMs: number = Date.now()): string {
  const key = base32Decode(base32Secret.replace(/\s+/g, '').toUpperCase());
  const counter = Math.floor(atMs / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const slice = hmac.slice(offset, offset + 4);
  const code = (slice.readUInt32BE(0) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, '0');
}

function base32Decode(s: string): Buffer {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of s.replace(/=+$/, '')) {
    const idx = ALPHABET.indexOf(c);
    if (idx < 0) throw new AppError(`Invalid base32 char "${c}" in TOTP secret`, 400, 'BAD_TOTP_SECRET');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
