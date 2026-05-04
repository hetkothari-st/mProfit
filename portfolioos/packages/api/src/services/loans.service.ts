/**
 * Loans service — Approach C: computed amortization + stored payments.
 *
 * The amortization schedule is computed on-the-fly from the loan's terms
 * and the stored LoanPayment rows (EMIs, prepayments, foreclosure).
 * No schedule rows are persisted — they are always derived.
 *
 * Money math uses decimal.js throughout (never JS Number) per §3.2.
 */

import { Decimal } from 'decimal.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { serializeMoney } from '@portfolioos/shared';

// ── Constants ────────────────────────────────────────────────────────────────

export const LOAN_TYPES = [
  'HOME',
  'CAR',
  'PERSONAL',
  'EDUCATION',
  'BUSINESS',
  'GOLD',
  'LAS',
  'OTHER',
] as const;

export const PAYMENT_TYPES = [
  'EMI',
  'PREPAYMENT',
  'FORECLOSURE',
  'PROCESSING_FEE',
] as const;

export const PREPAYMENT_OPTIONS = ['REDUCE_TENURE', 'REDUCE_EMI'] as const;

export const LOAN_STATUSES = ['ACTIVE', 'CLOSED', 'FORECLOSED'] as const;

const ALERT_THRESHOLDS = [30, 15, 7, 1] as const;

// ── Input types ──────────────────────────────────────────────────────────────

export interface CreateLoanInput {
  lenderName: string;
  accountNumber?: string | null;
  loanType: (typeof LOAN_TYPES)[number];
  borrowerName: string;
  principalAmount: string;
  interestRate: string;
  tenureMonths: number;
  emiAmount: string;
  emiDueDay?: number;
  disbursementDate: string;
  firstEmiDate: string;
  prepaymentOption?: (typeof PREPAYMENT_OPTIONS)[number];
  vehicleId?: string | null;
  rentalPropertyId?: string | null;
  portfolioId?: string | null;
  taxBenefitSection?: string | null;
  status?: (typeof LOAN_STATUSES)[number];
  closedDate?: string | null;
  lenderMatchKey?: string | null;
}

export type UpdateLoanInput = Partial<CreateLoanInput>;

export interface AddPaymentInput {
  paymentType: (typeof PAYMENT_TYPES)[number];
  paidOn: string;
  amount: string;
  principalPart?: string | null;
  interestPart?: string | null;
  forMonth?: string | null;
  canonicalEventId?: string | null;
  notes?: string | null;
}

// ── Amortization types ───────────────────────────────────────────────────────

export interface AmortizationRow {
  month: number;
  date: string;          // YYYY-MM-DD (EMI due date)
  emiAmount: string;
  principalPart: string;
  interestPart: string;
  openingBalance: string;
  closingBalance: string;
  isPaid: boolean;
  paidOn: string | null;
  paymentType: string;   // 'EMI' | 'PREPAYMENT' etc. for display
}

export interface TaxBenefitSummary {
  section: string;
  principalDeduction: string | null;   // 80C principal cap
  interestDeduction: string | null;    // 24b / 80E interest cap
  estimatedTaxSaving: string;          // at 30% bracket
}

export interface LoanSummary {
  outstandingBalance: string;
  totalPrincipalPaid: string;
  totalInterestPaid: string;
  nextEmiDate: string | null;
  nextEmiAmount: string;
  remainingEmiCount: number;
  remainingTenureMonths: number;
  totalInterestPayable: string;
  effectiveEndDate: string | null;
  prepaymentSavings: string | null;
  taxBenefit: TaxBenefitSummary | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDate(s: string): Date {
  return new Date(s + 'T00:00:00Z');
}

/**
 * Format a Date as YYYY-MM-DD (UTC, so no timezone drift on @db.Date fields).
 */
function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Add N calendar months to a date, preserving the day-of-month
 * (clamping to end-of-month when needed, e.g. Jan 31 + 1 month → Feb 28).
 */
function addMonths(date: Date, n: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, date.getUTCDate()));
  // If day overflowed (e.g. March 31 + 1 → April 31 → May 1), rewind to last day of target month
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n + 1, 0));
  if (d.getUTCDate() < date.getUTCDate()) return target;
  return d;
}

/**
 * Compute monthly interest rate from annual rate (percentage).
 * E.g. 8.5% annual → 0.085/12 monthly.
 */
export function computeMonthlyRate(annualRatePct: Decimal): Decimal {
  return annualRatePct.dividedBy(100).dividedBy(12);
}

/**
 * Standard reducing-balance EMI formula:
 *   EMI = P × r × (1+r)^n / ((1+r)^n - 1)
 * where r = monthly rate, n = tenure months, P = principal.
 */
export function computeEmi(
  principal: Decimal,
  annualRatePct: Decimal,
  tenureMonths: number,
): Decimal {
  const r = computeMonthlyRate(annualRatePct);
  if (r.isZero()) {
    // Zero-interest loan
    return principal.dividedBy(tenureMonths).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
  }
  const onePlusR = r.plus(1);
  const onePlusRn = onePlusR.toPower(tenureMonths);
  return principal
    .times(r)
    .times(onePlusRn)
    .dividedBy(onePlusRn.minus(1))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
}

export type StoredLoan = {
  id: string;
  principalAmount: Prisma.Decimal;
  interestRate: Prisma.Decimal;
  tenureMonths: number;
  emiAmount: Prisma.Decimal;
  emiDueDay: number;
  firstEmiDate: Date;
  prepaymentOption: string;
  taxBenefitSection?: string | null;
  payments: StoredPayment[];
};

type StoredPayment = {
  id: string;
  paymentType: string;
  paidOn: Date;
  amount: Prisma.Decimal;
  principalPart: Prisma.Decimal | null;
  interestPart: Prisma.Decimal | null;
  forMonth: string | null;
};

/**
 * Build the full amortization schedule for a loan, incorporating stored
 * payments (EMIs and prepayments).
 *
 * Algorithm:
 *  1. Start at month 1, opening balance = principalAmount.
 *  2. Apply any prepayments that fall before this EMI date (reduce balance first).
 *  3. Compute interest for the month = openingBalance × monthlyRate.
 *  4. Principal part = EMI − interest (or closing balance if it's the last installment).
 *  5. Closing balance = opening − principal.
 *  6. If prepaymentOption = REDUCE_TENURE: keep same EMI, recalculate remaining months.
 *     If prepaymentOption = REDUCE_EMI: recompute EMI, keep original tenure.
 *  7. Stop when closing balance ≈ 0 or original tenure exhausted.
 *
 * Returns up to 600 rows (50 years — more than any real loan).
 */
export function buildAmortizationSchedule(
  loan: StoredLoan,
): AmortizationRow[] {
  const ZERO = new Decimal(0);
  const EPSILON = new Decimal('0.005'); // ≈ ₹0 balance threshold

  const annualRate = new Decimal(loan.interestRate.toString());
  const originalEmi = new Decimal(loan.emiAmount.toString());
  const principal = new Decimal(loan.principalAmount.toString());
  const monthlyRate = computeMonthlyRate(annualRate);

  // Separate EMI payments by forMonth, prepayments by date
  const emiPaidMonths = new Map<string, StoredPayment>();
  const prepayments: StoredPayment[] = [];

  for (const p of loan.payments) {
    if (p.paymentType === 'EMI') {
      const key = p.forMonth ?? dateToIso(p.paidOn).slice(0, 7);
      emiPaidMonths.set(key, p);
    } else if (p.paymentType === 'PREPAYMENT') {
      prepayments.push(p);
    }
    // FORECLOSURE / PROCESSING_FEE handled separately in summary
  }

  // Sort prepayments ascending by date
  prepayments.sort((a, b) => a.paidOn.getTime() - b.paidOn.getTime());
  let prepaymentIdx = 0;

  const rows: AmortizationRow[] = [];
  let balance = principal;
  let currentEmi = originalEmi;
  let currentTenure = loan.tenureMonths;
  let emiDate = new Date(loan.firstEmiDate);

  const maxRows = Math.min(600, loan.tenureMonths * 3); // safety cap

  for (let month = 1; month <= maxRows; month++) {
    if (balance.lessThanOrEqualTo(EPSILON)) break;

    const emiMonthKey = dateToIso(emiDate).slice(0, 7); // YYYY-MM

    // Apply all prepayments that fell before or on this EMI date
    while (
      prepaymentIdx < prepayments.length &&
      prepayments[prepaymentIdx]!.paidOn <= emiDate
    ) {
      const pre = prepayments[prepaymentIdx]!;
      const preAmt = new Decimal(pre.amount.toString());
      balance = Decimal.max(ZERO, balance.minus(preAmt));
      prepaymentIdx++;

      if (balance.lessThanOrEqualTo(EPSILON)) break;

      const remainingMonths = currentTenure - month + 1;
      if (remainingMonths <= 0) break;

      if (loan.prepaymentOption === 'REDUCE_TENURE') {
        // Recompute remaining months at same EMI
        if (!monthlyRate.isZero()) {
          const onePlusR = monthlyRate.plus(1);
          // n = -log(1 - r*P/EMI) / log(1+r)
          const rP = monthlyRate.times(balance);
          if (rP.lessThan(currentEmi)) {
            const logArg = new Decimal(1).minus(rP.dividedBy(currentEmi));
            if (logArg.greaterThan(0)) {
              const newMonths = Math.ceil(
                -Math.log(logArg.toNumber()) / Math.log(onePlusR.toNumber()),
              );
              currentTenure = month - 1 + newMonths;
            } else {
              // Balance so small one EMI covers it
              currentTenure = month;
            }
          } else {
            currentTenure = month;
          }
        } else {
          currentTenure = month - 1 + Math.ceil(balance.dividedBy(currentEmi).toNumber());
        }
      } else {
        // REDUCE_EMI: keep original remaining tenure, recompute EMI
        const remaining = currentTenure - month + 1;
        currentEmi = computeEmi(balance, annualRate, remaining);
      }
    }

    if (balance.lessThanOrEqualTo(EPSILON)) break;

    const openingBalance = balance;

    // Interest for this month
    const interestPart = balance.times(monthlyRate).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);

    // Principal part (cap at remaining balance to avoid overshoot on last EMI)
    let principalPart = currentEmi.minus(interestPart).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
    if (principalPart.greaterThan(balance)) {
      principalPart = balance.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
    }

    // Actual EMI for this row (may be less on last installment)
    const actualEmi = principalPart.plus(interestPart);

    const closingBalance = openingBalance.minus(principalPart).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
    balance = Decimal.max(ZERO, closingBalance);

    // Check if this month's EMI was paid
    const paidEntry = emiPaidMonths.get(emiMonthKey);
    const isPaid = paidEntry !== undefined;

    rows.push({
      month,
      date: dateToIso(emiDate),
      emiAmount: serializeMoney(actualEmi),
      principalPart: serializeMoney(principalPart),
      interestPart: serializeMoney(interestPart),
      openingBalance: serializeMoney(openingBalance),
      closingBalance: serializeMoney(balance),
      isPaid,
      paidOn: isPaid ? dateToIso(paidEntry!.paidOn) : null,
      paymentType: 'EMI',
    });

    if (balance.lessThanOrEqualTo(EPSILON)) break;

    // Advance to next EMI date
    emiDate = addMonths(new Date(loan.firstEmiDate), month);
  }

  return rows;
}

/**
 * Compute a high-level summary of the current loan state.
 */
export function computeLoanSummary(loan: StoredLoan): LoanSummary {
  const ZERO = new Decimal(0);

  const schedule = buildAmortizationSchedule(loan);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Total principal and interest paid from stored payments
  const emiPayments = loan.payments.filter((p) => p.paymentType === 'EMI' || p.paymentType === 'PREPAYMENT' || p.paymentType === 'FORECLOSURE');
  let totalPrincipalPaid = ZERO;
  let totalInterestPaid = ZERO;

  for (const p of emiPayments) {
    if (p.principalPart) totalPrincipalPaid = totalPrincipalPaid.plus(new Decimal(p.principalPart.toString()));
    if (p.interestPart) totalInterestPaid = totalInterestPaid.plus(new Decimal(p.interestPart.toString()));
  }

  // Outstanding balance: last closing balance in schedule before today (or principal if no schedule)
  let outstandingBalance = new Decimal(loan.principalAmount.toString());
  let nextEmiDate: string | null = null;
  let nextEmiAmount = new Decimal(loan.emiAmount.toString());
  let remainingEmiCount = 0;
  let totalInterestPayable = ZERO;
  let effectiveEndDate: string | null = null;

  if (schedule.length > 0) {
    // Find the current position in the schedule
    const todayStr = dateToIso(today);
    const unpaidRows = schedule.filter((r) => !r.isPaid && r.date >= todayStr);
    const lastPaidRow = schedule.filter((r) => r.isPaid).pop();

    // Outstanding balance = closing balance of last unpaid row before today,
    // or the opening balance of the first unpaid row
    if (unpaidRows.length > 0) {
      const firstUnpaid = unpaidRows[0]!;
      outstandingBalance = new Decimal(firstUnpaid.openingBalance);
      nextEmiDate = firstUnpaid.date;
      nextEmiAmount = new Decimal(firstUnpaid.emiAmount);
      remainingEmiCount = unpaidRows.length;
      totalInterestPayable = unpaidRows.reduce(
        (s, r) => s.plus(new Decimal(r.interestPart)),
        ZERO,
      );
      effectiveEndDate = unpaidRows[unpaidRows.length - 1]!.date;
    } else if (lastPaidRow) {
      outstandingBalance = new Decimal(lastPaidRow.closingBalance);
    }
  }

  const remainingTenureMonths = remainingEmiCount;

  // Prepayment savings: interest in original full schedule vs. actual remaining
  const originalSchedule = buildAmortizationScheduleFromScratch(loan);
  const originalTotalInterest = originalSchedule.reduce(
    (s, r) => s.plus(new Decimal(r.interestPart)),
    ZERO,
  );
  const prepaymentSavingsDecimal = originalTotalInterest.minus(
    totalInterestPaid.plus(totalInterestPayable),
  );
  const prepaymentSavings = prepaymentSavingsDecimal.greaterThan(0)
    ? serializeMoney(prepaymentSavingsDecimal)
    : null;

  // Tax benefit
  const taxBenefit = computeTaxBenefit(loan, schedule, today);

  return {
    outstandingBalance: serializeMoney(outstandingBalance),
    totalPrincipalPaid: serializeMoney(totalPrincipalPaid),
    totalInterestPaid: serializeMoney(totalInterestPaid),
    nextEmiDate,
    nextEmiAmount: serializeMoney(nextEmiAmount),
    remainingEmiCount,
    remainingTenureMonths,
    totalInterestPayable: serializeMoney(totalInterestPayable),
    effectiveEndDate,
    prepaymentSavings,
    taxBenefit,
  };
}

/**
 * Build schedule without any payments (original plan) — used for prepayment savings calc.
 */
function buildAmortizationScheduleFromScratch(loan: StoredLoan): AmortizationRow[] {
  const loanWithoutPayments: StoredLoan = { ...loan, payments: [] };
  return buildAmortizationSchedule(loanWithoutPayments);
}

/**
 * Compute tax benefit summary for HOME and EDUCATION loans.
 * - HOME (80C + 24b): principal deduction max ₹1,50,000; interest deduction max ₹2,00,000
 * - EDUCATION (80E): interest deduction unlimited
 */
function computeTaxBenefit(
  loan: StoredLoan,
  schedule: AmortizationRow[],
  today: Date,
): TaxBenefitSummary | null {
  const section = loan.taxBenefitSection;
  if (!section) return null;

  const ZERO = new Decimal(0);
  const currentYear = today.getUTCFullYear();
  const fyStart = today.getUTCMonth() >= 3
    ? new Date(Date.UTC(currentYear, 3, 1))
    : new Date(Date.UTC(currentYear - 1, 3, 1));
  const fyEnd = today.getUTCMonth() >= 3
    ? new Date(Date.UTC(currentYear + 1, 2, 31))
    : new Date(Date.UTC(currentYear, 2, 31));

  const fyRows = schedule.filter((r) => {
    const d = new Date(r.date);
    return d >= fyStart && d <= fyEnd;
  });

  const annualPrincipal = fyRows.reduce((s, r) => s.plus(new Decimal(r.principalPart)), ZERO);
  const annualInterest = fyRows.reduce((s, r) => s.plus(new Decimal(r.interestPart)), ZERO);

  if (section === '80C_24B') {
    const principalCap = new Decimal('150000');
    const interestCap = new Decimal('200000');
    const principalDeduction = Decimal.min(annualPrincipal, principalCap);
    const interestDeduction = Decimal.min(annualInterest, interestCap);
    const taxSaving = principalDeduction.plus(interestDeduction).times('0.30').toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
    return {
      section: '80C + 24(b)',
      principalDeduction: serializeMoney(principalDeduction),
      interestDeduction: serializeMoney(interestDeduction),
      estimatedTaxSaving: serializeMoney(taxSaving),
    };
  }

  if (section === '80E') {
    // Education loan — interest deduction unlimited
    const taxSaving = annualInterest.times('0.30').toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
    return {
      section: '80E',
      principalDeduction: null,
      interestDeduction: serializeMoney(annualInterest),
      estimatedTaxSaving: serializeMoney(taxSaving),
    };
  }

  return null;
}

// ── Loan type used with prisma include ───────────────────────────────────────

type LoanWithPayments = Awaited<ReturnType<typeof prisma.loan.findFirst>> & {
  payments: Array<{
    id: string;
    loanId: string;
    paymentType: string;
    paidOn: Date;
    amount: Prisma.Decimal;
    principalPart: Prisma.Decimal | null;
    interestPart: Prisma.Decimal | null;
    forMonth: string | null;
    canonicalEventId: string | null;
    notes: string | null;
    createdAt: Date;
  }>;
};

// ── Loan CRUD ────────────────────────────────────────────────────────────────

export async function listLoans(userId: string) {
  return prisma.loan.findMany({
    where: { userId },
    include: {
      payments: { orderBy: { paidOn: 'desc' }, take: 5 },
      vehicle: { select: { id: true, registrationNo: true, make: true, model: true } },
      rentalProperty: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getLoan(userId: string, loanId: string) {
  const loan = await prisma.loan.findFirst({
    where: { id: loanId, userId },
    include: {
      payments: { orderBy: { paidOn: 'asc' } },
      vehicle: { select: { id: true, registrationNo: true, make: true, model: true } },
      rentalProperty: { select: { id: true, name: true } },
    },
  });
  if (!loan) throw new NotFoundError(`Loan ${loanId} not found`);
  return loan;
}

export async function createLoan(userId: string, input: CreateLoanInput) {
  return prisma.loan.create({
    data: {
      userId,
      lenderName: input.lenderName,
      accountNumber: input.accountNumber ?? null,
      loanType: input.loanType,
      borrowerName: input.borrowerName,
      principalAmount: new Prisma.Decimal(input.principalAmount),
      interestRate: new Prisma.Decimal(input.interestRate),
      tenureMonths: input.tenureMonths,
      emiAmount: new Prisma.Decimal(input.emiAmount),
      emiDueDay: input.emiDueDay ?? 1,
      disbursementDate: toDate(input.disbursementDate),
      firstEmiDate: toDate(input.firstEmiDate),
      prepaymentOption: input.prepaymentOption ?? 'REDUCE_TENURE',
      vehicleId: input.vehicleId ?? null,
      rentalPropertyId: input.rentalPropertyId ?? null,
      portfolioId: input.portfolioId ?? null,
      taxBenefitSection: input.taxBenefitSection ?? null,
      status: input.status ?? 'ACTIVE',
      closedDate: input.closedDate ? toDate(input.closedDate) : null,
      lenderMatchKey: input.lenderMatchKey ?? null,
    },
  });
}

export async function updateLoan(
  userId: string,
  loanId: string,
  input: UpdateLoanInput,
) {
  const existing = await prisma.loan.findFirst({ where: { id: loanId, userId } });
  if (!existing) throw new NotFoundError(`Loan ${loanId} not found`);

  return prisma.loan.update({
    where: { id: loanId },
    data: {
      ...(input.lenderName !== undefined && { lenderName: input.lenderName }),
      ...(input.accountNumber !== undefined && { accountNumber: input.accountNumber }),
      ...(input.loanType !== undefined && { loanType: input.loanType }),
      ...(input.borrowerName !== undefined && { borrowerName: input.borrowerName }),
      ...(input.principalAmount !== undefined && {
        principalAmount: new Prisma.Decimal(input.principalAmount),
      }),
      ...(input.interestRate !== undefined && {
        interestRate: new Prisma.Decimal(input.interestRate),
      }),
      ...(input.tenureMonths !== undefined && { tenureMonths: input.tenureMonths }),
      ...(input.emiAmount !== undefined && { emiAmount: new Prisma.Decimal(input.emiAmount) }),
      ...(input.emiDueDay !== undefined && { emiDueDay: input.emiDueDay }),
      ...(input.disbursementDate !== undefined && {
        disbursementDate: toDate(input.disbursementDate),
      }),
      ...(input.firstEmiDate !== undefined && { firstEmiDate: toDate(input.firstEmiDate) }),
      ...(input.prepaymentOption !== undefined && { prepaymentOption: input.prepaymentOption }),
      ...(input.vehicleId !== undefined && { vehicleId: input.vehicleId }),
      ...(input.rentalPropertyId !== undefined && { rentalPropertyId: input.rentalPropertyId }),
      ...(input.portfolioId !== undefined && { portfolioId: input.portfolioId }),
      ...(input.taxBenefitSection !== undefined && { taxBenefitSection: input.taxBenefitSection }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.closedDate !== undefined && {
        closedDate: input.closedDate ? toDate(input.closedDate) : null,
      }),
      ...(input.lenderMatchKey !== undefined && { lenderMatchKey: input.lenderMatchKey }),
    },
  });
}

export async function deleteLoan(userId: string, loanId: string) {
  const existing = await prisma.loan.findFirst({ where: { id: loanId, userId } });
  if (!existing) throw new NotFoundError(`Loan ${loanId} not found`);
  await prisma.loan.delete({ where: { id: loanId } });
}

// ── Payment management ───────────────────────────────────────────────────────

export async function addPayment(
  userId: string,
  loanId: string,
  input: AddPaymentInput,
) {
  const loan = await prisma.loan.findFirst({ where: { id: loanId, userId } });
  if (!loan) throw new NotFoundError(`Loan ${loanId} not found`);

  return prisma.loanPayment.create({
    data: {
      loanId,
      paymentType: input.paymentType,
      paidOn: toDate(input.paidOn),
      amount: new Prisma.Decimal(input.amount),
      principalPart: input.principalPart ? new Prisma.Decimal(input.principalPart) : null,
      interestPart: input.interestPart ? new Prisma.Decimal(input.interestPart) : null,
      forMonth: input.forMonth ?? null,
      canonicalEventId: input.canonicalEventId ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function deletePayment(userId: string, paymentId: string) {
  const payment = await prisma.loanPayment.findFirst({
    where: { id: paymentId },
    include: { loan: { select: { userId: true } } },
  });
  if (!payment || payment.loan.userId !== userId) {
    throw new NotFoundError(`LoanPayment ${paymentId} not found`);
  }
  await prisma.loanPayment.delete({ where: { id: paymentId } });
}

// ── Computed views ───────────────────────────────────────────────────────────

export async function getLoanSummary(userId: string, loanId: string): Promise<LoanSummary> {
  const loan = await getLoan(userId, loanId) as LoanWithPayments;
  return computeLoanSummary(loan as unknown as StoredLoan);
}

export async function getAmortization(
  userId: string,
  loanId: string,
): Promise<AmortizationRow[]> {
  const loan = await getLoan(userId, loanId) as LoanWithPayments;
  return buildAmortizationSchedule(loan as unknown as StoredLoan);
}

// ── Alert scanner ────────────────────────────────────────────────────────────

/**
 * For every ACTIVE loan, compute the next EMI date and create Alert rows
 * for approaching EMIs. Follows the same pattern as generateRenewalAlerts()
 * in insurance.service.ts.
 */
export async function generateLoanEmiAlerts(userId?: string): Promise<number> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayStr = dateToIso(today);

  const loans = await prisma.loan.findMany({
    where: {
      ...(userId ? { userId } : {}),
      status: 'ACTIVE',
    },
    include: {
      payments: { orderBy: { paidOn: 'asc' } },
    },
  });

  let created = 0;

  for (const loan of loans) {
    let schedule: AmortizationRow[];
    try {
      schedule = buildAmortizationSchedule(loan as unknown as StoredLoan);
    } catch (err) {
      logger.warn(
        { loanId: loan.id, err: err instanceof Error ? err.message : String(err) },
        '[loans] failed to build schedule for alert scan — skipping',
      );
      continue;
    }

    // Find the first unpaid EMI on or after today
    const nextUnpaid = schedule.find((r) => !r.isPaid && r.date >= todayStr);
    if (!nextUnpaid) continue;

    const emiDate = new Date(nextUnpaid.date + 'T00:00:00Z');
    const daysLeft = Math.ceil(
      (emiDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    const isOverdue = daysLeft < 0;
    const daysLabel = isOverdue ? Math.abs(daysLeft) : daysLeft;

    // Only alert at exact threshold crossings (or overdue)
    if (!isOverdue && !(ALERT_THRESHOLDS as readonly number[]).includes(daysLeft)) continue;

    const metaKey = `loan_emi:${loan.id}:${nextUnpaid.date}:${isOverdue ? 'overdue' : `${daysLeft}d`}`;

    const existing = await prisma.alert.findFirst({
      where: {
        userId: loan.userId,
        type: 'LOAN_EMI_DUE',
        metadata: { path: ['key'], equals: metaKey },
      },
    });
    if (existing) continue;

    const title = isOverdue
      ? `${loan.lenderName} EMI overdue by ${daysLabel} day${daysLabel !== 1 ? 's' : ''}`
      : `${loan.lenderName} EMI due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;

    const emiDisplay = new Decimal(nextUnpaid.emiAmount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const description = `EMI of ₹${emiDisplay} ${isOverdue ? 'was due on' : 'due on'} ${nextUnpaid.date}`;

    await prisma.alert.create({
      data: {
        userId: loan.userId,
        type: 'LOAN_EMI_DUE',
        title,
        description,
        triggerDate: new Date(),
        metadata: {
          key: metaKey,
          loanId: loan.id,
          lenderName: loan.lenderName,
          emiDate: nextUnpaid.date,
          emiAmount: nextUnpaid.emiAmount,
          daysLeft,
          isOverdue,
        },
      },
    });
    created++;
  }

  return created;
}
