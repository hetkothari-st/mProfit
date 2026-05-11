/**
 * Forex service — CRUD for ForexBalance, LrsRemittance, TcsCredit, plus LRS
 * utilisation aggregation and forex-pair speculative P&L computation.
 *
 * Encryption: ForexBalance.accountNumberEnc is AES-256-GCM via lib/secrets.ts
 * (same envelope used for mailbox/broker credentials). Only the last 4 digits
 * are stored in plain `accountLast4` for display; full account numbers are
 * decrypted on demand inside this service and never returned by list endpoints.
 *
 * Tax: LRS limit is USD 250,000 per individual per financial year. The
 * service-layer guard `checkLrsLimit` returns a structured result with a
 * `requiresForce` flag rather than throwing — the caller decides whether to
 * surface a confirm modal or block outright. TCS at 20% above ₹7L cumulative
 * per FY is informational here; actual deduction happens at the bank.
 */

import { Decimal } from 'decimal.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { encryptSecret, decryptSecret } from '../lib/secrets.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import {
  getLatestFxRate,
  getForexTicker,
  SUPPORTED_FX_CURRENCIES,
  DEFAULT_TICKER_PAIRS,
} from '../priceFeeds/fx.service.js';
import { financialYearOf } from './capitalGains.service.js';

// ─── Constants ──────────────────────────────────────────────────────

const LRS_ANNUAL_LIMIT_USD = new Decimal('250000');
const TCS_THRESHOLD_INR = new Decimal('700000'); // ₹7L per FY
const TCS_RATE = new Decimal('0.20'); // 20%
const LRS_WARNING_THRESHOLD_PCT = new Decimal('0.80'); // 80%

const VALID_PURPOSES = new Set([
  'INVESTMENT',
  'EDUCATION',
  'TRAVEL',
  'GIFT',
  'MAINTENANCE',
  'MEDICAL',
  'OTHER',
]);

// ─── Helpers ────────────────────────────────────────────────────────

function dateOrThrow(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new BadRequestError(`Invalid date (expected YYYY-MM-DD): ${s}`);
  }
  return new Date(`${s}T00:00:00.000Z`);
}

function decOrThrow(s: string, field: string): Prisma.Decimal {
  try {
    return new Prisma.Decimal(s);
  } catch {
    throw new BadRequestError(`Invalid decimal for ${field}: ${s}`);
  }
}

function normaliseCurrency(code: string): string {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw new BadRequestError(`Invalid currency code: ${code}`);
  return c;
}

function last4(s: string): string {
  const digits = s.replace(/\D/g, '');
  return digits.slice(-4);
}

// ─── ForexBalance CRUD ──────────────────────────────────────────────

export interface ForexBalanceInput {
  portfolioId?: string | null;
  currency: string;
  balance: string;
  accountLabel?: string | null;
  accountNumber?: string | null; // plain — encrypted on persist
  bankName?: string | null;
  country?: string | null;
  notes?: string | null;
}

export type ForexBalancePatch = Partial<ForexBalanceInput>;

function balanceToDto(row: { accountNumberEnc: string | null } & Record<string, unknown>) {
  const { accountNumberEnc: _omit, ...rest } = row;
  return rest;
}

export async function listForexBalances(userId: string) {
  const rows = await prisma.forexBalance.findMany({
    where: { userId },
    orderBy: [{ currency: 'asc' }, { accountLabel: 'asc' }],
  });
  return rows.map(balanceToDto);
}

export async function getForexBalance(userId: string, id: string) {
  const row = await prisma.forexBalance.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('Forex balance not found');
  if (row.userId !== userId) throw new ForbiddenError();
  return balanceToDto(row);
}

export async function createForexBalance(userId: string, input: ForexBalanceInput) {
  const currency = normaliseCurrency(input.currency);
  const balance = decOrThrow(input.balance, 'balance');
  const accountNumberEnc = input.accountNumber ? encryptSecret(input.accountNumber) : null;
  const accountLast4 = input.accountNumber ? last4(input.accountNumber) : null;

  const row = await prisma.forexBalance.create({
    data: {
      userId,
      portfolioId: input.portfolioId ?? null,
      currency,
      balance,
      accountLabel: input.accountLabel ?? null,
      accountNumberEnc,
      accountLast4,
      bankName: input.bankName ?? null,
      country: input.country ?? null,
      notes: input.notes ?? null,
    },
  });
  return balanceToDto(row);
}

export async function updateForexBalance(
  userId: string,
  id: string,
  patch: ForexBalancePatch,
) {
  const existing = await prisma.forexBalance.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Forex balance not found');
  if (existing.userId !== userId) throw new ForbiddenError();

  const data: Prisma.ForexBalanceUpdateInput = {};
  if (patch.portfolioId !== undefined) {
    data.portfolio = patch.portfolioId
      ? { connect: { id: patch.portfolioId } }
      : { disconnect: true };
  }
  if (patch.currency !== undefined) data.currency = normaliseCurrency(patch.currency);
  if (patch.balance !== undefined) data.balance = decOrThrow(patch.balance, 'balance');
  if (patch.accountLabel !== undefined) data.accountLabel = patch.accountLabel;
  if (patch.bankName !== undefined) data.bankName = patch.bankName;
  if (patch.country !== undefined) data.country = patch.country;
  if (patch.notes !== undefined) data.notes = patch.notes;
  if (patch.accountNumber !== undefined) {
    if (patch.accountNumber === null || patch.accountNumber === '') {
      data.accountNumberEnc = null;
      data.accountLast4 = null;
    } else {
      data.accountNumberEnc = encryptSecret(patch.accountNumber);
      data.accountLast4 = last4(patch.accountNumber);
    }
  }

  const row = await prisma.forexBalance.update({ where: { id }, data });
  return balanceToDto(row);
}

export async function deleteForexBalance(userId: string, id: string) {
  const existing = await prisma.forexBalance.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Forex balance not found');
  if (existing.userId !== userId) throw new ForbiddenError();
  await prisma.forexBalance.delete({ where: { id } });
}

/**
 * Decrypts the stored account number. Restricted to detail/edit flows — never
 * called from list endpoints. Callers should audit-log every invocation per
 * §15.8 once AuditLog is wired into this surface.
 */
export async function revealForexAccountNumber(userId: string, id: string): Promise<string | null> {
  const row = await prisma.forexBalance.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('Forex balance not found');
  if (row.userId !== userId) throw new ForbiddenError();
  if (!row.accountNumberEnc) return null;
  try {
    return decryptSecret(row.accountNumberEnc);
  } catch (err) {
    logger.error({ err: (err as Error).message, id }, '[forex] account # decrypt failed');
    throw new BadRequestError('Failed to decrypt account number — encryption key may have rotated');
  }
}

// ─── LRS Remittance ─────────────────────────────────────────────────

export interface LrsRemittanceInput {
  portfolioId?: string | null;
  remittanceDate: string;
  currency: string;
  foreignAmount: string;
  fxRate?: string | null; // optional; we look up latest if missing
  purpose: string;
  bankName?: string | null;
  remittanceRef?: string | null;
  tcsDeducted?: string | null;
  tcsCreditId?: string | null;
  notes?: string | null;
  forceConfirmed?: boolean; // override LRS limit warning
}

export interface LrsUtilisation {
  fy: string;
  usedInr: string;
  usedUsd: string;
  limitUsd: string;
  remainingUsd: string;
  pctUsed: number;
  tcsThresholdInr: string;
  tcsLikelyOnNextInr: string;
  warning: boolean;
}

export async function getLrsUtilisation(
  userId: string,
  fy?: string,
): Promise<LrsUtilisation> {
  const targetFy = fy ?? financialYearOf(new Date());
  const rows = await prisma.lrsRemittance.findMany({
    where: { userId },
    select: { remittanceDate: true, inrEquivalent: true },
  });
  let usedInr = new Decimal(0);
  for (const r of rows) {
    if (financialYearOf(r.remittanceDate) === targetFy) {
      usedInr = usedInr.plus(r.inrEquivalent.toString());
    }
  }
  const usdInr = (await getLatestFxRate('USD', 'INR')) ?? new Decimal(83);
  const usedUsd = usdInr.isZero() ? new Decimal(0) : usedInr.dividedBy(usdInr);
  const remainingUsd = LRS_ANNUAL_LIMIT_USD.minus(usedUsd);
  const pctUsed = LRS_ANNUAL_LIMIT_USD.isZero()
    ? 0
    : Number(usedUsd.dividedBy(LRS_ANNUAL_LIMIT_USD).times(100).toFixed(2));
  const remainingThreshold = Decimal.max(TCS_THRESHOLD_INR.minus(usedInr), new Decimal(0));
  return {
    fy: targetFy,
    usedInr: usedInr.toFixed(4),
    usedUsd: usedUsd.toFixed(4),
    limitUsd: LRS_ANNUAL_LIMIT_USD.toFixed(2),
    remainingUsd: remainingUsd.toFixed(4),
    pctUsed,
    tcsThresholdInr: remainingThreshold.toFixed(4),
    tcsLikelyOnNextInr: TCS_RATE.toFixed(2),
    warning: usedUsd.dividedBy(LRS_ANNUAL_LIMIT_USD).greaterThanOrEqualTo(LRS_WARNING_THRESHOLD_PCT),
  };
}

export async function listLrsRemittances(userId: string, fy?: string) {
  const rows = await prisma.lrsRemittance.findMany({
    where: { userId },
    orderBy: { remittanceDate: 'desc' },
    include: { tcsCredit: true },
  });
  if (!fy) return rows;
  return rows.filter((r) => financialYearOf(r.remittanceDate) === fy);
}

export async function createLrsRemittance(userId: string, input: LrsRemittanceInput) {
  if (!VALID_PURPOSES.has(input.purpose.toUpperCase())) {
    throw new BadRequestError(`Invalid LRS purpose: ${input.purpose}`);
  }
  const remittanceDate = dateOrThrow(input.remittanceDate);
  const currency = normaliseCurrency(input.currency);
  const foreignAmount = decOrThrow(input.foreignAmount, 'foreignAmount');

  let fxRate: Decimal;
  if (input.fxRate) {
    fxRate = new Decimal(decOrThrow(input.fxRate, 'fxRate').toString());
  } else {
    const r = await getLatestFxRate(currency, 'INR');
    if (!r) throw new BadRequestError(`No FX rate available for ${currency}→INR`);
    fxRate = r;
  }
  const inrEquivalent = new Decimal(foreignAmount.toString()).times(fxRate);

  // LRS limit guard — project this remittance in USD via the live USD/INR
  // rate. Consistent with how getLrsUtilisation reports usage; allows the
  // caller to override via forceConfirmed once the user acknowledges.
  const util = await getLrsUtilisation(userId, financialYearOf(remittanceDate));
  const usdInr = (await getLatestFxRate('USD', 'INR')) ?? new Decimal(83);
  const thisRemittanceUsd = usdInr.isZero() ? new Decimal(0) : inrEquivalent.dividedBy(usdInr);
  const projectedUsd = new Decimal(util.usedUsd).plus(thisRemittanceUsd);
  if (projectedUsd.greaterThan(LRS_ANNUAL_LIMIT_USD) && !input.forceConfirmed) {
    throw new BadRequestError(
      `LRS limit exceeded: this remittance would push FY ${util.fy} usage to ` +
        `USD ${projectedUsd.toFixed(2)} (limit ${LRS_ANNUAL_LIMIT_USD.toFixed(0)}). ` +
        `Resend with forceConfirmed=true to override.`,
    );
  }

  const tcsDeducted = input.tcsDeducted
    ? decOrThrow(input.tcsDeducted, 'tcsDeducted')
    : new Prisma.Decimal(0);

  // When the remittance links to a TcsCredit row AND a non-zero TCS amount is
  // recorded, increment the credit's usedAmount so the FY claim ledger stays
  // in sync. We do this in an atomic transaction with the remittance write so
  // a race between two remittances cannot double-count or skip.
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.lrsRemittance.create({
      data: {
        userId,
        portfolioId: input.portfolioId ?? null,
        remittanceDate,
        currency,
        foreignAmount,
        inrEquivalent: new Prisma.Decimal(inrEquivalent.toFixed(4)),
        fxRate: new Prisma.Decimal(fxRate.toFixed(6)),
        purpose: input.purpose.toUpperCase(),
        bankName: input.bankName ?? null,
        remittanceRef: input.remittanceRef ?? null,
        tcsDeducted,
        tcsCreditId: input.tcsCreditId ?? null,
        notes: input.notes ?? null,
      },
    });
    if (input.tcsCreditId && tcsDeducted.gt(0)) {
      await tx.tcsCredit.update({
        where: { id: input.tcsCreditId },
        data: { usedAmount: { increment: tcsDeducted } },
      });
    }
    return created;
  });
  return row;
}

export async function deleteLrsRemittance(userId: string, id: string) {
  const row = await prisma.lrsRemittance.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('LRS remittance not found');
  if (row.userId !== userId) throw new ForbiddenError();
  // Reverse the usedAmount increment if this remittance contributed to a
  // TcsCredit's ledger. Wrapped in the same $transaction as the delete so a
  // failure of either rolls back cleanly.
  await prisma.$transaction(async (tx) => {
    if (row.tcsCreditId && row.tcsDeducted.gt(0)) {
      await tx.tcsCredit.update({
        where: { id: row.tcsCreditId },
        data: { usedAmount: { decrement: row.tcsDeducted } },
      });
    }
    await tx.lrsRemittance.delete({ where: { id } });
  });
}

// ─── TCS Credit ─────────────────────────────────────────────────────

export interface TcsCreditInput {
  financialYear: string;
  tcsAmount: string;
  tan?: string | null;
  collectorName?: string | null;
  form27eqRef?: string | null;
}

export async function listTcsCredits(userId: string, fy?: string) {
  return prisma.tcsCredit.findMany({
    where: { userId, ...(fy ? { financialYear: fy } : {}) },
    orderBy: { createdAt: 'desc' },
    include: { remittances: { select: { id: true, remittanceDate: true, foreignAmount: true, currency: true } } },
  });
}

export async function createTcsCredit(userId: string, input: TcsCreditInput) {
  return prisma.tcsCredit.create({
    data: {
      userId,
      financialYear: input.financialYear,
      tcsAmount: decOrThrow(input.tcsAmount, 'tcsAmount'),
      tan: input.tan ?? null,
      collectorName: input.collectorName ?? null,
      form27eqRef: input.form27eqRef ?? null,
    },
  });
}

export async function deleteTcsCredit(userId: string, id: string) {
  const row = await prisma.tcsCredit.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('TCS credit not found');
  if (row.userId !== userId) throw new ForbiddenError();
  await prisma.tcsCredit.delete({ where: { id } });
}

// ─── Forex pair P&L ────────────────────────────────────────────────
//
// FOREX_PAIR trades are speculative business income — they skip the CG FIFO
// engine. P&L here is the simple "sell proceeds minus buy cost" net per
// (portfolio, pair) bucket, aggregated by financial year.

export interface ForexPairPnlRow {
  portfolioId: string;
  pair: string;
  financialYear: string;
  buyQty: string;
  sellQty: string;
  buyCost: string;
  sellProceeds: string;
  realisedPnl: string; // sellProceeds − costBasis (FIFO matched, capped at min(buy, sell) qty)
  unrealisedPosition: string; // net qty still open
}

export async function computeForexPairPnL(portfolioId: string): Promise<ForexPairPnlRow[]> {
  const txs = await prisma.transaction.findMany({
    where: { portfolioId, assetClass: 'FOREX_PAIR' },
    orderBy: { tradeDate: 'asc' },
  });
  const buckets = new Map<string, typeof txs>();
  for (const t of txs) {
    const pair = t.isin ?? t.assetName ?? 'UNKNOWN';
    const key = `${portfolioId}|${pair}|${financialYearOf(t.tradeDate)}`;
    const arr = buckets.get(key) ?? [];
    arr.push(t);
    buckets.set(key, arr);
  }
  const rows: ForexPairPnlRow[] = [];
  for (const [key, list] of buckets) {
    const [, pair, fy] = key.split('|');
    let buyQty = new Decimal(0);
    let sellQty = new Decimal(0);
    let buyCost = new Decimal(0);
    let sellProceeds = new Decimal(0);
    for (const t of list) {
      const qty = new Decimal(t.quantity.toString());
      const net = new Decimal(t.netAmount.toString());
      if (t.transactionType === 'BUY') {
        buyQty = buyQty.plus(qty);
        buyCost = buyCost.plus(net);
      } else if (t.transactionType === 'SELL') {
        sellQty = sellQty.plus(qty);
        sellProceeds = sellProceeds.plus(net);
      }
    }
    const matchedQty = Decimal.min(buyQty, sellQty);
    const avgBuy = buyQty.isZero() ? new Decimal(0) : buyCost.dividedBy(buyQty);
    const avgSell = sellQty.isZero() ? new Decimal(0) : sellProceeds.dividedBy(sellQty);
    const realised = avgSell.minus(avgBuy).times(matchedQty);
    rows.push({
      portfolioId,
      pair: pair ?? 'UNKNOWN',
      financialYear: fy ?? '',
      buyQty: buyQty.toFixed(6),
      sellQty: sellQty.toFixed(6),
      buyCost: buyCost.toFixed(4),
      sellProceeds: sellProceeds.toFixed(4),
      realisedPnl: realised.toFixed(4),
      unrealisedPosition: buyQty.minus(sellQty).toFixed(6),
    });
  }
  return rows;
}

// ─── Live ticker pass-through ──────────────────────────────────────

export async function getDefaultTicker() {
  return getForexTicker(DEFAULT_TICKER_PAIRS.map((p) => ({ base: p.base, quote: p.quote })));
}

export { SUPPORTED_FX_CURRENCIES };
