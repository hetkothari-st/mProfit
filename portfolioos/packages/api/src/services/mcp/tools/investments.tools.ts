import { z } from 'zod';
import { serializeMoney, toDecimal } from '@everypaisa/shared';
import { getPortfolioHoldings } from '../../portfolio.service.js';
import { listTransactions } from '../../transaction.service.js';
import { getAllocationByClass, getAssetClassXirr, getCgByFy, getKpis, type AnalyticsScope } from '../../analytics.service.js';
import { listForexBalances } from '../../forex.service.js';
import { MAX_ROWS, ToolUserError, type ConnectorTool } from './types.js';
import { dmy, hasClientBooks, ownPortfolios, parseDateArg, pct } from './common.js';

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
  partialCaps: true,
  async run(ctx, args) {
    const capped = ctx.person?.caps.assetClasses ?? null;
    const { ids } = await scopeFor(ctx.userId, args.portfolioId);
    const own = await ownPortfolios(ctx.userId);
    const nameOf = new Map(own.map((p) => [p.id, p.name]));
    const rows: Record<string, unknown>[] = [];
    for (const id of ids) {
      for (const h of await getPortfolioHoldings(ctx.userId, id)) {
        if (args.assetClass && h.assetClass !== args.assetClass) continue;
        if (capped && !capped.includes(h.assetClass as never)) continue;
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
  partialCaps: true,
  async run(ctx, args) {
    const capped = ctx.person?.caps.assetClasses ?? null;
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
    const items = r.items.filter((t) => nameOf.has(t.portfolioId) && (!capped || capped.includes(t.assetClass as never)));
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
    if (!args.portfolioId && (await hasClientBooks(ctx.userId))) return ownBooksPerformance(ctx.userId, ctx.now);
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

type Dec = ReturnType<typeof toDecimal>;

/**
 * Performance when the user also keeps CA client books (whose money the
 * user-level analytics include): money totals and allocation are summed over
 * the user's own portfolios. A combined XIRR cannot be summed, so it is left
 * out and per-portfolio XIRR is given instead.
 */
async function ownBooksPerformance(userId: string, now: Date) {
  const own = await ownPortfolios(userId);
  const t = { invested: toDecimal('0'), currentValue: toDecimal('0'), unrealised: toDecimal('0'), realised: toDecimal('0'), income: toDecimal('0') };
  const alloc = new Map<string, Dec>();
  const perPortfolio: Record<string, unknown>[] = [];
  for (const p of own) {
    const scope: AnalyticsScope = { kind: 'portfolio', portfolioId: p.id };
    const [k, slices] = await Promise.all([getKpis(scope), getAllocationByClass(scope)]);
    t.invested = t.invested.plus(toDecimal(k.totalCost));
    t.currentValue = t.currentValue.plus(toDecimal(k.currentValue));
    t.unrealised = t.unrealised.plus(toDecimal(k.unrealisedPnL));
    t.realised = t.realised.plus(toDecimal(k.realisedYtd));
    t.income = t.income.plus(toDecimal(k.incomeYtd));
    for (const s of slices) alloc.set(s.label, (alloc.get(s.label) ?? toDecimal('0')).plus(toDecimal(s.value)));
    perPortfolio.push({ portfolio: p.name, xirrPct: pct(k.xirrOverall), invested: k.totalCost, currentValue: k.currentValue });
  }
  const total = [...alloc.values()].reduce((s, v) => s.plus(v), toDecimal('0'));
  return {
    rows: own.length,
    data: {
      asOf: dmy(now), owner: 'You', currency: 'INR',
      xirrPct: null, xirr1yPct: null, xirr3yPct: null, xirr5yPct: null, xirrReliable: false,
      xirrNote: 'A combined XIRR is not available for this account; see xirrPct per portfolio.',
      invested: serializeMoney(t.invested), currentValue: serializeMoney(t.currentValue), unrealisedGain: serializeMoney(t.unrealised),
      realisedThisFy: serializeMoney(t.realised), incomeThisFy: serializeMoney(t.income),
      allocation: [...alloc.entries()].map(([label, v]) => ({
        assetClass: label, value: serializeMoney(v), pct: total.isZero() ? '0.00' : v.dividedBy(total).times(100).toFixed(2),
      })),
      byPortfolio: perPortfolio,
    },
  };
}

/** Capital gains per FY from the user's own portfolios only (CA client books excluded). */
async function ownCgByFy(userId: string) {
  if (!(await hasClientBooks(userId))) return getCgByFy({ kind: 'user', userId });
  const byFy = new Map<string, { intraday: Dec; stcg: Dec; ltcg: Dec }>();
  for (const p of await ownPortfolios(userId)) {
    for (const r of await getCgByFy({ kind: 'portfolio', portfolioId: p.id })) {
      const cur = byFy.get(r.fy) ?? { intraday: toDecimal('0'), stcg: toDecimal('0'), ltcg: toDecimal('0') };
      byFy.set(r.fy, { intraday: cur.intraday.plus(toDecimal(r.intraday)), stcg: cur.stcg.plus(toDecimal(r.stcg)), ltcg: cur.ltcg.plus(toDecimal(r.ltcg)) });
    }
  }
  return [...byFy.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fy, v]) => ({
    fy, intraday: serializeMoney(v.intraday), stcg: serializeMoney(v.stcg), ltcg: serializeMoney(v.ltcg),
    total: serializeMoney(v.intraday.plus(v.stcg).plus(v.ltcg)),
  }));
}

const cgInput = { fy: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Indian financial year, e.g. 2025-26') };
const getCapitalGains: ConnectorTool<typeof cgInput> = {
  name: 'get_capital_gains', area: 'investments', title: 'Capital gains',
  description: 'Realised capital gains per financial year: intraday, short term and long term.', input: cgInput,
  async run(ctx, args) {
    const rows = (await ownCgByFy(ctx.userId)).filter((r) => !args.fy || r.fy === args.fy);
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
