/**
 * Bank Accounts service — CRUD over BankAccount, dated BankBalanceSnapshot
 * history, and an auto-attribution helper invoked from canonical-event
 * projection so UPI/NEFT/INTEREST credits/debits land against the right
 * account based on `accountLast4`.
 *
 * Money math uses decimal.js / Prisma.Decimal throughout per §3.2.
 *
 * Full account number: optional, AES-256-GCM encrypted via
 * pfCredentials.encryptIdentifier (APP_ENCRYPTION_KEY, §15.1). Every public
 * read/write returns through `toBankAccountDto`, which drops the ciphertext;
 * plaintext only leaves via `revealAccountNumber` / `shareAccountDetails`,
 * both of which audit-log first.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { encryptIdentifier, decryptIdentifier, last4 as last4Of } from './pfCredentials.service.js';
import { lookupIfsc, type IfscDetails } from './ifscLookup.service.js';

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
  /** Full account number, plain — encrypted on persist. Overrides `last4`. */
  accountNumber?: string | null;
  customerId?: string | null;
  portfolioId?: string | null;
  ifsc?: string | null;
  branch?: string | null;
  branchAddress?: string | null;
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

export interface RevealAuditContext {
  ip?: string | null;
  userAgent?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDate(s: string): Date {
  return new Date(s + 'T00:00:00Z');
}

function decimal(s: string | null | undefined): Prisma.Decimal | null {
  if (s === null || s === undefined || s === '') return null;
  return new Prisma.Decimal(s);
}

/**
 * Users paste account numbers with spaces or hyphens. Indian account numbers
 * run 9–18 digits; the floor is 6 to admit older co-operative-bank formats.
 */
function normaliseAccountNumber(raw: string): string {
  const n = raw.replace(/[\s-]/g, '');
  if (!/^\d{6,18}$/.test(n)) {
    throw new BadRequestError('Account number must be 6–18 digits');
  }
  return n;
}

async function decryptAccountNumber(enc: string, accountId: string): Promise<string> {
  try {
    return await decryptIdentifier(enc);
  } catch (err) {
    logger.error(
      { err: (err as Error).message, accountId },
      '[bankAccounts] account number decrypt failed',
    );
    throw new BadRequestError(
      'Could not decrypt the account number — the encryption key may have changed',
    );
  }
}

/**
 * Drop the ciphertext before a row leaves this service — `accountNumberEnc`
 * must never be serialized, even encrypted. The client only learns whether a
 * full number exists.
 */
export function toBankAccountDto<T extends { accountNumberEnc: string | null }>(
  row: T,
): Omit<T, 'accountNumberEnc'> & { hasAccountNumber: boolean } {
  const { accountNumberEnc, ...rest } = row;
  return { ...rest, hasAccountNumber: accountNumberEnc !== null };
}

// ── Account CRUD ─────────────────────────────────────────────────────────────

export async function listAccounts(userId: string) {
  const rows = await prisma.bankAccount.findMany({
    where: { userId },
    include: {
      snapshots: { orderBy: { asOfDate: 'desc' }, take: 1 },
    },
    orderBy: [{ status: 'asc' }, { bankName: 'asc' }, { createdAt: 'desc' }],
  });
  return rows.map(toBankAccountDto);
}

export async function getAccount(userId: string, accountId: string) {
  const account = await prisma.bankAccount.findFirst({
    where: { id: accountId, userId },
    include: {
      snapshots: { orderBy: { asOfDate: 'desc' }, take: 365 },
    },
  });
  if (!account) throw new NotFoundError(`BankAccount ${accountId} not found`);
  return toBankAccountDto(account);
}

export async function createAccount(userId: string, input: CreateBankAccountInput) {
  const accountNumber = input.accountNumber ? normaliseAccountNumber(input.accountNumber) : null;
  const row = await prisma.bankAccount.create({
    data: {
      userId,
      bankName: input.bankName.trim(),
      accountType: input.accountType,
      accountHolder: input.accountHolder.trim(),
      // Last 4 follows the full number when one is given, so the two can't
      // disagree (auto-attribution matches on last4).
      last4: accountNumber ? last4Of(accountNumber) : input.last4.trim(),
      accountNumberEnc: accountNumber ? await encryptIdentifier(accountNumber) : null,
      customerId: input.customerId?.trim() || null,
      portfolioId: input.portfolioId ?? null,
      ifsc: input.ifsc?.trim() || null,
      branch: input.branch?.trim() || null,
      branchAddress: input.branchAddress?.trim() || null,
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
  return toBankAccountDto(row);
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
  // After `last4` so a new full number wins over a hand-typed last4.
  if (input.accountNumber !== undefined) {
    if (input.accountNumber === null || input.accountNumber.trim() === '') {
      data.accountNumberEnc = null;
    } else {
      const accountNumber = normaliseAccountNumber(input.accountNumber);
      data.accountNumberEnc = await encryptIdentifier(accountNumber);
      data.last4 = last4Of(accountNumber);
    }
  }
  if (input.customerId !== undefined) data.customerId = input.customerId?.trim() || null;
  if (input.portfolioId !== undefined)
    data.portfolio = input.portfolioId
      ? { connect: { id: input.portfolioId } }
      : { disconnect: true };
  if (input.ifsc !== undefined) data.ifsc = input.ifsc?.trim() || null;
  if (input.branch !== undefined) data.branch = input.branch?.trim() || null;
  if (input.branchAddress !== undefined)
    data.branchAddress = input.branchAddress?.trim() || null;
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

  return toBankAccountDto(await prisma.bankAccount.update({ where: { id: accountId }, data }));
}

export async function deleteAccount(userId: string, accountId: string) {
  const existing = await prisma.bankAccount.findFirst({
    where: { id: accountId, userId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError(`BankAccount ${accountId} not found`);
  await prisma.bankAccount.delete({ where: { id: accountId } });
}

/**
 * Decrypt the full account number for its owner. Writes a `pii_view` AuditLog
 * row before returning (§3.7 / §15.8); if that write fails, the reveal fails
 * with it. Returns null when only last4 was ever saved (nothing shown, nothing
 * audited).
 */
export async function revealAccountNumber(
  userId: string,
  accountId: string,
  ctx: RevealAuditContext,
): Promise<string | null> {
  const row = await prisma.bankAccount.findFirst({
    where: { id: accountId, userId },
    select: { id: true, accountNumberEnc: true },
  });
  if (!row) throw new NotFoundError(`BankAccount ${accountId} not found`);
  if (!row.accountNumberEnc) return null;

  const accountNumber = await decryptAccountNumber(row.accountNumberEnc, accountId);

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'pii_view',
      resource: `BankAccount:${accountId}`,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      metadata: { field: 'accountNumber' },
    },
  });
  return accountNumber;
}

interface BranchDetails {
  branch: string | null;
  branchAddress: string | null;
}

/**
 * Fill whichever of branch name / address is empty from the IFSC and persist
 * it, so the next share needs no lookup and the user can correct the (often
 * messy) upstream text via Edit. A failed lookup degrades to sharing without
 * them rather than blocking the share.
 */
async function fillBranchFromIfsc(
  ifsc: string,
  accountId: string,
  current: BranchDetails,
): Promise<BranchDetails> {
  let info: IfscDetails | null;
  try {
    info = await lookupIfsc(ifsc);
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, accountId },
      '[bankAccounts] IFSC lookup failed — sharing without branch details',
    );
    return current;
  }
  if (!info) return current;

  const data: { branch?: string; branchAddress?: string } = {};
  if (!current.branch && info.branch) data.branch = info.branch;
  if (!current.branchAddress && info.address) data.branchAddress = info.address;
  if (Object.keys(data).length > 0) {
    await prisma.bankAccount.update({ where: { id: accountId }, data });
  }
  return {
    branch: current.branch ?? data.branch ?? null,
    branchAddress: current.branchAddress ?? data.branchAddress ?? null,
  };
}

/**
 * Plain-text bank details for the user to send onward (to receive a
 * transfer). Contains the full account number, so it's treated like a reveal:
 * owner-scoped, `pii_share` audit row written before returning, and refused
 * when only last4 is on file.
 */
export async function shareAccountDetails(
  userId: string,
  accountId: string,
  ctx: RevealAuditContext,
): Promise<{ text: string }> {
  const row = await prisma.bankAccount.findFirst({
    where: { id: accountId, userId },
    select: {
      id: true,
      bankName: true,
      accountHolder: true,
      accountNumberEnc: true,
      ifsc: true,
      branch: true,
      branchAddress: true,
    },
  });
  if (!row) throw new NotFoundError(`BankAccount ${accountId} not found`);
  if (!row.accountNumberEnc) {
    throw new BadRequestError('Add the full account number (Edit account) before sharing bank details');
  }

  const accountNumber = await decryptAccountNumber(row.accountNumberEnc, accountId);

  let branchDetails: BranchDetails = { branch: row.branch, branchAddress: row.branchAddress };
  if (row.ifsc && (!row.branch || !row.branchAddress)) {
    branchDetails = await fillBranchFromIfsc(row.ifsc, accountId, branchDetails);
  }

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'pii_share',
      resource: `BankAccount:${accountId}`,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      metadata: { fields: ['accountHolder', 'accountNumber', 'ifsc', 'branch', 'branchAddress'] },
    },
  });

  const lines = [
    `${row.bankName} account details`,
    `Account holder: ${row.accountHolder}`,
    `Account number: ${accountNumber}`,
    row.ifsc ? `IFSC: ${row.ifsc}` : null,
    branchDetails.branch ? `Branch: ${branchDetails.branch}` : null,
    branchDetails.branchAddress ? `Branch address: ${branchDetails.branchAddress}` : null,
  ].filter((line): line is string => line !== null);
  return { text: lines.join('\n') };
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
