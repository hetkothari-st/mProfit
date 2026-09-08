/**
 * Tenant khata ledger — the single write path for rent money.
 *
 * `RentReceipt` still holds the monthly rent charge, but its `status`,
 * `receivedAmount`, `receivedOn`, `cashFlowId` and `autoMatchedFromEventId`
 * are a projection of `RentLedgerEntry` computed here. Nothing outside this
 * file may write those columns (CLAUDE.md §3.1).
 */

import { Prisma } from '@prisma/client';
import { prisma, runInTransaction } from '../lib/prisma.js';
import {
  allocateCredits,
  deriveReceiptStatus,
  type ChargeInput,
  type CreditInput,
} from './rentalLedgerMath.js';

export const LEDGER_ENTRY_TYPES = [
  'PAYMENT',
  'DISCOUNT',
  'LATE_FEE',
  'OTHER_CHARGE',
  'DEPOSIT',
  'DEPOSIT_REFUND',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

/** Charge side of the khata — increases what the tenant owes. */
const CHARGE_TYPES = new Set<LedgerEntryType>(['LATE_FEE', 'OTHER_CHARGE']);
/** Credit side — reduces what the tenant owes. */
const CREDIT_TYPES = new Set<LedgerEntryType>(['PAYMENT', 'DISCOUNT']);

export const OVERDUE_GRACE_DAYS = 7;

const ZERO = new Prisma.Decimal(0);

export interface LedgerSummary {
  balanceDue: Prisma.Decimal;
  depositHeld: Prisma.Decimal;
  /** Receipts that moved from unsettled to RECEIVED/PARTIAL in this run. */
  settledReceiptIds: string[];
}

export async function recomputeTenancyLedger(
  tx: Prisma.TransactionClient,
  tenancyId: string,
): Promise<LedgerSummary> {
  const [receipts, entries] = await Promise.all([
    tx.rentReceipt.findMany({ where: { tenancyId }, orderBy: { dueDate: 'asc' } }),
    tx.rentLedgerEntry.findMany({ where: { tenancyId } }),
  ]);

  const charges: ChargeInput[] = [];
  for (const r of receipts) {
    if (r.isSkipped) continue;
    charges.push({
      key: r.id,
      kind: 'RECEIPT',
      forMonth: r.forMonth,
      due: r.dueDate,
      amount: r.expectedAmount,
    });
  }
  for (const e of entries) {
    if (CHARGE_TYPES.has(e.entryType as LedgerEntryType)) {
      charges.push({
        key: e.id, kind: 'FEE', forMonth: null, due: e.entryDate, amount: e.amount,
      });
    }
  }

  const credits: CreditInput[] = entries
    .filter((e) => CREDIT_TYPES.has(e.entryType as LedgerEntryType))
    .map((e) => ({
      key: e.id,
      entryDate: e.entryDate,
      createdAt: e.createdAt,
      forMonth: e.forMonth,
      amount: e.amount,
    }));

  const { perCharge } = allocateCredits(charges, credits);
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const today = new Date();
  const settledReceiptIds: string[] = [];

  for (const r of receipts) {
    const alloc = perCharge.get(r.id);
    const allocated = alloc?.allocated ?? ZERO;
    const status = deriveReceiptStatus({
      isSkipped: r.isSkipped,
      expected: r.expectedAmount,
      allocated,
      dueDate: r.dueDate,
      today,
      graceDays: OVERDUE_GRACE_DAYS,
    });

    // Carry the legacy single-link columns from the first contributing entry
    // so the existing DTO and the "undo auto-match" affordance keep working.
    const contributors = (alloc?.creditKeys ?? []).map((k) => entryById.get(k)!);
    const cashFlowId = contributors.find((e) => e.cashFlowId)?.cashFlowId ?? null;
    const autoMatchedFromEventId =
      contributors.find((e) => e.canonicalEventId)?.canonicalEventId ?? null;

    const wasSettled = r.status === 'RECEIVED' || r.status === 'PARTIAL';
    const isSettled = status === 'RECEIVED' || status === 'PARTIAL';
    if (!wasSettled && isSettled) settledReceiptIds.push(r.id);

    const nextReceived = allocated.gt(ZERO) ? allocated : null;
    const nextReceivedOn = alloc?.settledOn ?? null;
    const unchanged =
      r.status === status &&
      (r.receivedAmount?.toString() ?? null) === (nextReceived?.toString() ?? null) &&
      (r.receivedOn?.getTime() ?? null) === (nextReceivedOn?.getTime() ?? null) &&
      r.cashFlowId === cashFlowId &&
      r.autoMatchedFromEventId === autoMatchedFromEventId;
    if (unchanged) continue;

    await tx.rentReceipt.update({
      where: { id: r.id },
      data: {
        status,
        receivedAmount: nextReceived,
        receivedOn: nextReceivedOn,
        cashFlowId,
        autoMatchedFromEventId,
      },
    });
  }

  let chargeTotal = ZERO;
  for (const c of charges) chargeTotal = chargeTotal.plus(c.amount);
  let creditTotal = ZERO;
  for (const c of credits) creditTotal = creditTotal.plus(c.amount);

  let depositHeld = ZERO;
  for (const e of entries) {
    if (e.entryType === 'DEPOSIT') depositHeld = depositHeld.plus(e.amount);
    if (e.entryType === 'DEPOSIT_REFUND') depositHeld = depositHeld.minus(e.amount);
  }

  const balanceDue = chargeTotal.minus(creditTotal);
  await tx.tenancy.update({
    where: { id: tenancyId },
    data: { balanceDue, depositHeld, balanceComputedAt: new Date() },
  });

  for (const receiptId of settledReceiptIds) {
    await resolveRentReceiptReminders(tx, receiptId);
  }

  return { balanceDue, depositHeld, settledReceiptIds };
}

/**
 * A receipt just settled — clear anything still nagging about it. Moved here
 * from rental.service.ts so the recompute owns the whole settle transition.
 * We delete (not soft-dismiss) the alert so a later un-settle can recreate it
 * past `generateRentOverdueAlerts`'s dedup-by-key check.
 */
export async function resolveRentReceiptReminders(
  tx: Prisma.TransactionClient,
  receiptId: string,
): Promise<void> {
  await tx.rentReminder.updateMany({
    where: { receiptId, status: 'PENDING_APPROVAL' },
    data: { status: 'SUPERSEDED' },
  });
  await tx.alert.deleteMany({
    where: {
      type: 'CUSTOM',
      metadata: { path: ['key'], equals: `rent_overdue:${receiptId}` },
    },
  });
}

/** Convenience wrapper for callers that are not already in a transaction. */
export async function recomputeTenancy(tenancyId: string): Promise<LedgerSummary> {
  return runInTransaction((tx) => recomputeTenancyLedger(tx, tenancyId));
}
