import { Decimal } from 'decimal.js';
import type { Money, Quantity } from '@portfolioos/shared';
import type { AssetClass, Exchange, Prisma, TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { ensureStockMaster, ensureMutualFundMaster, resolveMutualFundId } from './masterData.service.js';
import { recomputeForAsset } from './holdingsProjection.js';
import { computeAssetKey, extractUnderlyingFromAssetName } from './assetKey.js';
import { naturalKeyHash } from './sourceHash.js';
import { persistCapitalGainsForAsset } from './capitalGains.service.js';
import { updateStockPricesFromYahoo } from '../priceFeeds/yahoo.service.js';
import { refreshAllHoldingPrices } from './holdings.service.js';

export interface CreateTransactionInput {
  portfolioId: string;
  transactionType: TransactionType;
  assetClass: AssetClass;

  stockSymbol?: string;
  stockName?: string;
  exchange?: Exchange;

  schemeCode?: string;
  schemeName?: string;
  amcName?: string;

  assetName?: string;
  isin?: string;

  tradeDate: string;
  settlementDate?: string;
  quantity: number | string;
  price: number | string;

  brokerage?: number | string;
  stt?: number | string;
  stampDuty?: number | string;
  exchangeCharges?: number | string;
  gst?: number | string;
  sebiCharges?: number | string;
  otherCharges?: number | string;

  strikePrice?: number | string;
  expiryDate?: string;
  optionType?: 'CALL' | 'PUT';
  lotSize?: number;

  maturityDate?: string;
  interestRate?: number | string;
  interestFrequency?: string;

  broker?: string;
  orderNo?: string;
  tradeNo?: string;
  narration?: string;

  // Ingestion lineage + idempotency (§3.3, §3.4, §4.5). Callers that already
  // computed a deterministic key (e.g. the importer's file-hash path) pass it
  // here; otherwise createTransaction derives one from (broker, orderNo,
  // tradeNo) when those are present.
  sourceAdapter?: string;
  sourceAdapterVer?: string;
  sourceHash?: string;

  // Forex: trade-time currency snapshot for non-INR transactions. `currency`
  // null/undefined → INR (backward compat). `fxRateAtTrade` is the base→INR
  // rate frozen at tradeDate (Rule 115); `inrEquivalent` is the INR value of
  // grossAmount and is used when projecting into HoldingProjection.
  currency?: string;
  fxRateAtTrade?: number | string;
  inrEquivalent?: number | string;
}

function d(v: number | string | undefined | null, fallback = 0): Decimal {
  if (v === undefined || v === null || v === '') return new Decimal(fallback);
  return new Decimal(v);
}

function toDateOnly(str: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) throw new BadRequestError(`Invalid date: ${str}`);
  return new Date(`${str}T00:00:00.000Z`);
}

async function assertPortfolio(userId: string, portfolioId: string) {
  const p = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
  if (!p) throw new NotFoundError('Portfolio not found');
  if (p.userId !== userId) throw new ForbiddenError();
  return p;
}

async function resolveAssetRefs(
  input: CreateTransactionInput,
): Promise<{ stockId: string | null; fundId: string | null; assetName: string | null; isin: string | null }> {
  const isStock = ['EQUITY', 'FUTURES', 'OPTIONS', 'ETF', 'FOREIGN_EQUITY'].includes(input.assetClass);
  const isFund = input.assetClass === 'MUTUAL_FUND';

  if (isStock && input.stockSymbol) {
    // Foreign equity defaults to NASDAQ when no exchange supplied — keeps
    // domestic exchange (NSE) for everything else. Exchange enum exposes
    // NSE/BSE/MCX/NFO/BFO today; foreign exchanges still pass through as
    // strings via Prisma so the symbol lookup works even if the enum lacks
    // a NASDAQ value (we surface symbol+name; price feed runs via Yahoo).
    const exchange = input.exchange ?? (input.assetClass === 'FOREIGN_EQUITY' ? 'NASDAQ' : 'NSE');
    const stock = await ensureStockMaster({
      symbol: input.stockSymbol,
      exchange,
      name: input.stockName,
      isin: input.isin,
    });
    return { stockId: stock.id, fundId: null, assetName: stock.name, isin: stock.isin ?? input.isin ?? null };
  }

  if (isFund) {
    const fundId = await resolveMutualFundId({
      schemeCode: input.schemeCode,
      isin: input.isin,
      schemeName: input.schemeName || input.assetName
    });

    if (fundId) {
      const fund = await prisma.mutualFundMaster.findUnique({ where: { id: fundId } });
      if (fund) {
        return { stockId: null, fundId: fund.id, assetName: fund.schemeName, isin: fund.isin ?? input.isin ?? null };
      }
    }
  }

  if (!input.assetName && !input.schemeName && !input.stockSymbol) {
    throw new BadRequestError('Asset name or symbol is required');
  }
  return { stockId: null, fundId: null, assetName: input.schemeName || input.assetName || null, isin: input.isin ?? null };
}

function computeGrossAndNet(
  input: CreateTransactionInput,
): { gross: Decimal; charges: Decimal; net: Decimal } {
  const qty = d(input.quantity);
  const price = d(input.price);
  const gross = qty.times(price);

  const charges = d(input.brokerage)
    .plus(d(input.stt))
    .plus(d(input.stampDuty))
    .plus(d(input.exchangeCharges))
    .plus(d(input.gst))
    .plus(d(input.sebiCharges))
    .plus(d(input.otherCharges));

  const isBuyish = [
    'BUY',
    'SWITCH_IN',
    'SIP',
    'DIVIDEND_REINVEST',
    'RIGHTS_ISSUE',
    'BONUS',
    'OPENING_BALANCE',
    'MERGER_IN',
    'DEMERGER_IN',
  ].includes(input.transactionType);
  const net = isBuyish ? gross.plus(charges) : gross.minus(charges);
  return { gross, charges, net };
}

function deriveSourceHash(userId: string, input: CreateTransactionInput): string | null {
  if (input.sourceHash) return input.sourceHash;
  if (input.broker && input.orderNo && input.tradeNo) {
    return naturalKeyHash({
      userId,
      broker: input.broker,
      orderNo: input.orderNo,
      tradeNo: input.tradeNo,
    });
  }
  return null;
}

export async function createTransaction(userId: string, input: CreateTransactionInput) {
  await assertPortfolio(userId, input.portfolioId);

  const qty = d(input.quantity);
  const price = d(input.price);
  if (qty.lte(0)) throw new BadRequestError('Quantity must be > 0');
  if (price.lt(0)) throw new BadRequestError('Price cannot be negative');

  // Idempotency gate: if the caller can identify this event deterministically
  // (either an explicit hash or a broker-provided natural key) and we've
  // already ingested it, silently return the existing row. Manual entries
  // without any source tracking have sourceHash=NULL and are exempted from
  // dedup — we can't tell a double-click from two genuine trades.
  const sourceHash = deriveSourceHash(userId, input);
  if (sourceHash) {
    const existing = await prisma.transaction.findUnique({ where: { sourceHash } });
    if (existing) return toTransactionDTO(existing);
  }

  const refs = await resolveAssetRefs(input);
  const { gross, net } = computeGrossAndNet(input);
  // F&O assetKey requires underlying + type + strike + expiry. For
  // FUTURES/OPTIONS we derive these from the input (stockSymbol or
  // stockName as the underlying source). Falls through to equity scheme
  // for everything else.
  const isFno = input.assetClass === 'FUTURES' || input.assetClass === 'OPTIONS';
  const assetKey = isFno && input.expiryDate
    ? computeAssetKey({
        foUnderlying:
          input.stockSymbol ??
          extractUnderlyingFromAssetName(input.assetName) ??
          input.assetName ??
          'UNKNOWN',
        foInstrumentType:
          input.assetClass === 'FUTURES' ? 'FUTURES' : input.optionType ?? 'CALL',
        foStrikePrice: input.strikePrice ? String(input.strikePrice) : null,
        foExpiryDate: input.expiryDate,
      })
    : computeAssetKey(refs);

  const data: Prisma.TransactionUncheckedCreateInput = {
    portfolioId: input.portfolioId,
    assetClass: input.assetClass,
    transactionType: input.transactionType,
    stockId: refs.stockId,
    fundId: refs.fundId,
    assetName: refs.assetName,
    isin: refs.isin,
    assetKey,
    tradeDate: toDateOnly(input.tradeDate),
    settlementDate: input.settlementDate ? toDateOnly(input.settlementDate) : null,
    quantity: qty.toString(),
    price: price.toString(),
    grossAmount: gross.toString(),
    brokerage: d(input.brokerage).toString(),
    stt: d(input.stt).toString(),
    stampDuty: d(input.stampDuty).toString(),
    exchangeCharges: d(input.exchangeCharges).toString(),
    gst: d(input.gst).toString(),
    sebiCharges: d(input.sebiCharges).toString(),
    otherCharges: d(input.otherCharges).toString(),
    netAmount: net.toString(),
    strikePrice: input.strikePrice ? d(input.strikePrice).toString() : null,
    expiryDate: input.expiryDate ? toDateOnly(input.expiryDate) : null,
    optionType: input.optionType ?? null,
    lotSize: input.lotSize ?? null,
    maturityDate: input.maturityDate ? toDateOnly(input.maturityDate) : null,
    interestRate: input.interestRate ? d(input.interestRate).toString() : null,
    interestFrequency: input.interestFrequency ?? null,
    broker: input.broker ?? null,
    exchange: input.exchange ?? null,
    orderNo: input.orderNo ?? null,
    tradeNo: input.tradeNo ?? null,
    narration: input.narration ?? null,
    sourceAdapter: input.sourceAdapter ?? null,
    sourceAdapterVer: input.sourceAdapterVer ?? null,
    sourceHash: sourceHash,
    currency: input.currency ? input.currency.toUpperCase() : null,
    fxRateAtTrade: input.fxRateAtTrade ? d(input.fxRateAtTrade).toString() : null,
    inrEquivalent: input.inrEquivalent ? d(input.inrEquivalent).toString() : null,
  };

  const tx = await prisma.transaction.create({ data });

  await recomputeForAsset(tx.portfolioId, assetKey);

  // Fire-and-forget price refresh so the new holding's current value shows
  // immediately without the user having to click "Refresh".
  const priceable = ['EQUITY', 'ETF', 'MUTUAL_FUND', 'FOREIGN_EQUITY'] as AssetClass[];
  if (priceable.includes(input.assetClass)) {
    updateStockPricesFromYahoo({ onlyHeld: true })
      .then(() => refreshAllHoldingPrices())
      .catch((err) => logger.warn({ err }, '[transaction] background price refresh failed'));
  }

  return toTransactionDTO(tx);
}

export async function updateTransaction(
  userId: string,
  id: string,
  input: Partial<CreateTransactionInput>,
) {
  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Transaction not found');
  await assertPortfolio(userId, existing.portfolioId);

  const targetPortfolioId = input.portfolioId ?? existing.portfolioId;
  if (input.portfolioId && input.portfolioId !== existing.portfolioId) {
    await assertPortfolio(userId, input.portfolioId);
  }

  const merged: CreateTransactionInput = {
    portfolioId: targetPortfolioId,
    assetClass: input.assetClass ?? existing.assetClass,
    transactionType: input.transactionType ?? existing.transactionType,
    tradeDate: input.tradeDate ?? existing.tradeDate.toISOString().slice(0, 10),
    settlementDate:
      input.settlementDate ??
      (existing.settlementDate ? existing.settlementDate.toISOString().slice(0, 10) : undefined),
    quantity: input.quantity ?? existing.quantity.toString(),
    price: input.price ?? existing.price.toString(),

    stockSymbol: input.stockSymbol,
    stockName: input.stockName,
    exchange: input.exchange ?? existing.exchange ?? undefined,
    schemeCode: input.schemeCode,
    schemeName: input.schemeName,
    amcName: input.amcName,
    assetName: input.assetName ?? existing.assetName ?? undefined,
    isin: input.isin ?? existing.isin ?? undefined,

    brokerage: input.brokerage ?? existing.brokerage.toString(),
    stt: input.stt ?? existing.stt.toString(),
    stampDuty: input.stampDuty ?? existing.stampDuty.toString(),
    exchangeCharges: input.exchangeCharges ?? existing.exchangeCharges.toString(),
    gst: input.gst ?? existing.gst.toString(),
    sebiCharges: input.sebiCharges ?? existing.sebiCharges.toString(),
    otherCharges: input.otherCharges ?? existing.otherCharges.toString(),

    strikePrice:
      input.strikePrice ?? (existing.strikePrice ? existing.strikePrice.toString() : undefined),
    expiryDate:
      input.expiryDate ??
      (existing.expiryDate ? existing.expiryDate.toISOString().slice(0, 10) : undefined),
    optionType: input.optionType ?? existing.optionType ?? undefined,
    lotSize: input.lotSize ?? existing.lotSize ?? undefined,
    maturityDate:
      input.maturityDate ??
      (existing.maturityDate ? existing.maturityDate.toISOString().slice(0, 10) : undefined),
    interestRate:
      input.interestRate ??
      (existing.interestRate ? existing.interestRate.toString() : undefined),
    interestFrequency: input.interestFrequency ?? existing.interestFrequency ?? undefined,

    broker: input.broker ?? existing.broker ?? undefined,
    orderNo: input.orderNo ?? existing.orderNo ?? undefined,
    tradeNo: input.tradeNo ?? existing.tradeNo ?? undefined,
    narration: input.narration ?? existing.narration ?? undefined,

    // Forex carry-through. existing.currency/fxRateAtTrade may be null for
    // legacy INR rows; preserve null unless caller overrides.
    currency: input.currency ?? (existing as { currency?: string | null }).currency ?? undefined,
    fxRateAtTrade:
      input.fxRateAtTrade ??
      ((existing as { fxRateAtTrade?: { toString(): string } | null }).fxRateAtTrade
        ? (existing as { fxRateAtTrade: { toString(): string } }).fxRateAtTrade.toString()
        : undefined),
    inrEquivalent:
      input.inrEquivalent ??
      ((existing as { inrEquivalent?: { toString(): string } | null }).inrEquivalent
        ? (existing as { inrEquivalent: { toString(): string } }).inrEquivalent.toString()
        : undefined),
  };

  const qty = d(merged.quantity);
  const price = d(merged.price);
  if (qty.lte(0)) throw new BadRequestError('Quantity must be > 0');
  if (price.lt(0)) throw new BadRequestError('Price cannot be negative');

  // Re-resolve asset refs so changes to assetName/isin/symbol propagate to
  // stockId/fundId and the computed assetKey.
  const refs = await resolveAssetRefs(merged);
  const { gross, net } = computeGrossAndNet(merged);

  const isFno = merged.assetClass === 'FUTURES' || merged.assetClass === 'OPTIONS';
  const newAssetKey =
    isFno && merged.expiryDate
      ? computeAssetKey({
          foUnderlying:
            merged.stockSymbol ??
            extractUnderlyingFromAssetName(merged.assetName) ??
            merged.assetName ??
            'UNKNOWN',
          foInstrumentType:
            merged.assetClass === 'FUTURES' ? 'FUTURES' : merged.optionType ?? 'CALL',
          foStrikePrice: merged.strikePrice ? String(merged.strikePrice) : null,
          foExpiryDate: merged.expiryDate,
        })
      : computeAssetKey(refs);

  const patch: Prisma.TransactionUncheckedUpdateInput = {
    portfolioId: targetPortfolioId,
    transactionType: merged.transactionType,
    assetClass: merged.assetClass,
    stockId: refs.stockId,
    fundId: refs.fundId,
    assetName: refs.assetName,
    isin: refs.isin,
    assetKey: newAssetKey,
    tradeDate: toDateOnly(merged.tradeDate),
    settlementDate: merged.settlementDate ? toDateOnly(merged.settlementDate) : null,
    quantity: qty.toString(),
    price: price.toString(),
    grossAmount: gross.toString(),
    brokerage: d(merged.brokerage).toString(),
    stt: d(merged.stt).toString(),
    stampDuty: d(merged.stampDuty).toString(),
    exchangeCharges: d(merged.exchangeCharges).toString(),
    gst: d(merged.gst).toString(),
    sebiCharges: d(merged.sebiCharges).toString(),
    otherCharges: d(merged.otherCharges).toString(),
    netAmount: net.toString(),
    strikePrice: merged.strikePrice ? d(merged.strikePrice).toString() : null,
    expiryDate: merged.expiryDate ? toDateOnly(merged.expiryDate) : null,
    optionType: merged.optionType ?? null,
    lotSize: merged.lotSize ?? null,
    maturityDate: merged.maturityDate ? toDateOnly(merged.maturityDate) : null,
    interestRate: merged.interestRate ? d(merged.interestRate).toString() : null,
    interestFrequency: merged.interestFrequency ?? null,
    exchange: merged.exchange ?? null,
    broker: merged.broker ?? null,
    orderNo: merged.orderNo ?? null,
    tradeNo: merged.tradeNo ?? null,
    narration: merged.narration ?? null,
    currency: merged.currency ? merged.currency.toUpperCase() : null,
    fxRateAtTrade: merged.fxRateAtTrade ? d(merged.fxRateAtTrade).toString() : null,
    inrEquivalent: merged.inrEquivalent ? d(merged.inrEquivalent).toString() : null,
  };

  const updated = await prisma.transaction.update({ where: { id }, data: patch });

  const oldAssetKey =
    existing.assetKey ??
    computeAssetKey({
      stockId: existing.stockId,
      fundId: existing.fundId,
      isin: existing.isin,
      assetName: existing.assetName,
    });
  const movedAsset = oldAssetKey !== newAssetKey;
  const movedPortfolio = existing.portfolioId !== updated.portfolioId;
  if (movedAsset || movedPortfolio) {
    // Old (portfolio, assetKey) bucket lost a row → recompute so its
    // projection + capital-gains drop the moved transaction. §5.1 task 10.
    await recomputeForAsset(existing.portfolioId, oldAssetKey);
    await persistCapitalGainsForAsset(existing.portfolioId, oldAssetKey);
  }
  await recomputeForAsset(updated.portfolioId, newAssetKey);
  await persistCapitalGainsForAsset(updated.portfolioId, newAssetKey);

  return toTransactionDTO(updated);
}

export async function deleteTransaction(userId: string, id: string): Promise<void> {
  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Transaction not found');
  await assertPortfolio(userId, existing.portfolioId);

  await prisma.transaction.delete({ where: { id } });

  const assetKey =
    existing.assetKey ??
    computeAssetKey({
      stockId: existing.stockId,
      fundId: existing.fundId,
      isin: existing.isin,
      assetName: existing.assetName,
    });
  await recomputeForAsset(existing.portfolioId, assetKey);
  // Cascade FIFO recompute. onDelete:Cascade wipes CGs tied via
  // sellTransactionId, but CGs referencing this row via the bare-string
  // buyTransactionId would dangle without this — §5.1 task 10 / BUG-004.
  await persistCapitalGainsForAsset(existing.portfolioId, assetKey);
}

export async function getTransaction(userId: string, id: string) {
  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: {
      stock: { select: { symbol: true, name: true, isin: true, exchange: true } },
      fund: { select: { schemeCode: true, schemeName: true, amcName: true, isin: true } },
      photos: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!tx) throw new NotFoundError('Transaction not found');
  await assertPortfolio(userId, tx.portfolioId);
  return toTransactionDTO(tx);
}

export interface ListTransactionsQuery {
  portfolioId?: string;
  assetClass?: AssetClass;
  transactionType?: TransactionType;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function listTransactions(userId: string, q: ListTransactionsQuery) {
  const where: Prisma.TransactionWhereInput = {
    portfolio: { userId },
  };
  if (q.portfolioId) where.portfolioId = q.portfolioId;
  if (q.assetClass) where.assetClass = q.assetClass;
  if (q.transactionType) where.transactionType = q.transactionType;
  if (q.from || q.to) {
    where.tradeDate = {};
    if (q.from) (where.tradeDate as any).gte = toDateOnly(q.from);
    if (q.to) (where.tradeDate as any).lte = toDateOnly(q.to);
  }

  const page = q.page && q.page > 0 ? q.page : 1;
  const pageSize = q.pageSize && q.pageSize > 0 ? Math.min(q.pageSize, 200) : 50;
  const skip = (page - 1) * pageSize;

  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: [{ tradeDate: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: pageSize,
      include: {
        stock: { select: { symbol: true, name: true, isin: true, exchange: true } },
        fund: { select: { schemeCode: true, schemeName: true, amcName: true, isin: true } },
        photos: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true }, orderBy: { createdAt: 'asc' } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    items: rows.map(toTransactionDTO),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

type TransactionWithRefs = Prisma.TransactionGetPayload<{
  include: {
    stock: { select: { symbol: true; name: true; isin: true; exchange: true } };
    fund: { select: { schemeCode: true; schemeName: true; amcName: true; isin: true } };
  };
}>;

export function toTransactionDTO(tx: TransactionWithRefs | Prisma.TransactionGetPayload<Record<string, never>>) {
  const anyTx = tx as any;
  return {
    id: tx.id,
    portfolioId: tx.portfolioId,
    assetClass: tx.assetClass,
    transactionType: tx.transactionType,
    stockId: tx.stockId,
    fundId: tx.fundId,
    assetName: anyTx.stock?.name ?? anyTx.fund?.schemeName ?? tx.assetName ?? null,
    symbol: anyTx.stock?.symbol ?? null,
    schemeCode: anyTx.fund?.schemeCode ?? null,
    amcName: anyTx.fund?.amcName ?? null,
    isin: tx.isin,
    exchange: tx.exchange,
    tradeDate: tx.tradeDate.toISOString().slice(0, 10),
    settlementDate: tx.settlementDate ? tx.settlementDate.toISOString().slice(0, 10) : null,
    // Money + quantity fields leave as strings (§3.2). Prisma's Decimal
    // has a stable .toString() with full precision; we forward that.
    quantity: tx.quantity.toString() as Quantity,
    price: tx.price.toString() as Money,
    grossAmount: tx.grossAmount.toString() as Money,
    brokerage: tx.brokerage.toString() as Money,
    stt: tx.stt.toString() as Money,
    stampDuty: tx.stampDuty.toString() as Money,
    exchangeCharges: tx.exchangeCharges.toString() as Money,
    gst: tx.gst.toString() as Money,
    sebiCharges: tx.sebiCharges.toString() as Money,
    otherCharges: tx.otherCharges.toString() as Money,
    netAmount: tx.netAmount.toString() as Money,
    strikePrice: tx.strikePrice ? (tx.strikePrice.toString() as Money) : null,
    expiryDate: tx.expiryDate ? tx.expiryDate.toISOString().slice(0, 10) : null,
    optionType: tx.optionType,
    lotSize: tx.lotSize,
    maturityDate: tx.maturityDate ? tx.maturityDate.toISOString().slice(0, 10) : null,
    interestRate: tx.interestRate ? tx.interestRate.toString() : null,
    interestFrequency: tx.interestFrequency,
    broker: tx.broker,
    orderNo: tx.orderNo,
    tradeNo: tx.tradeNo,
    narration: tx.narration,
    photos: (anyTx.photos ?? []).map((p: { id: string; fileName: string; mimeType: string; sizeBytes: number }) => ({
      id: p.id,
      fileName: p.fileName,
      mimeType: p.mimeType,
      sizeBytes: p.sizeBytes,
    })),
    currency: anyTx.currency ?? null,
    fxRateAtTrade: anyTx.fxRateAtTrade ? anyTx.fxRateAtTrade.toString() : null,
    inrEquivalent: anyTx.inrEquivalent ? anyTx.inrEquivalent.toString() : null,
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
  };
}
