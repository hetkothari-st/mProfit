import jwt, { type SignOptions, type JwtPayload } from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../lib/errors.js';

export interface AccessPayload {
  sub: string;
  email: string;
  role: string;
  plan: string;
  type: 'access';
}

export function signAccessToken(payload: Omit<AccessPayload, 'type'>): {
  token: string;
  expiresAt: Date;
} {
  const expiresIn = env.JWT_ACCESS_EXPIRY as SignOptions['expiresIn'];
  const token = jwt.sign({ ...payload, type: 'access' }, env.JWT_SECRET, { expiresIn });
  const decoded = jwt.decode(token) as JwtPayload | null;
  const expiresAt = decoded?.exp
    ? new Date(decoded.exp * 1000)
    : new Date(Date.now() + 15 * 60 * 1000);
  return { token, expiresAt };
}

export function verifyAccessToken(token: string): AccessPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AccessPayload;
    if (decoded.type !== 'access') throw new UnauthorizedError('Invalid token type');
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new UnauthorizedError('Token expired');
    if (err instanceof jwt.JsonWebTokenError) throw new UnauthorizedError('Invalid token');
    throw err;
  }
}

const REFRESH_TOKEN_BYTES = 48;

export function generateRefreshToken(): string {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
}

export function refreshTokenExpiry(): Date {
  const expiry = env.JWT_REFRESH_EXPIRY;
  const match = /^(\d+)\s*([smhdw])$/.exec(expiry);
  let ms = 30 * 24 * 60 * 60 * 1000;
  if (match) {
    const value = Number(match[1]);
    const unit = match[2];
    const mult: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      w: 7 * 24 * 60 * 60 * 1000,
    };
    const multiplier = unit ? mult[unit] : undefined;
    ms = value * (multiplier ?? mult.d!);
  }
  return new Date(Date.now() + ms);
}
