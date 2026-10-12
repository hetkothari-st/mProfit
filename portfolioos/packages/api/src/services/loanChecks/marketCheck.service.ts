/**
 * Compare-with-market data for one loan (EMI calculator plan 3, spec s6.2). The savings themselves are
 * computed by the shared `compareWithMarket` (the web card lets the user edit switching costs); this returns
 * the inputs: the loan's position from its own schedule, the best fresh market rate and the benchmark series.
 */
import {
  Decimal, MCLR_BENCHMARK_TENOR, rateLoanTypeForLoan,
  type BenchmarkKind, type BenchmarkSummaryWire, type LoanMarketCheckWire, type LoanRateBenchmark, type LoanRateType,
  type MarketRateWire, type RateLoanType,
} from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';
import { computeLoanSummary, type StoredLoan } from '../loans.service.js';
import { listLoanRates } from '../loanRates/loanRates.service.js';
import { isoDate, pctString } from '../loanRates/store.js';
import { canonicalLender } from './lenderAlias.js';

export interface LoanPosition {
  outstanding: Decimal;
  remainingMonths: number;
  nextEmiDate: string | null;
}

/** Outstanding balance, remaining EMIs and next EMI date from the loan's own schedule (payments included). */
export function loanPosition(loan: StoredLoan, asOf: Date): LoanPosition {
  const summary = computeLoanSummary(loan, asOf);
  return {
    outstanding: new Decimal(summary.outstandingBalance),
    remainingMonths: summary.remainingEmiCount,
    nextEmiDate: summary.nextEmiDate,
  };
}

/** Plan ruling 4: the lowest effective min rate that is not stale (SUSPECT rows never reach listLoanRates). */
export async function bestMarketRate(type: RateLoanType, now: Date): Promise<MarketRateWire | null> {
  const { rows } = await listLoanRates(type, now);
  const best = rows.find((row) => !row.stale);
  return best ? { sourceId: best.sourceId, lender: best.lender, minRatePct: best.minRatePct, asOf: best.asOf, sourceUrl: best.sourceUrl } : null;
}

export interface BenchmarkTarget {
  kind: BenchmarkKind;
  lender: string | null;
  tenor: string | null;
}

/**
 * Which benchmark series a loan follows (spec s6.1/s6.2): FLOATING + REPO -> repo; FLOATING + MCLR -> the
 * matched lender's 1-year MCLR, or repo for display when the lender is not tracked. Everything else: none.
 */
export function benchmarkTarget(rateType: string, rateBenchmark: string | null, lender: string | null): BenchmarkTarget | null {
  if (rateType !== 'FLOATING') return null;
  if (rateBenchmark === 'REPO') return { kind: 'REPO', lender: null, tenor: null };
  if (rateBenchmark === 'MCLR') {
    return lender !== null ? { kind: 'MCLR', lender, tenor: MCLR_BENCHMARK_TENOR } : { kind: 'REPO', lender: null, tenor: null };
  }
  return null;
}

/** Latest rate of the series and, when the two newest rows differ, the signed last change. */
export async function benchmarkSummary(target: BenchmarkTarget): Promise<BenchmarkSummaryWire | null> {
  const [current, previous] = await prisma.benchmarkRate.findMany({
    where: { kind: target.kind, lender: target.lender, tenor: target.tenor },
    orderBy: [{ effectiveDate: 'desc' }, { fetchedAt: 'desc' }],
    take: 2,
  });
  if (!current) return null;
  const date = isoDate(current.effectiveDate)!;
  return {
    kind: target.kind,
    lender: target.lender,
    tenor: target.tenor,
    ratePct: pctString(current.ratePct),
    effectiveDate: date,
    lastChange:
      previous && !previous.ratePct.equals(current.ratePct)
        ? { deltaPct: pctString(current.ratePct.minus(previous.ratePct)), date }
        : null,
  };
}

export async function getLoanMarketCheck(userId: string, loanId: string, now: Date = new Date()): Promise<LoanMarketCheckWire> {
  const loan = await prisma.loan.findFirst({
    where: { id: loanId, userId },
    include: { payments: { orderBy: { paidOn: 'asc' } } },
  });
  if (!loan) throw new NotFoundError(`Loan ${loanId} not found`);
  const rateLoanType = rateLoanTypeForLoan(loan.loanType);
  const lender = canonicalLender(loan.lenderName);
  const position = loanPosition(loan as unknown as StoredLoan, now);
  const target = benchmarkTarget(loan.rateType, loan.rateBenchmark, lender);
  return {
    loanId: loan.id,
    status: loan.status,
    loanType: loan.loanType,
    rateLoanType,
    lender,
    rateType: loan.rateType as LoanRateType,
    rateBenchmark: loan.rateBenchmark as LoanRateBenchmark | null,
    nextRateResetDate: isoDate(loan.nextRateResetDate),
    currentRatePct: pctString(loan.interestRate),
    outstanding: position.outstanding.toFixed(2),
    remainingMonths: position.remainingMonths,
    nextEmiDate: position.nextEmiDate,
    market: rateLoanType !== null ? await bestMarketRate(rateLoanType, now) : null,
    benchmark: target !== null ? await benchmarkSummary(target) : null,
  };
}
