import 'dotenv/config';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { z } from 'zod';

vi.mock('../../src/config/env.js', async (orig) => {
  const real = (await orig()) as { env: Record<string, unknown> };
  return { env: { ...real.env, MCP_ENABLED: 'true', API_PUBLIC_URL: 'https://api.test.local', FRONTEND_URL: 'https://app.test.local' } };
});

const svc = await import('../../src/services/mcp/oauth.service.js');
const { CONNECTOR_TOOLS } = await import('../../src/services/mcp/tools/index.js');
const { mcpRouter } = await import('../../src/routes/mcp.routes.js');
const { prisma } = await import('../../src/lib/prisma.js');
const { runAsSystem } = await import('../../src/lib/requestContext.js');
const { createTestScope } = await import('../helpers/db.js');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

// Test-only tools so this task is testable before Task 6's real tools exist.
CONNECTOR_TOOLS.push(
  { name: 'test_echo_me', area: 'always', title: 't', description: 't', input: {}, run: async (ctx) => ({ rows: 1, data: { userId: ctx.userId, accountNumber: '50100234564821' } }) },
  { name: 'test_loans_only', area: 'loans', title: 't', description: 't', input: { n: z.number().int().optional() }, run: async () => ({ data: { ok: true } }) },
  { name: 'test_slow', area: 'always', title: 't', description: 't', input: {}, run: () => new Promise(() => undefined) },
);

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
let server: Server;
let base: string;
let user: Awaited<ReturnType<typeof createTestScope>>;
let clientId: string;

async function newAccessToken(areas: string[]): Promise<string> {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const { reqId } = await svc.startAuthorization({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256' });
  const { redirectTo } = await svc.decide(reqId, user.userId, { approve: true, areas });
  const code = new URL(redirectTo).searchParams.get('code')!;
  return (await svc.exchangeToken({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier })).access_token;
}

async function connect(token: string) {
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  return client;
}

beforeAll(async () => {
  user = await createTestScope('mcp-endpoint');
  await runAsSystem(() => prisma.user.update({ where: { id: user.userId }, data: { plan: 'PLUS' } }));
  clientId = (await svc.registerClient({ redirect_uris: [REDIRECT] })).client_id;
  const app = express();
  app.use(express.json());
  app.use(mcpRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  await runAsSystem(async () => {
    await prisma.mcpToken.deleteMany({ where: { userId: user.userId } });
    await prisma.mcpAuthCode.deleteMany({ where: { userId: user.userId } });
    await prisma.mcpGrant.deleteMany({ where: { userId: user.userId } });
    await prisma.mcpClient.deleteMany({ where: { clientId } });
  });
  await user.cleanup();
});

describe('/mcp auth', () => {
  it('no token -> 401 pointing at resource metadata', async () => {
    const r = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{}' });
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toBe('Bearer resource_metadata="https://api.test.local/.well-known/oauth-protected-resource"');
  });
  it('a session JWT is not accepted', async () => {
    const r = await fetch(`${base}/mcp`, { method: 'POST', headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.x', 'content-type': 'application/json' }, body: '{}' });
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toContain('error="invalid_token"');
  });
  it('GET is 405 (stateless, no stream)', async () => {
    expect((await fetch(`${base}/mcp`)).status).toBe(405);
  });
});

describe('/mcp tools', () => {
  it('lists only tools for shared areas, all read-only', async () => {
    const client = await connect(await newAccessToken(['investments']));
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('test_echo_me');
    expect(names).not.toContain('test_loans_only');
    for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(true);
    await client.close();
  });
  it('runs as the connecting user and masks the result', async () => {
    const client = await connect(await newAccessToken(['investments']));
    const r = await client.callTool({ name: 'test_echo_me', arguments: {} });
    const text = (r.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(JSON.parse(text)).toEqual({ userId: user.userId, accountNumber: 'XXXX4821' });
    // The audit write is fire-and-forget; wait for it rather than racing it.
    await vi.waitFor(async () => {
      const audit = await runAsSystem(() => prisma.auditLog.findFirst({ where: { userId: user.userId, action: 'mcp_tool_called' }, orderBy: { createdAt: 'desc' } }));
      expect(audit?.metadata).toMatchObject({ tool: 'test_echo_me', area: 'always', rowCount: 1, ok: true });
    }, { timeout: 3000 });
    await client.close();
  });
  it('a slow tool times out with a plain error', async () => {
    const client = await connect(await newAccessToken(['investments']));
    const r = await client.callTool({ name: 'test_slow', arguments: {} });
    expect(r.isError).toBe(true);
    await client.close();
  }, 20_000);
  it('a downgraded user gets the plan-locked error from every tool', async () => {
    const token = await newAccessToken(['investments']);
    await runAsSystem(() => prisma.user.update({ where: { id: user.userId }, data: { plan: 'FREE' } }));
    try {
      const client = await connect(token);
      const r = await client.callTool({ name: 'test_echo_me', arguments: {} });
      expect(r.isError).toBe(true);
      expect((r.content as Array<{ text: string }>)[0]!.text).toMatch(/Plus plan/);
      await client.close();
    } finally {
      await runAsSystem(() => prisma.user.update({ where: { id: user.userId }, data: { plan: 'PLUS' } }));
    }
  });
  it('revoked grant answers 401 on the next call', async () => {
    const token = await newAccessToken(['investments']);
    const client = await connect(token);
    const [conn] = await svc.listConnections(user.userId);
    await svc.revokeConnection(user.userId, conn!.id);
    await expect(client.callTool({ name: 'test_echo_me', arguments: {} })).rejects.toThrow();
    await client.close().catch(() => undefined);
  });
  it('updates lastUsedAt', async () => {
    const client = await connect(await newAccessToken(['investments']));
    await client.callTool({ name: 'test_echo_me', arguments: {} });
    await vi.waitFor(async () => {
      const g = await runAsSystem(() => prisma.mcpGrant.findFirst({ where: { userId: user.userId, revokedAt: null } }));
      expect(g?.lastUsedAt).not.toBeNull();
    }, { timeout: 3000 });
    await client.close();
  });
});
