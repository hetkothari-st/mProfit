/**
 * Loans the user has given to someone else — money owed TO them.
 *
 * Every figure is derived from the loan's terms plus its ledger of entries
 * (repayments, interest received, extra amounts lent, amounts forgiven), never
 * stored, so editing or deleting an entry can't leave a stale balance behind.
 *
 * Two repayment modes:
 * - FLEXIBLE: repaid whenever. Optional annual simple interest accrues day by
 *   day on the principal still outstanding; an optional due date drives
 *   reminders.
 * - EMI: fixed instalments. Each instalment is emiAmount, starting
 *   firstEmiDate, monthly for tenureMonths. A payment or waiver can be marked
 *   against one instalment (installmentNo); anything untied, and anything
 *   beyond an instalment's amount, fills the schedule oldest instalment first.
 */
import { Decimal } from 'decimal.js';
import { Prisma } from '@prisma/client';
import { prisma, runInTransaction } from '../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { serializeMoney } from '@everypaisa/shared';

export const LOAN_GIVEN_ENTRY_KINDS = [
  'REPAYMENT',
  'INTEREST_RECEIVED',
  'ADDITIONAL_LENT',
  'WAIVER',
] as const;
export type LoanGivenEntryKind = (typeof LOAN_GIVEN_ENTRY_KINDS)[number];
export const LOAN_GIVEN_MODES = ['FLEXIBLE', 'EMI'] as const;
export const LOAN_GIVEN_STATUSES = ['ACTIVE', 'SETTLED', 'WRITTEN_OFF'] as const;
export const RELATIONSHIPS = ['FRIEND', 'FAMILY', 'COLLEAGUE', 'BUSINESS', 'OTHER'] as const;

const ALERT_THRESHOLDS = [30, 15, 7, 1] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const ZERO = new Decimal(0);

// ── date helpers (all dates are UTC calendar days) ───────────────────

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayUtc(): Date {
  const t = new Date();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}

function addMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const day = d.getUTCDate();
  // Clamp to the last day of the target month (31 Jan + 1 month → 28/29 Feb).
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last)));
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

// ── pure calculation ─────────────────────────────────────────────────

export interface LoanTerms {
  principalAmount: Decimal.Value;
  lentOn: Date;
  interestRate: Decimal.Value;
  dueDate: Date | null;
  repaymentMode: string;
  emiAmount: Decimal.Value | null;
  tenureMonths: number | null;
  firstEmiDate: Date | null;
  status: string;
  closedOn: Date | null;
}

export interface LedgerEntry {
  kind: string;
  amount: Decimal.Value;
  date: Date;
  installmentNo?: number | null;
}

export type InstallmentStatus = 'PAID' | 'WAIVED' | 'PARTIAL' | 'OVERDUE' | 'DUE' | 'UPCOMING';

export interface ScheduleRow {
  no: number;
  dueDate: string;
  amount: string;
  /** Interest-bearing loans only: the standard amortisation split. */
  principal: string | null;
  interest: string | null;
  /** Principal left after this instalment, per the amortisation schedule. */
  balanceAfter: string;
  paid: string;
  waived: string;
  remaining: string;
  status: InstallmentStatus;
  /** Due date passed and not fully covered (also true for PARTIAL rows). */
  overdue: boolean;
  lastPaidOn: string | null;
  /** Some of the cover comes from entries marked against this instalment. */
  marked: boolean;
}

/** Instalments due within this many days show as DUE rather than UPCOMING. */
const DUE_SOON_DAYS = 7;

/**
 * The EMI schedule with what has been received against each instalment.
 * Null for loans without complete EMI terms.
 */
export function computeEmiSchedule(
  terms: LoanTerms,
  entries: LedgerEntry[],
  today: Date = todayUtc(),
): ScheduleRow[] | null {
  if (terms.repaymentMode !== 'EMI' || !terms.emiAmount || !terms.tenureMonths || !terms.firstEmiDate) {
    return null;
  }
  const n = terms.tenureMonths;
  const emi = new Decimal(terms.emiAmount);
  const r = new Decimal(terms.interestRate).dividedBy(1200);
  const rows = Array.from({ length: n }, () => ({
    paid: ZERO,
    waived: ZERO,
    lastPaidOn: null as Date | null,
    marked: false,
  }));
  const covered = (i: number) => rows[i]!.paid.plus(rows[i]!.waived);

  const credit = (i: number, amount: Decimal, kind: string, date: Date): Decimal => {
    const room = Decimal.max(emi.minus(covered(i)), ZERO);
    const take = Decimal.min(room, amount);
    if (take.greaterThan(0)) {
      const row = rows[i]!;
      if (kind === 'WAIVER') row.waived = row.waived.plus(take);
      else {
        row.paid = row.paid.plus(take);
        if (!row.lastPaidOn || date > row.lastPaidOn) row.lastPaidOn = date;
      }
    }
    return amount.minus(take);
  };

  const scheduleKinds = new Set(['REPAYMENT', 'INTEREST_RECEIVED', 'WAIVER']);
  const pool: Array<{ kind: string; amount: Decimal; date: Date }> = [];
  const byDate = [...entries]
    .filter((e) => scheduleKinds.has(e.kind))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Marked entries first, so untied money can't take an instalment's place.
  for (const e of byDate) {
    const no = e.installmentNo;
    if (no && no >= 1 && no <= n && e.kind !== 'INTEREST_RECEIVED') {
      rows[no - 1]!.marked = true;
      const left = credit(no - 1, new Decimal(e.amount), e.kind, e.date);
      if (left.greaterThan(0)) pool.push({ kind: e.kind, amount: left, date: e.date });
    } else {
      pool.push({ kind: e.kind, amount: new Decimal(e.amount), date: e.date });
    }
  }
  pool.sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const p of pool) {
    let left = p.amount;
    for (let i = 0; i < n && left.greaterThan(0); i++) left = credit(i, left, p.kind, p.date);
  }

  let balance = new Decimal(terms.principalAmount);
  return rows.map((row, i) => {
    const due = addMonths(terms.firstEmiDate!, i);
    let principalPart: Decimal;
    let interestPart: Decimal | null = null;
    if (r.isZero()) {
      principalPart = Decimal.min(emi, balance);
    } else {
      interestPart = balance.times(r).toDecimalPlaces(2);
      principalPart = Decimal.min(emi.minus(interestPart), balance);
    }
    balance = Decimal.max(balance.minus(principalPart), ZERO);

    const cover = covered(i);
    const full = cover.greaterThanOrEqualTo(emi);
    const overdue = !full && due.getTime() < today.getTime();
    const daysToDue = daysBetween(today, due);
    const status: InstallmentStatus = full
      ? row.paid.greaterThan(0)
        ? 'PAID'
        : 'WAIVED'
      : cover.greaterThan(0)
        ? 'PARTIAL'
        : overdue
          ? 'OVERDUE'
          : daysToDue <= DUE_SOON_DAYS
            ? 'DUE'
            : 'UPCOMING';

    return {
      no: i + 1,
      dueDate: isoDay(due),
      amount: serializeMoney(emi),
      principal: interestPart ? serializeMoney(principalPart) : null,
      interest: interestPart ? serializeMoney(interestPart) : null,
      balanceAfter: serializeMoney(balance.toDecimalPlaces(2)),
      paid: serializeMoney(row.paid),
      waived: serializeMoney(row.waived),
      remaining: serializeMoney(Decimal.max(emi.minus(cover), ZERO)),
      status,
      overdue,
      lastPaidOn: row.lastPaidOn ? isoDay(row.lastPaidOn) : null,
      marked: row.marked,
    };
  });
}

export interface LoanGivenSummary {
  principalLent: string;
  repaid: string;
  waived: string;
  interestReceived: string;
  totalReceived: string;
  /** Principal still owed. What counts toward net worth while ACTIVE. */
  outstandingPrincipal: string;
  /** FLEXIBLE with interest only: simple interest earned to date. */
  interestAccrued: string | null;
  /** FLEXIBLE with interest only: accrued minus interest already received. */
  interestDue: string | null;
  nextDue: { date: string; amount: string } | null;
  /** Days past the next due date; 0 when not overdue. */
  overdueDays: number;
  emi: {
    installmentsTotal: number;
    installmentsPaid: number;
    expectedTotal: string;
    remainingToReceive: string;
  } | null;
}

export function computeLoanGivenSummary(
  terms: LoanTerms,
  entries: LedgerEntry[],
  today: Date = todayUtc(),
): LoanGivenSummary {
  const sum = (kind: LoanGivenEntryKind) =>
    entries.filter((e) => e.kind === kind).reduce((s, e) => s.plus(e.amount), ZERO);

  const principal = new Decimal(terms.principalAmount);
  const additional = sum('ADDITIONAL_LENT');
  const repaid = sum('REPAYMENT');
  const waived = sum('WAIVER');
  const interestReceived = sum('INTEREST_RECEIVED');
  const principalLent = principal.plus(additional);
  const totalReceived = repaid.plus(interestReceived);
  const active = terms.status === 'ACTIVE';
  // Interest stops accruing once a loan is closed.
  const asOf = !active && terms.closedOn ? terms.closedOn : today;
  const rate = new Decimal(terms.interestRate);

  let outstanding: Decimal;
  let interestAccrued: Decimal | null = null;
  let interestDue: Decimal | null = null;
  let nextDue: LoanGivenSummary['nextDue'] = null;
  let overdueDays = 0;
  let emi: LoanGivenSummary['emi'] = null;

  if (terms.repaymentMode === 'EMI' && terms.emiAmount && terms.tenureMonths && terms.firstEmiDate) {
    const emiAmount = new Decimal(terms.emiAmount);
    const expectedTotal = emiAmount.times(terms.tenureMonths).plus(additional);
    const receivedTowardSchedule = totalReceived.plus(waived);
    const schedule = computeEmiSchedule(terms, entries, today)!;
    const installmentsPaid = schedule.filter((row) => new Decimal(row.remaining).isZero()).length;

    // Principal left after k full instalments' worth of money on a standard
    // amortising loan (whichever instalments it was marked against); anything
    // beyond k instalments comes straight off principal.
    const r = rate.dividedBy(1200);
    const k = emiAmount.isZero()
      ? 0
      : Math.min(receivedTowardSchedule.dividedToIntegerBy(emiAmount).toNumber(), terms.tenureMonths);
    let balance: Decimal;
    if (r.isZero()) {
      balance = principal.minus(emiAmount.times(k));
    } else {
      const growth = r.plus(1).pow(k);
      balance = principal.times(growth).minus(emiAmount.times(growth.minus(1)).dividedBy(r));
    }
    const beyond = receivedTowardSchedule.minus(emiAmount.times(k));
    outstanding = Decimal.max(balance.plus(additional).minus(beyond), ZERO);

    const remainingToReceive = Decimal.max(expectedTotal.minus(receivedTowardSchedule), ZERO);
    emi = {
      installmentsTotal: terms.tenureMonths,
      installmentsPaid,
      expectedTotal: serializeMoney(expectedTotal),
      remainingToReceive: serializeMoney(remainingToReceive),
    };

    const open = schedule.find((row) => new Decimal(row.remaining).greaterThan(0));
    if (active && open) {
      nextDue = { date: open.dueDate, amount: open.remaining };
      overdueDays = Math.max(daysBetween(toDate(open.dueDate), today), 0);
    }
  } else {
    outstanding = Decimal.max(principalLent.minus(repaid).minus(waived), ZERO);

    if (rate.greaterThan(0)) {
      // Simple interest on the balance, day by day, between ledger events.
      const events = [
        { date: terms.lentOn, delta: principal },
        ...entries
          .filter((e) => e.kind !== 'INTEREST_RECEIVED')
          .map((e) => ({
            date: e.date,
            delta: e.kind === 'ADDITIONAL_LENT' ? new Decimal(e.amount) : new Decimal(e.amount).negated(),
          })),
      ]
        .filter((e) => e.date.getTime() <= asOf.getTime())
        .sort((a, b) => a.date.getTime() - b.date.getTime());

      let balance = ZERO;
      let accrued = ZERO;
      let cursor = events[0]?.date ?? terms.lentOn;
      for (const e of events) {
        const days = Math.max(daysBetween(cursor, e.date), 0);
        accrued = accrued.plus(Decimal.max(balance, ZERO).times(rate).dividedBy(100).times(days).dividedBy(365));
        balance = balance.plus(e.delta);
        cursor = e.date;
      }
      const tail = Math.max(daysBetween(cursor, asOf), 0);
      accrued = accrued.plus(Decimal.max(balance, ZERO).times(rate).dividedBy(100).times(tail).dividedBy(365));

      interestAccrued = accrued.toDecimalPlaces(2);
      interestDue = Decimal.max(interestAccrued.minus(interestReceived), ZERO);
    }

    if (active && terms.dueDate && (outstanding.greaterThan(0) || (interestDue?.greaterThan(0) ?? false))) {
      nextDue = {
        date: isoDay(terms.dueDate),
        amount: serializeMoney(outstanding.plus(interestDue ?? ZERO)),
      };
      overdueDays = Math.max(daysBetween(terms.dueDate, today), 0);
    }
  }

  return {
    principalLent: serializeMoney(principalLent),
    repaid: serializeMoney(repaid),
    waived: serializeMoney(waived),
    interestReceived: serializeMoney(interestReceived),
    totalReceived: serializeMoney(totalReceived),
    outstandingPrincipal: serializeMoney(outstanding.toDecimalPlaces(2)),
    interestAccrued: interestAccrued ? serializeMoney(interestAccrued) : null,
    interestDue: interestDue ? serializeMoney(interestDue.toDecimalPlaces(2)) : null,
    nextDue,
    overdueDays,
    emi,
  };
}

// ── persistence ──────────────────────────────────────────────────────

type LoanRow = Prisma.LoanGivenGetPayload<{ include: { entries: true } }>;

function termsOf(loan: LoanRow): LoanTerms {
  return {
    principalAmount: loan.principalAmount.toString(),
    lentOn: loan.lentOn,
    interestRate: loan.interestRate.toString(),
    dueDate: loan.dueDate,
    repaymentMode: loan.repaymentMode,
    emiAmount: loan.emiAmount?.toString() ?? null,
    tenureMonths: loan.tenureMonths,
    firstEmiDate: loan.firstEmiDate,
    status: loan.status,
    closedOn: loan.closedOn,
  };
}

function entriesOf(loan: LoanRow): LedgerEntry[] {
  return loan.entries.map((e) => ({
    kind: e.kind,
    amount: e.amount.toString(),
    date: e.date,
    installmentNo: e.installmentNo,
  }));
}

function toDTO(loan: LoanRow) {
  return {
    id: loan.id,
    borrowerName: loan.borrowerName,
    borrowerContact: loan.borrowerContact,
    relationship: loan.relationship,
    principalAmount: serializeMoney(loan.principalAmount.toString()),
    lentOn: isoDay(loan.lentOn),
    interestRate: loan.interestRate.toString(),
    dueDate: loan.dueDate ? isoDay(loan.dueDate) : null,
    repaymentMode: loan.repaymentMode,
    emiAmount: loan.emiAmount ? serializeMoney(loan.emiAmount.toString()) : null,
    tenureMonths: loan.tenureMonths,
    firstEmiDate: loan.firstEmiDate ? isoDay(loan.firstEmiDate) : null,
    status: loan.status,
    closedOn: loan.closedOn ? isoDay(loan.closedOn) : null,
    notes: loan.notes,
    createdAt: loan.createdAt.toISOString(),
    entries: [...loan.entries]
      .sort((a, b) => b.date.getTime() - a.date.getTime() || b.createdAt.getTime() - a.createdAt.getTime())
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        amount: serializeMoney(e.amount.toString()),
        date: isoDay(e.date),
        notes: e.notes,
        installmentNo: e.installmentNo,
      })),
    summary: computeLoanGivenSummary(termsOf(loan), entriesOf(loan)),
    schedule: computeEmiSchedule(termsOf(loan), entriesOf(loan)),
  };
}

export type LoanGivenDTO = ReturnType<typeof toDTO>;

async function findOwned(userId: string, id: string): Promise<LoanRow> {
  const loan = await prisma.loanGiven.findFirst({ where: { id, userId }, include: { entries: true } });
  if (!loan) throw new NotFoundError('Loan not found');
  return loan;
}

export interface LoanGivenInput {
  borrowerName: string;
  borrowerContact?: string | null;
  relationship?: string | null;
  principalAmount: string;
  lentOn: string;
  interestRate?: string;
  dueDate?: string | null;
  repaymentMode?: (typeof LOAN_GIVEN_MODES)[number];
  emiAmount?: string | null;
  tenureMonths?: number | null;
  firstEmiDate?: string | null;
  notes?: string | null;
}

function assertEmiTerms(input: {
  repaymentMode?: string;
  emiAmount?: string | null;
  tenureMonths?: number | null;
  firstEmiDate?: string | null;
}) {
  if (input.repaymentMode !== 'EMI') return;
  if (!input.emiAmount || !input.tenureMonths || !input.firstEmiDate) {
    throw new BadRequestError('EMI loans need the EMI amount, number of months and first EMI date');
  }
}

function termsData(input: Partial<LoanGivenInput>) {
  const data: Prisma.LoanGivenUpdateInput = {};
  if (input.borrowerName !== undefined) data.borrowerName = input.borrowerName;
  if (input.borrowerContact !== undefined) data.borrowerContact = input.borrowerContact || null;
  if (input.relationship !== undefined) data.relationship = input.relationship || null;
  if (input.principalAmount !== undefined) data.principalAmount = new Prisma.Decimal(input.principalAmount);
  if (input.lentOn !== undefined) data.lentOn = toDate(input.lentOn);
  if (input.interestRate !== undefined) data.interestRate = new Prisma.Decimal(input.interestRate || '0');
  if (input.dueDate !== undefined) data.dueDate = input.dueDate ? toDate(input.dueDate) : null;
  if (input.repaymentMode !== undefined) data.repaymentMode = input.repaymentMode;
  if (input.emiAmount !== undefined) data.emiAmount = input.emiAmount ? new Prisma.Decimal(input.emiAmount) : null;
  if (input.tenureMonths !== undefined) data.tenureMonths = input.tenureMonths ?? null;
  if (input.firstEmiDate !== undefined) data.firstEmiDate = input.firstEmiDate ? toDate(input.firstEmiDate) : null;
  if (input.notes !== undefined) data.notes = input.notes || null;
  return data;
}

export async function listLoansGiven(userId: string) {
  const loans = await prisma.loanGiven.findMany({
    where: { userId },
    include: { entries: true },
    orderBy: { lentOn: 'desc' },
  });
  return loans.map(toDTO);
}

export async function getLoanGiven(userId: string, id: string) {
  return toDTO(await findOwned(userId, id));
}

export async function createLoanGiven(userId: string, input: LoanGivenInput) {
  assertEmiTerms(input);
  const loan = await prisma.loanGiven.create({
    data: {
      ...(termsData(input) as Prisma.LoanGivenUncheckedCreateInput),
      userId,
      borrowerName: input.borrowerName,
      principalAmount: new Prisma.Decimal(input.principalAmount),
      lentOn: toDate(input.lentOn),
    },
    include: { entries: true },
  });
  return toDTO(loan);
}

export async function updateLoanGiven(userId: string, id: string, input: Partial<LoanGivenInput>) {
  const current = await findOwned(userId, id);
  assertEmiTerms({
    repaymentMode: input.repaymentMode ?? current.repaymentMode,
    emiAmount: input.emiAmount !== undefined ? input.emiAmount : current.emiAmount?.toString(),
    tenureMonths: input.tenureMonths !== undefined ? input.tenureMonths : current.tenureMonths,
    firstEmiDate:
      input.firstEmiDate !== undefined
        ? input.firstEmiDate
        : current.firstEmiDate
          ? isoDay(current.firstEmiDate)
          : null,
  });
  const loan = await prisma.loanGiven.update({
    where: { id: current.id },
    data: termsData(input),
    include: { entries: true },
  });
  return toDTO(loan);
}

export async function deleteLoanGiven(userId: string, id: string) {
  const loan = await findOwned(userId, id);
  await prisma.loanGiven.delete({ where: { id: loan.id } });
}

export async function addLoanGivenEntry(
  userId: string,
  loanId: string,
  input: { kind: LoanGivenEntryKind; amount: string; date: string; notes?: string | null },
) {
  const loan = await findOwned(userId, loanId);
  if (new Decimal(input.amount).lessThanOrEqualTo(0)) {
    throw new BadRequestError('Amount must be greater than 0');
  }
  await prisma.loanGivenEntry.create({
    data: {
      loanId: loan.id,
      kind: input.kind,
      amount: new Prisma.Decimal(input.amount),
      date: toDate(input.date),
      notes: input.notes || null,
    },
  });
  return getLoanGiven(userId, loan.id);
}

export async function deleteLoanGivenEntry(userId: string, entryId: string) {
  const entry = await prisma.loanGivenEntry.findUnique({
    where: { id: entryId },
    select: { id: true, loanId: true },
  });
  // Ownership through the parent loan — the entry table has no userId.
  if (!entry) throw new NotFoundError('Entry not found');
  await findOwned(userId, entry.loanId);
  await prisma.loanGivenEntry.delete({ where: { id: entry.id } });
  return getLoanGiven(userId, entry.loanId);
}

export const INSTALLMENT_ACTIONS = ['PAID', 'PARTIAL', 'WAIVED', 'PENDING'] as const;
export type InstallmentAction = (typeof INSTALLMENT_ACTIONS)[number];

/**
 * One-click status for an EMI instalment:
 * - PAID: add a repayment for whatever the instalment still needs, keeping any
 *   part payment already recorded against it.
 * - WAIVED: likewise, forgiving what it still needs.
 * - PARTIAL: set the amount received against it (replacing earlier marks); more
 *   than the EMI spills into the next instalments.
 * - PENDING: clear its marks. Untied repayments logged in History still count.
 *
 * Defaults the date to the due date, or today for an instalment not yet due.
 */
export async function setLoanGivenInstallment(
  userId: string,
  loanId: string,
  installmentNo: number,
  input: { action: InstallmentAction; amount?: string; date?: string; notes?: string | null },
) {
  const loan = await findOwned(userId, loanId);
  if (loan.status !== 'ACTIVE') throw new BadRequestError('Reopen the loan to update its instalments');
  const topUp = input.action === 'PAID' || input.action === 'WAIVED';
  // Top-ups measure what's left with the existing marks; resets without them.
  const basis = topUp ? loan.entries : loan.entries.filter((e) => e.installmentNo !== installmentNo);
  const schedule = computeEmiSchedule(termsOf(loan), entriesOf({ ...loan, entries: basis }));
  if (!schedule) throw new BadRequestError('Only EMI loans have instalments');
  const row = schedule[installmentNo - 1];
  if (!row) throw new BadRequestError(`This loan has ${schedule.length} instalments`);

  const today = isoDay(todayUtc());
  const date = input.date ?? (row.dueDate < today ? row.dueDate : today);
  let entry: { kind: LoanGivenEntryKind; amount: Decimal } | null = null;
  if (topUp) {
    const remaining = new Decimal(row.remaining);
    if (remaining.greaterThan(0)) {
      entry = { kind: input.action === 'PAID' ? 'REPAYMENT' : 'WAIVER', amount: remaining };
    }
  } else if (input.action === 'PARTIAL') {
    if (!input.amount || new Decimal(input.amount).lessThanOrEqualTo(0)) {
      throw new BadRequestError('Enter the amount received');
    }
    entry = { kind: 'REPAYMENT', amount: new Decimal(input.amount) };
  }

  await runInTransaction(async (tx) => {
    if (!topUp) await tx.loanGivenEntry.deleteMany({ where: { loanId: loan.id, installmentNo } });
    if (entry) {
      await tx.loanGivenEntry.create({
        data: {
          loanId: loan.id,
          kind: entry.kind,
          amount: new Prisma.Decimal(entry.amount.toFixed(2)),
          date: toDate(date),
          notes: input.notes || null,
          installmentNo,
        },
      });
    }
  });
  return getLoanGiven(userId, loan.id);
}

/** Close the loan as fully settled. */
export async function settleLoanGiven(userId: string, id: string, date: string) {
  const loan = await findOwned(userId, id);
  await prisma.loanGiven.update({
    where: { id: loan.id },
    data: { status: 'SETTLED', closedOn: toDate(date) },
  });
  return getLoanGiven(userId, loan.id);
}

/** Forgive whatever principal is still owed and close the loan. */
export async function writeOffLoanGiven(userId: string, id: string, date: string, notes?: string | null) {
  const loan = await findOwned(userId, id);
  const { outstandingPrincipal } = computeLoanGivenSummary(termsOf(loan), entriesOf(loan));
  await runInTransaction(async (tx) => {
    if (new Decimal(outstandingPrincipal).greaterThan(0)) {
      await tx.loanGivenEntry.create({
        data: {
          loanId: loan.id,
          kind: 'WAIVER',
          amount: new Prisma.Decimal(outstandingPrincipal),
          date: toDate(date),
          notes: notes || 'Written off',
        },
      });
    }
    await tx.loanGiven.update({
      where: { id: loan.id },
      data: { status: 'WRITTEN_OFF', closedOn: toDate(date) },
    });
  });
  return getLoanGiven(userId, loan.id);
}

/** Undo settle / write-off. A write-off's WAIVER entry stays until deleted. */
export async function reopenLoanGiven(userId: string, id: string) {
  const loan = await findOwned(userId, id);
  await prisma.loanGiven.update({
    where: { id: loan.id },
    data: { status: 'ACTIVE', closedOn: null },
  });
  return getLoanGiven(userId, loan.id);
}

/** Principal still owed on ACTIVE loans — the asset side for net worth. */
export async function outstandingLoansGiven(userId: string): Promise<{ count: number; total: Decimal }> {
  const loans = await prisma.loanGiven.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { entries: true },
  });
  const total = loans.reduce(
    (s, l) => s.plus(computeLoanGivenSummary(termsOf(l), entriesOf(l)).outstandingPrincipal),
    ZERO,
  );
  return { count: loans.length, total };
}

// ── reminders ────────────────────────────────────────────────────────

export async function generateLoanGivenAlerts(userId?: string): Promise<number> {
  const today = todayUtc();
  const loans = await prisma.loanGiven.findMany({
    where: { ...(userId ? { userId } : {}), status: 'ACTIVE' },
    include: { entries: true },
  });

  let created = 0;
  for (const loan of loans) {
    let summary: LoanGivenSummary;
    try {
      summary = computeLoanGivenSummary(termsOf(loan), entriesOf(loan), today);
    } catch (err) {
      logger.warn({ loanId: loan.id, err }, '[loans-given] could not compute summary for reminders');
      continue;
    }
    if (!summary.nextDue) continue;

    const daysLeft = daysBetween(today, toDate(summary.nextDue.date));
    const isOverdue = daysLeft < 0;
    if (!isOverdue && !(ALERT_THRESHOLDS as readonly number[]).includes(daysLeft)) continue;

    const key = `loan_given:${loan.id}:${summary.nextDue.date}:${isOverdue ? 'overdue' : `${daysLeft}d`}`;
    const existing = await prisma.alert.findFirst({
      where: { userId: loan.userId, type: 'LOAN_GIVEN_DUE', metadata: { path: ['key'], equals: key } },
    });
    if (existing) continue;

    const amount = new Decimal(summary.nextDue.amount)
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const days = Math.abs(daysLeft);
    await prisma.alert.create({
      data: {
        userId: loan.userId,
        type: 'LOAN_GIVEN_DUE',
        title: isOverdue
          ? `${loan.borrowerName}'s repayment is overdue by ${days} day${days !== 1 ? 's' : ''}`
          : `${loan.borrowerName}'s repayment is due in ${days} day${days !== 1 ? 's' : ''}`,
        description: `₹${amount} ${isOverdue ? 'was due on' : 'due on'} ${summary.nextDue.date}`,
        triggerDate: new Date(),
        metadata: { key, loanGivenId: loan.id, dueDate: summary.nextDue.date, amount: summary.nextDue.amount },
      },
    });
    created++;
  }
  return created;
}
