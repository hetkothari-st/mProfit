import { Prisma } from '@prisma/client';
import type { Portfolio, CommodityType } from '@prisma/client';
import {
  Decimal,
  toDecimal,
  serializeMoney,
  serializeQuantity,
  type Money,
  type Quantity,
} from '@portfolioos/shared';
import type { Transaction } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import { fetchHistorical, buildYahooSymbol } from '../priceFeeds/yahoo.service.js';
import { valuationMethodFor } from './valuationMethod.js';
import { isPriceStale } from './priceStaleness.js';
import {
  getEffectiveScope,
  portfolioReadableWhere,
  type EffectiveScope,
} from './familyScope.service.js';
import { runAsUser } from '../lib/requestContext.js';
import { computePortfolioXirr, computeHoldingXirrs } from './xirr.service.js';

function toPortfolioDTO(p: Portfolio) {
  return {
    id: p.id,
    userId: p.userId,
    familyId: p.familyId,
    clientId: p.clientId,
    name: p.name,
    description: p.description,
    type: p.type,
    currency: p.currency,
    isDefault: p.isDefault,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/**
 * List portfolios visible to the caller, respecting family scope.
 *
 * Personal view (no `familyId`): returns the caller's own portfolios.
 * Family view: returns family-shared portfolios of that family plus the
 * caller's own personal portfolios. When the caller is OWNER, other
 * members' personal portfolios are fetched via `runAsUser` fan-out so
 * the existing single-owner RLS on personal rows keeps holding.
 */
export async function listPortfoliosForScope(
  callerId: string,
  familyId?: string,
) {
  const scope = await getEffectiveScope(callerId, { familyId });
  return listPortfoliosWithScope(scope);
}

/**
 * @deprecated Prefer `listPortfoliosForScope`. Kept for the small number
 * of callers that still pass a bare userId (system jobs, tests).
 */
export async function listPortfolios(userId: string) {
  return listPortfoliosWithScope({
    callerId: userId,
    familyId: null,
    role: null,
    readableUserIds: [userId],
    writableUserIds: [userId],
    readableFamilyIds: [],
    writableFamilyIds: [],
    allowedAssetClasses: null,
    allowedCategories: null,
  });
}

async function listPortfoliosWithScope(scope: EffectiveScope) {
  // OWNER cross-member reads on personal portfolios need to run under
  // each member's user context so the personal-portfolio RLS branch
  // (`userId = current`) permits them. Own personal + all family-shared
  // fit inside a single query as the caller.
  // Family view (any role) reads across all active members via fan-out
  // — the Portfolio RLS policy only permits family-shared reads for
  // members; peer personal portfolios still need runAsUser context.
  const isFamilyView =
    scope.familyId !== null && scope.readableUserIds.length > 1;

  const rows = await (async () => {
    if (!isFamilyView) {
      return prisma.portfolio.findMany({
        where: portfolioReadableWhere(scope),
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        include: {
          _count: { select: { holdingProjections: true, transactions: true } },
        },
      });
    }
    const otherUserIds = scope.readableUserIds.filter((u) => u !== scope.callerId);
    const perMember = await Promise.all(
      otherUserIds.map((uid) =>
        runAsUser(uid, () =>
          prisma.portfolio.findMany({
            where: { userId: uid, familyId: null },
            include: {
              _count: { select: { holdingProjections: true, transactions: true } },
            },
          }),
        ),
      ),
    );
    const own = await prisma.portfolio.findMany({
      where: portfolioReadableWhere(scope),
      include: {
        _count: { select: { holdingProjections: true, transactions: true } },
      },
    });
    const all = [...own, ...perMember.flat()];
    return all.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  })();

  // Aggregate current value per portfolio. Own + family-shared portfolios
  // read in the caller's context (Portfolio RLS permits family via
  // membership). Other members' personal portfolios (OWNER cross-member
  // reads) run under each member's context via runAsUser so the child
  // tables' `p.userId = current` RLS branch still holds.
  const ownContextPortfolioIds: string[] = [];
  const perMemberPortfolios = new Map<string, string[]>();
  for (const p of rows) {
    if (p.userId === scope.callerId || p.familyId !== null) {
      ownContextPortfolioIds.push(p.id);
    } else {
      const bucket = perMemberPortfolios.get(p.userId) ?? [];
      bucket.push(p.id);
      perMemberPortfolios.set(p.userId, bucket);
    }
  }

  const holdingBatches: Array<
    Array<{ portfolioId: string; currentValue: Prisma.Decimal | null; totalCost: Prisma.Decimal }>
  > = [];
  if (ownContextPortfolioIds.length > 0) {
    holdingBatches.push(
      await prisma.holdingProjection.findMany({
        where: { portfolioId: { in: ownContextPortfolioIds } },
        select: { portfolioId: true, currentValue: true, totalCost: true },
      }),
    );
  }
  for (const [memberUserId, ids] of perMemberPortfolios) {
    holdingBatches.push(
      await runAsUser(memberUserId, () =>
        prisma.holdingProjection.findMany({
          where: { portfolioId: { in: ids } },
          select: { portfolioId: true, currentValue: true, totalCost: true },
        }),
      ),
    );
  }

  const valueByPortfolio = new Map<string, Decimal>();
  for (const h of holdingBatches.flat()) {
    const prev = valueByPortfolio.get(h.portfolioId) ?? new Decimal(0);
    const effective = h.currentValue !== null ? toDecimal(h.currentValue) : toDecimal(h.totalCost);
    valueByPortfolio.set(h.portfolioId, prev.plus(effective));
  }

  return rows.map((p) => ({
    ...toPortfolioDTO(p),
    holdingCount: p._count.holdingProjections,
    transactionCount: p._count.transactions,
    currentValue: serializeMoney(valueByPortfolio.get(p.id) ?? new Decimal(0)),
  }));
}

export async function getPortfolio(userId: string, id: string) {
  const p = await ensureReadable(userId, id);
  return toPortfolioDTO(p);
}

async function ensureOwnership(userId: string, id: string) {
  const p = await prisma.portfolio.findUnique({ where: { id } });
  if (!p) throw new NotFoundError('Portfolio not found');
  if (p.userId === userId) return p;
  // Family-shared portfolios: any ACTIVE OWNER (or the CONTRIBUTOR
  // creator, already handled above via userId equality) may manage
  // them. Personal portfolios of another user stay untouchable.
  if (p.familyId) {
    const membership = await prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId: p.familyId, userId } },
      select: { role: true, status: true },
    });
    if (membership?.status === 'ACTIVE' && membership.role === 'OWNER') {
      return p;
    }
  }
  throw new ForbiddenError();
}

/**
 * Permissive ownership check for READ paths. Returns the portfolio if:
 *   - Caller owns it (userId equality), OR
 *   - It's a family-shared portfolio and caller is an ACTIVE member of
 *     that family (any role), OR
 *   - It's a peer PERSONAL portfolio owned by a member of a family the
 *     caller also belongs to (any role, ACTIVE). This is the new
 *     "family view sees everyone's data" semantic.
 *
 * Writes must still route through `ensureOwnership` — this helper is
 * strictly for read-only paths (holdings, summary, valuation, cash-
 * flows, etc.).
 */
export async function ensureReadable(userId: string, id: string) {
  const p = await prisma.portfolio.findUnique({ where: { id } });
  if (!p) throw new NotFoundError('Portfolio not found');
  if (p.userId === userId) return p;

  if (p.familyId) {
    const membership = await prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId: p.familyId, userId } },
      select: { status: true },
    });
    if (membership?.status === 'ACTIVE') return p;
  }

  // Peer personal portfolio: readable if caller shares a family with
  // the portfolio's owner. Confirms via a single join across the
  // FamilyMember table — both rows must be ACTIVE.
  const sharedFamily = await prisma.familyMember.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      family: {
        members: {
          some: { userId: p.userId, status: 'ACTIVE' },
        },
      },
    },
    select: { familyId: true },
  });
  if (sharedFamily) return p;

  throw new ForbiddenError();
}

export async function createPortfolio(
  userId: string,
  input: {
    name: string;
    description?: string;
    type?: Portfolio['type'];
    currency?: string;
    clientId?: string;
    isDefault?: boolean;
  },
) {
  if (input.clientId) {
    const client = await prisma.client.findUnique({ where: { id: input.clientId } });
    if (!client || client.advisorId !== userId) throw new ForbiddenError('Invalid client');
  }

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.portfolio.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }
    const created = await tx.portfolio.create({
      data: {
        userId,
        name: input.name,
        description: input.description,
        type: input.type ?? 'INVESTMENT',
        currency: input.currency ?? 'INR',
        clientId: input.clientId,
        isDefault: input.isDefault ?? false,
      },
    });
    return toPortfolioDTO(created);
  });
}

export async function updatePortfolio(
  userId: string,
  id: string,
  patch: Prisma.PortfolioUpdateInput & { isDefault?: boolean },
) {
  await ensureOwnership(userId, id);
  return prisma.$transaction(async (tx) => {
    if (patch.isDefault === true) {
      await tx.portfolio.updateMany({
        where: { userId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }
    const updated = await tx.portfolio.update({
      where: { id },
      data: patch,
    });
    return toPortfolioDTO(updated);
  });
}

export async function deletePortfolio(userId: string, id: string): Promise<void> {
  await ensureOwnership(userId, id);
  await prisma.portfolio.delete({ where: { id } });
}

/**
 * Given rows ordered `[key asc, date desc]`, returns the latest price and
 * the one immediately before it per key — the "today vs prior close" pair
 * `getPortfolioSummary`'s todaysChange needs for stocks/MF/crypto/commodities.
 * `prevClose: null` means only one price point exists (no day-over-day move
 * computable yet, e.g. a holding priced for the first time today).
 */
export function latestVsPrevious<T, K>(
  rows: T[],
  keyOf: (row: T) => K,
  priceOf: (row: T) => Prisma.Decimal,
): Map<K, { latestClose: Decimal; prevClose: Decimal | null }> {
  const byKey = new Map<K, { latestClose: Decimal; prevClose: Decimal | null }>();
  for (const row of rows) {
    const key = keyOf(row);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { latestClose: toDecimal(priceOf(row)), prevClose: null });
    } else if (existing.prevClose === null) {
      existing.prevClose = toDecimal(priceOf(row));
    }
  }
  return byKey;
}

export async function getPortfolioSummary(userId: string, id: string) {
  const portfolio = await ensureReadable(userId, id);
  // Peer personal portfolios still need runAsUser context so child-table
  // RLS (HoldingProjection/Transaction join Portfolio.userId = current)
  // permits the read — same pattern as getPortfolioHoldings.
  const readCtx = <T>(fn: () => Promise<T>): Promise<T> =>
    portfolio.userId === userId || portfolio.familyId ? fn() : runAsUser(portfolio.userId, fn);

  const [rows, holdingCount, xirrResult] = await readCtx(() =>
    Promise.all([
      prisma.holdingProjection.findMany({
        where: { portfolioId: id },
        select: {
          totalCost: true,
          currentValue: true,
          unrealisedPnL: true,
          quantity: true,
          stockId: true,
          fundId: true,
          isin: true,
          assetClass: true,
        },
      }),
      prisma.holdingProjection.count({ where: { portfolioId: id } }),
      computePortfolioXirr(id),
    ]),
  );

  const holdings = rows.filter((h) => h.stockId);

  const totalInvestment = rows.reduce((s, h) => s.plus(toDecimal(h.totalCost)), new Decimal(0));
  // For assets without a live price (FD, Gold, Bonds, EPF, PPF…) use totalCost
  // as current value — they're worth at least what was invested until repriced.
  const currentValue = rows.reduce((s, h) => {
    const cv = h.currentValue !== null ? toDecimal(h.currentValue) : toDecimal(h.totalCost);
    return s.plus(cv);
  }, new Decimal(0));
  const unrealisedPnL = currentValue.minus(totalInvestment);
  // Pct is dimensionless; float is fine once the numerator/denominator are
  // already exact Decimals.
  const unrealisedPnLPct = totalInvestment.greaterThan(0)
    ? unrealisedPnL.dividedBy(totalInvestment).times(100).toNumber()
    : 0;

  // Day move on market-priced holdings only — stocks, MF (via NAV history),
  // crypto, and physical gold/silver (via commodity spot history). Everything
  // else (FD, bonds, EPF/PPF, etc.) has no daily feed, so it contributes 0 —
  // matches the "Accrual/cost assets have no intraday change" dashboard copy.
  // All three feeds are global market reference data (no per-user RLS), so
  // none of this needs readCtx.
  let todaysChange = new Decimal(0);

  const stockIds = holdings.map((h) => h.stockId!).filter(Boolean);
  if (stockIds.length > 0) {
    const prices = await prisma.stockPrice.findMany({
      where: { stockId: { in: stockIds } },
      orderBy: [{ stockId: 'asc' }, { date: 'desc' }],
    });
    const byStock = latestVsPrevious(prices, (p) => p.stockId, (p) => p.close);
    for (const h of holdings) {
      if (!h.stockId) continue;
      const pair = byStock.get(h.stockId);
      if (!pair || pair.prevClose === null) continue;
      todaysChange = todaysChange.plus(pair.latestClose.minus(pair.prevClose).times(toDecimal(h.quantity)));
    }
  }

  const fundHoldings = rows.filter((h) => h.fundId);
  const fundIds = fundHoldings.map((h) => h.fundId!).filter(Boolean);
  if (fundIds.length > 0) {
    const navs = await prisma.mFNav.findMany({
      where: { fundId: { in: fundIds } },
      orderBy: [{ fundId: 'asc' }, { date: 'desc' }],
    });
    const byFund = latestVsPrevious(navs, (n) => n.fundId, (n) => n.nav);
    for (const h of fundHoldings) {
      const pair = byFund.get(h.fundId!);
      if (!pair || pair.prevClose === null) continue;
      todaysChange = todaysChange.plus(pair.latestClose.minus(pair.prevClose).times(toDecimal(h.quantity)));
    }
  }

  const cryptoHoldings = rows.filter((h) => h.assetClass === 'CRYPTOCURRENCY' && h.isin);
  if (cryptoHoldings.length > 0) {
    const coinGeckoIds = [...new Set(cryptoHoldings.map((h) => h.isin!))];
    const cryptoMasters = await prisma.cryptoMaster.findMany({
      where: { coinGeckoId: { in: coinGeckoIds } },
      select: { id: true, coinGeckoId: true },
    });
    const cryptoIdByCoinGeckoId = new Map(cryptoMasters.map((c) => [c.coinGeckoId, c.id]));
    const cryptoIds = [...cryptoIdByCoinGeckoId.values()];
    if (cryptoIds.length > 0) {
      const prices = await prisma.cryptoPrice.findMany({
        where: { cryptoId: { in: cryptoIds } },
        orderBy: [{ cryptoId: 'asc' }, { date: 'desc' }],
      });
      const byCrypto = latestVsPrevious(prices, (p) => p.cryptoId, (p) => p.priceInr);
      for (const h of cryptoHoldings) {
        const cryptoId = cryptoIdByCoinGeckoId.get(h.isin!);
        const pair = cryptoId ? byCrypto.get(cryptoId) : undefined;
        if (!pair || pair.prevClose === null) continue;
        todaysChange = todaysChange.plus(pair.latestClose.minus(pair.prevClose).times(toDecimal(h.quantity)));
      }
    }
  }

  const commodityByAssetClass: Partial<Record<typeof rows[number]['assetClass'], CommodityType>> = {
    PHYSICAL_GOLD: 'GOLD',
    GOLD_ETF: 'GOLD',
    GOLD_BOND: 'GOLD',
    PHYSICAL_SILVER: 'SILVER',
  };
  const commodityHoldings = rows.filter((h) => commodityByAssetClass[h.assetClass]);
  if (commodityHoldings.length > 0) {
    const commodities = [...new Set(commodityHoldings.map((h) => commodityByAssetClass[h.assetClass]!))];
    const prices = await prisma.commodityPrice.findMany({
      where: { commodity: { in: commodities } },
      orderBy: [{ commodity: 'asc' }, { date: 'desc' }],
    });
    const byCommodity = latestVsPrevious(prices, (p) => p.commodity, (p) => p.price);
    for (const h of commodityHoldings) {
      const commodity = commodityByAssetClass[h.assetClass]!;
      const pair = byCommodity.get(commodity);
      if (!pair || pair.prevClose === null) continue;
      todaysChange = todaysChange.plus(pair.latestClose.minus(pair.prevClose).times(toDecimal(h.quantity)));
    }
  }

  const priorValue = currentValue.minus(todaysChange);
  const todaysChangePct = priorValue.greaterThan(0)
    ? todaysChange.dividedBy(priorValue).times(100).toNumber()
    : 0;

  return {
    id,
    totalInvestment: serializeMoney(totalInvestment),
    currentValue: serializeMoney(currentValue),
    unrealisedPnL: serializeMoney(unrealisedPnL),
    unrealisedPnLPct,
    todaysChange: serializeMoney(todaysChange),
    todaysChangePct,
    // Unreliable (too little history — §xirr.reliability MIN_XIRR_DAYS)
    // surfaces as null rather than an annualized rate that a few days of
    // noise blew out of proportion.
    xirr: xirrResult.reliable ? xirrResult.xirr : null,
    holdingCount,
  };
}

export async function getPortfolioHoldings(userId: string, id: string) {
  const portfolio = await ensureReadable(userId, id);
  // Peer personal portfolios still need runAsUser context so child-
  // table RLS (HoldingProjection joins Portfolio.userId = current)
  // permits the read.
  const readCtx = <T>(fn: () => Promise<T>): Promise<T> =>
    portfolio.userId === userId || portfolio.familyId ? fn() : runAsUser(portfolio.userId, fn);
  const holdings = await readCtx(() =>
    prisma.holdingProjection.findMany({
      where: { portfolioId: id },
      orderBy: { computedAt: 'desc' },
    }),
  );

  // HoldingProjection stores assetName/isin directly — we still need stock
  // symbol / fund schemeCode for display, so batch-fetch those in one round-
  // trip instead of 1+N joins.
  const stockIds = [...new Set(holdings.map((h) => h.stockId).filter((s): s is string => !!s))];
  const fundIds = [...new Set(holdings.map((h) => h.fundId).filter((f): f is string => !!f))];
  const [stocks, funds] = await Promise.all([
    stockIds.length
      ? prisma.stockMaster.findMany({
          where: { id: { in: stockIds } },
          select: { id: true, symbol: true, name: true, isin: true },
        })
      : Promise.resolve([] as Array<{ id: string; symbol: string; name: string; isin: string | null }>),
    fundIds.length
      ? prisma.mutualFundMaster.findMany({
          where: { id: { in: fundIds } },
          select: { id: true, schemeCode: true, schemeName: true, isin: true },
        })
      : Promise.resolve([] as Array<{ id: string; schemeCode: string; schemeName: string; isin: string | null }>),
  ]);
  const stockById = new Map(stocks.map((s) => [s.id, s]));
  const fundById = new Map(funds.map((f) => [f.id, f]));

  // Per-holding XIRR: one extra query for ALL of this portfolio's
  // transactions, then grouped + solved in memory by computeHoldingXirrs —
  // not one `transaction.findMany` per holding. Terminal values reuse the
  // `currentValue`/`totalCost` already on the HoldingProjection rows fetched
  // above instead of re-querying them (that's what `computePortfolioXirr`'s
  // internal `terminalValue()` does, which would reintroduce N+1 here).
  const allTransactions: Transaction[] = await readCtx(() =>
    prisma.transaction.findMany({
      where: { portfolioId: id },
      orderBy: { tradeDate: 'asc' },
    }),
  );
  const terminalValues = new Map(
    holdings.map((h) => [
      h.assetKey,
      h.currentValue !== null ? toDecimal(h.currentValue) : toDecimal(h.totalCost),
    ]),
  );
  const xirrByAssetKey = computeHoldingXirrs(allTransactions, terminalValues);

  return holdings.map((h) => {
    const stock = h.stockId ? stockById.get(h.stockId) ?? null : null;
    const fund = h.fundId ? fundById.get(h.fundId) ?? null : null;
    const assetName = stock?.name ?? fund?.schemeName ?? h.assetName ?? 'Unknown';
    const symbol = stock?.symbol ?? fund?.schemeCode ?? null;
    const isin = h.isin ?? stock?.isin ?? fund?.isin ?? null;
    const totalCost = toDecimal(h.totalCost);
    const unrealisedPnL = h.unrealisedPnL !== null ? toDecimal(h.unrealisedPnL) : null;
    const unrealisedPnLPct =
      unrealisedPnL !== null && totalCost.greaterThan(0)
        ? unrealisedPnL.dividedBy(totalCost).times(100).toNumber()
        : null;
    const xirrForHolding = xirrByAssetKey.get(h.assetKey);

    return {
      id: h.id,
      assetKey: h.assetKey,
      assetClass: h.assetClass,
      assetName,
      symbol,
      isin,
      quantity: serializeQuantity(h.quantity) as Quantity,
      avgCostPrice: serializeMoney(h.avgCostPrice) as Money,
      totalCost: serializeMoney(totalCost) as Money,
      currentPrice: h.currentPrice !== null ? (serializeMoney(h.currentPrice) as Money) : null,
      currentValue: h.currentValue !== null ? (serializeMoney(h.currentValue) as Money) : null,
      unrealisedPnL: unrealisedPnL !== null ? (serializeMoney(unrealisedPnL) as Money) : null,
      unrealisedPnLPct,
      // How currentValue is derived (drives UI labeling): MARKET rows show
      // live P&L + a freshness badge; ACCRUAL rows show "accrued" returns and
      // no daily/MTM delta; PAYOUT/COST rows have no market move.
      valuationMethod: valuationMethodFor(h.assetClass),
      priceAsOf: h.priceAsOf ? h.priceAsOf.toISOString() : null,
      stale: isPriceStale(h.assetClass, h.priceAsOf),
      xirr: xirrForHolding && xirrForHolding.reliable ? xirrForHolding.xirr : null,
      holdingPeriodDays:
        xirrForHolding && xirrForHolding.cashflowCount >= 2 ? xirrForHolding.spanDays : null,
    };
  });
}

export async function getAssetAllocation(userId: string, id: string) {
  const portfolio = await ensureReadable(userId, id);
  const readCtx = <T>(fn: () => Promise<T>): Promise<T> =>
    portfolio.userId === userId || portfolio.familyId ? fn() : runAsUser(portfolio.userId, fn);
  // groupBy + _sum skips NULL currentValue rows — so we fetch all rows and
  // sum in JS using totalCost as fallback for unpriced assets.
  const rows = await readCtx(() =>
    prisma.holdingProjection.findMany({
      where: { portfolioId: id },
      select: { assetClass: true, currentValue: true, totalCost: true },
    }),
  );
  const byClass = new Map<string, { value: Decimal; count: number }>();
  for (const h of rows) {
    const val = h.currentValue !== null ? toDecimal(h.currentValue) : toDecimal(h.totalCost);
    const entry = byClass.get(h.assetClass) ?? { value: new Decimal(0), count: 0 };
    entry.value = entry.value.plus(val);
    entry.count++;
    byClass.set(h.assetClass, entry);
  }
  const total = [...byClass.values()].reduce((s, e) => s.plus(e.value), new Decimal(0));
  return [...byClass.entries()].map(([assetClass, entry]) => ({
    assetClass,
    value: serializeMoney(entry.value) as Money,
    percent: total.greaterThan(0) ? entry.value.dividedBy(total).times(100).toNumber() : 0,
    holdingCount: entry.count,
  }));
}

export async function getHistoricalValuation(
  userId: string,
  id: string,
  days = 365,
) {
  const portfolio = await ensureReadable(userId, id);
  const readCtx = <T>(fn: () => Promise<T>): Promise<T> =>
    portfolio.userId === userId || portfolio.familyId ? fn() : runAsUser(portfolio.userId, fn);

  const todayStr = new Date().toISOString().slice(0, 10);
  const allTransactions = await readCtx(() =>
    prisma.transaction.findMany({
      where: { portfolioId: id },
      orderBy: { tradeDate: 'asc' },
      select: { tradeDate: true, assetKey: true, stockId: true, transactionType: true, quantity: true, netAmount: true },
    }),
  );
  if (allTransactions.length === 0) return [] as Array<{ date: string; value: Money; invested: Money }>;

  const firstTxDate = allTransactions[0]!.tradeDate.toISOString().slice(0, 10);
  const windowStart = days === 0
    ? firstTxDate
    : new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const rangeStart = windowStart < firstTxDate ? firstTxDate : windowStart;

  // Unique stocks held in this portfolio
  const stockIds = [...new Set(allTransactions.map((t) => t.stockId).filter((s): s is string => !!s))];

  // Backfill Yahoo historical prices for stocks that lack data in the window
  if (stockIds.length > 0) {
    const fromDate = new Date(rangeStart);
    const existingCount = await prisma.stockPrice.count({
      where: { stockId: { in: stockIds }, date: { gte: fromDate } },
    });
    // If we have fewer rows than (stocks × days × 0.5), assume we need a backfill
    const minExpected = stockIds.length * days * 0.4;
    if (existingCount < minExpected) {
      const stocks = await prisma.stockMaster.findMany({
        where: { id: { in: stockIds } },
        select: { id: true, symbol: true, exchange: true },
      });
      await Promise.allSettled(
        stocks.map(async (s) => {
          try {
            const bars = await fetchHistorical(s.symbol, s.exchange, fromDate);
            if (bars.length === 0) return;
            await prisma.$transaction(
              bars.map((b) =>
                prisma.stockPrice.upsert({
                  where: { stockId_date: { stockId: s.id, date: b.date } },
                  update: { open: b.open.toString(), high: b.high.toString(), low: b.low.toString(), close: b.close.toString() },
                  create: { stockId: s.id, date: b.date, open: b.open.toString(), high: b.high.toString(), low: b.low.toString(), close: b.close.toString() },
                }),
              ),
            );
          } catch (err) {
            logger.warn({ err, symbol: s.symbol }, '[portfolio] historical backfill failed');
          }
        }),
      );
    }
  }

  // Load prices from DB
  const allPrices = stockIds.length
    ? await prisma.stockPrice.findMany({
        where: { stockId: { in: stockIds } },
        select: { stockId: true, date: true, close: true },
        orderBy: [{ stockId: 'asc' }, { date: 'asc' }],
      })
    : [];
  const pricesByStock = new Map<string, Array<{ d: string; close: Decimal }>>();
  for (const p of allPrices) {
    if (!pricesByStock.has(p.stockId)) pricesByStock.set(p.stockId, []);
    pricesByStock.get(p.stockId)!.push({ d: p.date.toISOString().slice(0, 10), close: toDecimal(p.close) });
  }
  function priceOnOrBefore(stockId: string, dateStr: string): Decimal | null {
    const arr = pricesByStock.get(stockId);
    if (!arr) return null;
    let best: Decimal | null = null;
    for (const p of arr) {
      if (p.d <= dateStr) best = p.close;
      else break;
    }
    return best;
  }

  // Must mirror BUY_TYPES / SELL_TYPES in holdingsProjection.ts so historical
  // replay produces the same per-asset state as the live projection. Notably
  // DEPOSIT (FDs, EPF, insurance, salary slips) is a buy; MATURITY/REDEMPTION/
  // WITHDRAWAL close out positions. Anything else (DIVIDEND_PAYOUT,
  // INTEREST_RECEIVED, SPLIT) is handled below or ignored for valuation.
  const BUY_TYPES = new Set([
    'BUY','SIP','SWITCH_IN','BONUS','OPENING_BALANCE','DIVIDEND_REINVEST',
    'MERGER_IN','DEMERGER_IN','RIGHTS_ISSUE','DEPOSIT',
  ]);
  const SELL_TYPES = new Set([
    'SELL','SWITCH_OUT','MERGER_OUT','DEMERGER_OUT','REDEMPTION','MATURITY','WITHDRAWAL',
  ]);

  type HoldingState = { qty: Decimal; cost: Decimal; stockId: string | null };

  function applyTx(state: Map<string, HoldingState>, tx: typeof allTransactions[number]): void {
    const d = tx.tradeDate.toISOString().slice(0, 10);
    const key = tx.assetKey ?? `_${tx.stockId ?? d}`;
    const qty = toDecimal(tx.quantity);
    const net = toDecimal(tx.netAmount);
    const h = state.get(key) ?? { qty: new Decimal(0), cost: new Decimal(0), stockId: tx.stockId };

    if (BUY_TYPES.has(tx.transactionType)) {
      if (tx.transactionType === 'BONUS') {
        h.qty = h.qty.plus(qty);
      } else {
        h.qty = h.qty.plus(qty);
        h.cost = h.cost.plus(net);
        invested = invested.plus(net);
      }
    } else if (SELL_TYPES.has(tx.transactionType)) {
      if (h.qty.isZero()) {
        // Position already closed; matched cost basis already removed. Ignore.
        state.set(key, h);
        return;
      }
      const sellQty = Decimal.min(qty, h.qty);
      const avgCost = h.cost.dividedBy(h.qty);
      const costSold = avgCost.times(sellQty);
      h.qty = h.qty.minus(sellQty);
      h.cost = h.cost.minus(costSold);
      if (h.qty.isZero() || h.qty.isNegative()) {
        h.qty = new Decimal(0);
        h.cost = new Decimal(0);
      }
    } else if (tx.transactionType === 'SPLIT') {
      // SPLIT rows carry post-split delta-quantity; cost unchanged.
      h.qty = h.qty.plus(qty);
    }
    // DIVIDEND_PAYOUT / INTEREST_RECEIVED don't affect qty/cost.

    state.set(key, h);
  }

  // Apply all transactions up to windowStart to get the starting state
  const state = new Map<string, HoldingState>();
  let invested = new Decimal(0);
  const byDate = new Map<string, typeof allTransactions>();
  for (const tx of allTransactions) {
    const d = tx.tradeDate.toISOString().slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(tx);
  }

  // Apply transactions STRICTLY before window start as the opening baseline.
  // Transactions on rangeStart itself get applied below in the per-day loop;
  // applying them here too would double-count (invested 2×, state inflated).
  for (const [d, txns] of [...byDate.entries()].sort()) {
    if (d >= rangeStart) break;
    for (const tx of txns) applyTx(state, tx);
  }

  // Generate daily samples from rangeStart to today
  function portfolioValueOn(dateStr: string): Decimal {
    let v = new Decimal(0);
    for (const h of state.values()) {
      // Skip truly closed positions (both qty and cost zero). For non-tradable
      // assets (FDs, insurance, real estate) qty may be 0 with cost > 0, or
      // qty equals principal — either way `cost` carries the invested value
      // and `priceOnOrBefore` will return null since stockId is null.
      if (h.qty.lte(0) && h.cost.lte(0)) continue;
      const price = h.stockId && h.qty.gt(0) ? priceOnOrBefore(h.stockId, dateStr) : null;
      v = v.plus(price ? h.qty.times(price) : h.cost);
    }
    return v;
  }

  const points: Array<{ date: string; value: Money; invested: Money }> = [];
  const cursor = new Date(rangeStart + 'T00:00:00Z');
  const end = new Date(todayStr + 'T00:00:00Z');

  while (cursor <= end) {
    const d = cursor.toISOString().slice(0, 10);

    // Apply any transactions on this date
    for (const tx of byDate.get(d) ?? []) applyTx(state, tx);

    const value = portfolioValueOn(d);
    // Only emit if we have a meaningful value (skip zero-value pre-investment days)
    if (value.greaterThan(0) || invested.greaterThan(0)) {
      points.push({
        date: d,
        value: serializeMoney(value) as Money,
        invested: serializeMoney(invested) as Money,
      });
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Overlay today's point with live HoldingProjection market value (most
  // accurate snapshot — picks up intraday price moves the historical
  // StockPrice table hasn't seen yet). Critically, do NOT replace `invested`
  // from HoldingProjection.totalCost: that field is the cost basis of
  // remaining holdings (drops on every SELL), while `invested` here means
  // cumulative gross outflow. Conflating them caused the chart to "drop to
  // zero" after the last sell. Reuse the prior cumulative `invested` instead.
  if (points.length > 0) {
    const projections = await prisma.holdingProjection.findMany({
      where: { portfolioId: id },
      select: { currentValue: true, totalCost: true },
    });
    const liveValue = projections.reduce(
      (s, h) => s.plus(toDecimal(h.currentValue ?? h.totalCost)),
      new Decimal(0),
    );
    const last = points[points.length - 1]!;
    if (last.date === todayStr) {
      // Keep last.invested (cumulative); refresh only value.
      points[points.length - 1] = {
        date: todayStr,
        value: serializeMoney(liveValue) as Money,
        invested: last.invested,
      };
    } else if (liveValue.greaterThan(0)) {
      // Append today using the carried-forward cumulative `invested`.
      points.push({
        date: todayStr,
        value: serializeMoney(liveValue) as Money,
        invested: last.invested,
      });
    }
  }

  return points;
}

export async function getCashFlows(userId: string, id: string) {
  const portfolio = await ensureReadable(userId, id);
  const readCtx = <T>(fn: () => Promise<T>): Promise<T> =>
    portfolio.userId === userId || portfolio.familyId ? fn() : runAsUser(portfolio.userId, fn);
  const flows = await readCtx(() =>
    prisma.cashFlow.findMany({
      where: { portfolioId: id },
      orderBy: { date: 'asc' },
    }),
  );
  return flows.map((f) => ({
    id: f.id,
    date: f.date.toISOString().slice(0, 10),
    type: f.type,
    amount: serializeMoney(f.amount) as Money,
    description: f.description,
  }));
}
