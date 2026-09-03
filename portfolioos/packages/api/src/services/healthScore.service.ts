import { Decimal } from 'decimal.js';
import { ageBasedEquityGuidelinePct } from './riskProfileMath.js';
import { formatINR } from '@portfolioos/shared';
import { prisma } from '../lib/prisma.js';
import { getDashboardNetWorth } from './dashboard.service.js';
import { listGoals } from './goals.service.js';
import { activeMonthlyIncomeTotal } from './income.service.js';
import {
  emergencyFundScore, investmentRateScore, debtBurdenScore,
  diversificationScore, insuranceScore, goalProgressScore, weightedOverall,
} from './healthScoreMath.js';

const ZERO = new Decimal(0);
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const LIQUID_CLASSES = new Set(['CASH', 'FIXED_DEPOSIT', 'RECURRING_DEPOSIT', 'POST_OFFICE_SAVINGS', 'POST_OFFICE_RD', 'POST_OFFICE_TD']);
const LIFE_POLICY_TYPES = new Set(['TERM', 'WHOLE_LIFE', 'ULIP', 'ENDOWMENT']);

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

async function liquidAssetsTotal(userId: string): Promise<Decimal> {
  const rows = await prisma.holdingProjection.findMany({
    where: { portfolio: { userId }, assetClass: { in: Array.from(LIQUID_CLASSES) as never } },
    select: { currentValue: true, totalCost: true },
  });
  return rows.reduce((s, h) => s.plus(h.currentValue !== null ? d(h.currentValue) : d(h.totalCost)), ZERO);
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
  const [liquidAssets, monthlyExpenses] = await Promise.all([
    liquidAssetsTotal(userId),
    estimateMonthlyExpenses(userId),
  ]);
  const target = emergencyFundTargetFor(monthlyExpenses);
  return {
    liquidAssets,
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
    { score: number; insight: string; action: string }
  >;
  computedAt: string;
}

export async function computeHealthScore(userId: string, opts: { force?: boolean } = {}): Promise<HealthScoreResult> {
  if (!opts.force) {
    const cached = await prisma.healthScoreSnapshot.findUnique({ where: { userId } });
    if (cached && Date.now() - cached.computedAt.getTime() < STALE_AFTER_MS) {
      return {
        overallScore: cached.overallScore,
        grade: cached.grade,
        subScores: cached.subScores as HealthScoreResult['subScores'],
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
  const activeGoals = goals.filter((g) => g.status === 'ACTIVE');
  const gp = goalProgressScore(activeGoals.map((g) => g.progressPct));

  // A brand-new user with zero holdings has no signal for emergency-fund coverage or
  // diversification, and a user with zero confirmed income events has no signal for
  // investment rate, debt burden, or "is my cover enough" — the pure-math functions
  // optimistically resolve their zero-denominator guard clauses to values that read as
  // real judgments (0, 100, ...) when they're actually "insufficient data." Override to
  // the neutral 50 already used elsewhere (insuranceScore/goalProgressScore with no
  // policies/goals). These overridden values feed BOTH the sub-score cards and
  // weightedOverall so the gauge and the cards never disagree.
  const emergencyFundScoreForOverall = hasAnyHoldings ? ef.score : 50;
  const diversificationScoreForOverall = hasAnyHoldings ? dv.score : 50;
  const investmentRateScoreForOverall = hasIncomeData ? ir.score : 50;
  const debtBurdenScoreForOverall = hasIncomeData ? db.score : 50;
  const insuranceNeedsIncomeToJudge = life.hasPolicies && !hasIncomeData;
  const insuranceScoreForOverall = insuranceNeedsIncomeToJudge ? 50 : ins.score;

  const { overall, grade } = weightedOverall({
    emergencyFund: emergencyFundScoreForOverall, investmentRate: investmentRateScoreForOverall, debtBurden: debtBurdenScoreForOverall,
    diversification: diversificationScoreForOverall, insurance: insuranceScoreForOverall, goalProgress: gp.score,
  });

  // Emergency fund: point at the exact shortfall, or confirm the buffer if already met.
  const emergencyTarget = emergencyFundTargetFor(monthlyExpenses);
  const emergencyShortfall = emergencyTarget.minus(liquidAssets);
  const emergencyFundAction = emergencyShortfall.greaterThan(0)
    ? `You need ${formatINR(emergencyShortfall.toString())} more in liquid assets (savings, FDs) to reach the 6-month target of ${formatINR(emergencyTarget.toString())}.`
    : "You're fully covered for 6 months of expenses — keep this buffer growing as your expenses rise.";

  // Investment rate: exact ₹/month gap to the 20% target.
  const investmentTarget = monthlyIncome.times(0.2);
  const investmentGap = investmentTarget.minus(monthlyInvestment);
  const investmentRateAction = !hasIncomeData
    ? 'Add your salary under Income, or connect Gmail, so we can see your income and score this accurately.'
    : investmentGap.greaterThan(0)
      ? `Increase your monthly investing by ${formatINR(investmentGap.toString())} to hit the 20% target (${formatINR(investmentTarget.toString())}/month).`
      : "You're investing at or above the 20% target — keep it up.";

  // Debt burden: exact ₹/month to cut to get under the 40% comfort line.
  const debtComfortCap = monthlyIncome.times(0.4);
  const debtExcess = monthlyDebtPayments.minus(debtComfortCap);
  const debtBurdenAction = !hasIncomeData
    ? 'Add your salary under Income, or connect Gmail, so we can see your income and score this accurately.'
    : debtExcess.greaterThan(0)
      ? `Cut ${formatINR(debtExcess.toString())}/month from EMIs or card dues to get under the comfortable 40% line.`
      : 'Your EMIs and card payments are comfortably within a healthy range.';

  // Diversification: name the single worst driver (holding, then asset class, then
  // equity-vs-age guideline) instead of a generic "rebalance" nudge.
  const maxClass = netWorth.allocationBreakdown.reduce<{ key: string; percent: number } | null>(
    (m, a) => (m === null || a.percent > m.percent ? a : m), null,
  );
  const targetEquityPct = ageBasedEquityGuidelinePct(age);
  const equityGap = targetEquityPct != null ? Math.abs(equityPct - targetEquityPct) : null;
  let diversificationAction: string;
  if (largestHoldingPct.pct > 50) {
    diversificationAction = `${largestHoldingPct.name ?? 'Your largest holding'} is ${largestHoldingPct.pct.toFixed(0)}% of your portfolio — trim it below 50% to reduce concentration risk.`;
  } else if (maxClass && maxClass.percent > 60) {
    diversificationAction = `${humanizeAssetClass(maxClass.key)} makes up ${maxClass.percent.toFixed(0)}% of your portfolio — bring it under 60% by adding other asset classes.`;
  } else if (equityGap != null && equityGap > 10 && targetEquityPct != null) {
    diversificationAction = equityPct > targetEquityPct
      ? `Your equity allocation (${equityPct.toFixed(0)}%) is well above the age-based guideline of ${targetEquityPct.toFixed(0)}% — consider shifting some toward debt.`
      : `Your equity allocation (${equityPct.toFixed(0)}%) is well below the age-based guideline of ${targetEquityPct.toFixed(0)}% — consider adding equity exposure.`;
  } else {
    diversificationAction = "Your portfolio is well spread across holdings and asset classes — no rebalancing needed right now.";
  }

  // Insurance: exact ₹ gap to the 10x-income target, or flag missing income data.
  const insuranceRequiredCover = annualIncome.times(10);
  const insuranceGap = insuranceRequiredCover.minus(life.sumAssured);
  const insuranceAction = !life.hasPolicies
    ? 'Add a term or life policy — you currently have none tracked.'
    : !hasIncomeData
      ? 'Add your salary under Income, or connect Gmail, so we can see your income and check if your cover is enough.'
      : insuranceGap.greaterThan(0)
        ? `Add ${formatINR(insuranceGap.toString())} more life cover to reach the 10x-income target of ${formatINR(insuranceRequiredCover.toString())}.`
        : "Your life cover meets the 10x-income target — no action needed.";

  // Goal progress: name the specific goal dragging the average down.
  const worstGoal = activeGoals.length > 0
    ? [...activeGoals].sort((a, b) => a.progressPct - b.progressPct)[0]
    : null;
  const goalProgressAction = worstGoal
    ? `"${worstGoal.name}" is your furthest-behind goal at ${Math.round(worstGoal.progressPct)}% progress — review contributions or timeline.`
    : 'Set your first financial goal.';

  const subScores: HealthScoreResult['subScores'] = {
    emergencyFund: hasAnyHoldings
      ? {
        score: Math.round(ef.score),
        insight: `You have ${ef.monthsCovered === Infinity ? '20+' : ef.monthsCovered.toFixed(1)} months of expenses covered. Target is 6 months.`,
        action: emergencyFundAction,
      }
      : {
        score: 50,
        insight: 'No portfolio data yet — add your bank accounts or investments to get an emergency-fund score.',
        action: 'Connect a bank account or add your investments to get scored.',
      },
    investmentRate: hasIncomeData
      ? {
        score: Math.round(ir.score),
        insight: `You're investing ${ir.ratePct.toFixed(1)}% of income. Target is 20%.`,
        action: investmentRateAction,
      }
      : {
        score: 50,
        insight: "We don't have enough confirmed income data yet to estimate your investment rate.",
        action: investmentRateAction,
      },
    debtBurden: hasIncomeData
      ? {
        score: Math.round(db.score),
        insight: `Your EMIs and card payments consume ${db.burdenPct.toFixed(1)}% of income. Keep it under 40%.`,
        action: debtBurdenAction,
      }
      : {
        score: 50,
        insight: `We don't have enough confirmed income data yet to score this. You have ${formatINR(monthlyDebtPayments.toString())}/month in EMIs and card dues.`,
        action: debtBurdenAction,
      },
    diversification: hasAnyHoldings
      ? {
        score: Math.round(dv.score),
        insight: `Your equity allocation is ${equityPct.toFixed(1)}% of your portfolio.`,
        action: diversificationAction,
      }
      : {
        score: 50,
        insight: 'No portfolio data yet to assess diversification.',
        action: 'Add your investments to get scored.',
      },
    insurance: {
      score: Math.round(insuranceNeedsIncomeToJudge ? 50 : ins.score),
      insight: !life.hasPolicies
        ? 'No life insurance policies found — add one manually to get scored.'
        : insuranceNeedsIncomeToJudge
          ? `Your life cover is ${formatINR(life.sumAssured.toString())}, but we don't have enough income data yet to check if that's enough.`
          : `Your life cover is ${formatINR(life.sumAssured.toString())}. Target is 10x annual income.`,
      action: insuranceAction,
    },
    goalProgress: {
      score: Math.round(gp.score),
      insight: activeGoals.length > 0
        ? `You are averaging ${Math.round(gp.score)}% progress across your active goals.`
        : 'You have not set any financial goals yet.',
      action: goalProgressAction,
    },
  };

  const computedAt = new Date();
  await prisma.healthScoreSnapshot.upsert({
    where: { userId },
    create: { userId, overallScore: overall, grade, subScores: subScores as never, computedAt },
    update: { overallScore: overall, grade, subScores: subScores as never, computedAt },
  });

  return { overallScore: overall, grade, subScores, computedAt: computedAt.toISOString() };
}
