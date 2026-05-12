/**
 * §8 Rental service — properties, tenancies, receipt generation,
 * manual mark-received, property expenses, and a fuzzy auto-match
 * helper for bank-credit events.
 *
 * The receipt table (`RentReceipt`) is a schedule: when a tenancy is
 * created, we pre-materialise one row per month through `endDate` (or
 * 12 months rolling from `startDate` if the tenancy is open-ended).
 * Each row starts in `EXPECTED`; user actions (manual "mark received"
 * or the auto-match path) flip it to `RECEIVED`, and a daily cron
 * flips stale ones to `OVERDUE` (§8.1). Because every receipt exists
 * up-front, alerting is just a WHERE clause on `(status, dueDate)` —
 * no imperative "was a receipt missed this month?" scan.
 *
 * The auto-match path (§8.2) hooks into the canonical-event projection
 * pipeline: when a UPI/NEFT credit is projected, the hook calls
 * `tryAutoMatchRentReceipt`; on success the receipt is marked RECEIVED
 * and `autoMatchedFromEventId` links back so the user can undo.
 */

import { Prisma, type RentReceipt } from '@prisma/client';
import { similarityRatio } from '@portfolioos/shared';
import { prisma } from '../lib/prisma.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/**
 * Transaction client type as handed to $transaction callbacks on our
 * extended Prisma client (the $allOperations extension widens the
 * inferred type away from `Prisma.TransactionClient`).
 */
type ExtendedTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// ── Types ────────────────────────────────────────────────────────────

const PROPERTY_TYPES = new Set([
  'RESIDENTIAL',
  'COMMERCIAL',
  'LAND',
  'PARKING',
]);

const RECEIPT_STATUS = {
  EXPECTED: 'EXPECTED',
  RECEIVED: 'RECEIVED',
  PARTIAL: 'PARTIAL',
  OVERDUE: 'OVERDUE',
  SKIPPED: 'SKIPPED',
} as const;

export type ReceiptStatus = (typeof RECEIPT_STATUS)[keyof typeof RECEIPT_STATUS];

export interface CreatePropertyInput {
  name: string;
  address?: string | null;
  propertyType: string;
  portfolioId?: string | null;
  purchaseDate?: string | null;
  purchasePrice?: string | null;
  currentValue?: string | null;
  isActive?: boolean;
}

export type UpdatePropertyInput = Partial<CreatePropertyInput>;

export interface CreateTenancyInput {
  propertyId: string;
  tenantName: string;
  tenantContact?: string | null;
  tenantEmail?: string | null;
  tenantPhone?: string | null;
  startDate: string;
  endDate?: string | null;
  monthlyRent: string;
  securityDeposit?: string | null;
  rentDueDay?: number;
  notes?: string | null;
}

export type UpdateTenancyInput = Partial<
  Omit<CreateTenancyInput, 'propertyId'>
> & { isActive?: boolean };

export interface MarkReceivedInput {
  receivedAmount: string;
  receivedOn: string;
  notes?: string | null;
}

export interface CreateExpenseInput {
  expenseType: string;
  amount: string;
  paidOn: string;
  description?: string | null;
  receiptUrl?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function parseIsoDate(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new BadRequestError(`Invalid date (expected YYYY-MM-DD): ${s}`);
  }
  return new Date(`${s}T00:00:00.000Z`);
}

function parseIsoDateOptional(
  s: string | null | undefined,
): Date | null | undefined {
  if (s === undefined) return undefined;
  if (s === null) return null;
  return parseIsoDate(s);
}

function parseDecimal(s: string, field: string): Prisma.Decimal {
  try {
    return new Prisma.Decimal(s);
  } catch {
    throw new BadRequestError(`Invalid decimal for ${field}: ${s}`);
  }
}

function parseDecimalOptional(
  s: string | null | undefined,
  field: string,
): Prisma.Decimal | null | undefined {
  if (s === undefined) return undefined;
  if (s === null) return null;
  return parseDecimal(s, field);
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/**
 * Build the canonical `YYYY-MM` label for a given UTC date.
 */
function forMonthLabel(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Compute the due date for a given month + rentDueDay, clamping the day
 * to the actual number of days in the target month (rentDueDay=31 in
 * February yields Feb-28/29, not a rollover to March 3).
 */
function dueDateFor(year: number, monthIndex0: number, dueDay: number): Date {
  const clamped = Math.min(Math.max(dueDay, 1), daysInMonth(year, monthIndex0));
  return new Date(Date.UTC(year, monthIndex0, clamped));
}

/**
 * Enumerate (forMonth, dueDate) tuples between start and end, inclusive
 * of the month containing `start` and the month containing `end`.
 * Defaults to a 12-month rolling window from `start` when `end` is null.
 */
function enumerateMonths(
  start: Date,
  end: Date | null,
  dueDay: number,
): Array<{ forMonth: string; dueDate: Date }> {
  const stop = end ?? new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 11, 1),
  );
  const result: Array<{ forMonth: string; dueDate: Date }> = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  while (
    y < stop.getUTCFullYear() ||
    (y === stop.getUTCFullYear() && m <= stop.getUTCMonth())
  ) {
    const due = dueDateFor(y, m, dueDay);
    result.push({ forMonth: forMonthLabel(due), dueDate: due });
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return result;
}

// ── Property CRUD ────────────────────────────────────────────────────

export async function listProperties(userId: string) {
  return prisma.rentalProperty.findMany({
    where: { userId },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: {
      tenancies: {
        orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
      },
      _count: { select: { expenses: true } },
    },
  });
}

export async function getProperty(userId: string, id: string) {
  const row = await prisma.rentalProperty.findUnique({
    where: { id },
    include: {
      tenancies: {
        orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
        include: {
          rentReceipts: { orderBy: { dueDate: 'desc' } },
        },
      },
      expenses: { orderBy: { paidOn: 'desc' } },
    },
  });
  if (!row) throw new NotFoundError('Property not found');
  if (row.userId !== userId) throw new ForbiddenError();
  return row;
}

export async function createProperty(
  userId: string,
  input: CreatePropertyInput,
) {
  if (!PROPERTY_TYPES.has(input.propertyType)) {
    throw new BadRequestError(
      `propertyType must be one of ${[...PROPERTY_TYPES].join(', ')}`,
    );
  }
  if (!input.name.trim()) {
    throw new BadRequestError('name is required');
  }
  if (input.portfolioId) {
    const owned = await prisma.portfolio.findFirst({
      where: { id: input.portfolioId, userId },
      select: { id: true },
    });
    if (!owned) throw new BadRequestError('portfolioId does not belong to user');
  }

  return prisma.rentalProperty.create({
    data: {
      userId,
      name: input.name.trim(),
      address: input.address ?? null,
      propertyType: input.propertyType,
      portfolioId: input.portfolioId ?? null,
      purchaseDate: parseIsoDateOptional(input.purchaseDate) ?? null,
      purchasePrice: parseDecimalOptional(input.purchasePrice, 'purchasePrice') ?? null,
      currentValue: parseDecimalOptional(input.currentValue, 'currentValue') ?? null,
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateProperty(
  userId: string,
  id: string,
  patch: UpdatePropertyInput,
) {
  await getProperty(userId, id);

  if (patch.propertyType !== undefined && !PROPERTY_TYPES.has(patch.propertyType)) {
    throw new BadRequestError(
      `propertyType must be one of ${[...PROPERTY_TYPES].join(', ')}`,
    );
  }
  if (patch.portfolioId) {
    const owned = await prisma.portfolio.findFirst({
      where: { id: patch.portfolioId, userId },
      select: { id: true },
    });
    if (!owned) throw new BadRequestError('portfolioId does not belong to user');
  }

  const data: Prisma.RentalPropertyUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.address !== undefined) data.address = patch.address;
  if (patch.propertyType !== undefined) data.propertyType = patch.propertyType;
  if (patch.portfolioId !== undefined) data.portfolioId = patch.portfolioId;
  if (patch.purchaseDate !== undefined)
    data.purchaseDate = parseIsoDateOptional(patch.purchaseDate);
  if (patch.purchasePrice !== undefined)
    data.purchasePrice = parseDecimalOptional(patch.purchasePrice, 'purchasePrice');
  if (patch.currentValue !== undefined)
    data.currentValue = parseDecimalOptional(patch.currentValue, 'currentValue');
  if (patch.isActive !== undefined) data.isActive = patch.isActive;

  return prisma.rentalProperty.update({ where: { id }, data });
}

export async function deleteProperty(userId: string, id: string) {
  await getProperty(userId, id);
  // Schema cascades through Tenancy → RentReceipt and PropertyExpense.
  await prisma.rentalProperty.delete({ where: { id } });
}

// ── Tenancy CRUD + receipt generation ────────────────────────────────

/**
 * Generate the schedule of `RentReceipt` rows for a newly-created
 * tenancy. Idempotent on `(tenancyId, forMonth)` via the model's unique
 * constraint, so calling this twice on the same tenancy does nothing
 * the second time — useful when `updateTenancy` extends `endDate` and
 * we want to backfill new months without disturbing existing ones.
 */
async function generateReceiptsForTenancy(
  tx: ExtendedTx,
  tenancyId: string,
  startDate: Date,
  endDate: Date | null,
  monthlyRent: Prisma.Decimal,
  rentDueDay: number,
): Promise<number> {
  const schedule = enumerateMonths(startDate, endDate, rentDueDay);
  if (schedule.length === 0) return 0;
  // Compute the OVERDUE cutoff once (today − OVERDUE_GRACE_DAYS). Receipts
  // with dueDate at or before this cutoff are written directly as OVERDUE
  // instead of EXPECTED so a freshly-created tenancy with a back-dated
  // startDate (common case: landlord onboards months into an active lease)
  // immediately surfaces in alerts — without this, the daily 01:00 IST cron
  // had to run before any past-due alerts would appear, which masked the
  // backlog for up to 24 hours after onboarding.
  const overdueCutoff = new Date();
  overdueCutoff.setUTCDate(overdueCutoff.getUTCDate() - OVERDUE_GRACE_DAYS);
  overdueCutoff.setUTCHours(0, 0, 0, 0);
  const data: Prisma.RentReceiptCreateManyInput[] = schedule.map((s) => ({
    tenancyId,
    forMonth: s.forMonth,
    expectedAmount: monthlyRent,
    dueDate: s.dueDate,
    status: s.dueDate <= overdueCutoff
      ? RECEIPT_STATUS.OVERDUE
      : RECEIPT_STATUS.EXPECTED,
  }));
  const result = await tx.rentReceipt.createMany({
    data,
    skipDuplicates: true,
  });
  return result.count;
}

export async function createTenancy(userId: string, input: CreateTenancyInput) {
  const property = await getProperty(userId, input.propertyId);
  if (!property.isActive) {
    throw new BadRequestError('Cannot create tenancy on inactive property');
  }

  const startDate = parseIsoDate(input.startDate);
  const endDate = parseIsoDateOptional(input.endDate) ?? null;
  if (endDate && endDate < startDate) {
    throw new BadRequestError('endDate cannot be before startDate');
  }

  const monthlyRent = parseDecimal(input.monthlyRent, 'monthlyRent');
  if (monthlyRent.lte(0)) {
    throw new BadRequestError('monthlyRent must be positive');
  }
  const rentDueDay = input.rentDueDay ?? 1;
  if (rentDueDay < 1 || rentDueDay > 31) {
    throw new BadRequestError('rentDueDay must be between 1 and 31');
  }

  const securityDeposit = parseDecimalOptional(
    input.securityDeposit,
    'securityDeposit',
  );

  return prisma.$transaction(async (tx) => {
    const tenancy = await tx.tenancy.create({
      data: {
        propertyId: input.propertyId,
        tenantName: input.tenantName.trim(),
        tenantContact: input.tenantContact ?? null,
        tenantEmail: input.tenantEmail?.trim() || null,
        tenantPhone: input.tenantPhone?.trim() || null,
        startDate,
        endDate,
        monthlyRent,
        securityDeposit: securityDeposit ?? null,
        rentDueDay,
        isActive: true,
        notes: input.notes ?? null,
      },
    });
    await generateReceiptsForTenancy(
      tx,
      tenancy.id,
      startDate,
      endDate,
      monthlyRent,
      rentDueDay,
    );
    return tenancy;
  });
}

async function getTenancyOwned(userId: string, tenancyId: string) {
  const row = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    include: { property: { select: { userId: true, id: true } } },
  });
  if (!row) throw new NotFoundError('Tenancy not found');
  if (row.property.userId !== userId) throw new ForbiddenError();
  return row;
}

export async function updateTenancy(
  userId: string,
  id: string,
  patch: UpdateTenancyInput,
) {
  const existing = await getTenancyOwned(userId, id);

  const data: Prisma.TenancyUpdateInput = {};
  if (patch.tenantName !== undefined) data.tenantName = patch.tenantName.trim();
  if (patch.tenantContact !== undefined) data.tenantContact = patch.tenantContact;
  if (patch.tenantEmail !== undefined) data.tenantEmail = patch.tenantEmail?.trim() || null;
  if (patch.tenantPhone !== undefined) data.tenantPhone = patch.tenantPhone?.trim() || null;
  if (patch.startDate !== undefined) {
    throw new BadRequestError(
      'startDate is immutable after tenancy creation — create a new tenancy instead',
    );
  }
  if (patch.rentDueDay !== undefined) {
    if (patch.rentDueDay < 1 || patch.rentDueDay > 31) {
      throw new BadRequestError('rentDueDay must be between 1 and 31');
    }
    data.rentDueDay = patch.rentDueDay;
  }
  if (patch.monthlyRent !== undefined) {
    const v = parseDecimal(patch.monthlyRent, 'monthlyRent');
    if (v.lte(0)) throw new BadRequestError('monthlyRent must be positive');
    data.monthlyRent = v;
  }
  if (patch.securityDeposit !== undefined) {
    data.securityDeposit = parseDecimalOptional(
      patch.securityDeposit,
      'securityDeposit',
    );
  }
  if (patch.notes !== undefined) data.notes = patch.notes;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;

  let newEndDate: Date | null | undefined;
  if (patch.endDate !== undefined) {
    newEndDate = parseIsoDateOptional(patch.endDate) ?? null;
    if (newEndDate && newEndDate < existing.startDate) {
      throw new BadRequestError('endDate cannot be before startDate');
    }
    data.endDate = newEndDate;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.tenancy.update({ where: { id }, data });

    // If endDate was extended, backfill receipts for the new months.
    // If it was shortened, cancel EXPECTED/OVERDUE receipts that fall
    // after the new end. We never touch RECEIVED/PARTIAL rows — those
    // are historical fact.
    if (newEndDate !== undefined) {
      if (newEndDate && (!existing.endDate || newEndDate > existing.endDate)) {
        await generateReceiptsForTenancy(
          tx,
          id,
          existing.startDate,
          newEndDate,
          updated.monthlyRent,
          updated.rentDueDay,
        );
      }
      if (newEndDate) {
        await tx.rentReceipt.updateMany({
          where: {
            tenancyId: id,
            dueDate: { gt: newEndDate },
            status: { in: [RECEIPT_STATUS.EXPECTED, RECEIPT_STATUS.OVERDUE] },
          },
          data: { status: RECEIPT_STATUS.SKIPPED },
        });
      }
    }

    // Sync pending reminders' `channels` JSON with the new contact state
    // so a landlord who fills in tenantEmail/tenantPhone from the
    // reminders panel can immediately approve & send without having to
    // re-run the scan or wait for the cron. We only touch
    // PENDING_APPROVAL rows — APPROVED/SENT/FAILED/REJECTED are
    // historical and shouldn't shift under the user.
    if (patch.tenantEmail !== undefined || patch.tenantPhone !== undefined) {
      const channels = {
        email: !!updated.tenantEmail,
        sms: !!updated.tenantPhone,
      };
      await tx.rentReminder.updateMany({
        where: { tenancyId: id, status: 'PENDING_APPROVAL' },
        data: { channels },
      });
    }

    return updated;
  });
}

export async function deleteTenancy(userId: string, id: string) {
  await getTenancyOwned(userId, id);
  await prisma.tenancy.delete({ where: { id } });
}

// ── Receipts ─────────────────────────────────────────────────────────

export interface ListReceiptsQuery {
  tenancyId?: string;
  propertyId?: string;
  status?: ReceiptStatus;
  from?: string;
  to?: string;
  limit?: number;
}

export async function listReceipts(userId: string, q: ListReceiptsQuery = {}) {
  const where: Prisma.RentReceiptWhereInput = {
    tenancy: { property: { userId } },
  };
  if (q.tenancyId) where.tenancyId = q.tenancyId;
  if (q.propertyId) {
    where.tenancy = { property: { userId, id: q.propertyId } };
  }
  if (q.status) where.status = q.status;
  if (q.from || q.to) {
    where.dueDate = {};
    if (q.from) where.dueDate.gte = parseIsoDate(q.from);
    if (q.to) where.dueDate.lte = parseIsoDate(q.to);
  }

  return prisma.rentReceipt.findMany({
    where,
    orderBy: [{ dueDate: 'desc' }],
    take: Math.min(q.limit ?? 200, 1000),
    include: {
      tenancy: {
        select: {
          id: true,
          tenantName: true,
          property: { select: { id: true, name: true, portfolioId: true } },
        },
      },
    },
  });
}

async function getReceiptOwned(userId: string, receiptId: string) {
  const row = await prisma.rentReceipt.findUnique({
    where: { id: receiptId },
    include: {
      tenancy: {
        include: { property: { select: { userId: true, portfolioId: true, name: true } } },
      },
    },
  });
  if (!row) throw new NotFoundError('Rent receipt not found');
  if (row.tenancy.property.userId !== userId) throw new ForbiddenError();
  return row;
}

/**
 * Flip a receipt to RECEIVED and write a corresponding CashFlow. The
 * CashFlow lands on the property's linked portfolio (if any) or the
 * user's default portfolio; if neither exists, we still update the
 * receipt so the user can fix the portfolio mapping later, but skip
 * the CashFlow write and record that in `notes`.
 */
export async function markReceiptReceived(
  userId: string,
  receiptId: string,
  input: MarkReceivedInput,
): Promise<RentReceipt> {
  const existing = await getReceiptOwned(userId, receiptId);
  if (existing.status === RECEIPT_STATUS.RECEIVED) {
    return existing;
  }

  const received = parseDecimal(input.receivedAmount, 'receivedAmount');
  if (received.lte(0)) {
    throw new BadRequestError('receivedAmount must be positive');
  }
  const receivedOn = parseIsoDate(input.receivedOn);

  const portfolioId =
    existing.tenancy.property.portfolioId ??
    (await prisma.portfolio.findFirst({
      where: { userId, isDefault: true },
      select: { id: true },
    }))?.id ??
    (await prisma.portfolio.findFirst({
      where: { userId },
      select: { id: true },
    }))?.id ??
    null;

  const expected = new Prisma.Decimal(existing.expectedAmount.toString());
  const status: ReceiptStatus =
    received.lt(expected)
      ? RECEIPT_STATUS.PARTIAL
      : RECEIPT_STATUS.RECEIVED;

  return prisma.$transaction(async (tx) => {
    let cashFlowId: string | null = null;
    if (portfolioId) {
      const cf = await tx.cashFlow.create({
        data: {
          portfolioId,
          date: receivedOn,
          type: 'INFLOW',
          amount: received,
          description: `Rent received — ${existing.tenancy.property.name} / ${existing.tenancy.tenantName} (${existing.forMonth})`,
        },
        select: { id: true },
      });
      cashFlowId = cf.id;
    }
    const updated = await tx.rentReceipt.update({
      where: { id: receiptId },
      data: {
        status,
        receivedAmount: received,
        receivedOn,
        notes: input.notes ?? existing.notes,
        cashFlowId,
      },
    });
    // Receipt is settled — abandon any pending reminders for this row so
    // we don't bother the tenant about money we already received.
    await tx.rentReminder.updateMany({
      where: { receiptId, status: 'PENDING_APPROVAL' },
      data: { status: 'SUPERSEDED' },
    });
    return updated;
  });
}

export async function skipReceipt(
  userId: string,
  receiptId: string,
  reason?: string | null,
) {
  const existing = await getReceiptOwned(userId, receiptId);
  if (
    existing.status === RECEIPT_STATUS.RECEIVED ||
    existing.status === RECEIPT_STATUS.PARTIAL
  ) {
    throw new BadRequestError(
      'Cannot skip a receipt already marked received — edit/unlink first',
    );
  }
  return prisma.rentReceipt.update({
    where: { id: receiptId },
    data: {
      status: RECEIPT_STATUS.SKIPPED,
      notes: reason ?? existing.notes,
    },
  });
}

/**
 * Pick the right "unsettled" status to revert to. If the original dueDate
 * is past the OVERDUE grace window we land back on OVERDUE so the alert
 * resurfaces; otherwise we drop to EXPECTED. Used by both undo-received
 * and undo-skipped paths so a misclick doesn't quietly disappear a
 * receipt that's still genuinely overdue.
 */
function unsettledStatusFor(dueDate: Date): ReceiptStatus {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - OVERDUE_GRACE_DAYS);
  cutoff.setUTCHours(0, 0, 0, 0);
  return dueDate <= cutoff ? RECEIPT_STATUS.OVERDUE : RECEIPT_STATUS.EXPECTED;
}

/**
 * Undo a manual "mark received" / "auto-match" click. Resets the receipt
 * back to EXPECTED or OVERDUE depending on its dueDate, clears the
 * received fields, and removes any CashFlow row we created when the
 * mark-received originally fired so the portfolio's cash position
 * doesn't double-count.
 */
export async function unmarkReceived(userId: string, receiptId: string) {
  const existing = await getReceiptOwned(userId, receiptId);
  if (
    existing.status !== RECEIPT_STATUS.RECEIVED &&
    existing.status !== RECEIPT_STATUS.PARTIAL
  ) {
    throw new BadRequestError(
      'Receipt is not in a received state — nothing to undo',
    );
  }
  const nextStatus = unsettledStatusFor(existing.dueDate);
  return prisma.$transaction(async (tx) => {
    if (existing.cashFlowId) {
      await tx.cashFlow.deleteMany({ where: { id: existing.cashFlowId } });
    }
    return tx.rentReceipt.update({
      where: { id: receiptId },
      data: {
        status: nextStatus,
        receivedAmount: null,
        receivedOn: null,
        cashFlowId: null,
        autoMatchedFromEventId: null,
      },
    });
  });
}

/**
 * Undo a manual "skip" click. Drops back to EXPECTED or OVERDUE
 * depending on dueDate so a skipped-by-mistake receipt re-enters the
 * alert queue.
 */
export async function unskipReceipt(userId: string, receiptId: string) {
  const existing = await getReceiptOwned(userId, receiptId);
  if (existing.status !== RECEIPT_STATUS.SKIPPED) {
    throw new BadRequestError('Receipt is not skipped — nothing to undo');
  }
  return prisma.rentReceipt.update({
    where: { id: receiptId },
    data: { status: unsettledStatusFor(existing.dueDate) },
  });
}

// ── Expenses ─────────────────────────────────────────────────────────

const EXPENSE_TYPES = new Set([
  'PROPERTY_TAX',
  'MAINTENANCE',
  'REPAIRS',
  'UTILITIES',
  'AGENT_FEE',
  'LEGAL',
  'OTHER',
]);

export async function listExpenses(userId: string, propertyId?: string) {
  return prisma.propertyExpense.findMany({
    where: {
      property: {
        userId,
        ...(propertyId ? { id: propertyId } : {}),
      },
    },
    orderBy: { paidOn: 'desc' },
  });
}

export async function addExpense(
  userId: string,
  propertyId: string,
  input: CreateExpenseInput,
) {
  await getProperty(userId, propertyId);
  if (!EXPENSE_TYPES.has(input.expenseType)) {
    throw new BadRequestError(
      `expenseType must be one of ${[...EXPENSE_TYPES].join(', ')}`,
    );
  }
  const amount = parseDecimal(input.amount, 'amount');
  if (amount.lte(0)) throw new BadRequestError('amount must be positive');

  return prisma.propertyExpense.create({
    data: {
      propertyId,
      expenseType: input.expenseType,
      amount,
      paidOn: parseIsoDate(input.paidOn),
      description: input.description ?? null,
      receiptUrl: input.receiptUrl ?? null,
    },
  });
}

export async function removeExpense(userId: string, expenseId: string) {
  const row = await prisma.propertyExpense.findUnique({
    where: { id: expenseId },
    include: { property: { select: { userId: true } } },
  });
  if (!row) throw new NotFoundError('Expense not found');
  if (row.property.userId !== userId) throw new ForbiddenError();
  await prisma.propertyExpense.delete({ where: { id: expenseId } });
}

// ── Reporting ────────────────────────────────────────────────────────

export interface PropertyPnL {
  propertyId: string;
  from: string;
  to: string;
  rentReceived: string;
  expensesTotal: string;
  netPnL: string;
  receiptCount: number;
  expenseCount: number;
}

export async function propertyPnL(
  userId: string,
  propertyId: string,
  from: string,
  to: string,
): Promise<PropertyPnL> {
  await getProperty(userId, propertyId);
  const fromDate = parseIsoDate(from);
  const toDate = parseIsoDate(to);

  const receipts = await prisma.rentReceipt.findMany({
    where: {
      tenancy: { propertyId },
      status: { in: [RECEIPT_STATUS.RECEIVED, RECEIPT_STATUS.PARTIAL] },
      receivedOn: { gte: fromDate, lte: toDate },
    },
    select: { receivedAmount: true },
  });
  const expenses = await prisma.propertyExpense.findMany({
    where: {
      propertyId,
      paidOn: { gte: fromDate, lte: toDate },
    },
    select: { amount: true },
  });

  let rentTotal = new Prisma.Decimal(0);
  for (const r of receipts) {
    if (r.receivedAmount) rentTotal = rentTotal.plus(r.receivedAmount.toString());
  }
  let expTotal = new Prisma.Decimal(0);
  for (const e of expenses) expTotal = expTotal.plus(e.amount.toString());

  return {
    propertyId,
    from,
    to,
    rentReceived: rentTotal.toFixed(2),
    expensesTotal: expTotal.toFixed(2),
    netPnL: rentTotal.minus(expTotal).toFixed(2),
    receiptCount: receipts.length,
    expenseCount: expenses.length,
  };
}

// ── Overdue cron + auto-match ────────────────────────────────────────

const OVERDUE_GRACE_DAYS = 7;
const AUTO_MATCH_AMOUNT_TOLERANCE = new Prisma.Decimal(10);
const AUTO_MATCH_DATE_WINDOW_DAYS = 5;
const AUTO_MATCH_NAME_SIMILARITY = 0.5;

/**
 * Flip every EXPECTED receipt whose `dueDate` is older than today by at
 * least `OVERDUE_GRACE_DAYS` into `OVERDUE`. Returns the number of rows
 * updated. Scoped to `userId` when provided; the daily cron calls it
 * with no userId and it pans across all users (RLS bypass handled by
 * the caller via `runInSystemContext`).
 */
export async function markOverdueReceipts(userId?: string): Promise<number> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - OVERDUE_GRACE_DAYS);
  cutoff.setUTCHours(0, 0, 0, 0);

  const where: Prisma.RentReceiptWhereInput = {
    status: RECEIPT_STATUS.EXPECTED,
    dueDate: { lte: cutoff },
  };
  if (userId) {
    where.tenancy = { property: { userId } };
  }

  const result = await prisma.rentReceipt.updateMany({
    where,
    data: { status: RECEIPT_STATUS.OVERDUE },
  });
  if (result.count > 0) {
    logger.info(
      { count: result.count, userId: userId ?? '<all>' },
      'rental.overdue.flipped',
    );
  }
  return result.count;
}

export interface AutoMatchCandidateEvent {
  id: string;
  userId: string;
  eventDate: Date;
  amount: Prisma.Decimal | null;
  counterparty: string | null;
}

/**
 * Attempt to auto-match a UPI/NEFT CREDIT event to a single EXPECTED
 * receipt per §8.2:
 *   • amount within ±₹10 of receipt.expectedAmount
 *   • dueDate within ±5 days of event.eventDate
 *   • tenantName similarity ≥ 0.5 to event.counterparty (when present)
 *
 * Ambiguity wins: if more than one receipt qualifies, we refuse to
 * match — the user can resolve manually. Returns the matched receipt
 * id on success, null when no match or ambiguous.
 */
export async function tryAutoMatchRentReceipt(
  event: AutoMatchCandidateEvent,
): Promise<{ receiptId: string; reason: string } | null> {
  if (!event.amount) return null;
  const amount = new Prisma.Decimal(event.amount.toString());

  const low = amount.minus(AUTO_MATCH_AMOUNT_TOLERANCE);
  const high = amount.plus(AUTO_MATCH_AMOUNT_TOLERANCE);
  const dateLow = new Date(event.eventDate.getTime());
  dateLow.setUTCDate(dateLow.getUTCDate() - AUTO_MATCH_DATE_WINDOW_DAYS);
  const dateHigh = new Date(event.eventDate.getTime());
  dateHigh.setUTCDate(dateHigh.getUTCDate() + AUTO_MATCH_DATE_WINDOW_DAYS);

  const candidates = await prisma.rentReceipt.findMany({
    where: {
      status: { in: [RECEIPT_STATUS.EXPECTED, RECEIPT_STATUS.OVERDUE] },
      expectedAmount: { gte: low, lte: high },
      dueDate: { gte: dateLow, lte: dateHigh },
      tenancy: { property: { userId: event.userId } },
    },
    include: {
      tenancy: {
        select: { id: true, tenantName: true, property: { select: { id: true, name: true, portfolioId: true } } },
      },
    },
  });

  if (candidates.length === 0) return null;

  // Name similarity: if the event lacks a counterparty, fall back to
  // amount+date only. We then require a single candidate — if there
  // are multiple, ambiguity blocks the auto-match.
  const withNameScore = candidates.map((c) => ({
    candidate: c,
    score: event.counterparty
      ? similarityRatio(event.counterparty, c.tenancy.tenantName)
      : 0,
  }));
  const nameFiltered = event.counterparty
    ? withNameScore.filter((r) => r.score >= AUTO_MATCH_NAME_SIMILARITY)
    : withNameScore;

  if (nameFiltered.length === 0) return null;
  if (nameFiltered.length > 1) return null; // ambiguous — don't guess

  const chosen = nameFiltered[0]!;
  return {
    receiptId: chosen.candidate.id,
    reason: `amount=±₹${AUTO_MATCH_AMOUNT_TOLERANCE.toString()}, date=±${AUTO_MATCH_DATE_WINDOW_DAYS}d, name_sim=${chosen.score.toFixed(2)}`,
  };
}

/**
 * Commit an auto-match: flip the receipt to RECEIVED and link the
 * event id (and optionally a pre-existing CashFlow created upstream by
 * the canonical-event projection pipeline, so we don't double-count
 * the credit). If `cashFlowId` is null and the property has a linked
 * portfolio, we create a CashFlow ourselves; the caller can use that
 * form when invoking the auto-match outside the projection pipeline.
 */
export async function applyAutoMatch(
  userId: string,
  receiptId: string,
  event: AutoMatchCandidateEvent,
  existingCashFlowId: string | null = null,
): Promise<RentReceipt> {
  const existing = await getReceiptOwned(userId, receiptId);
  if (existing.status === RECEIPT_STATUS.RECEIVED) return existing;

  const received = event.amount
    ? new Prisma.Decimal(event.amount.toString())
    : new Prisma.Decimal(existing.expectedAmount.toString());
  const receivedOn = event.eventDate;

  const portfolioId = existing.tenancy.property.portfolioId ?? null;

  const expected = new Prisma.Decimal(existing.expectedAmount.toString());
  const status: ReceiptStatus =
    received.lt(expected)
      ? RECEIPT_STATUS.PARTIAL
      : RECEIPT_STATUS.RECEIVED;

  return prisma.$transaction(async (tx) => {
    let cashFlowId: string | null = existingCashFlowId;
    if (!cashFlowId && portfolioId) {
      const cf = await tx.cashFlow.create({
        data: {
          portfolioId,
          date: receivedOn,
          type: 'INFLOW',
          amount: received,
          description: `Auto-matched rent — ${existing.tenancy.property.name} / ${existing.tenancy.tenantName} (${existing.forMonth})`,
        },
        select: { id: true },
      });
      cashFlowId = cf.id;
    }
    return tx.rentReceipt.update({
      where: { id: receiptId },
      data: {
        status,
        receivedAmount: received,
        receivedOn,
        cashFlowId,
        autoMatchedFromEventId: event.id,
      },
    });
  });
}

/**
 * Projection-pipeline hook: after a UPI/NEFT CREDIT event has been
 * projected into a generic CashFlow, try to auto-match it against an
 * expected rent receipt. On match we re-point the existing CashFlow at
 * the rental context (updating description) and flip the receipt.
 *
 * Returns an outcome summary the caller can log or surface. Never
 * throws — failures are logged and the projection stays durable; the
 * auto-match is always a best-effort enhancement.
 */
export async function hookAutoMatchRentalCredit(
  event: AutoMatchCandidateEvent,
  cashFlowId: string | null,
): Promise<
  | { kind: 'matched'; receiptId: string; reason: string }
  | { kind: 'no_match' }
  | { kind: 'ambiguous' }
> {
  try {
    const match = await tryAutoMatchRentReceipt(event);
    if (!match) return { kind: 'no_match' };
    await applyAutoMatch(event.userId, match.receiptId, event, cashFlowId);
    logger.info(
      { eventId: event.id, receiptId: match.receiptId, reason: match.reason },
      'rental.auto_match.success',
    );
    return { kind: 'matched', receiptId: match.receiptId, reason: match.reason };
  } catch (err) {
    logger.warn({ err, eventId: event.id }, 'rental.auto_match.failed');
    return { kind: 'no_match' };
  }
}

/**
 * Undo a prior auto-match: flip the receipt back to EXPECTED and delete
 * the linked CashFlow. Keeps the `autoMatchedFromEventId` null so the
 * event won't re-match automatically — the user explicitly rejected
 * this pairing.
 */
export async function undoAutoMatch(userId: string, receiptId: string) {
  const existing = await getReceiptOwned(userId, receiptId);
  if (!existing.autoMatchedFromEventId) {
    throw new BadRequestError('Receipt was not auto-matched');
  }
  return prisma.$transaction(async (tx) => {
    if (existing.cashFlowId) {
      await tx.cashFlow.deleteMany({ where: { id: existing.cashFlowId } });
    }
    return tx.rentReceipt.update({
      where: { id: receiptId },
      data: {
        status: RECEIPT_STATUS.EXPECTED,
        receivedAmount: null,
        receivedOn: null,
        cashFlowId: null,
        autoMatchedFromEventId: null,
      },
    });
  });
}
