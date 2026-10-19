/**
 * The daily existing-loan checks (spec s6.3), one user at a time. `findBenchmarkChanges` and
 * `eligibleUserIds` read across users and run under runAsSystem; `checkUserLoans` runs under
 * runAsUser(userId), so it can only see and write that user's loans and alerts.
 */
import type { Loan, LoanPayment, Prisma } from '@prisma/client';
import {
  DEFAULT_SWITCHING_COSTS, Decimal, MCLR_BENCHMARK_TENOR, REFINANCE_MIN_GAP_PP,
  compareWithMarket, nextResetOnOrAfter, passThroughEstimate, rateLoanTypeForLoan, switchingCost,
  type BenchmarkKind, type MarketRateWire, type RateLoanType,
} from '@everypaisa/shared';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { istDate } from '../loanRates/sanity.js';
import { isoDate } from '../loanRates/store.js';
import type { StoredLoan } from '../loans.service.js';
import { canonicalLender } from './lenderAlias.js';
import { benchmarkAlertText, refinanceAlertText } from './loanAlertText.js';
import { loanPosition } from './marketCheck.service.js';

/** Plan ruling 7: a change fetched within this window is still news; the dedup key stops repeats. */
export const BENCHMARK_LOOKBACK_DAYS = 7;
/** A net move bigger than this in one window is a misparse or a mistyped override, not news. */
export const MAX_BENCHMARK_CHANGE_PP = new Decimal('1.00');
/** A change dated further back than this is history, not news (e.g. a backdated override). */
export const MAX_BENCHMARK_CHANGE_AGE_DAYS = 30;
const DAY_MS = 86_400_000;

export interface BenchmarkChange {
  kind: BenchmarkKind;
  lender: string | null;
  ratePct: Decimal;
  /** Signed: negative is a cut. */
  deltaPct: Decimal;
  effectiveDate: string;
  fetchedAt: Date;
}

/**
 * One change per series (REPO, or one lender's 1-year MCLR): the NET move from the last row fetched before
 * the window to the latest row fetched in it, so a cut that is reversed within the window is not news. Skipped
 * when the net move is zero, implausibly large, dated in the future (IST) or more than 30 days ago.
 */
export async function findBenchmarkChanges(now: Date): Promise<BenchmarkChange[]> {
  const since = new Date(now.getTime() - BENCHMARK_LOOKBACK_DAYS * DAY_MS);
  const recent = await prisma.benchmarkRate.findMany({
    where: {
      fetchedAt: { gte: since, lte: now },
      OR: [{ kind: 'REPO', lender: null, tenor: null }, { kind: 'MCLR', tenor: MCLR_BENCHMARK_TENOR }],
    },
    orderBy: [{ effectiveDate: 'asc' }, { fetchedAt: 'asc' }],
  });
  const latestBySeries = new Map<string, (typeof recent)[number]>();
  for (const row of recent) latestBySeries.set(`${row.kind}|${row.lender ?? ''}|${row.tenor ?? ''}`, row);

  const today = istDate(now);
  const oldest = istDate(new Date(now.getTime() - MAX_BENCHMARK_CHANGE_AGE_DAYS * DAY_MS));
  const changes: BenchmarkChange[] = [];
  for (const latest of latestBySeries.values()) {
    const effectiveDate = isoDate(latest.effectiveDate)!;
    if (effectiveDate > today || effectiveDate < oldest) continue;
    const baseline = await prisma.benchmarkRate.findFirst({
      where: { kind: latest.kind, lender: latest.lender, tenor: latest.tenor, fetchedAt: { lt: since } },
      orderBy: [{ effectiveDate: 'desc' }, { fetchedAt: 'desc' }],
    });
    if (!baseline) continue;
    const delta = new Decimal(latest.ratePct.minus(baseline.ratePct).toString());
    if (delta.isZero()) continue;
    if (delta.abs().greaterThan(MAX_BENCHMARK_CHANGE_PP)) {
      logger.warn(
        { kind: latest.kind, lender: latest.lender, tenor: latest.tenor, deltaPct: delta.toFixed(2), effectiveDate },
        '[loanChecks] benchmark change too large to be real; not alerting',
      );
      continue;
    }
    changes.push({
      kind: latest.kind as BenchmarkKind,
      lender: latest.lender,
      ratePct: new Decimal(latest.ratePct.toString()),
      deltaPct: delta,
      effectiveDate,
      fetchedAt: latest.fetchedAt,
    });
  }
  return changes;
}

/**
 * Plan ruling 10: owners of ACTIVE loans who are active, not scheduled for deletion, opted in, and not a
 * CA-owned shadow client (managed family profiles are included). Loans are read first because a relation
 * filter on User would run Loan's RLS policy without the system bypass.
 */
export async function eligibleUserIds(only?: string[]): Promise<string[]> {
  const owners = await prisma.loan.findMany({
    where: { status: 'ACTIVE', ...(only ? { userId: { in: only } } : {}) },
    select: { userId: true },
    distinct: ['userId'],
  });
  if (owners.length === 0) return [];
  const users = await prisma.user.findMany({
    where: {
      id: { in: owners.map((o) => o.userId) },
      isActive: true,
      loanRateAlerts: true,
      deletionScheduledFor: null,
      OR: [{ isShadowClient: false }, { managedById: { not: null } }],
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return users.map((u) => u.id);
}

export interface LoanCheckContext {
  now: Date;
  changes: BenchmarkChange[];
  market: (type: RateLoanType) => Promise<MarketRateWire | null>;
}

export interface UserCheckResult {
  refinance: number;
  benchmark: number;
  failedLoans: number;
}

type LoanWithPayments = Loan & { payments: LoanPayment[] };

export async function checkUserLoans(userId: string, ctx: LoanCheckContext): Promise<UserCheckResult> {
  const loans = await prisma.loan.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { payments: { orderBy: { paidOn: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  const result: UserCheckResult = { refinance: 0, benchmark: 0, failedLoans: 0 };
  // Each check fails on its own: a loan whose schedule cannot be built, or a failed market lookup, must not
  // cost this loan its other check or the user's other loans theirs. Failures are counted and logged with the id.
  for (const loan of loans) {
    try {
      result.refinance += await refinanceCheck(loan, ctx);
    } catch (err) {
      result.failedLoans++;
      logger.warn({ err, loanId: loan.id }, '[loanChecks] refinance check skipped');
    }
    try {
      result.benchmark += await benchmarkChecks(loan, ctx);
    } catch (err) {
      result.failedLoans++;
      logger.warn({ err, loanId: loan.id }, '[loanChecks] benchmark check skipped');
    }
  }
  return result;
}

async function alertExists(userId: string, type: 'LOAN_REFINANCE' | 'LOAN_BENCHMARK_CHANGE', key: string): Promise<boolean> {
  const row = await prisma.alert.findFirst({ where: { userId, type, metadata: { path: ['key'], equals: key } }, select: { id: true } });
  return row !== null;
}

async function refinanceCheck(loan: LoanWithPayments, ctx: LoanCheckContext): Promise<number> {
  const type = rateLoanTypeForLoan(loan.loanType);
  if (type === null) return 0;
  const market = await ctx.market(type);
  if (market === null) return 0;
  const current = new Decimal(loan.interestRate.toString());
  const best = new Decimal(market.minRatePct);
  if (current.minus(best).lessThan(REFINANCE_MIN_GAP_PP)) return 0;
  const position = loanPosition(loan as unknown as StoredLoan, ctx.now);
  const cost = switchingCost(position.outstanding, new Decimal(DEFAULT_SWITCHING_COSTS.processingPct), new Decimal(DEFAULT_SWITCHING_COSTS.otherCharges));
  const comparison = compareWithMarket({
    outstanding: position.outstanding,
    remainingMonths: position.remainingMonths,
    currentRatePct: current,
    marketRatePct: best,
    switchingCost: cost,
  });
  if (comparison === null || !comparison.netSaving.greaterThan(0)) return 0;
  const month = istDate(ctx.now).slice(0, 7);
  const key = `loan:refi:${loan.id}:${month}`;
  if (await alertExists(loan.userId, 'LOAN_REFINANCE', key)) return 0;
  const text = refinanceAlertText({
    loanType: loan.loanType, lenderName: loan.lenderName, currentRatePct: current,
    marketLender: market.lender, marketRatePct: best, netSaving: comparison.netSaving,
  });
  const metadata: Prisma.InputJsonObject = {
    key,
    loanId: loan.id,
    lenderName: loan.lenderName,
    month,
    currentRatePct: current.toFixed(2),
    marketRatePct: best.toFixed(2),
    marketLender: market.lender,
    marketSourceId: market.sourceId,
    netSaving: comparison.netSaving.toFixed(2),
    breakEvenMonth: comparison.breakEvenMonth,
  };
  await prisma.alert.create({
    data: { userId: loan.userId, type: 'LOAN_REFINANCE', title: text.title, description: text.description, triggerDate: ctx.now, metadata },
  });
  return 1;
}

async function benchmarkChecks(loan: LoanWithPayments, ctx: LoanCheckContext): Promise<number> {
  if (loan.rateType !== 'FLOATING' || ctx.changes.length === 0) return 0;
  const lender = canonicalLender(loan.lenderName);
  const applicable = ctx.changes.filter(
    (c) =>
      (c.kind === 'REPO' && loan.rateBenchmark === 'REPO') ||
      (c.kind === 'MCLR' && loan.rateBenchmark === 'MCLR' && lender !== null && c.lender === lender),
  );
  let created = 0;
  for (const change of applicable) {
    // Plan ruling 7: a loan entered after the change was seen already carries the new rate.
    if (loan.createdAt.getTime() >= change.fetchedAt.getTime()) continue;
    const key = `loan:bench:${loan.id}:${change.kind}:${change.effectiveDate}`;
    if (await alertExists(loan.userId, 'LOAN_BENCHMARK_CHANGE', key)) continue;
    const position = loanPosition(loan as unknown as StoredLoan, ctx.now);
    const estimate = passThroughEstimate({
      outstanding: position.outstanding,
      remainingMonths: position.remainingMonths,
      currentRatePct: new Decimal(loan.interestRate.toString()),
      deltaPct: change.deltaPct,
    });
    const today = istDate(ctx.now);
    const from = change.effectiveDate > today ? change.effectiveDate : today;
    const nextResetDate = nextResetOnOrAfter(isoDate(loan.nextRateResetDate), from, change.kind);
    const text = benchmarkAlertText({
      kind: change.kind, benchmarkLender: change.lender, deltaPct: change.deltaPct, effectiveDate: change.effectiveDate,
      lenderName: loan.lenderName, nextResetDate, estimate,
    });
    const metadata: Prisma.InputJsonObject = {
      key,
      loanId: loan.id,
      lenderName: loan.lenderName,
      kind: change.kind,
      benchmarkLender: change.lender,
      effectiveDate: change.effectiveDate,
      deltaPct: change.deltaPct.toFixed(2),
      nextResetDate,
      newEmi: estimate !== null ? estimate.newEmi.toFixed(0) : null,
      tenureDeltaMonths: estimate !== null ? estimate.tenureDeltaMonths : null,
    };
    await prisma.alert.create({
      data: { userId: loan.userId, type: 'LOAN_BENCHMARK_CHANGE', title: text.title, description: text.description, triggerDate: ctx.now, metadata },
    });
    created++;
  }
  return created;
}
