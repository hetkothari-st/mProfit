import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { CONNECTOR_TOOLS } from '../../src/services/mcp/tools/index.js';
import { maskForChatbot } from '../../src/services/mcp/mask.js';
import { getDashboardNetWorth } from '../../src/services/dashboard.service.js';
import { createTransaction } from '../../src/services/transaction.service.js';
import type { ToolContext } from '../../src/services/mcp/tools/types.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let a: TestScope;
let b: TestScope;
let clientRowId: string | null = null;
const ctx = (userId: string, areas: ToolContext['areas'] = ['investments', 'retirement']): ToolContext =>
  ({ userId, grantId: 'g', areas, planOk: true, now: new Date('2026-10-15T06:00:00Z') });
async function call(name: string, userId: string, args: Record<string, unknown> = {}, areas?: ToolContext['areas']) {
  const tool = CONNECTOR_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`no tool ${name}`);
  return runAsUser(userId, async () => maskForChatbot((await tool.run(ctx(userId, areas), args as never)).data));
}

beforeAll(async () => {
  a = await createTestScope('mcp-tools-a');
  b = await createTestScope('mcp-tools-b');
  // A's own (scope) portfolio gets one FD deposit whose narration holds an account number.
  await runAsUser(a.userId, () => createTransaction(a.userId, {
    portfolioId: a.portfolioId, assetClass: 'FIXED_DEPOSIT', transactionType: 'DEPOSIT', assetName: 'HDFC FD',
    tradeDate: '2026-04-10', quantity: '1', price: '100000', narration: 'From A/c 50100234564821',
  } as never));
});
afterAll(async () => {
  if (clientRowId) {
    await runAsSystem(async () => {
      await prisma.portfolio.deleteMany({ where: { clientId: clientRowId! } });
      await prisma.client.delete({ where: { id: clientRowId! } });
    });
  }
  await a.cleanup();
  await b.cleanup();
});

describe('Part 1 tools', () => {
  it('registers the nine tools with their areas', () => {
    const map = Object.fromEntries(CONNECTOR_TOOLS.map((t) => [t.name, t.area]));
    expect(map).toMatchObject({
      get_overview: 'always', list_people: 'always', list_portfolios: 'investments', list_holdings: 'investments',
      list_transactions: 'investments', get_performance: 'investments', get_capital_gains: 'investments',
      list_forex: 'investments', list_retirement_accounts: 'retirement',
    });
  });

  it('get_overview matches the dashboard and hides unshared areas', async () => {
    const dash = await runAsUser(a.userId, () => getDashboardNetWorth(a.userId));
    const full = await call('get_overview', a.userId, {}, ['investments', 'retirement', 'banking', 'loans', 'insurance', 'property', 'vehicles']);
    expect(full.investments).toMatchObject({ currentValue: dash.portfolio.currentValue, invested: dash.portfolio.totalInvested });
    expect(full.netWorth).toBe(dash.netWorthAfterLiabilities);
    const partial = await call('get_overview', a.userId, {}, ['investments']);
    expect(partial.netWorth).toBeNull();
    expect(partial.netWorthNote).toMatch(/not all areas are shared/i);
    expect(partial).not.toHaveProperty('vehicles');
    expect(partial).not.toHaveProperty('loans');
  });

  it('list_people is just you in Part 1', async () => {
    expect((await call('list_people', a.userId)).people).toEqual([{ id: 'me', name: 'You', relation: 'self' }]);
  });

  it('list_holdings and list_portfolios return only own portfolios', async () => {
    const ps = await call('list_portfolios', a.userId);
    expect((ps.portfolios as Array<{ id: string }>).map((p) => p.id)).toEqual([a.portfolioId]);
    const hs = await call('list_holdings', a.userId);
    expect(hs.holdings).toHaveLength(1);
  });

  it('client portfolios excluded', async () => {
    const c = await runAsSystem(() => prisma.client.create({ data: { advisorId: a.userId, name: 'Client X' } }));
    clientRowId = c.id;
    const p = await runAsSystem(() => prisma.portfolio.create({ data: { userId: a.userId, name: 'Client book', clientId: c.id, currency: 'INR', type: 'INVESTMENT' } }));
    const ps = await call('list_portfolios', a.userId);
    expect((ps.portfolios as Array<{ id: string }>).map((x) => x.id)).not.toContain(p.id);
  });

  it('client-book activity changes no tool output (overview, performance, capital gains)', async () => {
    const tools = ['get_overview', 'get_performance', 'get_capital_gains'] as const;
    const all: ToolContext['areas'] = ['investments', 'retirement', 'banking', 'loans', 'insurance', 'property', 'vehicles'];
    const before = await Promise.all(tools.map((n) => call(n, a.userId, {}, all)));
    const c = await runAsSystem(() => prisma.client.create({ data: { advisorId: a.userId, name: 'Client Y' } }));
    const book = await runAsSystem(() => prisma.portfolio.create({ data: { userId: a.userId, name: 'Client Y book', clientId: c.id, currency: 'INR', type: 'INVESTMENT' } }));
    try {
      await runAsUser(a.userId, async () => {
        await createTransaction(a.userId, { portfolioId: book.id, assetClass: 'PHYSICAL_GOLD', transactionType: 'BUY', assetName: 'Gold coin', tradeDate: '2024-01-10', quantity: '10', price: '5000' } as never);
        await createTransaction(a.userId, { portfolioId: book.id, assetClass: 'PHYSICAL_GOLD', transactionType: 'SELL', assetName: 'Gold coin', tradeDate: '2026-05-10', quantity: '4', price: '9000' } as never);
      });
      const after = await Promise.all(tools.map((n) => call(n, a.userId, {}, all)));
      expect(after[0]).toEqual(before[0]);
      expect(after[1]).toEqual(before[1]);
      expect(after[2]).toEqual(before[2]);
    } finally {
      await runAsSystem(async () => {
        await prisma.capitalGain.deleteMany({ where: { portfolioId: book.id } });
        await prisma.holdingProjection.deleteMany({ where: { portfolioId: book.id } });
        await prisma.transaction.deleteMany({ where: { portfolioId: book.id } });
        await prisma.portfolio.delete({ where: { id: book.id } });
        await prisma.client.delete({ where: { id: c.id } });
      });
    }
  });

  it('narration with account number is masked', async () => {
    const tx = await call('list_transactions', a.userId, { from: '01/04/2026', to: '30/04/2026' });
    const row = (tx.transactions as Array<Record<string, unknown>>)[0]!;
    expect(row.date).toBe('10/04/2026');
    expect(row.userText).not.toContain('50100234564821');
    expect(row.userText).toContain('4821');
  });

  it('list_transactions rejects a bad date with a plain error', async () => {
    await expect(call('list_transactions', a.userId, { from: '31/02/2026' })).rejects.toThrow(/date/i);
  });

  it('user B token never sees user A', async () => {
    const ps = (await call('list_portfolios', b.userId)).portfolios as Array<{ id: string }>;
    expect(ps.map((p) => p.id)).toEqual([b.portfolioId]);
    expect((await call('list_transactions', b.userId)).transactions).toEqual([]);
  });

  it('no output anywhere holds an unmasked 9+ digit run', async () => {
    for (const name of ['get_overview', 'list_portfolios', 'list_holdings', 'list_transactions', 'get_performance', 'get_capital_gains', 'list_forex', 'list_retirement_accounts']) {
      const out = JSON.stringify(await call(name, a.userId));
      expect(out, name).not.toMatch(/(?<![\d.])\d{9,}(?![\d.])/);
    }
  });

  it('get_performance reports XIRR as a percent string', async () => {
    const p = await call('get_performance', a.userId);
    if (p.xirrPct !== null) expect(p.xirrPct).toMatch(/^-?\d+\.\d{2}$/);
    expect(Array.isArray(p.allocation)).toBe(true);
  });
});
