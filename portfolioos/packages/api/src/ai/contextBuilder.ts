/**
 * AI Assistant — Layer 1 context builder.
 *
 * Given a ClassifiedQuery, computes a fully-populated PortfolioContext
 * dict using the existing intelligence modules (analytics.service,
 * xirr.service, tax.service, dashboard.service, capitalGains.service,
 * goals + loans + credit cards). Claude never computes numbers — it
 * only reads and interprets what this file produces.
 *
 * Every intent returns a `relevant_data` block tailored to the
 * question. `user_profile` is always included so Claude can reference
 * the caller's name, net worth headline, and health signals without
 * additional fetches.
 *
 * Family scope: honours the resolved `EffectiveScope` so a family-view
 * question aggregates across all readable members via the same fan-out
 * the dashboard uses.
 */

import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import {
  getAnalyticsSnapshot,
  type AnalyticsScope,
} from '../services/analytics.service.js';
import { getDashboardNetWorthForScope } from '../services/dashboard.service.js';
import { computeUserXirr } from '../services/xirr.service.js';
import { computeUserCapitalGains } from '../services/capitalGains.service.js';
import { taxHarvestReport } from '../services/tax.service.js';
import { listGoals } from '../services/goals.service.js';
import { listLoans } from '../services/loans.service.js';
import { listCards } from '../services/creditCards.service.js';
import {
  getEffectiveScope,
  type EffectiveScope,
} from '../services/familyScope.service.js';
import { QueryIntent, type ClassifiedQuery } from './queryClassifier.js';

export interface AssistantContext {
  queryIntent: string;
  userQuery: string;
  userProfile: Record<string, unknown>;
  relevantData: Record<string, unknown>;
  scope: {
    kind: 'personal' | 'family';
    familyId: string | null;
    role: string | null;
    readableUserIds: string[];
  };
  formattingHints: {
    currency: 'INR';
    numberFormat: 'indian';
    responseLength: 'short' | 'medium' | 'long';
  };
}

/**
 * Fuzzy-match a user-supplied entity string ("sbi bluechip", "hdfc bank")
 * against a list of holding names. Case-insensitive, ignores extra
 * whitespace, matches on substring.
 */
function fuzzyMatch<T extends { name?: string | null; assetName?: string | null }>(
  haystack: T[],
  needle: string | null,
): T[] {
  if (!needle) return [];
  const q = needle.trim().toLowerCase();
  if (!q) return [];
  return haystack.filter((h) => {
    const label = ((h.name ?? h.assetName) ?? '').toLowerCase();
    return label.includes(q);
  });
}

async function buildUserProfile(
  callerId: string,
  scope: EffectiveScope,
): Promise<Record<string, unknown>> {
  const user = await prisma.user.findUnique({
    where: { id: callerId },
    select: {
      name: true,
      email: true,
      dob: true,
      plan: true,
      role: true,
    },
  });
  const analyticsScope: AnalyticsScope =
    scope.familyId !== null
      ? { kind: 'user', userId: callerId }
      : { kind: 'user', userId: callerId };
  let netWorth: number | null = null;
  let liabilities: number | null = null;
  let portfolioXirr: number | null = null;
  try {
    const nw = await getDashboardNetWorthForScope(callerId, {
      familyId: scope.familyId ?? undefined,
    });
    netWorth = Number(nw.totalNetWorth ?? 0);
    liabilities = Number(nw.totalLiabilities ?? 0);
  } catch (err) {
    logger.warn({ err }, '[ai.context] net worth fetch failed');
  }
  try {
    const xirr = await computeUserXirr(callerId);
    portfolioXirr = xirr.xirr;
  } catch (err) {
    logger.warn({ err }, '[ai.context] user XIRR failed');
  }
  void analyticsScope;
  const age = user?.dob ? Math.floor((Date.now() - user.dob.getTime()) / (365.25 * 86_400_000)) : null;
  const firstName = user?.name ? user.name.split(/\s+/)[0]! : 'there';
  return {
    firstName,
    fullName: user?.name ?? null,
    email: user?.email ?? null,
    age,
    subscriptionTier: user?.plan ?? 'FREE',
    userRole: user?.role ?? 'INVESTOR',
    totalNetWorth: netWorth,
    totalLiabilities: liabilities,
    portfolioXirr,
  };
}

/** Snapshot payload used across several intents. */
async function loadSnapshot(callerId: string): Promise<Awaited<ReturnType<typeof getAnalyticsSnapshot>> | null> {
  try {
    return await getAnalyticsSnapshot({ kind: 'user', userId: callerId }, '1Y');
  } catch (err) {
    logger.warn({ err }, '[ai.context] snapshot failed');
    return null;
  }
}

// ─── XIRR ────────────────────────────────────────────────────────────

async function buildXirrData(
  callerId: string,
  query: ClassifiedQuery,
): Promise<Record<string, unknown>> {
  const snapshot = await loadSnapshot(callerId);
  const allHoldings = await prisma.holdingProjection.findMany({
    where: { portfolio: { userId: callerId } },
    select: {
      assetName: true,
      assetKey: true,
      assetClass: true,
      totalCost: true,
      currentValue: true,
      unrealisedPnL: true,
      realisedPnL: true,
      quantity: true,
    },
  });
  const matches = fuzzyMatch(allHoldings, query.entity);
  const queryHolding = matches[0]
    ? {
        name: matches[0].assetName,
        assetClass: matches[0].assetClass,
        invested: matches[0].totalCost.toString(),
        currentValue: matches[0].currentValue?.toString() ?? null,
        unrealisedPnL: matches[0].unrealisedPnL?.toString() ?? null,
        realisedPnL: matches[0].realisedPnL.toString(),
      }
    : null;
  const assetClassXirr = snapshot?.assetClassXirr ?? [];
  const portfolioXirr = snapshot?.kpis.xirrOverall ?? null;
  return {
    queryEntity: query.entity,
    queryHolding,
    matchedHoldings: matches.slice(0, 5).map((h) => ({
      name: h.assetName,
      assetClass: h.assetClass,
      invested: h.totalCost.toString(),
      currentValue: h.currentValue?.toString() ?? null,
    })),
    portfolioXirr,
    xirr1y: snapshot?.kpis.xirr1y ?? null,
    xirr3y: snapshot?.kpis.xirr3y ?? null,
    xirr5y: snapshot?.kpis.xirr5y ?? null,
    assetClassXirr: assetClassXirr.map((r) => ({
      assetClass: r.assetClass,
      label: r.label,
      xirr: r.xirr,
      invested: r.invested,
      currentValue: r.currentValue,
    })),
    benchmark: {
      nifty50Approx: 0.135,
      fdRateApprox: 0.07,
    },
    topPerformer: snapshot?.topWinnersLosers.winners[0] ?? null,
    worstPerformer: snapshot?.topWinnersLosers.losers[0] ?? null,
  };
}

// ─── Allocation ──────────────────────────────────────────────────────

async function buildAllocationData(
  callerId: string,
  query: ClassifiedQuery,
): Promise<Record<string, unknown>> {
  const snapshot = await loadSnapshot(callerId);
  const sectorAllocation = snapshot?.sectorAllocation ?? [];
  const classAllocation = snapshot?.allocationByClass ?? [];
  const totalValue =
    Number(snapshot?.kpis.currentValue ?? 0) || 1;
  const querySector = query.entity
    ? sectorAllocation.find((s) => s.sector.toLowerCase() === query.entity!.toLowerCase())
    : null;
  const user = await prisma.user.findUnique({
    where: { id: callerId },
    select: { dob: true },
  });
  const age = user?.dob
    ? Math.floor((Date.now() - user.dob.getTime()) / (365.25 * 86_400_000))
    : null;
  const equitySlice = classAllocation.find((c) => c.key === 'EQUITY');
  const equityPct = equitySlice?.pct ?? 0;
  const recommendedEquityPct = age ? Math.max(20, 100 - age) : null;
  return {
    queryEntity: query.entity,
    querySector: querySector ?? null,
    sectorAllocation: sectorAllocation.map((s) => ({
      sector: s.sector,
      pct: s.pct,
      value: s.value,
    })),
    classAllocation: classAllocation.map((c) => ({
      key: c.key,
      label: c.label,
      pct: c.pct,
      value: c.value,
    })),
    totalPortfolioValue: totalValue,
    userAge: age,
    currentEquityPct: equityPct,
    recommendedEquityPct,
    equityDeviation:
      recommendedEquityPct !== null ? equityPct - recommendedEquityPct : null,
    concentrationRisk: (snapshot?.concentrationRisk ?? []).slice(0, 5).map((r) => ({
      assetName: r.assetName,
      assetClass: r.assetClass,
      pct: r.pct,
      cumulativePct: r.cumulativePct,
    })),
  };
}

// ─── Tax drag ────────────────────────────────────────────────────────

async function buildTaxData(callerId: string, query: ClassifiedQuery): Promise<Record<string, unknown>> {
  const fy = currentFy();
  let harvest: Awaited<ReturnType<typeof taxHarvestReport>> | null = null;
  try {
    harvest = await taxHarvestReport(callerId, fy);
  } catch (err) {
    logger.warn({ err }, '[ai.context] tax harvest report failed');
  }
  let cg: Awaited<ReturnType<typeof computeUserCapitalGains>> | null = null;
  try {
    cg = await computeUserCapitalGains(callerId);
  } catch (err) {
    logger.warn({ err }, '[ai.context] capital gains failed');
  }
  const fyRow = cg?.summaryByFy?.[fy];
  const holdingRows = harvest?.rows ?? [];
  const queryHolding = query.entity
    ? holdingRows.find((r) => r.assetName.toLowerCase().includes(query.entity!.toLowerCase()))
    : null;
  return {
    currentFy: fy,
    realisedThisFy: fyRow
      ? {
          intraday: fyRow.intraday.toString(),
          stcg: fyRow.stcg.toString(),
          ltcg: fyRow.ltcg.toString(),
          taxable: fyRow.taxable.toString(),
        }
      : null,
    harvestTotals: harvest?.totals ?? null,
    highestLossOpportunities: holdingRows
      .filter((r) => Number(r.unrealisedPnL) < 0)
      .sort((a, b) => Number(a.unrealisedPnL) - Number(b.unrealisedPnL))
      .slice(0, 5)
      .map((r) => ({
        assetName: r.assetName,
        portfolioName: r.portfolioName,
        classification: r.classification,
        unrealisedPnL: r.unrealisedPnL,
      })),
    queryHolding: queryHolding
      ? {
          assetName: queryHolding.assetName,
          portfolioName: queryHolding.portfolioName,
          classification: queryHolding.classification,
          unrealisedPnL: queryHolding.unrealisedPnL,
        }
      : null,
    ltcgExemptionInr: 125000,
    caveat: 'These are estimates — consult a CA for actual ITR filing.',
  };
}

// ─── Net worth compare ───────────────────────────────────────────────

async function buildNetWorthData(
  callerId: string,
  scope: EffectiveScope,
): Promise<Record<string, unknown>> {
  const nw = await getDashboardNetWorthForScope(callerId, {
    familyId: scope.familyId ?? undefined,
  }).catch(() => null);
  const snapshot = await loadSnapshot(callerId);
  const valueLine = snapshot?.portfolioValueLine ?? [];
  const monthsAgo = (n: number) => {
    if (valueLine.length === 0) return null;
    const cutoffDate = new Date(Date.now() - n * 30 * 86_400_000);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);
    const row = valueLine.find((p) => p.date >= cutoffStr);
    return row ? Number(row.value) : null;
  };
  const current = nw ? Number(nw.totalNetWorth ?? 0) : null;
  const at1m = monthsAgo(1);
  const at3m = monthsAgo(3);
  const at6m = monthsAgo(6);
  const at12m = monthsAgo(12);
  const changeOf = (past: number | null) => {
    if (past === null || current === null || past === 0) return null;
    return {
      absolute: current - past,
      percent: ((current - past) / past) * 100,
    };
  };
  return {
    currentNetWorth: current,
    liabilities: nw ? Number(nw.totalLiabilities ?? 0) : null,
    netWorthAfterLiabilities: nw ? Number(nw.netWorthAfterLiabilities ?? 0) : null,
    netWorth1mAgo: at1m,
    netWorth3mAgo: at3m,
    netWorth6mAgo: at6m,
    netWorth12mAgo: at12m,
    changes: {
      '1m': changeOf(at1m),
      '3m': changeOf(at3m),
      '6m': changeOf(at6m),
      '12m': changeOf(at12m),
    },
    historyMonthly: valueLine.slice(-24).map((v) => ({ date: v.date, value: v.value })),
  };
}

// ─── Goals ───────────────────────────────────────────────────────────

async function buildGoalData(
  callerId: string,
  query: ClassifiedQuery,
): Promise<Record<string, unknown>> {
  const goals = await listGoals(callerId).catch(() => []);
  const rows = (goals as Array<Record<string, unknown>>).map((g) => ({
    id: g.id as string,
    name: g.name as string,
    targetAmount: g.targetAmount ?? null,
    targetDate: g.targetDate ?? null,
    currentAmount: g.currentAmount ?? null,
    monthlyContribution: g.monthlyContribution ?? null,
    onTrack: g.onTrack ?? null,
  }));
  const queried = query.entity
    ? rows.find((g) => g.name.toLowerCase().includes(query.entity!.toLowerCase()))
    : null;
  return {
    goals: rows,
    queryGoal: queried ?? null,
    goalCount: rows.length,
  };
}

// ─── Debt ────────────────────────────────────────────────────────────

async function buildDebtData(callerId: string): Promise<Record<string, unknown>> {
  const [loans, cards] = await Promise.all([
    listLoans(callerId).catch(() => []),
    listCards(callerId).catch(() => []),
  ]);
  const loanRows = loans as Array<Record<string, unknown>>;
  const cardRows = cards as Array<Record<string, unknown>>;
  const totalLoanOutstanding = loanRows.reduce(
    (s, l) => s + Number(l.outstandingPrincipal ?? l.outstanding ?? 0),
    0,
  );
  const totalMonthlyEmi = loanRows.reduce((s, l) => s + Number(l.monthlyEmi ?? l.emi ?? 0), 0);
  const totalCardOutstanding = cardRows.reduce(
    (s, c) => s + Number(c.currentOutstanding ?? c.outstanding ?? 0),
    0,
  );
  // Rough annual CC interest cost at ~36% APR (3% monthly).
  const ccAnnualInterest = totalCardOutstanding * 0.36;
  return {
    loans: loanRows.map((l) => ({
      lender: l.lender ?? l.name ?? null,
      loanType: l.loanType ?? l.type ?? null,
      outstanding: l.outstandingPrincipal ?? l.outstanding ?? null,
      monthlyEmi: l.monthlyEmi ?? l.emi ?? null,
      interestRate: l.interestRatePct ?? l.interestRate ?? null,
      remainingTenureMonths: l.remainingTenureMonths ?? l.tenureRemainingMonths ?? null,
    })),
    creditCards: cardRows.map((c) => ({
      issuer: c.issuer ?? c.bank ?? null,
      last4: c.last4 ?? null,
      outstanding: c.currentOutstanding ?? c.outstanding ?? null,
      creditLimit: c.creditLimit ?? null,
      dueDate: c.nextDueDate ?? null,
    })),
    totals: {
      totalLoanOutstanding,
      totalMonthlyEmi,
      totalCardOutstanding,
      creditCardAnnualInterestEstimateInr: ccAnnualInterest,
    },
  };
}

// ─── What if ─────────────────────────────────────────────────────────

async function buildWhatIfData(
  callerId: string,
  query: ClassifiedQuery,
): Promise<Record<string, unknown>> {
  const goals = await buildGoalData(callerId, { ...query, entity: null });
  const nw = await buildNetWorthData(
    callerId,
    { callerId, familyId: null, role: null, readableUserIds: [callerId], writableUserIds: [callerId], readableFamilyIds: [], writableFamilyIds: [], allowedAssetClasses: null, allowedCategories: null },
  );
  return {
    scenarioSummary: query.originalQuery,
    scenarioAmount: query.amount,
    scenarioPeriod: query.period,
    currentGoals: goals.goals,
    currentNetWorth: (nw as Record<string, unknown>).currentNetWorth,
    // Very lightweight: server passes the raw scenario + current
    // baselines. Claude reasons about the delta with plain arithmetic,
    // *not* recomputing XIRR/CAGR. If a rigorous projection is needed,
    // the goal engine can be swapped in here later.
    guidance:
      'Given the scenario amount and period, describe the plausible impact on the goals and net-worth trajectory using the current values as the baseline. Present a before/after view.',
  };
}

// ─── Portfolio health (composite) ────────────────────────────────────

async function buildHealthData(callerId: string): Promise<Record<string, unknown>> {
  const snapshot = await loadSnapshot(callerId);
  const nw = await getDashboardNetWorthForScope(callerId).catch(() => null);
  return {
    netWorth: nw ? Number(nw.totalNetWorth ?? 0) : null,
    liabilities: nw ? Number(nw.totalLiabilities ?? 0) : null,
    portfolioXirr: snapshot?.kpis.xirrOverall ?? null,
    xirr1y: snapshot?.kpis.xirr1y ?? null,
    unrealisedPnL: snapshot?.kpis.unrealisedPnL ?? null,
    realisedYtd: snapshot?.kpis.realisedYtd ?? null,
    incomeYtd: snapshot?.kpis.incomeYtd ?? null,
    topClasses: (snapshot?.allocationByClass ?? []).slice(0, 5),
    concentrationRisk: (snapshot?.concentrationRisk ?? []).slice(0, 3),
    liabilityDrag:
      nw && Number(nw.totalNetWorth) > 0
        ? Number(nw.totalLiabilities) / Number(nw.totalNetWorth)
        : null,
    guidance:
      'Compute a rough 0-100 health verdict from these inputs and explain the two weakest links. Be honest, not sycophantic.',
  };
}

// ─── Benchmark ───────────────────────────────────────────────────────

async function buildBenchmarkData(callerId: string): Promise<Record<string, unknown>> {
  const snapshot = await loadSnapshot(callerId);
  return {
    portfolioXirr: snapshot?.kpis.xirrOverall ?? null,
    xirr1y: snapshot?.kpis.xirr1y ?? null,
    xirr3y: snapshot?.kpis.xirr3y ?? null,
    xirr5y: snapshot?.kpis.xirr5y ?? null,
    benchmarks: {
      nifty50CagrLongTerm: 0.135,
      fdRate: 0.07,
    },
    assetClassXirr: (snapshot?.assetClassXirr ?? []).map((r) => ({
      assetClass: r.assetClass,
      label: r.label,
      xirr: r.xirr,
    })),
  };
}

// ─── Rebalance (uses allocation + concentration) ─────────────────────

async function buildRebalanceData(callerId: string): Promise<Record<string, unknown>> {
  const alloc = await buildAllocationData(callerId, {
    intent: QueryIntent.ALLOCATION_CHECK,
    entity: null,
    amount: null,
    period: null,
    originalQuery: '',
  });
  return {
    ...alloc,
    guidance:
      'Suggest rebalancing directions based on the allocation deviations and concentration risks. Do not name specific securities to buy/sell (SEBI compliance).',
  };
}

// ─── Holding detail ──────────────────────────────────────────────────

async function buildHoldingDetailData(
  callerId: string,
  query: ClassifiedQuery,
): Promise<Record<string, unknown>> {
  const allHoldings = await prisma.holdingProjection.findMany({
    where: { portfolio: { userId: callerId } },
    include: { portfolio: { select: { name: true, currency: true } } },
    orderBy: { currentValue: 'desc' },
  });
  const matches = query.entity ? fuzzyMatch(allHoldings, query.entity) : allHoldings.slice(0, 5);
  return {
    queryEntity: query.entity,
    matches: matches.slice(0, 10).map((h) => ({
      name: h.assetName,
      portfolio: h.portfolio.name,
      assetClass: h.assetClass,
      quantity: h.quantity.toString(),
      avgCost: h.avgCostPrice.toString(),
      totalCost: h.totalCost.toString(),
      currentPrice: h.currentPrice?.toString() ?? null,
      currentValue: h.currentValue?.toString() ?? null,
      unrealisedPnL: h.unrealisedPnL?.toString() ?? null,
      realisedPnL: h.realisedPnL.toString(),
    })),
    top5ByValue: allHoldings.slice(0, 5).map((h) => ({
      name: h.assetName,
      value: h.currentValue?.toString() ?? h.totalCost.toString(),
    })),
  };
}

// ─── General (fallback comprehensive summary) ────────────────────────

async function buildGeneralData(
  callerId: string,
  scope: EffectiveScope,
): Promise<Record<string, unknown>> {
  const snapshot = await loadSnapshot(callerId);
  const nw = await getDashboardNetWorthForScope(callerId, {
    familyId: scope.familyId ?? undefined,
  }).catch(() => null);
  return {
    netWorth: nw ? Number(nw.totalNetWorth ?? 0) : null,
    liabilities: nw ? Number(nw.totalLiabilities ?? 0) : null,
    portfolioXirr: snapshot?.kpis.xirrOverall ?? null,
    unrealisedPnL: snapshot?.kpis.unrealisedPnL ?? null,
    realisedYtd: snapshot?.kpis.realisedYtd ?? null,
    incomeYtd: snapshot?.kpis.incomeYtd ?? null,
    top5Holdings: (nw?.allocationBreakdown ?? []).slice(0, 5),
    assetAllocation: (snapshot?.allocationByClass ?? []).map((c) => ({
      label: c.label,
      pct: c.pct,
      value: c.value,
    })),
    upcomingAlerts: (nw?.alerts ?? []).slice(0, 5),
    concentrationRisk: (snapshot?.concentrationRisk ?? []).slice(0, 3),
  };
}

// ─── Dispatcher ──────────────────────────────────────────────────────

function currentFy(): string {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

function lengthHintFor(intent: QueryIntent): 'short' | 'medium' | 'long' {
  switch (intent) {
    case QueryIntent.XIRR_QUERY:
    case QueryIntent.HOLDING_DETAIL:
      return 'short';
    case QueryIntent.WHAT_IF:
      return 'long';
    default:
      return 'medium';
  }
}

export async function buildContext(
  callerId: string,
  familyId: string | null,
  query: ClassifiedQuery,
): Promise<AssistantContext> {
  const scope = await getEffectiveScope(callerId, { familyId: familyId ?? undefined });
  const userProfile = await buildUserProfile(callerId, scope);
  let relevantData: Record<string, unknown> = {};
  try {
    switch (query.intent) {
      case QueryIntent.XIRR_QUERY:
        relevantData = await buildXirrData(callerId, query);
        break;
      case QueryIntent.ALLOCATION_CHECK:
        relevantData = await buildAllocationData(callerId, query);
        break;
      case QueryIntent.TAX_DRAG:
        relevantData = await buildTaxData(callerId, query);
        break;
      case QueryIntent.NET_WORTH_COMPARE:
        relevantData = await buildNetWorthData(callerId, scope);
        break;
      case QueryIntent.GOAL_PROJECTION:
        relevantData = await buildGoalData(callerId, query);
        break;
      case QueryIntent.DEBT_ANALYSIS:
        relevantData = await buildDebtData(callerId);
        break;
      case QueryIntent.WHAT_IF:
        relevantData = await buildWhatIfData(callerId, query);
        break;
      case QueryIntent.PORTFOLIO_HEALTH:
        relevantData = await buildHealthData(callerId);
        break;
      case QueryIntent.BENCHMARK_COMPARE:
        relevantData = await buildBenchmarkData(callerId);
        break;
      case QueryIntent.REBALANCE_ADVICE:
        relevantData = await buildRebalanceData(callerId);
        break;
      case QueryIntent.HOLDING_DETAIL:
        relevantData = await buildHoldingDetailData(callerId, query);
        break;
      case QueryIntent.GENERAL:
      default:
        relevantData = await buildGeneralData(callerId, scope);
    }
  } catch (err) {
    logger.error({ err, intent: query.intent }, '[ai.context] builder threw');
    relevantData = { error: 'Context builder failed — Claude should acknowledge missing data.' };
  }
  return {
    queryIntent: query.intent,
    userQuery: query.originalQuery,
    userProfile,
    relevantData,
    scope: {
      kind: scope.familyId === null ? 'personal' : 'family',
      familyId: scope.familyId,
      role: scope.role,
      readableUserIds: scope.readableUserIds,
    },
    formattingHints: {
      currency: 'INR',
      numberFormat: 'indian',
      responseLength: lengthHintFor(query.intent),
    },
  };
}
