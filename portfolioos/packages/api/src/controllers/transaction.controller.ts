import type { Request, Response } from 'express';
import { z } from 'zod';
import { AssetClass, Exchange, TransactionType, OptionType } from '@prisma/client';
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
} from '../services/transaction.service.js';
import { created, noContent, ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const decimalLike = z.union([z.number(), z.string()]);

const baseTransactionSchema = z.object({
  portfolioId: z.string().cuid(),
  transactionType: z.nativeEnum(TransactionType),
  assetClass: z.nativeEnum(AssetClass),
  stockSymbol: z.string().trim().max(40).optional(),
  stockName: z.string().trim().max(200).optional(),
  exchange: z.nativeEnum(Exchange).optional(),
  schemeCode: z.string().trim().max(40).optional(),
  schemeName: z.string().trim().max(300).optional(),
  amcName: z.string().trim().max(200).optional(),
  assetName: z.string().trim().max(300).optional(),
  isin: z.string().trim().max(20).optional(),
  tradeDate: isoDate,
  settlementDate: isoDate.optional(),
  quantity: decimalLike,
  price: decimalLike,
  brokerage: decimalLike.optional(),
  stt: decimalLike.optional(),
  stampDuty: decimalLike.optional(),
  exchangeCharges: decimalLike.optional(),
  gst: decimalLike.optional(),
  sebiCharges: decimalLike.optional(),
  otherCharges: decimalLike.optional(),
  strikePrice: decimalLike.optional(),
  expiryDate: isoDate.optional(),
  optionType: z.nativeEnum(OptionType).optional(),
  lotSize: z.number().int().positive().optional(),
  maturityDate: isoDate.optional(),
  interestRate: decimalLike.optional(),
  interestFrequency: z.string().max(30).optional(),
  broker: z.string().max(100).optional(),
  orderNo: z.string().max(100).optional(),
  tradeNo: z.string().max(100).optional(),
  narration: z.string().max(500).optional(),
});

const createSchema = baseTransactionSchema;
const updateSchema = baseTransactionSchema.partial();

const listQuerySchema = z.object({
  portfolioId: z.string().cuid().optional(),
  assetClass: z.nativeEnum(AssetClass).optional(),
  transactionType: z.nativeEnum(TransactionType).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(1000).optional(),
});

function userId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

export async function create(req: Request, res: Response) {
  const data = createSchema.parse(req.body);
  created(res, await createTransaction(userId(req), data));
}

export async function update(req: Request, res: Response) {
  const data = updateSchema.parse(req.body);
  ok(res, await updateTransaction(userId(req), req.params.id!, data));
}

export async function remove(req: Request, res: Response) {
  await deleteTransaction(userId(req), req.params.id!);
  noContent(res);
}

export async function detail(req: Request, res: Response) {
  ok(res, await getTransaction(userId(req), req.params.id!));
}

export async function list(req: Request, res: Response) {
  const q = listQuerySchema.parse(req.query);
  ok(res, await listTransactions(userId(req), q));
}
