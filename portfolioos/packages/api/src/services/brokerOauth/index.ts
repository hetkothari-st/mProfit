import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../lib/errors.js';
import { encryptSecret, decryptSecret } from '../../lib/secrets.js';
import {
  buildKiteLoginUrl,
  exchangeKiteRequestToken,
} from './kite.oauth.js';
import {
  buildUpstoxLoginUrl,
  exchangeUpstoxAuthCode,
  refreshUpstoxToken,
} from './upstox.oauth.js';
import {
  angelLoginWithTotp,
  refreshAngelSession,
  generateTotp,
} from './angel.oauth.js';

export type BrokerId = 'zerodha' | 'upstox' | 'angel';

const STATE_TTL_MIN = 10;
const REFRESH_HEADROOM_MS = 5 * 60 * 1000; // refresh tokens 5 min before expiry

/**
 * One-time setup: store API key + secret/TOTP for a user. Does NOT log in;
 * leaves accessToken null until the user completes the OAuth dance.
 */
export async function setupBrokerCredential(input: {
  userId: string;
  brokerId: BrokerId;
  apiKey: string;
  apiSecret?: string | null; // Kite + Upstox
  redirectUri?: string | null; // Upstox (mandatory) + Kite (informational)
  clientCode?: string | null; // Angel
  password?: string | null; // Angel — stored encrypted
  totpSecret?: string | null; // Angel base32 seed
}): Promise<{ id: string; needsLogin: boolean }> {
  validateSetup(input);

  // Angel: store the login password inside the `apiSecret` column (Angel has
  // no client_secret), and the TOTP base32 seed in `totpSecret`.
  const apiSecretToStore =
    input.brokerId === 'angel'
      ? input.password
        ? encryptSecret(input.password)
        : null
      : input.apiSecret
        ? encryptSecret(input.apiSecret)
        : null;

  const data = {
    apiKey: encryptSecret(input.apiKey),
    apiSecret: apiSecretToStore,
    redirectUri: input.redirectUri ?? null,
    clientCode: input.clientCode ?? null,
    totpSecret: input.totpSecret ? encryptSecret(input.totpSecret) : null,
    isActive: true,
  };

  const cred = await prisma.brokerCredential.upsert({
    where: { userId_brokerId: { userId: input.userId, brokerId: input.brokerId } },
    create: { userId: input.userId, brokerId: input.brokerId, ...data },
    update: data,
  });

  // Angel needs no popup — login immediately so the first sync works.
  if (input.brokerId === 'angel') {
    await loginAngelInline(cred.id);
    return { id: cred.id, needsLogin: false };
  }
  return { id: cred.id, needsLogin: true };
}

function validateSetup(input: {
  brokerId: BrokerId;
  apiKey: string;
  apiSecret?: string | null;
  redirectUri?: string | null;
  clientCode?: string | null;
  password?: string | null;
  totpSecret?: string | null;
}): void {
  if (!input.apiKey.trim()) throw new AppError('apiKey required', 400, 'BAD_REQUEST');
  if (input.brokerId === 'zerodha' && !input.apiSecret) {
    throw new AppError('Kite apiSecret required', 400, 'BAD_REQUEST');
  }
  if (input.brokerId === 'upstox') {
    if (!input.apiSecret) throw new AppError('Upstox apiSecret required', 400, 'BAD_REQUEST');
    if (!input.redirectUri) throw new AppError('Upstox redirectUri required', 400, 'BAD_REQUEST');
  }
  if (input.brokerId === 'angel') {
    if (!input.clientCode) throw new AppError('Angel clientCode required', 400, 'BAD_REQUEST');
    if (!input.password) throw new AppError('Angel password required', 400, 'BAD_REQUEST');
    if (!input.totpSecret) throw new AppError('Angel TOTP seed required', 400, 'BAD_REQUEST');
    // Validate TOTP seed parses cleanly. Throws BAD_TOTP_SECRET if not.
    generateTotp(input.totpSecret);
  }
}

/**
 * Returns { url, state } for an OAuth login. Frontend opens `url` in a popup.
 * Only needed for Kite + Upstox (Angel is API-direct).
 */
export async function startBrokerOauth(
  userId: string,
  brokerId: BrokerId,
): Promise<{ url: string; state: string; brokerId: BrokerId }> {
  const cred = await prisma.brokerCredential.findUnique({
    where: { userId_brokerId: { userId, brokerId } },
  });
  if (!cred) throw new AppError('Set up broker credentials first', 400, 'NO_BROKER_CREDENTIAL');

  if (brokerId === 'angel') {
    // Angel doesn't need an interactive login — refresh inline and return a
    // sentinel "url" the frontend can ignore.
    await refreshSession(cred.id);
    return { url: '', state: '', brokerId };
  }

  const apiKey = decryptSecret(cred.apiKey);
  const state = crypto.randomBytes(24).toString('hex');
  await prisma.brokerCredential.update({
    where: { id: cred.id },
    data: {
      loginState: state,
      loginStateExpiresAt: new Date(Date.now() + STATE_TTL_MIN * 60 * 1000),
    },
  });

  let url: string;
  if (brokerId === 'zerodha') {
    url = buildKiteLoginUrl(apiKey, state);
  } else {
    if (!cred.redirectUri) {
      throw new AppError('Upstox redirectUri missing on credential', 400, 'BAD_REQUEST');
    }
    url = buildUpstoxLoginUrl({ apiKey, redirectUri: cred.redirectUri, state });
  }
  return { url, state, brokerId };
}

/**
 * Handle OAuth callback. Looks up the credential by `state`, exchanges the
 * code/request_token for an access token, persists encrypted.
 */
export async function handleBrokerCallback(input: {
  brokerId: BrokerId;
  state: string;
  code?: string; // upstox
  requestToken?: string; // kite
}): Promise<{ userId: string; brokerId: BrokerId }> {
  const cred = await prisma.brokerCredential.findFirst({
    where: { loginState: input.state, brokerId: input.brokerId },
  });
  if (!cred) throw new AppError('Invalid or expired state', 400, 'OAUTH_STATE_INVALID');
  if (!cred.loginStateExpiresAt || cred.loginStateExpiresAt.getTime() < Date.now()) {
    throw new AppError('OAuth state expired — start login again', 400, 'OAUTH_STATE_EXPIRED');
  }

  const apiKey = decryptSecret(cred.apiKey);
  const apiSecret = cred.apiSecret ? decryptSecret(cred.apiSecret) : null;

  if (input.brokerId === 'zerodha') {
    if (!input.requestToken) throw new AppError('request_token required', 400, 'BAD_REQUEST');
    if (!apiSecret) throw new AppError('Kite apiSecret missing', 400, 'BAD_REQUEST');
    const sess = await exchangeKiteRequestToken({
      apiKey,
      apiSecret,
      requestToken: input.requestToken,
    });
    await persistSession(cred.id, sess.accessToken, null, sess.expiresAt);
  } else if (input.brokerId === 'upstox') {
    if (!input.code) throw new AppError('code required', 400, 'BAD_REQUEST');
    if (!apiSecret) throw new AppError('Upstox apiSecret missing', 400, 'BAD_REQUEST');
    if (!cred.redirectUri) throw new AppError('Upstox redirectUri missing', 400, 'BAD_REQUEST');
    const sess = await exchangeUpstoxAuthCode({
      apiKey,
      apiSecret,
      redirectUri: cred.redirectUri,
      code: input.code,
    });
    await persistSession(cred.id, sess.accessToken, sess.refreshToken, sess.expiresAt);
  } else {
    throw new AppError(`Broker ${input.brokerId} does not use OAuth callback`, 400, 'BAD_REQUEST');
  }

  return { userId: cred.userId, brokerId: input.brokerId };
}

/**
 * On-demand login for Angel (no browser).
 */
async function loginAngelInline(credentialId: string): Promise<void> {
  const cred = await prisma.brokerCredential.findUnique({ where: { id: credentialId } });
  if (!cred || cred.brokerId !== 'angel') throw new AppError('Angel cred not found', 400, 'BAD_REQUEST');
  if (!cred.apiSecret || !cred.totpSecret || !cred.clientCode) {
    throw new AppError('Angel cred incomplete', 400, 'BAD_REQUEST');
  }
  const sess = await angelLoginWithTotp({
    apiKey: decryptSecret(cred.apiKey),
    clientCode: cred.clientCode,
    password: decryptSecret(cred.apiSecret),
    totpSecret: decryptSecret(cred.totpSecret),
  });
  await persistSession(cred.id, sess.accessToken, sess.refreshToken, sess.expiresAt);
}

/**
 * Returns a live access token for the connector to call broker APIs with.
 * Auto-refreshes (Upstox/Angel) when within REFRESH_HEADROOM_MS of expiry.
 * Throws NEEDS_LOGIN for Kite when expired (only re-login can mint new).
 */
export async function getActiveBrokerSession(credentialId: string): Promise<{
  apiKey: string;
  accessToken: string;
  brokerId: BrokerId;
}> {
  let cred = await prisma.brokerCredential.findUnique({ where: { id: credentialId } });
  if (!cred) throw new AppError('Credential not found', 404, 'NOT_FOUND');

  const expiresMs = cred.tokenExpiresAt?.getTime() ?? 0;
  const stillFresh = cred.accessToken && expiresMs > Date.now() + REFRESH_HEADROOM_MS;

  if (!stillFresh) {
    cred = await refreshSession(cred.id);
  }
  if (!cred.accessToken) {
    throw new AppError(
      `Login to ${cred.brokerId} required`,
      401,
      'BROKER_LOGIN_REQUIRED',
      { brokerId: cred.brokerId },
    );
  }
  return {
    apiKey: decryptSecret(cred.apiKey),
    accessToken: decryptSecret(cred.accessToken),
    brokerId: cred.brokerId as BrokerId,
  };
}

export async function refreshSession(credentialId: string): Promise<NonNullable<Awaited<ReturnType<typeof prisma.brokerCredential.findUnique>>>> {
  const cred = await prisma.brokerCredential.findUnique({ where: { id: credentialId } });
  if (!cred) throw new AppError('Credential not found', 404, 'NOT_FOUND');

  if (cred.brokerId === 'zerodha') {
    // Kite has no refresh token API; user must re-login.
    throw new AppError('Kite session expired — login again', 401, 'BROKER_LOGIN_REQUIRED', {
      brokerId: 'zerodha',
    });
  }

  if (cred.brokerId === 'upstox') {
    if (!cred.refreshToken || !cred.apiSecret) {
      throw new AppError('Upstox refresh missing — login again', 401, 'BROKER_LOGIN_REQUIRED', {
        brokerId: 'upstox',
      });
    }
    try {
      const sess = await refreshUpstoxToken({
        apiKey: decryptSecret(cred.apiKey),
        apiSecret: decryptSecret(cred.apiSecret),
        refreshToken: decryptSecret(cred.refreshToken),
      });
      return await persistSession(
        cred.id,
        sess.accessToken,
        sess.refreshToken ?? decryptSecret(cred.refreshToken),
        sess.expiresAt,
      );
    } catch (err) {
      logger.warn({ err, credentialId }, '[broker.oauth] upstox refresh failed; needs login');
      throw new AppError('Upstox refresh failed — login again', 401, 'BROKER_LOGIN_REQUIRED', {
        brokerId: 'upstox',
      });
    }
  }

  if (cred.brokerId === 'angel') {
    // Prefer refresh-token rotation; fall back to TOTP login if it fails.
    if (cred.refreshToken) {
      try {
        const sess = await refreshAngelSession({
          apiKey: decryptSecret(cred.apiKey),
          refreshToken: decryptSecret(cred.refreshToken),
        });
        return await persistSession(cred.id, sess.accessToken, sess.refreshToken, sess.expiresAt);
      } catch (err) {
        logger.warn({ err }, '[broker.oauth] angel refresh failed, falling back to TOTP login');
      }
    }
    await loginAngelInline(cred.id);
    return (await prisma.brokerCredential.findUnique({ where: { id: cred.id } }))!;
  }

  throw new AppError(`Unknown broker ${cred.brokerId}`, 400, 'BROKER_UNSUPPORTED');
}

async function persistSession(
  credId: string,
  accessToken: string,
  refreshToken: string | null,
  expiresAt: Date,
) {
  return prisma.brokerCredential.update({
    where: { id: credId },
    data: {
      accessToken: encryptSecret(accessToken),
      refreshToken: refreshToken ? encryptSecret(refreshToken) : null,
      tokenExpiresAt: expiresAt,
      loginState: null,
      loginStateExpiresAt: null,
      isActive: true,
    },
  });
}

/**
 * Public-safe view of a credential — never returns secrets, only metadata
 * the UI uses to decide which buttons to show.
 */
export async function getBrokerStatus(userId: string, brokerId: BrokerId): Promise<{
  configured: boolean;
  connected: boolean;
  needsLogin: boolean;
  tokenExpiresAt: string | null;
  lastSyncedAt: string | null;
}> {
  const cred = await prisma.brokerCredential.findUnique({
    where: { userId_brokerId: { userId, brokerId } },
  });
  if (!cred) {
    return { configured: false, connected: false, needsLogin: true, tokenExpiresAt: null, lastSyncedAt: null };
  }
  const tokenLive = !!cred.accessToken && (cred.tokenExpiresAt?.getTime() ?? 0) > Date.now();
  return {
    configured: true,
    connected: tokenLive,
    needsLogin: !tokenLive,
    tokenExpiresAt: cred.tokenExpiresAt?.toISOString() ?? null,
    lastSyncedAt: cred.lastSyncedAt?.toISOString() ?? null,
  };
}
