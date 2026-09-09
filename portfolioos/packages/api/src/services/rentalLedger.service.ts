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
import { BadRequestError, NotFoundError, ForbiddenError } from '../lib/errors.js';
import { formatINR } from '@portfolioos/shared';
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

/**
 * ALLOCATION charge side — increases what the tenant owes, so it takes part
 * in `allocateCredits` and in `balanceDue`. Deliberately narrower than the
 * DISPLAY charge side below; do not merge the two.
 */
const CHARGE_TYPES = new Set<LedgerEntryType>(['LATE_FEE', 'OTHER_CHARGE']);
/** Credit side — reduces what the tenant owes. */
const CREDIT_TYPES = new Set<LedgerEntryType>(['PAYMENT', 'DISCOUNT']);
/**
 * DISPLAY charge side — the khata's "You gave" column and the statement
 * PDF's "Charged" column. A `DEPOSIT_REFUND` is money leaving the landlord,
 * which the spec's §4 table puts on that side, and which the entry dialog
 * already files under GAVE — so it must not fall through to CREDIT and read
 * as money received. It stays OUT of `CHARGE_TYPES` because it changes
 * `depositHeld`, never `balanceDue`, and it is excluded from
 * `runningBalance` in `getTenancyLedger` for the same reason.
 */
const DISPLAY_CHARGE_TYPES = new Set<LedgerEntryType>([
  ...CHARGE_TYPES,
  'DEPOSIT_REFUND',
]);

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
  // Serialise every recompute of a given tenancy. Under READ COMMITTED, two
  // concurrent writers — a user recording a payment while the auto-match
  // hook projects a bank credit, say — each read a snapshot missing the
  // other's entry, and whichever commits last overwrites `balanceDue` and
  // the whole receipt projection with a total that silently omits one
  // payment. Nothing self-heals that. Taking the lock as the FIRST statement
  // means the loser blocks here and then re-reads both tables below, seeing
  // the winner's committed rows.
  //
  // This runs under RLS as the app role: `Tenancy`'s policy is FOR ALL with
  // an owner-join subquery, and Postgres applies it to `SELECT … FOR UPDATE`
  // the same as to a plain read — a row the caller cannot see simply does
  // not come back (and does not get locked). Verified against the dev
  // database as `portfolioos_app` (NOSUPERUSER, NOBYPASSRLS); see
  // test/invariants/rental-ledger-concurrency.test.ts.
  await tx.$queryRaw`SELECT id FROM "Tenancy" WHERE id = ${tenancyId} FOR UPDATE`;

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
    // `receivedOn` = the date money FIRST landed against this month, which is
    // the meaning it carried before the ledger existed and the meaning two
    // pre-existing consumers depend on: dashboard.service.ts's YTD rental
    // income and rental.service.ts's propertyPnL both select
    // `status IN ('RECEIVED','PARTIAL') AND receivedOn >= <date>`. Projecting
    // `settledOn` here instead would leave every PARTIAL receipt null and
    // silently drop partly-paid months from both totals — a tenant who paid
    // ₹20,000 of ₹45,000 would contribute ₹0 to each. Don't "simplify" this
    // back to `settledOn`.
    const nextReceivedOn = alloc?.firstCreditDate ?? null;
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

  // Idempotency guard: only touch the row (and bump balanceComputedAt) when
  // the computed totals actually differ from what's stored. Without this,
  // a no-op recompute — e.g. the daily overdue cron running against an
  // untouched ledger — would still write every Tenancy row on every run,
  // which both violates "recompute twice changes nothing" and means
  // balanceComputedAt would record "last recomputed" rather than "last
  // changed". Don't remove this guard to "simplify" the write.
  const tenancy = await tx.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
  const balanceChanged =
    !tenancy.balanceDue.equals(balanceDue) || !tenancy.depositHeld.equals(depositHeld);
  if (balanceChanged) {
    await tx.tenancy.update({
      where: { id: tenancyId },
      data: { balanceDue, depositHeld, balanceComputedAt: new Date() },
    });
  }

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

/**
 * Ownership check shared by every tenancy-scoped service function. Lives
 * here (rather than rental.service.ts, which imports from this file) so
 * rentalLedger.service.ts has no dependency back on rental.service.ts.
 */
export async function getTenancyOwned(userId: string, tenancyId: string) {
  const row = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    include: { property: { select: { userId: true, id: true } } },
  });
  if (!row) throw new NotFoundError('Tenancy not found');
  if (row.property.userId !== userId) throw new ForbiddenError();
  return row;
}

const CASH_FLOW_DIRECTION: Partial<Record<LedgerEntryType, 'INFLOW' | 'OUTFLOW'>> = {
  PAYMENT: 'INFLOW',
  DEPOSIT: 'INFLOW',
  DEPOSIT_REFUND: 'OUTFLOW',
};

export interface CreateLedgerEntryInput {
  entryType: LedgerEntryType;
  amount: string;
  entryDate: string;
  forMonth?: string | null;
  note?: string | null;
  attachmentUrl?: string | null;
}
export type UpdateLedgerEntryInput = Partial<CreateLedgerEntryInput>;

function parseAmount(raw: string): Prisma.Decimal {
  let d: Prisma.Decimal;
  try {
    d = new Prisma.Decimal(raw);
  } catch {
    throw new BadRequestError(`Invalid decimal for amount: ${raw}`);
  }
  if (d.lte(0)) throw new BadRequestError('amount must be positive');
  return d;
}

function parseDay(raw: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new BadRequestError(`Invalid date (expected YYYY-MM-DD): ${raw}`);
  }
  return new Date(`${raw}T00:00:00.000Z`);
}

function assertEntryType(t: string): LedgerEntryType {
  if (!(LEDGER_ENTRY_TYPES as readonly string[]).includes(t)) {
    throw new BadRequestError(
      `Invalid entryType: ${t}. Expected one of ${LEDGER_ENTRY_TYPES.join(', ')}`,
    );
  }
  return t as LedgerEntryType;
}

async function getEntryOwned(userId: string, entryId: string) {
  const row = await prisma.rentLedgerEntry.findUnique({
    where: { id: entryId },
    include: { tenancy: { include: { property: { select: { userId: true, portfolioId: true, name: true } } } } },
  });
  if (!row) throw new NotFoundError('Ledger entry not found');
  if (row.tenancy.property.userId !== userId) throw new ForbiddenError();
  return row;
}

/**
 * Which portfolio a rental cash movement belongs to.
 *
 * A rental property need not be linked to a portfolio, but the money still
 * has to land somewhere or it never reaches Cash Activity. `markReceiptReceived`
 * has always fallen back to the user's default portfolio, then to any portfolio
 * they own. The khata's own write paths did not, so the same rupee recorded
 * from the khata instead of the property page produced no CashFlow at all on an
 * unlinked property. One resolver, used by every rental cash write, so the two
 * screens cannot disagree again.
 *
 * Null means the user owns no portfolio at all — then there is genuinely
 * nowhere to put it, and the ledger entry stands on its own.
 */
export async function resolveRentalPortfolioId(
  userId: string,
  propertyPortfolioId: string | null,
): Promise<string | null> {
  if (propertyPortfolioId) return propertyPortfolioId;
  const preferred = await prisma.portfolio.findFirst({
    where: { userId, isDefault: true },
    select: { id: true },
  });
  if (preferred) return preferred.id;
  const fallback = await prisma.portfolio.findFirst({
    where: { userId },
    select: { id: true },
  });
  return fallback?.id ?? null;
}

export async function createLedgerEntry(
  userId: string,
  tenancyId: string,
  input: CreateLedgerEntryInput,
): Promise<{ id: string }> {
  const tenancy = await getTenancyOwned(userId, tenancyId);
  const entryType = assertEntryType(input.entryType);
  const amount = parseAmount(input.amount);
  const entryDate = parseDay(input.entryDate);
  if (input.forMonth && !/^\d{4}-\d{2}$/.test(input.forMonth)) {
    throw new BadRequestError(`Invalid forMonth (expected YYYY-MM): ${input.forMonth}`);
  }

  const property = await prisma.rentalProperty.findUniqueOrThrow({
    where: { id: tenancy.propertyId },
    select: { name: true, portfolioId: true },
  });
  const direction = CASH_FLOW_DIRECTION[entryType];
  const portfolioId = await resolveRentalPortfolioId(userId, property.portfolioId);

  return runInTransaction(async (tx) => {
    let cashFlowId: string | null = null;
    if (direction && portfolioId) {
      const cf = await tx.cashFlow.create({
        data: {
          portfolioId,
          date: entryDate,
          type: direction,
          amount,
          description: `${entryType} — ${property.name} / ${tenancy.tenantName}`,
        },
        select: { id: true },
      });
      cashFlowId = cf.id;
    }
    const entry = await tx.rentLedgerEntry.create({
      data: {
        tenancyId,
        entryType,
        amount,
        entryDate,
        forMonth: input.forMonth ?? null,
        note: input.note ?? null,
        attachmentUrl: input.attachmentUrl ?? null,
        cashFlowId,
      },
      select: { id: true },
    });
    await recomputeTenancyLedger(tx, tenancyId);
    return entry;
  });
}

export async function updateLedgerEntry(
  userId: string,
  entryId: string,
  patch: UpdateLedgerEntryInput,
): Promise<{ id: string }> {
  const existing = await getEntryOwned(userId, entryId);
  const previousType = existing.entryType as LedgerEntryType;
  const parsedAmount = patch.amount !== undefined ? parseAmount(patch.amount) : undefined;
  const parsedEntryDate = patch.entryDate !== undefined ? parseDay(patch.entryDate) : undefined;
  const nextType = patch.entryType !== undefined ? assertEntryType(patch.entryType) : previousType;

  const data: Prisma.RentLedgerEntryUpdateInput = {};
  if (patch.entryType !== undefined) data.entryType = nextType;
  if (parsedAmount !== undefined) data.amount = parsedAmount;
  if (parsedEntryDate !== undefined) data.entryDate = parsedEntryDate;
  if (patch.forMonth !== undefined) data.forMonth = patch.forMonth;
  if (patch.note !== undefined) data.note = patch.note;
  if (patch.attachmentUrl !== undefined) data.attachmentUrl = patch.attachmentUrl;

  // Reconcile the CashFlow against the effective (possibly patched) entryType,
  // amount and date, rather than assuming "money-moving-ness" is unchanged.
  // Money moves in exactly one place — the CashFlow row created alongside a
  // PAYMENT/DEPOSIT/DEPOSIT_REFUND entry — so a patch that crosses that
  // boundary must create or delete it, not just leave a stale row behind.
  const previousDirection = CASH_FLOW_DIRECTION[previousType];
  const nextDirection = CASH_FLOW_DIRECTION[nextType];
  const effectiveAmount = parsedAmount ?? existing.amount;
  const effectiveEntryDate = parsedEntryDate ?? existing.entryDate;
  const property = existing.tenancy.property;
  // Same format createLedgerEntry uses. Rebuilt from the *effective* (new)
  // entryType so a type change never leaves a description naming the old one.
  const effectiveDescription = `${nextType} — ${property.name} / ${existing.tenancy.tenantName}`;

  return runInTransaction(async (tx) => {
    if (!previousDirection && nextDirection) {
      // Was not money-moving, now is: create the CashFlow (same shape as
      // createLedgerEntry), through the same portfolio resolver so an
      // unlinked property still lands its cash somewhere.
      const portfolioId = await resolveRentalPortfolioId(userId, property.portfolioId);
      if (portfolioId) {
        const cf = await tx.cashFlow.create({
          data: {
            portfolioId,
            date: effectiveEntryDate,
            type: nextDirection,
            amount: effectiveAmount,
            description: effectiveDescription,
          },
          select: { id: true },
        });
        data.cashFlowId = cf.id;
      }
    } else if (previousDirection && !nextDirection) {
      // Was money-moving, now is not: delete the CashFlow and unlink it.
      if (existing.cashFlowId) {
        await tx.cashFlow.deleteMany({ where: { id: existing.cashFlowId } });
      }
      data.cashFlowId = null;
    } else if (previousDirection && nextDirection && existing.cashFlowId) {
      // Still money-moving on both sides: keep the same row, but its
      // direction may have flipped (e.g. PAYMENT -> DEPOSIT_REFUND), not
      // just its amount/date — and its description, which was built at
      // creation time from the *old* entryType, must be rebuilt too, or a
      // DEPOSIT_REFUND row would keep reading "PAYMENT — …".
      await tx.cashFlow.update({
        where: { id: existing.cashFlowId },
        data: {
          amount: effectiveAmount,
          date: effectiveEntryDate,
          type: nextDirection,
          description: effectiveDescription,
        },
      });
    }

    const updated = await tx.rentLedgerEntry.update({
      where: { id: entryId }, data, select: { id: true },
    });
    await recomputeTenancyLedger(tx, existing.tenancyId);
    return { id: updated.id };
  });
}

export async function deleteLedgerEntry(userId: string, entryId: string): Promise<void> {
  const existing = await getEntryOwned(userId, entryId);
  await runInTransaction(async (tx) => {
    if (existing.cashFlowId) {
      await tx.cashFlow.deleteMany({ where: { id: existing.cashFlowId } });
    }
    await tx.rentLedgerEntry.delete({ where: { id: entryId } });
    await recomputeTenancyLedger(tx, existing.tenancyId);
  });
}

export interface LedgerRowDTO {
  id: string;
  kind: 'CHARGE' | 'CREDIT';
  source: 'RECEIPT' | 'ENTRY';
  entryType: string;
  date: string;
  amount: string;
  note: string | null;
  attachmentUrl: string | null;
  forMonth: string | null;
  /** Balance after this row, oldest-to-newest. */
  runningBalance: string;
}

export interface TenancyLedgerDTO {
  tenancyId: string;
  tenantName: string;
  tenantPhone: string | null;
  propertyId: string;
  propertyName: string;
  monthlyRent: string;
  balanceDue: string;
  depositHeld: string;
  /** Newest first. */
  rows: LedgerRowDTO[];
}

export async function getTenancyLedger(
  userId: string,
  tenancyId: string,
): Promise<TenancyLedgerDTO> {
  const tenancy = await getTenancyOwned(userId, tenancyId);
  const [property, receipts, entries, fresh] = await Promise.all([
    prisma.rentalProperty.findUniqueOrThrow({
      where: { id: tenancy.propertyId }, select: { id: true, name: true },
    }),
    prisma.rentReceipt.findMany({ where: { tenancyId }, orderBy: { dueDate: 'asc' } }),
    prisma.rentLedgerEntry.findMany({ where: { tenancyId }, orderBy: { entryDate: 'asc' } }),
    prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } }),
  ]);

  type Row = Omit<LedgerRowDTO, 'runningBalance'> & { sortKey: number };
  const rows: Row[] = [];
  for (const r of receipts) {
    if (r.isSkipped) continue;
    rows.push({
      id: r.id, kind: 'CHARGE', source: 'RECEIPT', entryType: 'RENT_CHARGE',
      date: r.dueDate.toISOString().slice(0, 10),
      amount: r.expectedAmount.toString(), note: r.notes,
      attachmentUrl: null, forMonth: r.forMonth, sortKey: r.dueDate.getTime(),
    });
  }
  for (const e of entries) {
    const type = e.entryType as LedgerEntryType;
    const kind: 'CHARGE' | 'CREDIT' = DISPLAY_CHARGE_TYPES.has(type) ? 'CHARGE' : 'CREDIT';
    rows.push({
      id: e.id, kind, source: 'ENTRY', entryType: e.entryType,
      date: e.entryDate.toISOString().slice(0, 10),
      amount: e.amount.toString(), note: e.note,
      attachmentUrl: e.attachmentUrl, forMonth: e.forMonth, sortKey: e.entryDate.getTime(),
    });
  }
  rows.sort((a, b) => a.sortKey - b.sortKey);

  // Deposits sit outside the rent balance, so they carry it unchanged.
  let running = ZERO;
  const withBalance: LedgerRowDTO[] = rows.map(({ sortKey: _sortKey, ...row }) => {
    const amt = new Prisma.Decimal(row.amount);
    if (row.entryType !== 'DEPOSIT' && row.entryType !== 'DEPOSIT_REFUND') {
      running = row.kind === 'CHARGE' ? running.plus(amt) : running.minus(amt);
    }
    return { ...row, runningBalance: running.toString() };
  });

  return {
    tenancyId,
    tenantName: tenancy.tenantName,
    tenantPhone: tenancy.tenantPhone,
    propertyId: property.id,
    propertyName: property.name,
    monthlyRent: fresh.monthlyRent.toString(),
    balanceDue: fresh.balanceDue.toString(),
    depositHeld: fresh.depositHeld.toString(),
    rows: withBalance.reverse(),
  };
}

export interface CollectionRowDTO {
  tenancyId: string;
  tenantName: string;
  tenantPhone: string | null;
  propertyId: string;
  propertyName: string;
  balanceDue: string;
  oldestUnpaidMonth: string | null;
  oldestUnpaidDueDate: string | null;
}

export async function listCollections(userId: string): Promise<CollectionRowDTO[]> {
  const tenancies = await prisma.tenancy.findMany({
    where: { isActive: true, property: { userId }, balanceDue: { gt: 0 } },
    include: { property: { select: { id: true, name: true } } },
    orderBy: { balanceDue: 'desc' },
  });
  if (tenancies.length === 0) return [];

  const oldest = await prisma.rentReceipt.findMany({
    where: {
      tenancyId: { in: tenancies.map((t) => t.id) },
      isSkipped: false,
      status: { in: ['EXPECTED', 'OVERDUE', 'PARTIAL'] },
    },
    orderBy: { dueDate: 'asc' },
    select: { tenancyId: true, forMonth: true, dueDate: true },
  });
  const firstUnpaid = new Map<string, { forMonth: string; dueDate: Date }>();
  for (const r of oldest) {
    if (!firstUnpaid.has(r.tenancyId)) {
      firstUnpaid.set(r.tenancyId, { forMonth: r.forMonth, dueDate: r.dueDate });
    }
  }

  return tenancies.map((t) => {
    const u = firstUnpaid.get(t.id);
    return {
      tenancyId: t.id,
      tenantName: t.tenantName,
      tenantPhone: t.tenantPhone,
      propertyId: t.property.id,
      propertyName: t.property.name,
      balanceDue: t.balanceDue.toString(),
      oldestUnpaidMonth: u?.forMonth ?? null,
      oldestUnpaidDueDate: u?.dueDate.toISOString().slice(0, 10) ?? null,
    };
  });
}

/**
 * Normalise an Indian mobile to E.164 digits for a wa.me link. Mirrors the
 * rule in notifications/sms.service.ts, minus the leading '+' (wa.me wants
 * bare digits). Returns null when the number is unusable, so the UI can
 * disable the button instead of opening a broken link.
 */
function waDigits(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-()+]/g, '');
  if (!/^\d{8,15}$/.test(cleaned)) return null;
  // "09876543210" is the commonest way an Indian mobile is written down. The
  // trunk-prefix zero is not part of the number, and leaving it on produced
  // a wa.me link to an 11-digit non-number — dead, with no error. Strip it
  // before the 10-digit test so the country code still gets prepended.
  const national = /^0\d{10}$/.test(cleaned) ? cleaned.slice(1) : cleaned;
  if (national.length === 10 && /^[6-9]\d{9}$/.test(national)) return `91${national}`;
  return national;
}

export async function buildReminderMessage(
  userId: string,
  tenancyId: string,
): Promise<{ text: string; waUrl: string | null }> {
  const ledger = await getTenancyLedger(userId, tenancyId);
  const property = await prisma.rentalProperty.findUniqueOrThrow({
    where: { id: ledger.propertyId },
    select: { name: true, landlordName: true, paymentInstructions: true },
  });
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId }, select: { name: true },
  });

  const balance = new Prisma.Decimal(ledger.balanceDue);
  const owes = balance.gt(0);

  // Correction 3: name the OLDEST unpaid month, not the newest. getTenancyLedger's
  // rows are newest-first, so scanning them for a RECEIPT row would surface the
  // most recent month. Query the oldest open receipt directly instead — the same
  // definition listCollections uses.
  const oldestUnpaid = owes
    ? await prisma.rentReceipt.findFirst({
        where: {
          tenancyId,
          isSkipped: false,
          status: { in: ['EXPECTED', 'OVERDUE', 'PARTIAL'] },
        },
        orderBy: { dueDate: 'asc' },
        select: { forMonth: true },
      })
    : null;

  // The khata's Remind button is always enabled, so a settled or in-advance
  // tenant is reachable here. `balanceDue` is negative when the tenant is in
  // advance, and formatting that straight into the sentence produced
  // "a reminder that -₹5,000.00 is outstanding". Say what is actually true
  // instead, and never quote a negative as an amount owed.
  let headline: string;
  if (owes) {
    headline = `This is a reminder that ${formatINR(balance.toString())} is outstanding on ${
      property.name
    }${oldestUnpaid?.forMonth ? ` (oldest pending: ${oldestUnpaid.forMonth})` : ''}.`;
  } else if (balance.isZero()) {
    headline = `Your rent account for ${property.name} is fully settled — nothing is outstanding. Thank you!`;
  } else {
    headline = `Your rent account for ${property.name} is settled, and you are ${formatINR(
      balance.abs().toString(),
    )} in advance. Nothing is outstanding.`;
  }

  const lines = [`Hi ${ledger.tenantName},`, '', headline];
  // Payment instructions only make sense when there is something to pay.
  if (owes && property.paymentInstructions) {
    lines.push('', property.paymentInstructions);
  }
  lines.push('', `— ${property.landlordName ?? user.name ?? 'Your landlord'}`);
  const text = lines.join('\n');

  const digits = waDigits(ledger.tenantPhone);
  return {
    text,
    waUrl: digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null,
  };
}
