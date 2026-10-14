import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { createTransaction } from '../../src/services/transaction.service.js';
import { listShareablePeople } from '../../src/services/mcp/people.js';
import { runConnectorTool } from '../../src/services/mcp/server.js';
import { decide, registerClient, startAuthorization, updateConnection } from '../../src/services/mcp/oauth.service.js';
import { CONNECTOR_TOOLS } from '../../src/services/mcp/tools/index.js';
import type { AiConnectorArea } from '@everypaisa/shared';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let a: TestScope; // the connecting user
let b: TestScope; // own-login family member (owner of family F2)
let managedId: string;
let managedPortfolioId: string;
let f1: string;
let f2: string;

const ALL: AiConnectorArea[] = ['investments', 'retirement', 'banking', 'loans', 'insurance', 'property', 'vehicles', 'goals_tax', 'split'];
const tool = (n: string) => CONNECTOR_TOOLS.find((t) => t.name === n)!;
function call(name: string, args: Record<string, unknown>, memberUserIds: string[], areas: AiConnectorArea[] = ALL) {
  // Same context the /mcp route sets: the connecting user's RLS scope.
  return runAsUser(a.userId, () => runConnectorTool({ userId: a.userId, grantId: 'g', areas, memberUserIds, planOk: true, now: new Date('2026-10-15T06:00:00Z') }, tool(name), args));
}

beforeAll(async () => {
  a = await createTestScope('mcp-people-a');
  b = await createTestScope('mcp-people-b');
  await runAsSystem(async () => {
    const m = await prisma.user.create({ data: { email: `managed-${Date.now()}@shadow.local`, passwordHash: 'x', name: 'Mom Test', isShadowClient: true, managedById: a.userId } });
    managedId = m.id;
    managedPortfolioId = (await prisma.portfolio.create({ data: { userId: m.id, name: 'Mom main', currency: 'INR', type: 'INVESTMENT', isDefault: true } })).id;
    f1 = (await prisma.family.create({ data: { name: 'F1', createdById: a.userId } })).id;
    await prisma.familyMember.createMany({ data: [
      { familyId: f1, userId: a.userId, role: 'OWNER', status: 'ACTIVE' },
      { familyId: f1, userId: m.id, role: 'CONTRIBUTOR', status: 'ACTIVE', relation: 'Mother' },
    ] });
    f2 = (await prisma.family.create({ data: { name: 'F2', createdById: b.userId } })).id;
    await prisma.familyMember.createMany({ data: [
      { familyId: f2, userId: b.userId, role: 'OWNER', status: 'ACTIVE', relation: 'Brother' },
      { familyId: f2, userId: a.userId, role: 'CONTRIBUTOR', status: 'ACTIVE', visibleCategories: [], visibleAssetClasses: ['FIXED_DEPOSIT'] },
    ] });
  });
  await runAsUser(managedId, () => createTransaction(managedId, { portfolioId: managedPortfolioId, assetClass: 'FIXED_DEPOSIT', transactionType: 'DEPOSIT', assetName: 'Mom FD', tradeDate: '2026-04-01', quantity: '1', price: '50000' } as never));
  await runAsUser(b.userId, async () => {
    await createTransaction(b.userId, { portfolioId: b.portfolioId, assetClass: 'FIXED_DEPOSIT', transactionType: 'DEPOSIT', assetName: 'B FD', tradeDate: '2026-04-01', quantity: '1', price: '70000' } as never);
    await createTransaction(b.userId, { portfolioId: b.portfolioId, assetClass: 'PHYSICAL_GOLD', transactionType: 'BUY', assetName: 'B Gold', tradeDate: '2026-04-01', quantity: '1', price: '9000' } as never);
  });
});
afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.familyMember.deleteMany({ where: { familyId: { in: [f1, f2] } } });
    await prisma.family.deleteMany({ where: { id: { in: [f1, f2] } } });
    await prisma.holdingProjection.deleteMany({ where: { portfolioId: managedPortfolioId } });
    await prisma.transaction.deleteMany({ where: { portfolioId: managedPortfolioId } });
    await prisma.portfolio.deleteMany({ where: { userId: managedId } });
    await prisma.user.delete({ where: { id: managedId } });
    await prisma.user.update({ where: { id: b.userId }, data: { aiConnectorFamilyOptIn: false } });
  });
  await a.cleanup();
  await b.cleanup();
});

describe('family people', () => {
  it('lists the managed profile as shareable and the member as not shareable until opt-in', async () => {
    const people = await runAsUser(a.userId, () => listShareablePeople(a.userId));
    expect(people.find((p) => p.userId === managedId)).toMatchObject({ kind: 'managed', shareable: true, name: 'Mom Test' });
    expect(people.find((p) => p.userId === b.userId)).toMatchObject({ kind: 'member', shareable: false });
    expect(people.find((p) => p.userId === a.userId)).toBeUndefined();
  });

  it('a decision naming a member who has not opted in is refused', async () => {
    const reg = await registerClient({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] });
    try {
      const { reqId } = await startAuthorization({ response_type: 'code', client_id: reg.client_id, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_challenge: 'x'.repeat(43), code_challenge_method: 'S256' });
      await expect(runAsUser(a.userId, () => decide(reqId, a.userId, { approve: true, areas: ['investments'], memberIds: [b.userId] })))
        .rejects.toMatchObject({ status: 400 });
    } finally {
      await runAsSystem(() => prisma.mcpClient.deleteMany({ where: { clientId: reg.client_id } }));
    }
  });

  it('reads a managed profile with owner label', async () => {
    const r = await call('list_holdings', { member: managedId }, [managedId]);
    expect(r.data.owner).toBe('Mom Test');
    expect(r.data.holdings).toHaveLength(1);
  });

  it('refuses a member who has not opted in, even if listed on the grant', async () => {
    await expect(call('list_holdings', { member: b.userId }, [b.userId])).rejects.toThrow(/not shared with this chatbot/);
  });

  it('caps refuse an area and filter asset classes', async () => {
    await runAsSystem(() => prisma.user.update({ where: { id: b.userId }, data: { aiConnectorFamilyOptIn: true } }));
    // Overview totals cannot be filtered by asset class, so a capped member's
    // investments and loans sections are left out rather than shown whole.
    const ov = await call('get_overview', { member: b.userId }, [b.userId], ['loans', 'investments']);
    expect(ov.data).not.toHaveProperty('loans');
    expect(ov.data).not.toHaveProperty('investments');
    const h = await call('list_holdings', { member: b.userId }, [b.userId]);
    expect((h.data.holdings as Array<{ assetClass: string }>).map((x) => x.assetClass)).toEqual(['FIXED_DEPOSIT']);
    await expect(call('get_performance', { member: b.userId }, [b.userId])).rejects.toThrow(/has not shared/);
  });

  it('overview totals need every category of an area (cards hidden when only bank accounts are shared)', async () => {
    await runAsSystem(async () => {
      await prisma.user.update({ where: { id: b.userId }, data: { aiConnectorFamilyOptIn: true } });
      await prisma.familyMember.updateMany({ where: { familyId: f2, userId: a.userId }, data: { visibleCategories: ['BANK_ACCOUNT', 'RENTAL'] } });
    });
    try {
      const ov = await call('get_overview', { member: b.userId }, [b.userId], ['banking', 'property']);
      expect(ov.data).not.toHaveProperty('creditCards');
      expect(ov.data).not.toHaveProperty('property');
    } finally {
      await runAsSystem(() => prisma.familyMember.updateMany({ where: { familyId: f2, userId: a.userId }, data: { visibleCategories: [] } }));
    }
  });

  it('filtered results say rows were hidden', async () => {
    await runAsSystem(() => prisma.user.update({ where: { id: b.userId }, data: { aiConnectorFamilyOptIn: true } }));
    const h = await call('list_holdings', { member: b.userId }, [b.userId]);
    expect(String(h.data.note)).toMatch(/hidden/i);
  });

  it('a member who opted out does not block saving the connection', async () => {
    const client = await runAsSystem(() => prisma.mcpClient.create({ data: { clientId: `mcp_stale_${Date.now()}`, redirectUris: [], displayName: 'Claude' } }));
    try {
      const g = await runAsUser(a.userId, () => prisma.mcpGrant.create({ data: { userId: a.userId, clientId: client.id, areas: ['investments', 'loans'], memberUserIds: [b.userId] } }));
      await runAsSystem(() => prisma.user.update({ where: { id: b.userId }, data: { aiConnectorFamilyOptIn: false } }));
      const conn = await runAsUser(a.userId, () => updateConnection(a.userId, g.id, { areas: ['investments'], memberUserIds: [b.userId] }));
      expect(conn.areas).toEqual(['investments']);
      expect(conn.memberUserIds).toEqual([]);
    } finally {
      await runAsSystem(async () => {
        await prisma.mcpGrant.deleteMany({ where: { clientId: client.id } });
        await prisma.mcpClient.delete({ where: { id: client.id } });
      });
    }
  });

  it('opt-out takes effect next call', async () => {
    await runAsSystem(() => prisma.user.update({ where: { id: b.userId }, data: { aiConnectorFamilyOptIn: true } }));
    await expect(call('list_holdings', { member: b.userId }, [b.userId])).resolves.toBeTruthy();
    await runAsSystem(() => prisma.user.update({ where: { id: b.userId }, data: { aiConnectorFamilyOptIn: false } }));
    await expect(call('list_holdings', { member: b.userId }, [b.userId])).rejects.toThrow(/not shared with this chatbot/);
  });

  it("member 'all' labels each person and keeps going past a refusal", async () => {
    await runAsSystem(() => prisma.user.update({ where: { id: b.userId }, data: { aiConnectorFamilyOptIn: true } }));
    const r = await call('get_performance', { member: 'all' }, [managedId, b.userId]);
    const people = r.data.people as Array<{ owner: string; data?: unknown; error?: string }>;
    expect(people.map((p) => p.owner)).toEqual(['You', 'Mom Test', expect.any(String)]);
    expect(people[1]!.data).toBeTruthy();
    expect(people[2]!.error).toMatch(/has not shared/);
  });

  it('list_people shows only people still eligible', async () => {
    const r = await call('list_people', {}, [managedId, b.userId]);
    expect((r.data.people as Array<{ id: string }>).map((p) => p.id)).toEqual(['me', managedId, b.userId]);
  });

  it('a profile no longer managed drops on the next call', async () => {
    await runAsSystem(() => prisma.user.update({ where: { id: managedId }, data: { managedById: null } }));
    try {
      await expect(call('list_holdings', { member: managedId }, [managedId])).rejects.toThrow(/not shared with this chatbot/);
    } finally {
      await runAsSystem(() => prisma.user.update({ where: { id: managedId }, data: { managedById: a.userId } }));
    }
  });
});
