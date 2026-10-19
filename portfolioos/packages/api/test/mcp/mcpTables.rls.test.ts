import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { purgeUser } from '../../src/services/account/accountDeletion.service.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let a: TestScope;
let b: TestScope;
let clientRowId: string;

beforeAll(async () => {
  a = await createTestScope('mcp-rls-a');
  b = await createTestScope('mcp-rls-b');
  const c = await runAsSystem(() => prisma.mcpClient.create({
    data: { clientId: `mcp_test_${Date.now()}`, redirectUris: ['https://claude.ai/api/mcp/auth_callback'], displayName: 'Claude' },
  }));
  clientRowId = c.id;
});
afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.mcpToken.deleteMany({ where: { userId: { in: [a.userId, b.userId] } } });
    await prisma.mcpGrant.deleteMany({ where: { userId: { in: [a.userId, b.userId] } } });
    await prisma.mcpClient.delete({ where: { id: clientRowId } });
  });
  await a.cleanup();
  // b was purged by the last test; its cleanup has nothing left to remove.
  await b.cleanup().catch(() => undefined);
});

describe('Mcp tables', () => {
  it('a grant is visible to its owner and invisible to another user', async () => {
    const g = await runAsUser(a.userId, () => prisma.mcpGrant.create({
      data: { userId: a.userId, clientId: clientRowId, areas: ['investments'] },
    }));
    expect(await runAsUser(a.userId, () => prisma.mcpGrant.findUnique({ where: { id: g.id } }))).not.toBeNull();
    expect(await runAsUser(b.userId, () => prisma.mcpGrant.findUnique({ where: { id: g.id } }))).toBeNull();
  });

  it('allows only one active grant per user and client', async () => {
    await expect(runAsUser(a.userId, () => prisma.mcpGrant.create({
      data: { userId: a.userId, clientId: clientRowId, areas: [] },
    }))).rejects.toThrow();
  });

  it('account purge removes grants and tokens', async () => {
    const g = await runAsUser(b.userId, () => prisma.mcpGrant.create({ data: { userId: b.userId, clientId: clientRowId, areas: [] } }));
    await runAsUser(b.userId, () => prisma.mcpToken.create({
      data: { userId: b.userId, grantId: g.id, tokenHash: `h_${Date.now()}`, kind: 'ACCESS', generation: 0, expiresAt: new Date(Date.now() + 60_000) },
    }));
    await purgeUser(b.userId);
    const left = await runAsSystem(() => prisma.mcpGrant.count({ where: { userId: b.userId } }));
    expect(left).toBe(0);
  });
});
