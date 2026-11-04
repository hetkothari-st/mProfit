/**
 * What counts towards net worth, and at what value — for the rows that live
 * outside portfolios (bank accounts, owned property, rental property) and for
 * the two holdings that would otherwise be counted twice (CASH mirrored from a
 * bank statement, PF-backed holdings).
 *
 * The dashboard's net worth and the Will Maker's estate both read these rules,
 * so the two cannot drift apart again. They used to: the dashboard left bank
 * balances and owned property out entirely and counted a rental that is also
 * recorded as an owned property twice over, so the two disagreed by crores.
 * test/will/estateAdapters.db.test.ts pins the two totals together.
 */
import { Decimal } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';

const ZERO = new Decimal(0);
const dec = (v: { toString(): string } | null | undefined): Decimal | null =>
  v == null ? null : new Decimal(v.toString());

/** Clamp a stored ownership percent into 0–100, two places. */
export function sharePct2(v: { toString(): string }): string {
  return Decimal.min(100, Decimal.max(0, new Decimal(v.toString()))).toFixed(2);
}

const ofShare = (value: Decimal, pct: string): Decimal => value.times(pct).dividedBy(100);

// ── Bank accounts ─────────────────────────────────────────────────────

/** Open accounts. An overdraft is a debt, not an asset. */
export function countedBankAccountsWhere(userId: string) {
  return { userId, status: { not: 'CLOSED' as const }, accountType: { not: 'OD' as const } };
}

/** A joint account is shared equally among its holders. */
export function bankSharePct(jointHolders: readonly unknown[]): string {
  return jointHolders.length > 0
    ? new Decimal(100).dividedBy(jointHolders.length + 1).toFixed(2, Decimal.ROUND_DOWN)
    : '100';
}

/** A negative or missing balance contributes nothing. */
export function bankBalanceValue(b: { currentBalance: { toString(): string } | null }): Decimal {
  const balance = dec(b.currentBalance);
  return balance && balance.greaterThan(0) ? balance : ZERO;
}

export function bankAccountShareValue(b: {
  currentBalance: { toString(): string } | null;
  jointHolders: readonly unknown[];
}): Decimal {
  return ofShare(bankBalanceValue(b), bankSharePct(b.jointHolders));
}

/**
 * A funded bank account on file means a statement import's CASH holdings
 * mirror money already counted as a bank balance.
 */
export function fundedBankAccountWhere(userId: string) {
  return { ...countedBankAccountsWhere(userId), currentBalance: { gt: 0 } };
}

// ── Owned property ────────────────────────────────────────────────────

export function countedOwnedPropertyWhere(userId: string) {
  return { userId, isActive: true, status: { not: 'SOLD' as const } };
}

/** Current value, else what was paid. */
export function ownedPropertyValue(p: {
  currentValue: { toString(): string } | null;
  purchasePrice: { toString(): string } | null;
}): Decimal | null {
  return dec(p.currentValue) ?? dec(p.purchasePrice);
}

/**
 * The caller's share: a company-owned property is the company's (the shares
 * are the asset), JOINT and HUF count the recorded percentage.
 */
export function ownedPropertyShareValue(p: {
  ownershipType: string;
  ownershipPercent: { toString(): string };
  currentValue: { toString(): string } | null;
  purchasePrice: { toString(): string } | null;
}): Decimal {
  if (p.ownershipType === 'COMPANY') return ZERO;
  const value = ownedPropertyValue(p) ?? ZERO;
  if (p.ownershipType === 'JOINT' || p.ownershipType === 'HUF') return ofShare(value, sharePct2(p.ownershipPercent));
  return value;
}

// ── Rental property ───────────────────────────────────────────────────

/**
 * Active rentals, minus any rental that an active owned property links to:
 * that is the same flat recorded twice, and the owned-property row carries it.
 */
export async function countedRentalPropertyWhere(userId: string) {
  const linked = await prisma.ownedProperty.findMany({
    where: { ...countedOwnedPropertyWhere(userId), rentalPropertyId: { not: null } },
    select: { rentalPropertyId: true },
  });
  const skip = linked.map((l) => l.rentalPropertyId).filter((x): x is string => !!x);
  return { userId, isActive: true, ...(skip.length ? { id: { notIn: skip } } : {}) };
}

/** Current value, else what was paid. */
export function rentalPropertyValue(r: {
  currentValue: { toString(): string } | null;
  purchasePrice: { toString(): string } | null;
}): Decimal {
  return dec(r.currentValue) ?? dec(r.purchasePrice) ?? ZERO;
}
