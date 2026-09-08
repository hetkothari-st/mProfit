/**
 * Pure allocation and status math for the tenant khata ledger.
 *
 * No Prisma client, no clock, no I/O — every input is passed in so the
 * whole thing is exercisable without a database. `rentalLedger.service.ts`
 * loads rows, calls these, and writes the result back.
 *
 * Allocation rule: a credit first fills the charge its `forMonth` pins it
 * to (if any capacity remains there), then spills to the oldest charge with
 * remaining capacity. Anything left after every charge is satisfied is an
 * advance the tenant is carrying.
 */

import { Prisma } from '@prisma/client';

const ZERO = new Prisma.Decimal(0);

export interface ChargeInput {
  /** RentReceipt.id for rent, RentLedgerEntry.id for a fee. */
  key: string;
  kind: 'RECEIPT' | 'FEE';
  /** "YYYY-MM" for rent charges; null for fees. */
  forMonth: string | null;
  due: Date;
  amount: Prisma.Decimal;
}

export interface CreditInput {
  /** RentLedgerEntry.id. */
  key: string;
  entryDate: Date;
  createdAt: Date;
  /** "YYYY-MM" pin, or null to allocate FIFO. */
  forMonth: string | null;
  amount: Prisma.Decimal;
}

export interface ChargeAllocation {
  allocated: Prisma.Decimal;
  /** entryDate of the credit that brought this charge to fully-paid. */
  settledOn: Date | null;
  /** Keys of every credit that contributed, in allocation order. */
  creditKeys: string[];
}

export interface AllocationResult {
  perCharge: Map<string, ChargeAllocation>;
  advance: Prisma.Decimal;
}

/**
 * Charges sort by due date, then receipts before fees on the same date, then
 * by key. Credits sort by entryDate, then createdAt, then key. Sorting here
 * rather than at the call site is what makes the result independent of the
 * order rows came back from the database.
 */
function sortCharges(charges: ChargeInput[]): ChargeInput[] {
  return [...charges].sort((a, b) => {
    const d = a.due.getTime() - b.due.getTime();
    if (d !== 0) return d;
    if (a.kind !== b.kind) return a.kind === 'RECEIPT' ? -1 : 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

function sortCredits(credits: CreditInput[]): CreditInput[] {
  return [...credits].sort((a, b) => {
    const d = a.entryDate.getTime() - b.entryDate.getTime();
    if (d !== 0) return d;
    const c = a.createdAt.getTime() - b.createdAt.getTime();
    if (c !== 0) return c;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

export function allocateCredits(
  charges: ChargeInput[],
  credits: CreditInput[],
): AllocationResult {
  const ordered = sortCharges(charges);
  const perCharge = new Map<string, ChargeAllocation>();
  const remaining = new Map<string, Prisma.Decimal>();
  for (const c of ordered) {
    perCharge.set(c.key, { allocated: ZERO, settledOn: null, creditKeys: [] });
    remaining.set(c.key, c.amount);
  }

  const applyTo = (chargeKey: string, credit: CreditInput, pool: Prisma.Decimal): Prisma.Decimal => {
    const left = remaining.get(chargeKey);
    if (!left || left.lte(ZERO) || pool.lte(ZERO)) return pool;
    const take = Prisma.Decimal.min(left, pool);
    const alloc = perCharge.get(chargeKey)!;
    alloc.allocated = alloc.allocated.plus(take);
    alloc.creditKeys.push(credit.key);
    remaining.set(chargeKey, left.minus(take));
    if (remaining.get(chargeKey)!.lte(ZERO)) {
      alloc.settledOn = credit.entryDate;
    }
    return pool.minus(take);
  };

  let advance = ZERO;
  for (const credit of sortCredits(credits)) {
    let pool = credit.amount;
    if (credit.forMonth) {
      const pinned = ordered.find(
        (c) => c.kind === 'RECEIPT' && c.forMonth === credit.forMonth,
      );
      if (pinned) pool = applyTo(pinned.key, credit, pool);
    }
    for (const c of ordered) {
      if (pool.lte(ZERO)) break;
      pool = applyTo(c.key, credit, pool);
    }
    advance = advance.plus(pool);
  }

  return { perCharge, advance };
}

export type DerivedReceiptStatus =
  | 'EXPECTED'
  | 'RECEIVED'
  | 'PARTIAL'
  | 'OVERDUE'
  | 'SKIPPED';

/**
 * PARTIAL deliberately outranks OVERDUE: before the ledger existed,
 * `markOverdueReceipts` only ever flipped EXPECTED to OVERDUE, so a partly
 * paid month never raised an overdue alert. Keeping that ordering means
 * alerts.service keeps behaving exactly as it does today.
 */
export function deriveReceiptStatus(args: {
  isSkipped: boolean;
  expected: Prisma.Decimal;
  allocated: Prisma.Decimal;
  dueDate: Date;
  today: Date;
  graceDays: number;
}): DerivedReceiptStatus {
  if (args.isSkipped) return 'SKIPPED';
  if (args.allocated.gte(args.expected)) return 'RECEIVED';
  if (args.allocated.gt(ZERO)) return 'PARTIAL';

  // <= (not <) deliberately mirrors markOverdueReceipts's
  // `dueDate: { lte: cutoff } }` in rental.service.ts — the grace-boundary
  // day itself (dueDate + graceDays) is already OVERDUE in production.
  // Don't "fix" this to `<` again; it was tried and reverted.
  const cutoff = new Date(args.today.getTime());
  cutoff.setUTCDate(cutoff.getUTCDate() - args.graceDays);
  cutoff.setUTCHours(0, 0, 0, 0);
  return args.dueDate <= cutoff ? 'OVERDUE' : 'EXPECTED';
}
