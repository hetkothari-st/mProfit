/**
 * Bank Accounts service — CRUD over BankAccount, dated BankBalanceSnapshot
 * history, and an auto-attribution helper invoked from canonical-event
 * projection so UPI/NEFT/INTEREST credits/debits land against the right
 * account based on `accountLast4`.
 *
 * Money math uses decimal.js / Prisma.Decimal throughout per §3.2.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

// ── Constants ────────────────────────────────────────────────────────────────

export const BANK_ACCOUNT_TYPES = [
  'SAVINGS',
  'CURRENT',
  'SALARY',
  'NRE',
  'NRO',
  'OD',
] as const;
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

export const BANK_ACCOUNT_STATUSES = ['ACTIVE', 'DORMANT', 'CLOSED'] as const;
export type BankAccountStatus = (typeof BANK_ACCOUNT_STATUSES)[number];

export const BANK_BALANCE_SOURCES = ['manual', 'statement', 'auto_event'] as const;
export type BankBalanceSource = (typeof BANK_BALANCE_SOURCES)[number];

// ── Input types ──────────────────────────────────────────────────────────────

export interface CreateBankAccountInput {
  bankName: string;
  accountType: BankAccountType;
  accountHolder: string;
  last4: string;
  portfolioId?: string | null;
  ifsc?: string | null;
  branch?: string | null;
  nickname?: string | null;
  jointHolders?: string[];
  nomineeName?: string | null;
  nomineeRelation?: string | null;
  debitCardLast4?: string | null;
  debitCardExpiry?: string | null;
  currentBalance?: string | null;
  balanceAsOf?: string | null; // ISO date
  status?: BankAccountStatus;
  openedOn?: string | null;
  closedOn?: string | null;
}

export type UpdateBankAccountInput = Partial<CreateBankAccountInput>;

export interface AddSnapshotInput {
  asOfDate: string; // YYYY-MM-DD
  balance: string;
  source: BankBalanceSource;
  note?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDate(s: string): Date {
  return new Date(s + 'T00:00:00Z');
}

function decimal(s: string | null | undefined): Prisma.Decimal | null {
  if (s === null || s === undefined || s === '') return null;
  return new Prisma.Decimal(s);
}

// ── Account CRUD ─────────────────────────────────────────────────────────────

export async function listAccounts(userId: string) {
  return prisma.bankAccount.findMany({
    where: { userId },
    include: {
      snapshots: { orderBy: { asOfDate: 'desc' }, take: 1 },
    },
    orderBy: [{ status: 'asc' }, { bankName: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function getAccount(userId: string, accountId: string) {
  const account = await prisma.bankAccount.findFirst({
    where: { id: accountId, userId },
    include: {
      snapshots: { orderBy: { asOfDate: 'desc' }, take: 365 },
    },
  });
  if (!account) throw new NotFoundError(`BankAccount ${accountId} not found`);
  return account;
}

export async function createAccount(userId: string, input: CreateBankAccountInput) {
  return prisma.bankAccount.create({
    data: {
      userId,
      bankName: input.bankName.trim(),
      accountType: input.accountType,
      accountHolder: input.accountHolder.trim(),
      last4: input.last4.trim(),
      portfolioId: input.portfolioId ?? null,
      ifsc: input.ifsc?.trim() || null,
      branch: input.branch?.trim() || null,
      nickname: input.nickname?.trim() || null,
      jointHolders: input.jointHolders ?? [],
      nomineeName: input.nomineeName?.trim() || null,
      nomineeRelation: input.nomineeRelation?.trim() || null,
      debitCardLast4: input.debitCardLast4?.trim() || null,
      debitCardExpiry: input.debitCardExpiry?.trim() || null,
      currentBalance: decimal(input.currentBalance),
      balanceAsOf: input.balanceAsOf ? toDate(input.balanceAsOf) : null,
      balanceSource: input.currentBalance ? 'manual' : null,
      status: input.status ?? 'ACTIVE',
      openedOn: input.openedOn ? toDate(input.openedOn) : null,
      closedOn: input.closedOn ? toDate(input.closedOn) : null,
    },
  });
}

export async function updateAccount(
  userId: string,
  accountId: string,
  input: UpdateBankAccountInput,
) {
  // Ensure the row belongs to the user before mutating.
  const existing = await prisma.bankAccount.findFirst({
    where: { id: accountId, userId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError(`BankAccount ${accountId} not found`);

  const data: Prisma.BankAccountUpdateInput = {};
  if (input.bankName !== undefined) data.bankName = input.bankName.trim();
  if (input.accountType !== undefined) data.accountType = input.accountType;
  if (input.accountHolder !== undefined) data.accountHolder = input.accountHolder.trim();
  if (input.last4 !== undefined) data.last4 = input.last4.trim();
  if (input.portfolioId !== undefined)
    data.portfolio = input.portfolioId
      ? { connect: { id: input.portfolioId } }
      : { disconnect: true };
  if (input.ifsc !== undefined) data.ifsc = input.ifsc?.trim() || null;
  if (input.branch !== undefined) data.branch = input.branch?.trim() || null;
  if (input.nickname !== undefined) data.nickname = input.nickname?.trim() || null;
  if (input.jointHolders !== undefined) data.jointHolders = input.jointHolders;
  if (input.nomineeName !== undefined) data.nomineeName = input.nomineeName?.trim() || null;
  if (input.nomineeRelation !== undefined)
    data.nomineeRelation = input.nomineeRelation?.trim() || null;
  if (input.debitCardLast4 !== undefined)
    data.debitCardLast4 = input.debitCardLast4?.trim() || null;
  if (input.debitCardExpiry !== undefined)
    data.debitCardExpiry = input.debitCardExpiry?.trim() || null;
  if (input.currentBalance !== undefined) {
    data.currentBalance = decimal(input.currentBalance);
    data.balanceAsOf = input.balanceAsOf ? toDate(input.balanceAsOf) : new Date();
    data.balanceSource = 'manual';
  }
  if (input.status !== undefined) data.status = input.status;
  if (input.openedOn !== undefined)
    data.openedOn = input.openedOn ? toDate(input.openedOn) : null;
  if (input.closedOn !== undefined)
    data.closedOn = input.closedOn ? toDate(input.closedOn) : null;

  return prisma.bankAccount.update({ where: { id: accountId }, data });
}

export async function deleteAccount(userId: string, accountId: string) {
  const existing = await prisma.bankAccount.findFirst({
    where: { id: accountId, userId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError(`BankAccount ${accountId} not found`);
  await prisma.bankAccount.delete({ where: { id: accountId } });
}

// ── Snapshots ────────────────────────────────────────────────────────────────

export async function addSnapshot(userId: string, accountId: string, input: AddSnapshotInput) {
  const account = await prisma.bankAccount.findFirst({
    where: { id: accountId, userId },
    select: { id: true },
  });
  if (!account) throw new NotFoundError(`BankAccount ${accountId} not found`);

  const asOf = toDate(input.asOfDate);
  const snap = await prisma.bankBalanceSnapshot.upsert({
    where: { accountId_asOfDate: { accountId, asOfDate: asOf } },
    update: {
      balance: new Prisma.Decimal(input.balance),
      source: input.source,
      note: input.note?.trim() || null,
    },
    create: {
      accountId,
      asOfDate: asOf,
      balance: new Prisma.Decimal(input.balance),
      source: input.source,
      note: input.note?.trim() || null,
    },
  });

  // If this snapshot is the most recent for the account, also refresh the
  // current-balance summary on the parent row so the list page stays accurate
  // without re-aggregating from snapshots.
  const latest = await prisma.bankBalanceSnapshot.findFirst({
    where: { accountId },
    orderBy: { asOfDate: 'desc' },
  });
  if (latest && latest.id === snap.id) {
    await prisma.bankAccount.update({
      where: { id: accountId },
      data: {
        currentBalance: latest.balance,
        balanceAsOf: latest.asOfDate,
        balanceSource: latest.source === 'auto_event' ? 'auto_event' : 'statement',
      },
    });
  }

  return snap;
}

export async function deleteSnapshot(userId: string, snapshotId: string) {
  const snap = await prisma.bankBalanceSnapshot.findUnique({
    where: { id: snapshotId },
    include: { account: { select: { userId: true } } },
  });
  if (!snap || snap.account.userId !== userId) {
    throw new NotFoundError(`Snapshot ${snapshotId} not found`);
  }
  await prisma.bankBalanceSnapshot.delete({ where: { id: snapshotId } });
}

// ── Cash flows scoped to an account ──────────────────────────────────────────

export async function listAccountCashFlows(
  userId: string,
  accountId: string,
  opts: { limit?: number } = {},
) {
  // Ownership check
  const account = await prisma.bankAccount.findFirst({
    where: { id: accountId, userId },
    select: { id: true },
  });
  if (!account) throw new NotFoundError(`BankAccount ${accountId} not found`);

  return prisma.cashFlow.findMany({
    where: { bankAccountId: accountId },
    orderBy: { date: 'desc' },
    take: opts.limit ?? 100,
  });
}

// ── Auto-attribution hook ────────────────────────────────────────────────────

/**
 * Find a BankAccount whose `last4` matches the supplied event's
 * `accountLast4`. Used by the canonical-event projection layer to
 * tag the resulting CashFlow with `bankAccountId`. Falls back to null
 * when the user has multiple accounts ending in the same 4 digits
 * (rare but possible across different banks) — we don't guess.
 */
export async function findAccountByLast4(
  userId: string,
  last4: string | null | undefined,
): Promise<string | null> {
  if (!last4 || last4.length !== 4) return null;
  const matches = await prisma.bankAccount.findMany({
    where: { userId, last4, status: { not: 'CLOSED' } },
    select: { id: true },
    take: 2,
  });
  if (matches.length === 1) return matches[0]!.id;
  if (matches.length > 1) {
    logger.info(
      { userId, last4, matchCount: matches.length },
      '[bankAccounts] ambiguous last4 — skipping auto-attribution',
    );
  }
  return null;
}

/**
 * Bump a bank account's running balance after a cashflow is projected.
 * Direction: 'INFLOW' adds, 'OUTFLOW' subtracts. Writes a snapshot for
 * the cashflow date so the balance chart picks it up.
 *
 * Uses Prisma's `{ increment }` so concurrent UPI/NEFT projections can
 * race safely — each becomes a single atomic `UPDATE balance = balance
 * + $delta` in Postgres. Ownership is enforced via a `where: { id, userId }`
 * filter so callers (including Bull workers) can't accidentally touch
 * another user's row even if the RLS session var isn't set.
 */
export async function applyEventToBalance(
  userId: string,
  accountId: string,
  amount: string,
  direction: 'INFLOW' | 'OUTFLOW',
  date: Date,
  canonicalEventId: string | null,
): Promise<void> {
  const delta = new Prisma.Decimal(amount).mul(direction === 'INFLOW' ? 1 : -1);

  // Atomic increment + ownership check in one round-trip. `updateMany`
  // returns count=0 if the row doesn't belong to this user — treat as no-op.
  const updated = await prisma.bankAccount.updateMany({
    where: { id: accountId, userId },
    data: {
      currentBalance: { increment: delta },
      balanceAsOf: date,
      balanceSource: 'auto_event',
    },
  });
  if (updated.count === 0) return;

  // Re-read the row to capture the new running balance for the snapshot.
  // Cheap — single PK lookup right after the write hits the same primary.
  const fresh = await prisma.bankAccount.findFirst({
    where: { id: accountId, userId },
    select: { currentBalance: true },
  });
  if (!fresh?.currentBalance) return;

  // Snapshot is best-effort — duplicate dates upsert.
  const asOf = new Date(date);
  asOf.setUTCHours(0, 0, 0, 0);
  await prisma.bankBalanceSnapshot.upsert({
    where: { accountId_asOfDate: { accountId, asOfDate: asOf } },
    update: { balance: fresh.currentBalance, source: 'auto_event', canonicalEventId },
    create: {
      accountId,
      asOfDate: asOf,
      balance: fresh.currentBalance,
      source: 'auto_event',
      canonicalEventId,
    },
  });
}
