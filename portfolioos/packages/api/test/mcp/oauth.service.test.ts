import 'dotenv/config';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';

vi.mock('../../src/config/env.js', async (orig) => {
  const real = (await orig()) as { env: Record<string, unknown> };
  return { env: { ...real.env, MCP_ENABLED: 'true', API_PUBLIC_URL: 'https://api.test.local', FRONTEND_URL: 'https://app.test.local' } };
});

const svc = await import('../../src/services/mcp/oauth.service.js');

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

let user: TestScope;
let clientId: string;

async function approveAndGetCode(areas: string[] = ['investments']): Promise<string> {
  const { reqId } = await svc.startAuthorization({
    response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge,
    code_challenge_method: 'S256', state: 'st1', resource: 'https://api.test.local/mcp',
  });
  const { redirectTo } = await svc.decide(reqId, user.userId, { approve: true, areas });
  const url = new URL(redirectTo);
  expect(url.origin + url.pathname).toBe(REDIRECT);
  expect(url.searchParams.get('state')).toBe('st1');
  expect(url.searchParams.get('iss')).toBe('https://api.test.local');
  return url.searchParams.get('code')!;
}

async function tokensFromCode(code: string) {
  return svc.exchangeToken({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier, resource: 'https://api.test.local/mcp' });
}

beforeAll(async () => {
  user = await createTestScope('mcp-oauth');
  clientId = (await svc.registerClient({ redirect_uris: [REDIRECT], client_name: 'Totally ChatGPT' })).client_id;
});
afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.mcpToken.deleteMany({ where: { userId: user.userId } });
    await prisma.mcpAuthCode.deleteMany({ where: { userId: user.userId } });
    await prisma.mcpGrant.deleteMany({ where: { userId: user.userId } });
    await prisma.mcpClient.deleteMany({ where: { clientId } });
  });
  await user.cleanup();
});

describe('registration', () => {
  it('names the client from its redirect host, not client_name', async () => {
    const r = await svc.registerClient({ redirect_uris: [REDIRECT], client_name: 'Totally ChatGPT' });
    expect(r.client_name).toBe('Claude');
    expect(r.token_endpoint_auth_method).toBe('none');
    await runAsSystem(() => prisma.mcpClient.delete({ where: { clientId: r.client_id } }));
  });
  it('refuses a redirect host outside the allowlist', async () => {
    await expect(svc.registerClient({ redirect_uris: ['https://evil.example/cb'] })).rejects.toMatchObject({ error: 'invalid_redirect_uri' });
  });
  it('refuses any other path on an allowed host (exact callback only)', async () => {
    await expect(svc.registerClient({ redirect_uris: ['https://claude.ai/some/user/page'] })).rejects.toMatchObject({ error: 'invalid_redirect_uri' });
    await expect(svc.registerClient({ redirect_uris: ['https://chatgpt.com/g/attacker'] })).rejects.toMatchObject({ error: 'invalid_redirect_uri' });
  });
  it('refuses http redirects', async () => {
    await expect(svc.registerClient({ redirect_uris: ['http://claude.ai/cb'] })).rejects.toMatchObject({ error: 'invalid_redirect_uri' });
  });
});

describe('authorization', () => {
  it('refuses plain PKCE', async () => {
    await expect(svc.startAuthorization({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'plain' }))
      .rejects.toMatchObject({ error: 'invalid_request' });
  });
  it('refuses a redirect_uri that was not registered', async () => {
    await expect(svc.startAuthorization({ response_type: 'code', client_id: clientId, redirect_uri: 'https://claude.ai/other', code_challenge: challenge, code_challenge_method: 'S256' }))
      .rejects.toMatchObject({ status: 400 });
  });
  it('a denial redirects with access_denied and creates no grant', async () => {
    const { reqId } = await svc.startAuthorization({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 'x' });
    const r = await svc.decide(reqId, user.userId, { approve: false, areas: [] });
    expect(new URL(r.redirectTo).searchParams.get('error')).toBe('access_denied');
    expect(r.grantId).toBeNull();
  });
  it('a request can be decided once', async () => {
    const { reqId } = await svc.startAuthorization({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256' });
    await svc.decide(reqId, user.userId, { approve: false, areas: [] });
    await expect(svc.decide(reqId, user.userId, { approve: false, areas: [] })).rejects.toMatchObject({ status: 404 });
  });
  it('rejects unknown areas', async () => {
    const { reqId } = await svc.startAuthorization({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256' });
    await expect(svc.decide(reqId, user.userId, { approve: true, areas: ['everything'] })).rejects.toMatchObject({ status: 400 });
  });
});

describe('tokens', () => {
  it('issues tokens for a valid code and resolves the access token', async () => {
    const t = await tokensFromCode(await approveAndGetCode(['investments', 'retirement']));
    expect(t.access_token.startsWith('epa_')).toBe(true);
    expect(t.refresh_token.startsWith('epr_')).toBe(true);
    expect(t.scope).toBe('area:investments area:retirement');
    const ctx = await svc.resolveAccessToken(t.access_token);
    expect(ctx).toMatchObject({ userId: user.userId, areas: ['investments', 'retirement'], clientName: 'Claude' });
  });
  it('re-approving the same client updates the one grant', async () => {
    await tokensFromCode(await approveAndGetCode(['loans']));
    const grants = await runAsSystem(() => prisma.mcpGrant.findMany({ where: { userId: user.userId, revokedAt: null } }));
    expect(grants).toHaveLength(1);
    expect(grants[0]!.areas).toEqual(['loans']);
  });
  it('refuses a wrong code_verifier', async () => {
    const code = await approveAndGetCode();
    await expect(svc.exchangeToken({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: 'x'.repeat(43) }))
      .rejects.toMatchObject({ error: 'invalid_grant' });
  });
  it('code replay revokes grant', async () => {
    const code = await approveAndGetCode();
    const t = await tokensFromCode(code);
    await expect(tokensFromCode(code)).rejects.toMatchObject({ error: 'invalid_grant' });
    expect(await svc.resolveAccessToken(t.access_token)).toBeNull();
  });
  it('an expired code is refused', async () => {
    const code = await approveAndGetCode();
    await runAsSystem(() => prisma.mcpAuthCode.updateMany({ where: { userId: user.userId, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } }));
    await expect(tokensFromCode(code)).rejects.toMatchObject({ error: 'invalid_grant' });
  });
  it('refresh rotates; refresh reuse revokes grant', async () => {
    const t1 = await tokensFromCode(await approveAndGetCode());
    const t2 = await svc.exchangeToken({ grant_type: 'refresh_token', refresh_token: t1.refresh_token, client_id: clientId });
    expect(t2.refresh_token).not.toBe(t1.refresh_token);
    expect(await svc.resolveAccessToken(t2.access_token)).not.toBeNull();
    await expect(svc.exchangeToken({ grant_type: 'refresh_token', refresh_token: t1.refresh_token, client_id: clientId }))
      .rejects.toMatchObject({ error: 'invalid_grant' });
    expect(await svc.resolveAccessToken(t2.access_token)).toBeNull();
  });
  it('a refresh token is not an access token and vice versa', async () => {
    const t = await tokensFromCode(await approveAndGetCode());
    expect(await svc.resolveAccessToken(t.refresh_token)).toBeNull();
    await expect(svc.exchangeToken({ grant_type: 'refresh_token', refresh_token: t.access_token, client_id: clientId }))
      .rejects.toMatchObject({ error: 'invalid_grant' });
  });
  it('revokeConnection ends access immediately and lists nothing', async () => {
    const t = await tokensFromCode(await approveAndGetCode());
    const [conn] = await svc.listConnections(user.userId);
    expect(conn!.clientName).toBe('Claude');
    await svc.revokeConnection(user.userId, conn!.id);
    expect(await svc.resolveAccessToken(t.access_token)).toBeNull();
    expect(await svc.listConnections(user.userId)).toEqual([]);
  });
  it('re-consent retires the old tokens without revoking the fresh connection', async () => {
    const t1 = await tokensFromCode(await approveAndGetCode(['investments']));
    const t2 = await tokensFromCode(await approveAndGetCode(['retirement']));
    expect(await svc.resolveAccessToken(t1.access_token)).toBeNull();
    await expect(svc.exchangeToken({ grant_type: 'refresh_token', refresh_token: t1.refresh_token, client_id: clientId }))
      .rejects.toMatchObject({ error: 'invalid_grant' });
    expect(await svc.resolveAccessToken(t2.access_token)).toMatchObject({ areas: ['retirement'] });
    const t3 = await svc.exchangeToken({ grant_type: 'refresh_token', refresh_token: t2.refresh_token, client_id: clientId });
    expect(await svc.resolveAccessToken(t3.access_token)).not.toBeNull();
  });
  it('purgeExpiredMcpRows deletes expired requests, codes, tokens and orphan clients only', async () => {
    const old = new Date(Date.now() - 8 * 86_400_000);
    const orphan = await runAsSystem(() => prisma.mcpClient.create({ data: { clientId: `mcp_orphan_${Date.now()}`, redirectUris: [REDIRECT], displayName: 'Claude', registeredAt: old } }));
    const { reqId } = await svc.startAuthorization({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256' });
    await runAsSystem(() => prisma.mcpAuthRequest.update({ where: { id: reqId }, data: { expiresAt: new Date(Date.now() - 1000) } }));
    const live = await tokensFromCode(await approveAndGetCode(['investments']));
    await runAsSystem(() => prisma.mcpToken.updateMany({ where: { userId: user.userId, kind: 'REFRESH' }, data: { expiresAt: new Date(Date.now() - 1000) } }));
    const r = await svc.purgeExpiredMcpRows(new Date());
    expect(r.requests).toBeGreaterThanOrEqual(1);
    expect(r.tokens).toBeGreaterThanOrEqual(1);
    expect(r.clients).toBeGreaterThanOrEqual(1);
    expect(await runAsSystem(() => prisma.mcpClient.findUnique({ where: { id: orphan.id } }))).toBeNull();
    expect(await runAsSystem(() => prisma.mcpClient.findUnique({ where: { clientId } }))).not.toBeNull();
    expect(await svc.resolveAccessToken(live.access_token)).not.toBeNull();
  });
  it('audits without data', async () => {
    const rows = await runAsSystem(() => prisma.auditLog.findMany({ where: { userId: user.userId, action: { startsWith: 'mcp_' } } }));
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(['mcp_connected', 'mcp_revoked', 'mcp_refresh_reuse']));
    for (const r of rows) expect(JSON.stringify(r.metadata)).not.toMatch(/epa_|epr_|epc_/);
  });
});
