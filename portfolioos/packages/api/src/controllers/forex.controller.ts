import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  listForexBalances,
  getForexBalance,
  createForexBalance,
  updateForexBalance,
  deleteForexBalance,
  revealForexAccountNumber,
  listLrsRemittances,
  createLrsRemittance,
  deleteLrsRemittance,
  getLrsUtilisation,
  listTcsCredits,
  createTcsCredit,
  deleteTcsCredit,
  computeForexPairPnL,
  getDefaultTicker,
  SUPPORTED_FX_CURRENCIES,
} from '../services/forex.service.js';
import { getForexTicker, syncFxRates } from '../priceFeeds/fx.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError, BadRequestError, NotFoundError, ForbiddenError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const moneyString = z.string().regex(/^-?\d+(\.\d+)?$/, 'Expected decimal string');
const currencyCode = z.string().regex(/^[A-Za-z]{3}$/, 'Expected ISO 4217 code');

// ─── ForexBalance ───────────────────────────────────────────────────

const createBalanceSchema = z.object({
  portfolioId: z.string().nullable().optional(),
  currency: currencyCode,
  balance: moneyString,
  accountLabel: z.string().max(120).nullable().optional(),
  accountNumber: z.string().max(64).nullable().optional(),
  bankName: z.string().max(160).nullable().optional(),
  country: z.string().max(80).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const updateBalanceSchema = createBalanceSchema.partial();

export async function listBalances(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await listForexBalances(req.user.id));
}

export async function getBalance(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await getForexBalance(req.user.id, req.params.id!));
}

export async function createBalance(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = createBalanceSchema.parse(req.body ?? {});
  ok(res, await createForexBalance(req.user.id, body));
}

export async function updateBalance(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = updateBalanceSchema.parse(req.body ?? {});
  ok(res, await updateForexBalance(req.user.id, req.params.id!, body));
}

export async function removeBalance(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteForexBalance(req.user.id, req.params.id!);
  ok(res, { deleted: true });
}

export async function revealAccount(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const value = await revealForexAccountNumber(req.user.id, req.params.id!);
  ok(res, { accountNumber: value });
}

// ─── LRS ────────────────────────────────────────────────────────────

const lrsCreateSchema = z.object({
  portfolioId: z.string().nullable().optional(),
  remittanceDate: isoDate,
  currency: currencyCode,
  foreignAmount: moneyString,
  fxRate: moneyString.nullable().optional(),
  purpose: z.enum(['INVESTMENT', 'EDUCATION', 'TRAVEL', 'GIFT', 'MAINTENANCE', 'MEDICAL', 'OTHER']),
  bankName: z.string().max(160).nullable().optional(),
  remittanceRef: z.string().max(200).nullable().optional(),
  tcsDeducted: moneyString.nullable().optional(),
  tcsCreditId: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  forceConfirmed: z.boolean().optional(),
});

export async function listLrs(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const fy = typeof req.query.fy === 'string' ? req.query.fy : undefined;
  ok(res, await listLrsRemittances(req.user.id, fy));
}

export async function createLrs(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = lrsCreateSchema.parse(req.body ?? {});
  ok(res, await createLrsRemittance(req.user.id, body));
}

export async function removeLrs(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteLrsRemittance(req.user.id, req.params.id!);
  ok(res, { deleted: true });
}

export async function lrsUtilisation(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const fy = typeof req.query.fy === 'string' ? req.query.fy : undefined;
  ok(res, await getLrsUtilisation(req.user.id, fy));
}

// ─── TCS ────────────────────────────────────────────────────────────

const tcsCreateSchema = z.object({
  financialYear: z.string().regex(/^\d{4}-\d{2}$/, 'Expected FY format like 2025-26'),
  tcsAmount: moneyString,
  tan: z.string().max(20).nullable().optional(),
  collectorName: z.string().max(200).nullable().optional(),
  form27eqRef: z.string().max(200).nullable().optional(),
});

export async function listTcs(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const fy = typeof req.query.fy === 'string' ? req.query.fy : undefined;
  ok(res, await listTcsCredits(req.user.id, fy));
}

export async function createTcs(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = tcsCreateSchema.parse(req.body ?? {});
  ok(res, await createTcsCredit(req.user.id, body));
}

export async function removeTcs(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteTcsCredit(req.user.id, req.params.id!);
  ok(res, { deleted: true });
}

// ─── Ticker + P&L ───────────────────────────────────────────────────

const tickerSchema = z.object({
  pairs: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').map((p) => p.trim()).filter(Boolean) : null)),
});

export async function ticker(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const parsed = tickerSchema.parse(req.query);
  if (!parsed.pairs || parsed.pairs.length === 0) {
    ok(res, await getDefaultTicker());
    return;
  }
  const pairs = parsed.pairs.map((p) => {
    if (p.length !== 6) throw new BadRequestError(`Invalid pair: ${p}`);
    return { base: p.slice(0, 3).toUpperCase(), quote: p.slice(3, 6).toUpperCase() };
  });
  ok(res, await getForexTicker(pairs));
}

export async function refreshTicker(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const result = await syncFxRates();
  ok(res, result);
}

export async function pairPnl(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const portfolioId = req.params.portfolioId!;
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
    select: { userId: true },
  });
  if (!portfolio) throw new NotFoundError('Portfolio not found');
  if (portfolio.userId !== req.user.id) throw new ForbiddenError();
  ok(res, await computeForexPairPnL(portfolioId));
}

export async function supportedCurrencies(_req: Request, res: Response) {
  ok(res, SUPPORTED_FX_CURRENCIES);
}
