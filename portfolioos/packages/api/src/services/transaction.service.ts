import { Decimal } from 'decimal.js';
import type { Money, Quantity } from '@portfolioos/shared';
import type { AssetClass, Exchange, Prisma, TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { ensureStockMaster, ensureMutualFundMaster } from './masterData.service.js';
import { recomputeForAsset } from './holdingsProjection.js';
import { computeAssetKey } from './assetKey.js';
import { naturalKeyHash } from './sourceHash.js';

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
  const isStock = ['EQUITY', 'FUTURES', 'OPTIONS', 'ETF'].includes(input.assetClass);
  const isFund = input.assetClass === 'MUTUAL_FUND';

  if (isStock && input.stockSymbol) {
    const stock = await ensureStockMaster({
      symbol: input.stockSymbol,
      exchange: input.exchange ?? 'NSE',
      name: input.stockName,
      isin: input.isin,
    });
    return { stockId: stock.id, fundId: null, assetName: stock.name, isin: stock.isin ?? input.isin ?? null };
  }

  if (isFund && input.schemeCode) {
    const fund = await ensureMutualFundMaster({
      schemeCode: input.schemeCode,
      schemeName: input.schemeName,
      amcName: input.amcName,
      isin: input.isin,
    });
    return { stockId: null, fundId: fund.id, assetName: fund.schemeName, isin: fund.isin ?? input.isin ?? null };
  }

  if (!input.assetName) {
    throw new BadRequestError('Asset name or symbol is required');
  }
  return { stockId: null, fundId: null, assetName: input.assetName, isin: input.isin ?? null };
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
  const assetKey = computeAssetKey(refs);

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
  };

  const tx = await prisma.transaction.create({ data });

  await recomputeForAsset(tx.portfolioId, assetKey);

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

  const merged: CreateTransactionInput = {
    portfolioId: existing.portfolioId,
    assetClass: existing.assetClass,
    transactionType: existing.transactionType,
    tradeDate: existing.tradeDate.toISOString().slice(0, 10),
    quantity: existing.quantity.toString(),
    price: existing.price.toString(),
    ...input,
  };

  const qty = d(merged.quantity);
  const price = d(merged.price);
  if (qty.lte(0)) throw new BadRequestError('Quantity must be > 0');
  if (price.lt(0)) throw new BadRequestError('Price cannot be negative');

  const { gross, net } = computeGrossAndNet(merged);

  const patch: Prisma.TransactionUncheckedUpdateInput = {
    transactionType: merged.transactionType,
    assetClass: merged.assetClass,
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
    broker: merged.broker ?? null,
    orderNo: merged.orderNo ?? null,
    tradeNo: merged.tradeNo ?? null,
    narration: merged.narration ?? null,
  };

  const updated = await prisma.transaction.update({ where: { id }, data: patch });

  // The current update endpoint doesn't mutate stockId/fundId/isin/assetName,
  // so the assetKey is stable — but fall back to recompute if a row pre-dates
  // the §4.10 backfill and is somehow still NULL.
  const assetKey =
    updated.assetKey ??
    computeAssetKey({
      stockId: updated.stockId,
      fundId: updated.fundId,
      isin: updated.isin,
      assetName: updated.assetName,
    });
  await recomputeForAsset(updated.portfolioId, assetKey);

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
}

export async function getTransaction(userId: string, id: string) {
  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: {
      stock: { select: { symbol: true, name: true, isin: true, exchange: true } },
      fund: { select: { schemeCode: true, schemeName: true, amcName: true, isin: true } },
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
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
  };
}
