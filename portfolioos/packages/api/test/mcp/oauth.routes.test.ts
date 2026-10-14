import 'dotenv/config';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const envState = vi.hoisted(() => ({ enabled: 'true' }));
vi.mock('../../src/config/env.js', async (orig) => {
  const real = (await orig()) as { env: Record<string, unknown> };
  return { env: new Proxy({ ...real.env, API_PUBLIC_URL: 'https://api.test.local', FRONTEND_URL: 'https://app.test.local' }, {
    get: (t, k) => (k === 'MCP_ENABLED' ? envState.enabled : (t as Record<string | symbol, unknown>)[k]),
  }) };
});
vi.mock('../../src/services/mcp/notice.service.js', () => ({ notifyNewConnection: vi.fn(async () => undefined) }));

const { mcpOAuthRouter } = await import('../../src/routes/mcpOAuth.routes.js');
const { connectRouter } = await import('../../src/routes/connect.routes.js');
const { errorHandler } = await import('../../src/middleware/errorHandler.js');
const { signAccessToken } = await import('../../src/services/jwt.service.js');
const { prisma } = await import('../../src/lib/prisma.js');
const { runAsSystem } = await import('../../src/lib/requestContext.js');
const { createTestScope } = await import('../helpers/db.js');
const { notifyNewConnection } = await import('../../src/services/mcp/notice.service.js');

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect';
const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

let server: Server;
let base: string;
let user: Awaited<ReturnType<typeof createTestScope>>;
const jwt = (plan: 'FREE' | 'PLUS') => signAccessToken({ sub: user.userId, email: `${user.userId}@test.local`, role: 'INVESTOR', plan }).token;

beforeAll(async () => {
  user = await createTestScope('mcp-routes');
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(mcpOAuthRouter);
  app.use('/api/connect', connectRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  await runAsSystem(async () => {
    await prisma.mcpToken.deleteMany({ where: { userId: user.userId } });
    await prisma.mcpAuthCode.deleteMany({ where: { userId: user.userId } });
    await prisma.mcpGrant.deleteMany({ where: { userId: user.userId } });
  });
  await user.cleanup();
});

describe('discovery', () => {
  it('serves protected resource metadata', async () => {
    const r = await fetch(`${base}/.well-known/oauth-protected-resource`);
    expect(await r.json()).toMatchObject({ resource: 'https://api.test.local/mcp', authorization_servers: ['https://api.test.local'] });
    const r2 = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    expect(r2.status).toBe(200);
  });
  it('serves authorization server metadata', async () => {
    const m = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
    expect(m).toMatchObject({
      issuer: 'https://api.test.local',
      authorization_endpoint: 'https://api.test.local/oauth/authorize',
      token_endpoint: 'https://api.test.local/oauth/token',
      registration_endpoint: 'https://api.test.local/oauth/register',
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    });
  });
  it('everything is 404 when the kill switch is off', async () => {
    envState.enabled = 'false';
    try {
      expect((await fetch(`${base}/.well-known/oauth-authorization-server`)).status).toBe(404);
      expect((await fetch(`${base}/api/connect/connections`, { headers: { authorization: `Bearer ${jwt('PLUS')}` } })).status).toBe(404);
    } finally {
      envState.enabled = 'true';
    }
  });
});

describe('full flow over HTTP', () => {
  it('register -> authorize -> approve -> token -> list -> revoke', async () => {
    const reg = await (await fetch(`${base}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: [REDIRECT] }) })).json();
    expect(reg.client_name).toBe('ChatGPT');

    const auth = await fetch(`${base}/oauth/authorize?${new URLSearchParams({
      response_type: 'code', client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 's9',
    })}`, { redirect: 'manual' });
    expect(auth.status).toBe(302);
    const to = new URL(auth.headers.get('location')!);
    expect(to.origin + to.pathname).toBe('https://app.test.local/connect/authorize');
    const reqId = to.searchParams.get('req')!;

    const details = await (await fetch(`${base}/api/connect/requests/${reqId}`, { headers: { authorization: `Bearer ${jwt('PLUS')}` } })).json();
    expect(details.data).toMatchObject({ clientName: 'ChatGPT', redirectHost: 'chatgpt.com', currentAreas: null });

    const free = await fetch(`${base}/api/connect/requests/${reqId}/decision`, {
      method: 'POST', headers: { authorization: `Bearer ${jwt('FREE')}`, 'content-type': 'application/json' }, body: JSON.stringify({ approve: true, areas: ['investments'] }),
    });
    expect(free.status).toBe(403);

    const dec = await (await fetch(`${base}/api/connect/requests/${reqId}/decision`, {
      method: 'POST', headers: { authorization: `Bearer ${jwt('PLUS')}`, 'content-type': 'application/json' }, body: JSON.stringify({ approve: true, areas: ['investments'] }),
    })).json();
    const code = new URL(dec.data.redirectTo).searchParams.get('code')!;
    expect(notifyNewConnection).toHaveBeenCalledWith(user.userId, 'ChatGPT', expect.any(String));

    const tok = await fetch(`${base}/oauth/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: reg.client_id, code_verifier: verifier }),
    });
    expect(tok.status).toBe(200);
    expect(tok.headers.get('cache-control')).toBe('no-store');
    expect((await tok.json()).token_type).toBe('Bearer');

    const list = await (await fetch(`${base}/api/connect/connections`, { headers: { authorization: `Bearer ${jwt('FREE')}` } })).json();
    expect(list.data).toHaveLength(1);
    const del = await fetch(`${base}/api/connect/connections/${list.data[0].id}`, { method: 'DELETE', headers: { authorization: `Bearer ${jwt('FREE')}` } });
    expect(del.status).toBe(200);
    await runAsSystem(() => prisma.mcpClient.deleteMany({ where: { clientId: reg.client_id } }));
  });

  it('an unknown client gets an error page, never a redirect', async () => {
    const r = await fetch(`${base}/oauth/authorize?client_id=nope&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code`, { redirect: 'manual' });
    expect(r.status).toBe(400);
    expect(r.headers.get('location')).toBeNull();
  });

  it('token errors use the RFC shape', async () => {
    const r = await fetch(`${base}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'password', client_id: 'x' }) });
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ error: 'invalid_client' });
  });
});
