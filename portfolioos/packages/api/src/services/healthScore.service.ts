import { Decimal } from 'decimal.js';
import { ageBasedEquityGuidelinePct } from './riskProfileMath.js';
import { formatINR } from '@everypaisa/shared';
import { prisma } from '../lib/prisma.js';
import { getDashboardNetWorth } from './dashboard.service.js';
import { listGoals } from './goals.service.js';
import { activeMonthlyIncomeTotal } from './income.service.js';
import {
  emergencyFundScore, investmentRateScore, debtBurdenScore,
  diversificationScore, insuranceScore, goalProgressScore, weightedOverall,
  requiredLifeCover, LIFE_POLICY_TYPES,
} from './healthScoreMath.js';

const ZERO = new Decimal(0);
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const LIQUID_CLASSES = new Set(['CASH', 'FIXED_DEPOSIT', 'RECURRING_DEPOSIT', 'POST_OFFICE_SAVINGS', 'POST_OFFICE_RD', 'POST_OFFICE_TD']);

function d(v: { toString(): string } | null | undefined): Decimal {
  if (v == null) return ZERO;
  return new Decimal(v.toString());
}

function monthsAgo(n: number): Date {
  const dt = new Date();
  dt.setUTCMonth(dt.getUTCMonth() - n);
  return dt;
}

async function estimateMonthlyIncome(userId: string): Promise<Decimal> {
  const events = await prisma.canonicalEvent.findMany({
    where: {
      userId,
      eventType: { in: ['NEFT_CREDIT', 'UPI_CREDIT'] },
      eventDate: { gte: monthsAgo(3) },
      status: { in: ['CONFIRMED', 'PROJECTED'] },
    },
    select: { amount: true },
  });
  const total = events.reduce((s, e) => s.plus(d(e.amount)), ZERO);
  return total.dividedBy(3);
}

async function estimateMonthlyExpenses(userId: string): Promise<Decimal> {
  const events = await prisma.canonicalEvent.findMany({
    where: {
      userId,
      eventType: { in: ['CARD_PURCHASE', 'UPI_DEBIT', 'NEFT_DEBIT'] },
      eventDate: { gte: monthsAgo(3) },
      status: { in: ['CONFIRMED', 'PROJECTED'] },
    },
    select: { amount: true },
  });
  const total = events.reduce((s, e) => s.plus(d(e.amount)), ZERO);
  return total.dividedBy(3);
}

async function estimateMonthlyInvestment(userId: string): Promise<Decimal> {
  const [events, transactions] = await Promise.all([
    prisma.canonicalEvent.findMany({
      where: {
        userId,
        eventType: { in: ['SIP_INSTALLMENT', 'BUY'] },
        eventDate: { gte: monthsAgo(3) },
        status: { in: ['CONFIRMED', 'PROJECTED'] },
      },
      select: { amount: true },
    }),
    // Most users add BUYs/SIPs by hand rather than via Gmail — count those
    // too. canonicalEventId: null avoids double-counting rows already
    // captured above once they're projected into a Transaction.
    prisma.transaction.findMany({
      where: {
        portfolio: { userId },
        transactionType: { in: ['BUY', 'SIP'] },
        tradeDate: { gte: monthsAgo(3) },
        canonicalEventId: null,
      },
      select: { netAmount: true },
    }),
  ]);
  const total = events
    .reduce((s, e) => s.plus(d(e.amount)), ZERO)
    .plus(transactions.reduce((s, t) => s.plus(d(t.netAmount)), ZERO));
  return total.dividedBy(3);
}

/**
 * Months of expenses the emergency fund should cover. Mirrors the divisor
 * inside healthScoreMath.emergencyFundScore — the two must not disagree.
 */
const EMERGENCY_FUND_MONTHS = 6;

/**
 * Money reachable within days: open bank accounts (never an overdraft), plus
 * cash, FDs, RDs and post-office deposits held as investments.
 *
 * A bank statement import mirrors an account as a CASH holding, so when stored
 * bank balances exist they replace CASH holdings rather than adding to them —
 * the balance on the account is the more direct and more current figure.
 */
async function liquidParts(userId: string): Promise<{ total: Decimal; bankBalances: Decimal }> {
  const [rows, accounts] = await Promise.all([
    prisma.holdingProjection.findMany({
      where: { portfolio: { userId }, assetClass: { in: Array.from(LIQUID_CLASSES) as never } },
      select: { assetClass: true, currentValue: true, totalCost: true },
    }),
    prisma.bankAccount.findMany({
      where: { userId, status: 'ACTIVE', accountType: { not: 'OD' } },
      select: { currentBalance: true },
    }),
  ]);
  const valueOf = (h: (typeof rows)[number]) => (h.currentValue !== null ? d(h.currentValue) : d(h.totalCost));
  const cashHoldings = rows.filter((h) => h.assetClass === 'CASH').reduce((s, h) => s.plus(valueOf(h)), ZERO);
  const deposits = rows.filter((h) => h.assetClass !== 'CASH').reduce((s, h) => s.plus(valueOf(h)), ZERO);
  const bankBalances = accounts.reduce((s, a) => s.plus(d(a.currentBalance)), ZERO);
  return {
    total: deposits.plus(bankBalances.greaterThan(0) ? bankBalances : cashHoldings),
    bankBalances,
  };
}

async function liquidAssetsTotal(userId: string): Promise<Decimal> {
  return (await liquidParts(userId)).total;
}

/**
 * The emergency-fund picture, in one place.
 *
 * Extracted so the advisor engine's liquidity facts are the *same* numbers the
 * health score shows rather than a third independent implementation of
 * "liquid assets vs six months of expenses" (contextBuilder and
 * healthScoreMath already made it two). Behaviour of computeHealthScore is
 * unchanged — it still calls the same two private estimators, now via this.
 */
export interface EmergencyFundInputs {
  liquidAssets: Decimal;
  /** The open bank accounts' part of liquidAssets (zero when none are on file). */
  bankBalances: Decimal;
  /** Three-month rolling average of debit events. Zero when we have no
   *  spending signal at all — callers must decide what that means for them. */
  monthlyExpenses: Decimal;
  target: Decimal;
  /** liquidAssets − target. Negative means a shortfall. */
  surplus: Decimal;
  /** False when there is no expense signal, so `target` is a meaningless 0. */
  hasExpenseSignal: boolean;
}

/** Pure: the six-month target for a given monthly spend. */
export function emergencyFundTargetFor(monthlyExpenses: Decimal): Decimal {
  return monthlyExpenses.times(EMERGENCY_FUND_MONTHS);
}

export async function getEmergencyFundInputs(userId: string): Promise<EmergencyFundInputs> {
  const [liquid, monthlyExpenses] = await Promise.all([
    liquidParts(userId),
    estimateMonthlyExpenses(userId),
  ]);
  const liquidAssets = liquid.total;
  const target = emergencyFundTargetFor(monthlyExpenses);
  return {
    liquidAssets,
    bankBalances: liquid.bankBalances,
    monthlyExpenses,
    target,
    surplus: liquidAssets.minus(target),
    hasExpenseSignal: monthlyExpenses.greaterThan(0),
  };
}

interface LargestHolding {
  pct: number;
  name: string | null;
}

async function largestSingleHoldingPct(userId: string): Promise<LargestHolding> {
  const rows = await prisma.holdingProjection.findMany({
    where: { portfolio: { userId } },
    select: { currentValue: true, totalCost: true, assetName: true },
  });
  const values = rows.map((h) => ({
    value: h.currentValue !== null ? d(h.currentValue) : d(h.totalCost),
    name: h.assetName,
  }));
  const total = values.reduce((s, v) => s.plus(v.value), ZERO);
  if (total.lessThanOrEqualTo(0)) return { pct: 0, name: null };
  const max = values.reduce((m, v) => (v.value.greaterThan(m.value) ? v : m), { value: ZERO, name: null as string | null });
  return { pct: max.value.dividedBy(total).times(100).toNumber(), name: max.name };
}

function humanizeAssetClass(key: string): string {
  return key
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

async function monthlyCcMinimums(userId: string): Promise<Decimal> {
  const cards = await prisma.creditCard.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { statements: { orderBy: { forMonth: 'desc' }, take: 1 } },
  });
  return cards.reduce((s, c) => s.plus(d(c.statements[0]?.minimumDue)), ZERO);
}

async function lifeInsuranceTotals(userId: string): Promise<{ sumAssured: Decimal; hasPolicies: boolean }> {
  const policies = await prisma.insurancePolicy.findMany({
    where: { userId, status: 'ACTIVE', type: { in: Array.from(LIFE_POLICY_TYPES) } },
    select: { sumAssured: true },
  });
  return {
    sumAssured: policies.reduce((s, p) => s.plus(d(p.sumAssured)), ZERO),
    hasPolicies: policies.length > 0,
  };
}

async function userAge(userId: string): Promise<number | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dob: true } });
  if (!user?.dob) return null;
  const ageMs = Date.now() - user.dob.getTime();
  return Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));
}

export interface HealthScoreResult {
  overallScore: number;
  grade: string;
  subScores: Record<
    'emergencyFund' | 'investmentRate' | 'debtBurden' | 'diversification' | 'insurance' | 'goalProgress',
    HealthSubScore
  >;
  computedAt: string;
}

/**
 * One part of the score. `score` is null when we don't have the data to judge
 * it (no expenses, no income, no goals...) - it is left out of the overall, not
 * counted as a middling 50. `action` is null when there is nothing to fix.
 */
export interface HealthSubScore {
  score: number | null;
  insight: string;
  action: string | null;
}

/** Bumped when the stored sub-score shape changes; older snapshots are recomputed. */
const SNAPSHOT_VERSION = 2;

function stripVersion(stored: unknown): HealthScoreResult['subScores'] {
  const { _v: _ignored, ...rest } = stored as Record<string, unknown>;
  return rest as HealthScoreResult['subScores'];
}

export async function computeHealthScore(userId: string, opts: { force?: boolean } = {}): Promise<HealthScoreResult> {
  if (!opts.force) {
    const cached = await prisma.healthScoreSnapshot.findUnique({ where: { userId } });
    // Snapshots from before unscored parts existed hold a made-up 50: recompute those.
    const isCurrent = (cached?.subScores as { _v?: unknown } | null)?._v === SNAPSHOT_VERSION;
    if (cached && isCurrent && Date.now() - cached.computedAt.getTime() < STALE_AFTER_MS) {
      return {
        overallScore: cached.overallScore,
        grade: cached.grade,
        subScores: stripVersion(cached.subScores),
        computedAt: cached.computedAt.toISOString(),
      };
    }
  }

  const [netWorth, goals, salaryIncome, estimatedIncome, monthlyExpenses, monthlyInvestment, liquidAssets, largestHoldingPct, ccMinimums, life, age] =
    await Promise.all([
      getDashboardNetWorth(userId),
      listGoals(userId),
      activeMonthlyIncomeTotal(userId),
      estimateMonthlyIncome(userId),
      estimateMonthlyExpenses(userId),
      estimateMonthlyInvestment(userId),
      liquidAssetsTotal(userId),
      largestSingleHoldingPct(userId),
      monthlyCcMinimums(userId),
      lifeInsuranceTotals(userId),
      userAge(userId),
    ]);

  // Manual salary entries are the preferred income source — most users
  // don't have Gmail connected, so the NEFT/UPI-credit estimate is a
  // fallback, not the primary signal.
  const monthlyIncome = salaryIncome.greaterThan(0) ? salaryIncome : estimatedIncome;

  const monthlyEmi = new Decimal(netWorth.liabilities.monthlyEmiTotal);
  const monthlyDebtPayments = monthlyEmi.plus(ccMinimums);
  const equityPct = netWorth.allocationBreakdown.find((a) => a.key === 'EQUITY')?.percent ?? 0;
  const annualIncome = monthlyIncome.times(12);
  const hasAnyHoldings = netWorth.allocationBreakdown.length > 0;
  // No active salary entries and no confirmed NEFT/UPI credit events in the
  // last 3 months. A real user always has *some* income, so this is a
  // reliable proxy for "we haven't seen your income yet" rather than "you
  // earn nothing."
  const hasIncomeData = monthlyIncome.greaterThan(0);

  // What we can actually judge. Without holdings there is nothing to measure
  // an emergency fund or diversification against; without expenses no
  // "months covered"; without income no investment rate, debt burden or
  // "is the cover enough"; without goals no goal progress. Those parts are
  // left unscored rather than given a neutral 50 — an account with no data
  // was showing B/70, and "20+ months" of emergency fund with no expenses.
  const hasExpenseData = monthlyExpenses.greaterThan(0);
  const hasDebt = monthlyDebtPayments.greaterThan(0);
  const activeGoals = goals.filter((g) => g.status === 'ACTIVE');

  const ef = emergencyFundScore(liquidAssets, monthlyExpenses);
  const ir = investmentRateScore(monthlyInvestment, monthlyIncome);
  const db = debtBurdenScore(monthlyDebtPayments, monthlyIncome);
  const dv = diversificationScore({
    classPercents: netWorth.allocationBreakdown.map((a) => ({ assetClass: a.key, percent: a.percent })),
    largestSingleHoldingPct: largestHoldingPct.pct,
    equityPct,
    age,
  });
  const ins = insuranceScore(life.sumAssured, annualIncome, life.hasPolicies);
  const gp = goalProgressScore(activeGoals.map((g) => g.progressPct));

  const addIncome = 'Add your salary under Income, or connect Gmail, so we can see your income.';

  // Emergency fund.
  const emergencyTarget = emergencyFundTargetFor(monthlyExpenses);
  const emergencyShortfall = emergencyTarget.minus(liquidAssets);
  const emergencyFund: HealthSubScore = !hasAnyHoldings
    ? {
      score: null,
      insight: 'No bank balances or investments yet, so there is nothing to measure an emergency fund against.',
      action: 'Add a bank account or your investments.',
    }
    : !hasExpenseData
      ? {
        score: null,
        insight: `You have ${formatINR(liquidAssets.toString())} in liquid assets, but we don't know your monthly expenses yet, so we can't tell how many months that covers.`,
        action: 'Record your spending (Cash Activity), or connect Gmail, so we can work out your monthly expenses.',
      }
      : {
        score: Math.round(ef.score),
        insight: `You have ${ef.monthsCovered.toFixed(1)} months of expenses covered. Target is 6 months.`,
        action: emergencyShortfall.greaterThan(0)
          ? `You need ${formatINR(emergencyShortfall.toString())} more in liquid assets (savings, FDs) to reach the 6-month target of ${formatINR(emergencyTarget.toString())}.`
          : null,
      };

  // Investment rate.
  const investmentTarget = monthlyIncome.times(0.2);
  const investmentGap = investmentTarget.minus(monthlyInvestment);
  const investmentRate: HealthSubScore = !hasIncomeData
    ? { score: null, insight: "We don't know your income yet, so we can't work out your investment rate.", action: addIncome }
    : {
      score: Math.round(ir.score),
      insight: `You're investing ${ir.ratePct.toFixed(1)}% of income. Target is 20%.`,
      action: investmentGap.greaterThan(0)
        ? `Increase your monthly investing by ${formatINR(investmentGap.toString())} to hit the 20% target (${formatINR(investmentTarget.toString())}/month).`
        : null,
    };

  // Debt burden. No EMIs or card dues is a fact, income or not.
  const debtComfortCap = monthlyIncome.times(0.4);
  const debtExcess = monthlyDebtPayments.minus(debtComfortCap);
  const debtBurden: HealthSubScore = !hasDebt
    ? { score: 100, insight: 'You have no EMIs or card dues.', action: null }
    : !hasIncomeData
      ? {
        score: null,
        insight: `You pay ${formatINR(monthlyDebtPayments.toString())}/month in EMIs and card dues, but we don't know your income yet, so we can't tell how heavy that is.`,
        action: addIncome,
      }
      : {
        score: Math.round(db.score),
        insight: `Your EMIs and card payments take ${db.burdenPct.toFixed(1)}% of income. Keep it under 40%.`,
        action: debtExcess.greaterThan(0)
          ? `Cut ${formatINR(debtExcess.toString())}/month from EMIs or card dues to get under the comfortable 40% line.`
          : null,
      };

  // Diversification: name the single worst driver (holding, then asset class,
  // then equity-vs-age guideline).
  const maxClass = netWorth.allocationBreakdown.reduce<{ key: string; percent: number } | null>(
    (m, a) => (m === null || a.percent > m.percent ? a : m), null,
  );
  const targetEquityPct = ageBasedEquityGuidelinePct(age);
  const equityGap = targetEquityPct != null ? Math.abs(equityPct - targetEquityPct) : null;
  let diversificationAction: string | null = null;
  if (largestHoldingPct.pct > 50) {
    diversificationAction = `${largestHoldingPct.name ?? 'Your largest holding'} is ${largestHoldingPct.pct.toFixed(0)}% of your portfolio — trim it below 50% to reduce concentration risk.`;
  } else if (maxClass && maxClass.percent > 60) {
    diversificationAction = `${humanizeAssetClass(maxClass.key)} makes up ${maxClass.percent.toFixed(0)}% of your portfolio — bring it under 60% by adding other asset classes.`;
  } else if (equityGap != null && equityGap > 10 && targetEquityPct != null) {
    diversificationAction = equityPct > targetEquityPct
      ? `Your equity allocation (${equityPct.toFixed(0)}%) is well above the age-based guideline of ${targetEquityPct.toFixed(0)}% — consider shifting some toward debt.`
      : `Your equity allocation (${equityPct.toFixed(0)}%) is well below the age-based guideline of ${targetEquityPct.toFixed(0)}% — consider adding equity exposure.`;
  }
  const diversification: HealthSubScore = !hasAnyHoldings
    ? { score: null, insight: 'No investments yet to assess diversification.', action: 'Add your investments.' }
    : {
      score: Math.round(dv.score),
      insight: diversificationAction
        ? `Your equity allocation is ${equityPct.toFixed(1)}% of your portfolio.`
        : `Your portfolio is well spread across holdings and asset classes (equity ${equityPct.toFixed(1)}%).`,
      action: diversificationAction,
    };

  // Insurance. With no life policy tracked we can't tell a gap from someone
  // with no dependents, so it isn't scored — but it is said.
  const insuranceRequiredCover = requiredLifeCover(annualIncome);
  const insuranceGap = insuranceRequiredCover.minus(life.sumAssured);
  const insurance: HealthSubScore = !life.hasPolicies
    ? {
      score: null,
      insight: 'No life insurance tracked.',
      action: 'If anyone depends on your income, add your term or life policy here (or take one).',
    }
    : !hasIncomeData
      ? {
        score: null,
        insight: `Your life cover is ${formatINR(life.sumAssured.toString())}, but we don't know your income yet, so we can't check if that's enough.`,
        action: addIncome,
      }
      : {
        score: Math.round(ins.score),
        insight: `Your life cover is ${formatINR(life.sumAssured.toString())}. Target is 10x annual income.`,
        action: insuranceGap.greaterThan(0)
          ? `Add ${formatINR(insuranceGap.toString())} more life cover to reach the 10x-income target of ${formatINR(insuranceRequiredCover.toString())}.`
          : null,
      };

  // Goal progress: name the goal furthest behind.
  const worstGoal = activeGoals.length > 0
    ? [...activeGoals].sort((a, b) => a.progressPct - b.progressPct)[0]
    : null;
  const goalProgress: HealthSubScore = !worstGoal
    ? { score: null, insight: "You haven't set any financial goals yet.", action: 'Set your first financial goal.' }
    : {
      score: Math.round(gp.score),
      insight: `You are averaging ${Math.round(gp.score)}% progress across your active goals.`,
      action: worstGoal.progressPct < 100
        ? `"${worstGoal.name}" is your furthest-behind goal at ${Math.round(worstGoal.progressPct)}% progress — review contributions or timeline.`
        : null,
    };

  const subScores: HealthScoreResult['subScores'] = {
    emergencyFund, investmentRate, debtBurden, diversification, insurance, goalProgress,
  };

  // The gauge and the cards are computed from the same values, so they agree.
  const { overall, grade } = weightedOverall({
    emergencyFund: emergencyFund.score,
    investmentRate: investmentRate.score,
    debtBurden: debtBurden.score,
    diversification: diversification.score,
    insurance: insurance.score,
    goalProgress: goalProgress.score,
  });

  const computedAt = new Date();
  await prisma.healthScoreSnapshot.upsert({
    where: { userId },
    create: { userId, overallScore: overall, grade, subScores: { ...subScores, _v: SNAPSHOT_VERSION } as never, computedAt },
    update: { overallScore: overall, grade, subScores: { ...subScores, _v: SNAPSHOT_VERSION } as never, computedAt },
  });

  return { overallScore: overall, grade, subScores, computedAt: computedAt.toISOString() };
}
