import { Decimal } from 'decimal.js';
import type { AssetClass, Prisma } from '@prisma/client';
import { compoundDeposit, depositPeriodsPerYear } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';

/**
 * Interest that has built up inside bank / post-office deposits during a
 * financial year, whether or not any cash was paid out.
 *
 * `investmentIncome` only counts interest that was *received* (an
 * INTEREST_RECEIVED transaction or a bank credit). A cumulative FD pays nothing
 * until maturity, yet its interest is usually taxable each year it accrues, so
 * the tax page would show ₹0 interest for a user with lakhs in FDs. This is the
 * missing figure. It is an estimate: banks round, and a user may follow the
 * cash method — the page says so.
 */

/** Taxable-interest deposit classes, and how each compounds when the row doesn't say. */
const DEPOSIT_CLASSES: ReadonlyArray<AssetClass> = [
  'FIXED_DEPOSIT',
  'RECURRING_DEPOSIT',
  'NSC',
  'KVP',
  'POST_OFFICE_TD',
  'POST_OFFICE_RD',
];
const ANNUAL_COMPOUNDING = new Set<AssetClass>(['NSC', 'KVP']);

export interface AccruingDeposit {
  principal: Decimal;
  ratePct: Decimal;
  openDate: Date;
  maturityDate: Date | null;
  periodsPerYear: number;
}

/** [1 Apr, 1 Apr next year) bounds for "2025-26" (UTC midnight); `end` is exclusive. */
function fyBounds(fy: string): { start: Date; end: Date } {
  const startYear = Number.parseInt(fy.slice(0, 4), 10);
  return {
    start: new Date(Date.UTC(startYear, 3, 1)),
    end: new Date(Date.UTC(startYear + 1, 3, 1)),
  };
}

/**
 * Interest accrued within `fy` across `deposits`, counted up to `asOf` (so the
 * running financial year shows what has built up so far, not a forecast).
 * Interest on a deposit stops at its maturity date.
 */
export function accruedDepositInterestInFy(
  deposits: readonly AccruingDeposit[],
  fy: string,
  asOf: Date,
): Decimal {
  const { start: fyStart, end: fyEnd } = fyBounds(fy);
  let total = new Decimal(0);
  for (const d of deposits) {
    const stop = [fyEnd, asOf, d.maturityDate].filter((x): x is Date => x != null).reduce((a, b) => (a < b ? a : b));
    const from = d.openDate > fyStart ? d.openDate : fyStart;
    if (stop <= from) continue;
    const common = { principal: d.principal, annualRate: d.ratePct.div(100), start: d.openDate, periodsPerYear: d.periodsPerYear };
    const atStop = compoundDeposit({ ...common, valuation: stop });
    const atFrom = compoundDeposit({ ...common, valuation: from });
    total = total.plus(atStop.minus(atFrom));
  }
  return total;
}

/**
 * Loads the deposit rows for the given portfolios and returns the FY's accrued
 * interest as a string. Uses each deposit's own principal; a part-withdrawn FD
 * is not scaled down, which makes this an upper-side estimate.
 */
export async function userAccruedDepositInterest(
  portfolioWhere: Prisma.PortfolioWhereInput,
  fy: string,
  asOf: Date = new Date(),
): Promise<string> {
  const txs = await prisma.transaction.findMany({
    where: {
      portfolio: portfolioWhere,
      assetClass: { in: [...DEPOSIT_CLASSES] },
      transactionType: { in: ['DEPOSIT', 'BUY', 'OPENING_BALANCE'] },
      interestRate: { not: null },
    },
    select: { netAmount: true, interestRate: true, interestFrequency: true, tradeDate: true, maturityDate: true, assetClass: true },
  });
  const deposits: AccruingDeposit[] = txs.map((t) => ({
    principal: new Decimal(t.netAmount.toString()),
    ratePct: new Decimal(t.interestRate!.toString()),
    openDate: t.tradeDate,
    maturityDate: t.maturityDate ?? null,
    periodsPerYear: ANNUAL_COMPOUNDING.has(t.assetClass) ? 1 : depositPeriodsPerYear(t.interestFrequency),
  }));
  return accruedDepositInterestInFy(deposits, fy, asOf).toDecimalPlaces(2).toString();
}
