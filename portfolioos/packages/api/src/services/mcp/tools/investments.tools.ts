import { z } from 'zod';
import { serializeMoney } from '@everypaisa/shared';
import { getPortfolioHoldings } from '../../portfolio.service.js';
import { listTransactions } from '../../transaction.service.js';
import { getAllocationByClass, getAssetClassXirr, getCgByFy, getKpis, type AnalyticsScope } from '../../analytics.service.js';
import { listForexBalances } from '../../forex.service.js';
import { MAX_ROWS, ToolUserError, type ConnectorTool } from './types.js';
import { dmy, ownPortfolios, parseDateArg, pct } from './common.js';

const NOT_YOURS = 'That portfolio id is not one of yours. Call list_portfolios for valid ids.';

async function scopeFor(userId: string, portfolioId?: string): Promise<{ scope: AnalyticsScope; ids: string[] }> {
  const own = await ownPortfolios(userId);
  if (portfolioId) {
    if (!own.some((p) => p.id === portfolioId)) throw new ToolUserError(NOT_YOURS);
    return { scope: { kind: 'portfolio', portfolioId }, ids: [portfolioId] };
  }
  return { scope: { kind: 'user', userId }, ids: own.map((p) => p.id) };
}

const listPortfoliosTool: ConnectorTool<Record<string, never>> = {
  name: 'list_portfolios', area: 'investments', title: 'Portfolios',
  description: 'Your investment portfolios with current value and counts.', input: {},
  async run(ctx) {
    const own = await ownPortfolios(ctx.userId);
    return {
      rows: own.length,
      data: {
        asOf: dmy(ctx.now), owner: 'You', currency: 'INR',
        portfolios: own.map((p) => ({
          id: p.id, name: p.name, type: p.type, currency: p.currency, currentValue: p.currentValue,
          holdings: p.holdingCount, transactions: p.transactionCount, userText: p.description ?? null,
        })),
      },
    };
  },
};

const holdingsInput = {
  portfolioId: z.string().optional().describe('Limit to one portfolio (id from list_portfolios).'),
  assetClass: z.string().optional().describe('e.g. EQUITY, MUTUAL_FUND, FIXED_DEPOSIT'),
};
const listHoldings: ConnectorTool<typeof holdingsInput> = {
  name: 'list_holdings', area: 'investments', title: 'Holdings',
  description: 'What you hold now: quantity, cost, value, gain and XIRR per holding.', input: holdingsInput,
  async run(ctx, args) {
    const { ids } = await scopeFor(ctx.userId, args.portfolioId);
    const own = await ownPortfolios(ctx.userId);
    const nameOf = new Map(own.map((p) => [p.id, p.name]));
    const rows: Record<string, unknown>[] = [];
    for (const id of ids) {
      for (const h of await getPortfolioHoldings(ctx.userId, id)) {
        if (args.assetClass && h.assetClass !== args.assetClass) continue;
        rows.push({
          portfolio: nameOf.get(id), assetClass: h.assetClass, name: h.assetName, symbol: h.symbol, isin: h.isin,
          quantity: h.quantity, avgCost: h.avgCostPrice, totalCost: h.totalCost, currentPrice: h.currentPrice,
          currentValue: h.currentValue, unrealisedGain: h.unrealisedPnL, xirrPct: pct(h.xirr),
          priceAsOf: dmy(h.priceAsOf), priceStale: h.stale,
        });
      }
    }
    return {
      rows: Math.min(rows.length, MAX_ROWS),
      data: { asOf: dmy(ctx.now), owner: 'You', currency: 'INR', holdings: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS },
    };
  },
};

const txInput = {
  from: z.string().optional().describe('dd/mm/yyyy'),
  to: z.string().optional().describe('dd/mm/yyyy'),
  portfolioId: z.string().optional(),
  assetClass: z.string().optional(),
  page: z.number().int().min(1).optional(),
};
const listTransactionsTool: ConnectorTool<typeof txInput> = {
  name: 'list_transactions', area: 'investments', title: 'Transactions',
  description: 'Buys, sells, dividends and other investment transactions, newest first, 200 per page.', input: txInput,
  async run(ctx, args) {
    const from = parseDateArg(args.from, 'from');
    const to = parseDateArg(args.to, 'to');
    const own = await ownPortfolios(ctx.userId);
    if (args.portfolioId && !own.some((p) => p.id === args.portfolioId)) throw new ToolUserError(NOT_YOURS);
    const nameOf = new Map(own.map((p) => [p.id, p.name]));
    const page = args.page ?? 1;
    const r = await listTransactions(ctx.userId, {
      from, to, portfolioId: args.portfolioId, assetClass: args.assetClass, page, pageSize: MAX_ROWS,
    } as never);
    // listTransactions is personal-scope without a familyId; this filter is
    // what guarantees own, non-client portfolios only.
    const items = r.items.filter((t) => nameOf.has(t.portfolioId));
    return {
      rows: items.length,
      data: {
        asOf: dmy(ctx.now), owner: 'You', currency: 'INR', page, totalPages: r.pagination.totalPages,
        transactions: items.map((t) => ({
          date: dmy(t.tradeDate), portfolio: nameOf.get(t.portfolioId), assetClass: t.assetClass, type: t.transactionType,
          name: t.assetName, symbol: t.symbol, quantity: t.quantity, price: t.price, netAmount: t.netAmount,
          broker: t.broker, userText: t.narration ?? null,
        })),
      },
    };
  },
};

const perfInput = { portfolioId: z.string().optional() };
const getPerformance: ConnectorTool<typeof perfInput> = {
  name: 'get_performance', area: 'investments', title: 'Performance',
  description: 'XIRR (overall, 1/3/5 years), gains, income this year and allocation by asset class.', input: perfInput,
  async run(ctx, args) {
    const { scope } = await scopeFor(ctx.userId, args.portfolioId);
    const [k, alloc, byClass] = await Promise.all([getKpis(scope), getAllocationByClass(scope), getAssetClassXirr(scope)]);
    return {
      rows: alloc.length + byClass.length,
      data: {
        asOf: dmy(ctx.now), owner: 'You', currency: 'INR',
        xirrPct: pct(k.xirrOverall), xirr1yPct: pct(k.xirr1y), xirr3yPct: pct(k.xirr3y), xirr5yPct: pct(k.xirr5y),
        xirrReliable: k.xirrReliable,
        invested: k.totalCost, currentValue: k.currentValue, unrealisedGain: k.unrealisedPnL,
        realisedThisFy: k.realisedYtd, incomeThisFy: k.incomeYtd,
        allocation: alloc.map((s) => ({ assetClass: s.label, value: s.value, pct: s.pct.toFixed(2) })),
        byAssetClass: byClass.map((r) => ({ assetClass: r.label, invested: r.invested, currentValue: r.currentValue, xirrPct: pct(r.xirr) })),
      },
    };
  },
};

const cgInput = { fy: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Indian financial year, e.g. 2025-26') };
const getCapitalGains: ConnectorTool<typeof cgInput> = {
  name: 'get_capital_gains', area: 'investments', title: 'Capital gains',
  description: 'Realised capital gains per financial year: intraday, short term and long term.', input: cgInput,
  async run(ctx, args) {
    const rows = (await getCgByFy({ kind: 'user', userId: ctx.userId })).filter((r) => !args.fy || r.fy === args.fy);
    return {
      rows: rows.length,
      data: { asOf: dmy(ctx.now), owner: 'You', currency: 'INR', years: rows.map((r) => ({ fy: r.fy, intraday: r.intraday, shortTerm: r.stcg, longTerm: r.ltcg, total: r.total })) },
    };
  },
};

const listForex: ConnectorTool<Record<string, never>> = {
  name: 'list_forex', area: 'investments', title: 'Foreign currency',
  description: 'Foreign currency balances.', input: {},
  async run(ctx) {
    const rows = await listForexBalances(ctx.userId);
    return {
      rows: rows.length,
      data: {
        asOf: dmy(ctx.now), owner: 'You',
        balances: rows.map((r) => ({
          currency: r.currency, balance: serializeMoney(r.balance as never), bank: r.bankName ?? null, country: r.country ?? null,
          account: r.accountLast4 ? `XXXX${String(r.accountLast4)}` : null, userText: r.accountLabel ?? null,
        })),
      },
    };
  },
};

export const INVESTMENT_TOOLS = [listPortfoliosTool, listHoldings, listTransactionsTool, getPerformance, getCapitalGains, listForex];
