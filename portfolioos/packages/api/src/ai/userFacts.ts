/**
 * The client's facts, as the adviser reads them at the top of every turn —
 * built from the advisor engine's `AdvisorFacts` (the same numbers the
 * Advisor and Analytics pages use), plus net worth, insurance, health score
 * and open recommendations.
 *
 * A value we don't have is written "not on file" — never zero — so the
 * adviser asks for it instead of treating it as absent.
 *
 * Cached per user for a few minutes: a conversation asks several questions
 * in a row, and rebuilding every figure each time would only add database
 * load.
 */
import { Decimal } from 'decimal.js';
import { formatINR, taxYearOf } from '@portfolioos/shared';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { userDataVersion } from '../lib/userDataVersion.js';
import { getDashboardNetWorthForScope } from '../services/dashboard.service.js';
import { computeSummary } from '../services/realEstate.service.js';
import { buildAdvisorFacts } from '../services/advisor/advisorFacts.builder.js';
import { listRecommendations } from '../services/advisor/advisorRecommendations.service.js';
import { computeHealthScore } from '../services/healthScore.service.js';
import { activeMonthlyIncomeTotal } from '../services/income.service.js';
import { listPolicies } from '../services/insurance.service.js';
import type { AdvisorAssetBucketValue, AdvisorFacts } from '../services/advisor/types.js';

const NOT_ON_FILE = 'not on file';
const CACHE_TTL_MS = 5 * 60_000;

const BUCKET_LABELS: Record<AdvisorAssetBucketValue, string> = {
  EQUITY_DOMESTIC: 'Equity (India)',
  EQUITY_INTERNATIONAL: 'Equity (international)',
  DEBT: 'Debt',
  GOLD: 'Gold',
  REAL_ASSETS: 'Real estate and real assets',
  CASH_EQUIVALENT: 'Cash and equivalents',
  OTHER_ALT: 'Other',
};

const LIFE_TYPES = new Set(['TERM', 'WHOLE_LIFE', 'ULIP', 'ENDOWMENT']);

export interface InsuranceFacts {
  lifeCover: string;
  healthCover: string;
  policies: number;
  nomineeGaps: number;
  criticalIllnessCover?: string | null;
}

/** Everything outside the investment portfolio, from the dashboard's own totals. */
export interface BalanceSheetFacts {
  bankBalance: string | null;
  bankAccounts: number;
  byAssetClass: Array<{ label: string; value: string; pct: number }>;
  ownedPropertyValue: string | null;
  rentalValue: string | null;
  monthlyRent: string | null;
  rentOverdue: number;
  vehicleValue: string | null;
  pendingChallans: number;
  loanOutstanding: string;
  monthlyEmi: string;
  loans: number;
  overdueEmis: Array<{ lender: string; daysOverdue: number }>;
  cardOutstanding: string;
  cards: number;
  alerts: string[];
}

export interface UserFactsInput {
  advisor: AdvisorFacts | null;
  /** From the assistant context's user profile (numbers, possibly null). */
  profile: Record<string, unknown>;
  insurance: InsuranceFacts | null;
  healthScore: { overallScore: number; grade: string } | null;
  openRecommendations: number | null;
  monthlyIncome?: string | null;
  /** Omitted: not shown. Null: it could not be read — said so, never zeros. */
  balanceSheet?: BalanceSheetFacts | null;
  viewingAsFamily: boolean;
  today: string;
  financialYear: string;
}

const inr = (v: Decimal | string | number) => formatINR(String(v), { compact: true });
const known = <T>(v: T | null | undefined): v is T => v !== null && v !== undefined;

function money(v: unknown): string {
  return typeof v === 'number' || typeof v === 'string' ? inr(v) : NOT_ON_FILE;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function allocationLines(a: AdvisorFacts): string[] {
  const targets = new Map(a.modelPortfolio.targets.map((t) => [t.bucket, t.targetPct]));
  const current = new Map(a.currentAllocation.map((c) => [c.bucket, c.currentPct]));
  const buckets = [...new Set([...targets.keys(), ...current.keys()])];
  if (buckets.length === 0) return ['Allocation vs target: no holdings to measure'];
  const lines = buckets.map((b) => {
    const cur = current.get(b) ?? 0;
    const tgt = targets.get(b);
    return `- ${BUCKET_LABELS[b]}: ${Math.round(cur)}% now${tgt !== undefined ? ` vs ${tgt}% target` : ' (no target set)'}`;
  });
  return [a.modelPortfolio.targets.length > 0 ? 'Allocation vs target:' : 'Allocation (no target allocation on file):', ...lines];
}

/** The five largest holdings by value, so the adviser can name what fills a bucket. */
function holdingLines(a: AdvisorFacts): string[] {
  if (a.holdings.length === 0 || a.totalPortfolioValue.lessThanOrEqualTo(0)) return [];
  const top = [...a.holdings].sort((x, y) => y.currentValue.comparedTo(x.currentValue)).slice(0, 5);
  return [
    'Largest holdings:',
    ...top.map((h) => {
      const share = h.currentValue.dividedBy(a.totalPortfolioValue).times(100).toDecimalPlaces(0).toString();
      return `- ${h.assetName}: ${share}% of investments (${BUCKET_LABELS[h.bucket] ?? h.bucket})`;
    }),
  ];
}

function goalLines(a: AdvisorFacts): string[] {
  if (a.goals.length === 0) return ['Goals: none on file'];
  return [
    'Goals:',
    ...a.goals.map((g) => {
      const status = g.isOnTrack === true ? 'on track' : g.isOnTrack === false ? 'behind' : 'progress unknown';
      const sip = g.currentMonthlyContribution ? `; ${formatINR(g.currentMonthlyContribution.toString(), { fractionDigits: 0 })} a month going in` : '';
      return `- ${g.name}: ${inr(g.currentValue)} of ${inr(g.targetAmount)}, ${g.yearsRemaining} years left, ${status}; ${g.priority.toLowerCase()} priority${sip}`;
    }),
  ];
}

function liquidityLine(a: AdvisorFacts): string {
  const { liquidAssets, monthlyExpenses, emergencyFundTarget } = a.liquidity;
  if (!monthlyExpenses || monthlyExpenses.lessThanOrEqualTo(0)) {
    return `Emergency fund: ${inr(liquidAssets)} in liquid assets. Monthly expenses: ${NOT_ON_FILE}`;
  }
  const months = liquidAssets.dividedBy(monthlyExpenses).toDecimalPlaces(1).toString();
  return (
    `Emergency fund: ${inr(liquidAssets)} in liquid assets — about ${months} months of expenses ` +
    `(monthly expenses ${inr(monthlyExpenses)}${emergencyFundTarget ? `; 6-month target ${inr(emergencyFundTarget)}` : ''})`
  );
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function balanceSheetLines(b: BalanceSheetFacts | null): string[] {
  if (!b) return ['Balance sheet: not available right now'];
  const out: string[] = [];
  out.push(
    b.bankAccounts > 0
      ? `Bank balances: ${b.bankBalance !== null ? inr(b.bankBalance) : NOT_ON_FILE} across ${plural(b.bankAccounts, 'account', 'accounts')} (counted in the emergency fund)`
      : 'Bank balances: no bank accounts on file',
  );
  if (b.byAssetClass.length > 0) {
    out.push('By asset class:', ...b.byAssetClass.slice(0, 10).map((c) => `- ${c.label}: ${inr(c.value)} (${Math.round(c.pct)}%)`));
  }
  if (b.ownedPropertyValue !== null) out.push(`Owned property: ${inr(b.ownedPropertyValue)}`);
  if (b.rentalValue !== null) {
    const rent = b.monthlyRent ? `, rent ${formatINR(b.monthlyRent, { fractionDigits: 0 })} a month` : '';
    const overdue = b.rentOverdue > 0 ? `; ${plural(b.rentOverdue, 'rent receipt', 'rent receipts')} overdue` : '';
    out.push(`Rental property: ${inr(b.rentalValue)}${rent}${overdue}`);
  }
  if (b.vehicleValue !== null) {
    out.push(`Vehicles: ${inr(b.vehicleValue)}${b.pendingChallans > 0 ? `; ${plural(b.pendingChallans, 'pending challan', 'pending challans')}` : ''}`);
  }
  if (b.loans > 0) {
    const overdue = b.overdueEmis.length > 0 ? `; overdue: ${b.overdueEmis.map((e) => `${e.lender} ${e.daysOverdue} days`).join(', ')}` : '';
    out.push(
      `Loans: ${inr(b.loanOutstanding)} outstanding across ${b.loans}; EMIs ${formatINR(b.monthlyEmi, { fractionDigits: 0 })} a month${overdue}`,
    );
  } else {
    out.push('Loans: none on file');
  }
  out.push(b.cards > 0 ? `Credit cards: ${inr(b.cardOutstanding)} outstanding across ${b.cards}` : 'Credit cards: none on file');
  if (b.alerts.length > 0) out.push(`Alerts: ${b.alerts.join('; ')}`);
  return out;
}

/** The facts block — plain lines the model can quote back. */
export function serializeUserFacts(input: UserFactsInput): string {
  const { advisor: a, profile: p } = input;
  const lines: string[] = [];

  lines.push(`Today: ${input.today}; financial year ${input.financialYear}`);
  if (input.viewingAsFamily) {
    lines.push(
      'Household view: net worth and liabilities cover only what members share with this user, so treat them as a floor. ' +
        'Risk profile, allocation, goals and insurance below are this user’s own.',
    );
  }
  if (typeof p['firstName'] === 'string') lines.push(`Client: ${p['firstName']}`);
  lines.push(`Age: ${typeof p['age'] === 'number' ? p['age'] : NOT_ON_FILE}`);
  lines.push(`Net worth: ${money(p['totalNetWorth'])}`);
  lines.push(`Loans and other liabilities: ${money(p['totalLiabilities'])}`);
  lines.push(`Monthly income: ${known(input.monthlyIncome) ? inr(input.monthlyIncome) : NOT_ON_FILE}`);
  lines.push(`Portfolio return (XIRR): ${typeof p['portfolioXirr'] === 'number' ? `${p['portfolioXirr']}% a year` : NOT_ON_FILE}`);
  if (input.balanceSheet !== undefined) lines.push(...balanceSheetLines(input.balanceSheet));

  if (a) {
    const r = a.riskProfile;
    lines.push(
      `Risk profile: ${r.category ?? NOT_ON_FILE}${r.category && r.assessedAt ? ` (assessed ${fmtDate(r.assessedAt)})` : ''}`,
    );
    lines.push(`Income-tax slab: ${known(r.taxSlabPct) ? `${r.taxSlabPct}%` : NOT_ON_FILE}`);
    lines.push(`Investments: ${inr(a.totalPortfolioValue)}`);
    lines.push(...allocationLines(a));
    lines.push(...holdingLines(a));
    lines.push(liquidityLine(a));
    lines.push(...goalLines(a));
    const approved = Object.values(a.approvedProducts).reduce((s, list) => s + list.length, 0);
    lines.push(`Approved products on file: ${approved}`);
    lines.push(`Tax-loss or gain harvesting candidates: ${a.harvestCandidates.length}`);
    const cg = a.capitalGainsRates;
    lines.push(
      `Capital-gains rates in force: equity short-term ${cg.stcgEquityPct}%, equity long-term ${cg.ltcgEquityPct}%, other long-term ${cg.ltcgOtherNonIndexedPct}%`,
    );
  } else {
    lines.push(`Risk profile: ${NOT_ON_FILE}`);
    lines.push(`Allocation vs target: ${NOT_ON_FILE}`);
    lines.push(`Goals: ${NOT_ON_FILE}`);
  }

  if (input.insurance) {
    const i = input.insurance;
    lines.push(
      `Insurance: ${i.policies} active ${i.policies === 1 ? 'policy' : 'policies'}; life cover ${inr(i.lifeCover)}; health cover ${inr(i.healthCover)}` +
        `${i.criticalIllnessCover ? `; critical illness cover ${inr(i.criticalIllnessCover)}` : ''}` +
        `${i.nomineeGaps > 0 ? `; ${i.nomineeGaps} life or accident ${i.nomineeGaps === 1 ? 'policy has' : 'policies have'} no nominee recorded` : ''}`,
    );
  } else {
    lines.push(`Insurance: ${NOT_ON_FILE}`);
  }
  lines.push(
    `Financial health score: ${input.healthScore ? `${input.healthScore.overallScore}/100 (${input.healthScore.grade})` : NOT_ON_FILE}`,
  );
  lines.push(`Open adviser recommendations: ${known(input.openRecommendations) ? input.openRecommendations : NOT_ON_FILE}`);
  return lines.join('\n');
}

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, `[ai.userFacts] ${label} unavailable`);
    return null;
  }
}

async function insuranceFacts(userId: string): Promise<InsuranceFacts> {
  const policies = (await listPolicies(userId)).filter((p) => p.status === 'ACTIVE');
  const sum = (filter: (p: (typeof policies)[number]) => boolean) =>
    policies.filter(filter).reduce((s, p) => s.plus(new Decimal(p.sumAssured.toString())), new Decimal(0));
  const ci = policies.reduce(
    (s, p) => (p.criticalIllnessSumAssured ? s.plus(new Decimal(p.criticalIllnessSumAssured)) : s),
    new Decimal(0),
  );
  return {
    policies: policies.length,
    lifeCover: sum((p) => LIFE_TYPES.has(p.type)).toString(),
    healthCover: sum((p) => p.type === 'HEALTH').toString(),
    criticalIllnessCover: ci.greaterThan(0) ? ci.toString() : null,
    nomineeGaps: policies.filter(
      (p) => (LIFE_TYPES.has(p.type) || p.type === 'PERSONAL_ACCIDENT') && !(Array.isArray(p.nominees) && p.nominees.length > 0),
    ).length,
  };
}

export interface AdvisorContext {
  /** The facts block for the prompt. */
  text: string;
  /** The advisor engine's facts, for tools; null if they couldn't be built. */
  facts: AdvisorFacts | null;
}

async function balanceSheetFacts(userId: string, familyId: string | null): Promise<BalanceSheetFacts> {
  const [nw, owned, accounts] = await Promise.all([
    getDashboardNetWorthForScope(userId, { familyId: familyId ?? undefined }),
    safe('owned property', () => computeSummary(userId)),
    prisma.bankAccount.findMany({
      where: { userId, status: 'ACTIVE', accountType: { not: 'OD' } },
      select: { currentBalance: true },
    }),
  ]);
  const withBalance = accounts.filter((a) => a.currentBalance !== null);
  const bankBalance = withBalance.reduce((s, a) => s.plus(new Decimal(a.currentBalance!.toString())), new Decimal(0));
  return {
    bankBalance: withBalance.length > 0 ? bankBalance.toString() : null,
    bankAccounts: accounts.length,
    byAssetClass: nw.allocationBreakdown.map((c) => ({ label: c.label, value: c.value, pct: c.percent })),
    ownedPropertyValue: owned && owned.activeProperties > 0 ? owned.totalCurrentValue : null,
    rentalValue: nw.realEstate.count > 0 ? nw.realEstate.totalValue : null,
    monthlyRent: nw.realEstate.count > 0 ? nw.realEstate.monthlyRent : null,
    rentOverdue: nw.realEstate.overdueCount,
    vehicleValue: nw.vehicles.count > 0 ? nw.vehicles.totalValue : null,
    pendingChallans: nw.vehicles.pendingChallans,
    loanOutstanding: nw.liabilities.totalOutstanding,
    monthlyEmi: nw.liabilities.monthlyEmiTotal,
    loans: nw.liabilities.loanCount,
    overdueEmis: nw.liabilities.overdueEmis.map((e) => ({ lender: e.lenderName, daysOverdue: e.daysOverdue })),
    cardOutstanding: nw.liabilities.totalCreditCardOutstanding,
    cards: nw.liabilities.creditCardCount,
    alerts: nw.alerts.slice(0, 6).map((a) => (a.description ? `${a.title} (${a.description})` : a.title)),
  };
}

// Keyed to the data version of every user in view (userDataVersion.ts): a
// write to any of their financial data rebuilds the facts on the next
// message. The time limit only catches what a write hook cannot see — price
// moves, and writes handled by another instance.
const cache = new Map<string, { at: number; version: string; value: AdvisorContext }>();

/** Build (or reuse, until the user's data changes) the client's facts. */
export async function loadAdvisorContext(
  userId: string,
  opts: { familyId: string | null; readableUserIds: readonly string[]; profile: Record<string, unknown> },
): Promise<AdvisorContext> {
  const viewingAsFamily = opts.familyId !== null;
  const key = `${userId}:${opts.familyId ?? 'personal'}`;
  // Read the version before building, so a write that lands mid-build still
  // invalidates what this call caches.
  const version = userDataVersion(opts.readableUserIds.length > 0 ? opts.readableUserIds : [userId]);
  const hit = cache.get(key);
  if (hit && hit.version === version && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const now = new Date();
  const [advisor, insurance, health, recs, income, balanceSheet] = await Promise.all([
    safe('advisor facts', () => buildAdvisorFacts(userId, now)),
    safe('insurance', () => insuranceFacts(userId)),
    safe('health score', () => computeHealthScore(userId)),
    safe('recommendations', () => listRecommendations(userId, { status: 'OPEN' })),
    safe('income', () => activeMonthlyIncomeTotal(userId)),
    safe('balance sheet', () => balanceSheetFacts(userId, opts.familyId)),
  ]);

  const value: AdvisorContext = {
    facts: advisor,
    text: serializeUserFacts({
      advisor,
      profile: opts.profile,
      insurance,
      healthScore: health ? { overallScore: health.overallScore, grade: health.grade } : null,
      openRecommendations: recs ? recs.length : null,
      monthlyIncome: income && income.greaterThan(0) ? income.toString() : null,
      balanceSheet,
      viewingAsFamily,
      today: now.toISOString().slice(0, 10),
      financialYear: taxYearOf(now.toISOString().slice(0, 10)),
    }),
  };
  cache.set(key, { at: Date.now(), version, value });
  if (cache.size > 500) {
    for (const [k, v] of cache) if (Date.now() - v.at >= CACHE_TTL_MS) cache.delete(k);
  }
  return value;
}
