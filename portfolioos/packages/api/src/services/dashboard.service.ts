import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { serializeMoney } from '@portfolioos/shared';
import { buildAmortizationSchedule, type StoredLoan } from './loans.service.js';
import { computeCardSummary } from './creditCards.service.js';

const ZERO = new Decimal(0);

function d(v: { toString(): string } | null | undefined): Decimal {
  if (v == null) return ZERO;
  return new Decimal(v.toString());
}

function premiumToAnnual(amount: Decimal, frequency: string): Decimal {
  switch (frequency) {
    case 'MONTHLY': return amount.times(12);
    case 'QUARTERLY': return amount.times(4);
    case 'HALF_YEARLY': return amount.times(2);
    case 'ANNUAL': return amount;
    case 'SINGLE': return ZERO;
    default: return amount;
  }
}

function fyStart(): Date {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 3, 1); // April 1
}

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

export async function getDashboardNetWorth(userId: string) {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 86_400_000);

  // ── 1. Financial portfolio ───────────────────────────────────────────
  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolio: { userId } },
    include: { portfolio: true },
  });

  // For assets without a live price (FD, Gold, Bonds, EPF…) use totalCost
  // as effective value so they appear in allocation and net worth totals.
  const effectiveVal = (h: { currentValue: { toString(): string } | null; totalCost: { toString(): string } }) =>
    h.currentValue !== null ? d(h.currentValue) : d(h.totalCost);

  const portfolioValue = holdings.reduce((s, h) => s.plus(effectiveVal(h)), ZERO);
  const portfolioInvested = holdings.reduce((s, h) => s.plus(d(h.totalCost)), ZERO);
  const portfolioPnL = portfolioValue.minus(portfolioInvested);
  const portfolioPnLPct = portfolioInvested.greaterThan(0)
    ? portfolioPnL.dividedBy(portfolioInvested).times(100).toNumber()
    : 0;

  // Asset class breakdown from HoldingProjection
  const byClass: Record<string, Decimal> = {};
  for (const h of holdings) {
    byClass[h.assetClass] = (byClass[h.assetClass] ?? ZERO).plus(effectiveVal(h));
  }

  // ── 2. Vehicles ──────────────────────────────────────────────────────
  const vehicles = await prisma.vehicle.findMany({
    where: { userId },
    include: {
      challans: { where: { status: 'PENDING' } },
    },
  });

  const vehicleValue = vehicles.reduce((s, v) => s.plus(d(v.currentValue)), ZERO);
  const pendingChallans = vehicles.reduce((n, v) => n + v.challans.length, 0);

  const vehicleAlerts: Array<{
    vehicleId: string;
    label: string;
    type: string;
    expiryDate: string;
    daysUntil: number;
  }> = [];
  for (const v of vehicles) {
    const label = [v.make, v.model, v.registrationNo].filter(Boolean).join(' ');
    const checks: Array<[Date | null, string]> = [
      [v.insuranceExpiry, 'Insurance'],
      [v.pucExpiry, 'PUC'],
      [v.fitnessExpiry, 'Fitness'],
      [v.roadTaxExpiry, 'Road Tax'],
    ];
    for (const [expiry, type] of checks) {
      if (expiry && expiry <= in30Days) {
        vehicleAlerts.push({
          vehicleId: v.id,
          label,
          type,
          expiryDate: expiry.toISOString().slice(0, 10),
          daysUntil: daysUntil(expiry),
        });
      }
    }
  }

  // ── 3. Rental ────────────────────────────────────────────────────────
  const properties = await prisma.rentalProperty.findMany({
    where: { userId },
    include: {
      tenancies: {
        where: { isActive: true },
        include: { rentReceipts: { where: { status: 'OVERDUE' } } },
      },
    },
  });

  const rentalValue = properties.reduce((s, p) => s.plus(d(p.currentValue)), ZERO);
  const monthlyRent = properties.reduce((s, p) => {
    return s.plus(p.tenancies.reduce((t, tn) => t.plus(d(tn.monthlyRent)), ZERO));
  }, ZERO);
  const overdueCount = properties.reduce((n, p) => {
    return n + p.tenancies.reduce((t, tn) => t + tn.rentReceipts.length, 0);
  }, 0);

  // YTD rental income (received receipts since April 1)
  const fy = fyStart();
  const receivedReceipts = await prisma.rentReceipt.findMany({
    where: {
      tenancy: { property: { userId } },
      receivedOn: { gte: fy },
      status: { in: ['RECEIVED', 'PARTIAL'] },
    },
  });
  const rentalIncomeYTD = receivedReceipts.reduce((s, r) => s.plus(d(r.receivedAmount)), ZERO);

  // YTD expenses
  const expenses = await prisma.propertyExpense.findMany({
    where: { property: { userId }, paidOn: { gte: fy } },
  });
  const rentalExpenseYTD = expenses.reduce((s, e) => s.plus(d(e.amount)), ZERO);

  // ── 4. Insurance ─────────────────────────────────────────────────────
  const policies = await prisma.insurancePolicy.findMany({
    where: { userId, status: 'ACTIVE' },
    orderBy: { nextPremiumDue: 'asc' },
  });

  const totalSumAssured = policies.reduce((s, p) => s.plus(d(p.sumAssured)), ZERO);
  const annualPremium = policies.reduce(
    (s, p) => s.plus(premiumToAnnual(d(p.premiumAmount), p.premiumFrequency)),
    ZERO,
  );
  const upcomingRenewals = policies
    .filter((p) => p.nextPremiumDue && p.nextPremiumDue <= in30Days)
    .map((p) => ({
      policyId: p.id,
      insurer: p.insurer,
      type: p.type,
      planName: p.planName,
      nextPremiumDue: p.nextPremiumDue!.toISOString().slice(0, 10),
      daysUntil: daysUntil(p.nextPremiumDue!),
      amount: serializeMoney(d(p.premiumAmount)),
    }));

  // ── 5. Loans & Liabilities ───────────────────────────────────────────
  const activeLoans = await prisma.loan.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { payments: { orderBy: { paidOn: 'asc' } } },
  });

  const activeCards = await prisma.creditCard.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { statements: { orderBy: { dueDate: 'desc' } } },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let totalOutstanding = ZERO;
  let monthlyEmiTotal = ZERO;
  const upcomingEmis: Array<{
    loanId: string;
    lenderName: string;
    emiDate: string;
    emiAmount: string;
    daysUntil: number;
  }> = [];
  const overdueEmis: Array<{
    loanId: string;
    lenderName: string;
    daysOverdue: number;
  }> = [];

  for (const loan of activeLoans) {
    monthlyEmiTotal = monthlyEmiTotal.plus(d(loan.emiAmount));

    let schedule: ReturnType<typeof buildAmortizationSchedule>;
    try {
      schedule = buildAmortizationSchedule(loan as unknown as StoredLoan);
    } catch {
      // If schedule fails (e.g. bad data), use principal as outstanding
      totalOutstanding = totalOutstanding.plus(d(loan.principalAmount));
      continue;
    }

    // Outstanding balance: opening balance of first unpaid EMI
    const firstUnpaid = schedule.find((r) => !r.isPaid);
    if (firstUnpaid) {
      totalOutstanding = totalOutstanding.plus(new Decimal(firstUnpaid.openingBalance));

      const emiDateMs = new Date(firstUnpaid.date + 'T00:00:00Z').getTime();
      const daysDiff = Math.ceil((emiDateMs - today.getTime()) / 86_400_000);

      if (daysDiff < 0) {
        overdueEmis.push({
          loanId: loan.id,
          lenderName: loan.lenderName,
          daysOverdue: Math.abs(daysDiff),
        });
      } else if (daysDiff <= 30) {
        upcomingEmis.push({
          loanId: loan.id,
          lenderName: loan.lenderName,
          emiDate: firstUnpaid.date,
          emiAmount: firstUnpaid.emiAmount,
          daysUntil: daysDiff,
        });
      }
    } else {
      // All EMIs paid — loan effectively zero outstanding
      // (status should be CLOSED but handle gracefully)
    }
  }

  upcomingEmis.sort((a, b) => a.daysUntil - b.daysUntil);

  // Credit card outstanding
  let totalCreditCardOutstanding = ZERO;
  for (const card of activeCards) {
    if (card.outstandingBalance) {
      totalCreditCardOutstanding = totalCreditCardOutstanding.plus(d(card.outstandingBalance));
    } else {
      // Sum PENDING/PARTIAL statements as proxy for outstanding
      const cardSummary = computeCardSummary(card);
      totalCreditCardOutstanding = totalCreditCardOutstanding.plus(
        new Decimal(cardSummary.outstanding),
      );
    }
  }

  const totalLiabilities = totalOutstanding.plus(totalCreditCardOutstanding);

  // ── 6. Expanded allocation (all tangible assets) ─────────────────────
  const totalTangible = portfolioValue.plus(vehicleValue).plus(rentalValue);
  const allocationBreakdown: Array<{
    key: string;
    label: string;
    value: string;
    numericValue: number;
    percent: number;
    category: string;
  }> = [];

  // Financial holdings grouped by class
  for (const [cls, val] of Object.entries(byClass).sort((a, b) =>
    b[1].comparedTo(a[1]),
  )) {
    allocationBreakdown.push({
      key: cls,
      label: cls,
      value: serializeMoney(val),
      numericValue: val.toNumber(),
      percent: totalTangible.greaterThan(0) ? val.dividedBy(totalTangible).times(100).toNumber() : 0,
      category: 'FINANCIAL',
    });
  }

  if (vehicleValue.greaterThan(0)) {
    allocationBreakdown.push({
      key: 'VEHICLE',
      label: 'Vehicles',
      value: serializeMoney(vehicleValue),
      numericValue: vehicleValue.toNumber(),
      percent: totalTangible.greaterThan(0) ? vehicleValue.dividedBy(totalTangible).times(100).toNumber() : 0,
      category: 'VEHICLE',
    });
  }

  if (rentalValue.greaterThan(0)) {
    allocationBreakdown.push({
      key: 'REAL_ESTATE',
      label: 'Real Estate',
      value: serializeMoney(rentalValue),
      numericValue: rentalValue.toNumber(),
      percent: totalTangible.greaterThan(0) ? rentalValue.dividedBy(totalTangible).times(100).toNumber() : 0,
      category: 'REAL_ESTATE',
    });
  }

  allocationBreakdown.sort((a, b) => b.numericValue - a.numericValue);

  // ── 6. Unified alerts (urgent first) ─────────────────────────────────
  const alerts: Array<{
    type: string;
    title: string;
    description: string;
    urgency: 'HIGH' | 'MEDIUM' | 'LOW';
    daysUntil: number | null;
  }> = [];

  for (const va of vehicleAlerts) {
    alerts.push({
      type: 'VEHICLE_EXPIRY',
      title: `${va.type} expiring — ${va.label}`,
      description: `Expires ${va.expiryDate}`,
      urgency: va.daysUntil <= 7 ? 'HIGH' : va.daysUntil <= 15 ? 'MEDIUM' : 'LOW',
      daysUntil: va.daysUntil,
    });
  }

  for (const r of upcomingRenewals) {
    alerts.push({
      type: 'INSURANCE_RENEWAL',
      title: `${r.insurer} ${r.type} premium due`,
      description: `₹${new Decimal(r.amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} due ${r.nextPremiumDue}`,
      urgency: r.daysUntil <= 7 ? 'HIGH' : r.daysUntil <= 15 ? 'MEDIUM' : 'LOW',
      daysUntil: r.daysUntil,
    });
  }

  if (overdueCount > 0) {
    alerts.push({
      type: 'RENT_OVERDUE',
      title: `${overdueCount} rent receipt${overdueCount > 1 ? 's' : ''} overdue`,
      description: 'Review rental properties for overdue payments',
      urgency: 'HIGH',
      daysUntil: null,
    });
  }

  if (pendingChallans > 0) {
    alerts.push({
      type: 'CHALLAN_PENDING',
      title: `${pendingChallans} pending traffic challan${pendingChallans > 1 ? 's' : ''}`,
      description: 'Pay or contest pending challans to avoid penalties',
      urgency: 'MEDIUM',
      daysUntil: null,
    });
  }

  // Loan EMI alerts
  for (const emi of overdueEmis) {
    alerts.push({
      type: 'LOAN_EMI_OVERDUE',
      title: `${emi.lenderName} EMI overdue`,
      description: `EMI is ${emi.daysOverdue} day${emi.daysOverdue !== 1 ? 's' : ''} overdue`,
      urgency: 'HIGH',
      daysUntil: -emi.daysOverdue,
    });
  }

  for (const emi of upcomingEmis) {
    alerts.push({
      type: 'LOAN_EMI_DUE',
      title: `${emi.lenderName} EMI due in ${emi.daysUntil} day${emi.daysUntil !== 1 ? 's' : ''}`,
      description: `EMI of ₹${new Decimal(emi.emiAmount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} due on ${emi.emiDate}`,
      urgency: emi.daysUntil <= 7 ? 'HIGH' : emi.daysUntil <= 15 ? 'MEDIUM' : 'LOW',
      daysUntil: emi.daysUntil,
    });
  }

  alerts.sort((a, b) => {
    const urgencyOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    }
    if (a.daysUntil != null && b.daysUntil != null) return a.daysUntil - b.daysUntil;
    return 0;
  });

  // ── 7. Net worth totals ──────────────────────────────────────────────
  // totalNetWorth = gross assets (unchanged for backward compat)
  // netWorthAfterLiabilities = assets − all outstanding loans & CC balances
  const totalNetWorth = portfolioValue.plus(vehicleValue).plus(rentalValue);
  const netWorthAfterLiabilities = totalNetWorth.minus(totalLiabilities);

  return {
    totalNetWorth: serializeMoney(totalNetWorth),
    totalLiabilities: serializeMoney(totalLiabilities),
    netWorthAfterLiabilities: serializeMoney(netWorthAfterLiabilities),

    portfolio: {
      currentValue: serializeMoney(portfolioValue),
      totalInvested: serializeMoney(portfolioInvested),
      unrealisedPnL: serializeMoney(portfolioPnL),
      unrealisedPnLPct: portfolioPnLPct,
    },

    realEstate: {
      count: properties.length,
      totalValue: serializeMoney(rentalValue),
      monthlyRent: serializeMoney(monthlyRent),
      incomeYTD: serializeMoney(rentalIncomeYTD),
      expenseYTD: serializeMoney(rentalExpenseYTD),
      netYTD: serializeMoney(rentalIncomeYTD.minus(rentalExpenseYTD)),
      overdueCount,
    },

    vehicles: {
      count: vehicles.length,
      totalValue: serializeMoney(vehicleValue),
      pendingChallans,
      expiringItems: vehicleAlerts,
    },

    insurance: {
      activePoliciesCount: policies.length,
      totalSumAssured: serializeMoney(totalSumAssured),
      annualPremiumTotal: serializeMoney(annualPremium),
      upcomingRenewals,
    },

    liabilities: {
      totalOutstanding: serializeMoney(totalOutstanding),
      monthlyEmiTotal: serializeMoney(monthlyEmiTotal),
      loanCount: activeLoans.length,
      creditCardCount: activeCards.length,
      totalCreditCardOutstanding: serializeMoney(totalCreditCardOutstanding),
      upcomingEmis,
      overdueEmis,
    },

    allocationBreakdown,
    alerts: alerts.slice(0, 10),
  };
}
