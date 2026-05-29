/**
 * Phase 2d — Cashflow forecast.
 *
 * Aggregates the next N months of scheduled inflows and outflows across:
 *   - Loan EMIs        (OUTFLOW, via amortization.firstUnpaid forward)
 *   - Rent receipts    (INFLOW,  via RentReceipt.dueDate where status=EXPECTED)
 *   - Insurance        (OUTFLOW, via InsurancePolicy.nextPremiumDue)
 *   - FD/RD maturities (INFLOW,  via Transaction.maturityDate)
 *
 * No mutations — pure read-only projection. Returns one row per event,
 * plus a per-month rollup so the UI can render a monthly bar chart
 * without re-aggregating on the client.
 */

import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import {
  buildAmortizationSchedule,
  type StoredLoan,
} from './loans.service.js';
import { serializeMoney } from '@portfolioos/shared';

const ZERO = new Decimal(0);

export type ForecastDirection = 'INFLOW' | 'OUTFLOW';
export type ForecastSource =
  | 'LOAN_EMI'
  | 'RENT_DUE'
  | 'INSURANCE_PREMIUM'
  | 'FD_MATURITY'
  | 'RD_MATURITY';

export interface ForecastEvent {
  id: string; // synthetic — `{source}:{originId}:{date}`
  date: string; // YYYY-MM-DD
  direction: ForecastDirection;
  source: ForecastSource;
  description: string;
  amount: string;
  /** Stable foreign key to source row (loanId, propertyId, policyId, txId). */
  refId: string;
}

export interface MonthlyRollup {
  month: string; // YYYY-MM
  inflow: string;
  outflow: string;
  net: string;
}

export interface ForecastResult {
  events: ForecastEvent[];
  monthly: MonthlyRollup[];
  summary: {
    totalInflow: string;
    totalOutflow: string;
    netCashflow: string;
    horizonMonths: number;
  };
}

function d(v: { toString(): string } | null | undefined): Decimal {
  if (v == null) return ZERO;
  return new Decimal(v.toString());
}

export async function getCashflowForecast(
  userId: string,
  horizonMonths = 12,
): Promise<ForecastResult> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const horizonEnd = new Date(today);
  horizonEnd.setUTCMonth(horizonEnd.getUTCMonth() + horizonMonths);

  const events: ForecastEvent[] = [];

  // ── Loan EMIs ────────────────────────────────────────────────────────
  const loans = await prisma.loan.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { payments: { orderBy: { paidOn: 'asc' } } },
  });
  for (const loan of loans) {
    let schedule: ReturnType<typeof buildAmortizationSchedule>;
    try {
      schedule = buildAmortizationSchedule(loan as unknown as StoredLoan);
    } catch {
      continue;
    }
    for (const row of schedule) {
      if (row.isPaid) continue;
      const dt = new Date(row.date + 'T00:00:00Z');
      if (dt < today || dt > horizonEnd) continue;
      events.push({
        id: `LOAN_EMI:${loan.id}:${row.date}`,
        date: row.date,
        direction: 'OUTFLOW',
        source: 'LOAN_EMI',
        description: `${loan.lenderName} EMI`,
        amount: serializeMoney(d(row.emiAmount)),
        refId: loan.id,
      });
    }
  }

  // ── Rent receipts ────────────────────────────────────────────────────
  const rentReceipts = await prisma.rentReceipt.findMany({
    where: {
      tenancy: { property: { userId } },
      dueDate: { gte: today, lte: horizonEnd },
      status: { in: ['EXPECTED', 'OVERDUE', 'PARTIAL'] },
    },
    include: {
      tenancy: {
        include: { property: { select: { name: true } } },
      },
    },
  });
  for (const r of rentReceipts) {
    events.push({
      id: `RENT_DUE:${r.id}:${r.dueDate.toISOString().slice(0, 10)}`,
      date: r.dueDate.toISOString().slice(0, 10),
      direction: 'INFLOW',
      source: 'RENT_DUE',
      description: `${r.tenancy.property.name} (${r.tenancy.tenantName})`,
      amount: serializeMoney(d(r.expectedAmount)),
      refId: r.id,
    });
  }

  // ── Insurance premiums ───────────────────────────────────────────────
  const policies = await prisma.insurancePolicy.findMany({
    where: {
      userId,
      status: 'ACTIVE',
      nextPremiumDue: { gte: today, lte: horizonEnd },
    },
  });
  for (const p of policies) {
    if (!p.nextPremiumDue) continue;
    events.push({
      id: `INSURANCE_PREMIUM:${p.id}:${p.nextPremiumDue.toISOString().slice(0, 10)}`,
      date: p.nextPremiumDue.toISOString().slice(0, 10),
      direction: 'OUTFLOW',
      source: 'INSURANCE_PREMIUM',
      description: `${p.insurer} ${p.type} premium`,
      amount: serializeMoney(d(p.premiumAmount)),
      refId: p.id,
    });
  }

  // ── FD/RD maturities ─────────────────────────────────────────────────
  const maturingTxns = await prisma.transaction.findMany({
    where: {
      portfolio: { userId },
      assetClass: { in: ['FIXED_DEPOSIT', 'RECURRING_DEPOSIT'] },
      maturityDate: { gte: today, lte: horizonEnd },
      transactionType: 'BUY',
    },
    select: {
      id: true,
      assetClass: true,
      assetName: true,
      netAmount: true,
      maturityDate: true,
    },
  });
  for (const tx of maturingTxns) {
    if (!tx.maturityDate) continue;
    const amt = d(tx.netAmount);
    const isFd = tx.assetClass === 'FIXED_DEPOSIT';
    events.push({
      id: `${isFd ? 'FD_MATURITY' : 'RD_MATURITY'}:${tx.id}:${tx.maturityDate.toISOString().slice(0, 10)}`,
      date: tx.maturityDate.toISOString().slice(0, 10),
      direction: 'INFLOW',
      source: isFd ? 'FD_MATURITY' : 'RD_MATURITY',
      description: `${isFd ? 'FD' : 'RD'} maturity — ${tx.assetName ?? 'Deposit'}`,
      amount: serializeMoney(amt),
      refId: tx.id,
    });
  }

  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // ── Monthly rollup ───────────────────────────────────────────────────
  const monthlyMap = new Map<string, { inflow: Decimal; outflow: Decimal }>();
  // Pre-seed all months in horizon so the chart shows zero-bars too.
  for (let i = 0; i < horizonMonths; i++) {
    const m = new Date(today);
    m.setUTCMonth(m.getUTCMonth() + i);
    const key = `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`;
    monthlyMap.set(key, { inflow: ZERO, outflow: ZERO });
  }
  for (const e of events) {
    const month = e.date.slice(0, 7);
    const cur = monthlyMap.get(month) ?? { inflow: ZERO, outflow: ZERO };
    if (e.direction === 'INFLOW') cur.inflow = cur.inflow.plus(d(e.amount));
    else cur.outflow = cur.outflow.plus(d(e.amount));
    monthlyMap.set(month, cur);
  }
  const monthly: MonthlyRollup[] = Array.from(monthlyMap.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, v]) => ({
      month,
      inflow: serializeMoney(v.inflow),
      outflow: serializeMoney(v.outflow),
      net: serializeMoney(v.inflow.minus(v.outflow)),
    }));

  const totalInflow = events
    .filter((e) => e.direction === 'INFLOW')
    .reduce((acc, e) => acc.plus(d(e.amount)), ZERO);
  const totalOutflow = events
    .filter((e) => e.direction === 'OUTFLOW')
    .reduce((acc, e) => acc.plus(d(e.amount)), ZERO);

  return {
    events,
    monthly,
    summary: {
      totalInflow: serializeMoney(totalInflow),
      totalOutflow: serializeMoney(totalOutflow),
      netCashflow: serializeMoney(totalInflow.minus(totalOutflow)),
      horizonMonths,
    },
  };
}
