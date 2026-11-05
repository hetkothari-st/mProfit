/**
 * Facts for the Act on it suggestion types (spec §7). Read once per engine
 * run, in the user's context, and handed to the rules as immutable input like
 * the rest of AdvisorFacts. Every section degrades to empty / null when its
 * source is missing: a rule with nothing to stand on stays silent.
 */
import { Decimal } from 'decimal.js';
import {
  DEFAULT_SWITCHING_COSTS,
  REFINANCE_MIN_GAP_PP,
  compareWithMarket,
  rateLoanTypeForLoan,
  switchingCost,
} from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { hasSpendingConsent } from '../safeToInvest/stiSpendStore.js';
import { advanceTaxReport } from '../tax/advanceTax.service.js';
import { computeOpenLots, financialYearOf, lotTaxStatus } from '../tax/capitalGains.service.js';
import { bestMarketRate, loanPosition } from '../loans/loanChecks/marketCheck.service.js';
import type { StoredLoan } from '../loans/loans.service.js';
import type { ActOnItFacts, AdvisorHoldingFact } from './types.js';

/** Savings accounts at the big banks pay 2.5–3.5%; used only when the user has not told us, and said so on the card. */
export const TYPICAL_SAVINGS_RATE_PCT = 3;
const INDEX_CODE = 'NIFTY50_TRI';
/** Spending-store categories that are money spent (as in Safe to Invest's buffer). */
const NOT_SPENDING = new Set(['self_transfer', 'investment', 'loan_emi', 'credit_card_bill', 'tax', 'insurance_premium_life', 'refund', 'income']);

const d = (v: { toString(): string } | null | undefined) => new Decimal(v ? v.toString() : 0);
const monthOf = (dt: Date) => dt.toISOString().slice(0, 7);
function monthsBack(asOf: Date, n: number): string[] {
  const out: string[] = [];
  for (let i = n; i >= 1; i--) out.push(new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  return out;
}

export interface ActOnItFactInputs {
  holdings: AdvisorHoldingFact[];
  /** Alert-based monthly expenses already in the advisor facts. */
  fallbackMonthlyExpenses: Decimal | null;
  harvest: {
    rows: { portfolioId: string; assetName: string; isin: string | null; classification: string; unrealisedPnL: string; currentValue: string }[];
    totals: { realisedLtcgInFy: string };
    savings: { ltcgExemption: string };
  };
}

async function safe<T>(label: string, fallback: T, fn: () => Promise<T>, failed?: string[]): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // A broken source skips the rules that need it (engine: rule.needs): never
    // run them on empty data, which would withdraw advice that is still true.
    failed?.push(label);
    logger.warn({ err: err instanceof Error ? err.message : String(err), section: label }, '[actOnIt] facts section unavailable');
    return fallback;
  }
}

export async function buildActOnItFacts(userId: string, asOf: Date, input: ActOnItFactInputs): Promise<ActOnItFacts> {
  const failed: string[] = [];
  const consent = await safe('consent', false, () => hasSpendingConsent(userId), failed);
  const [monthlySpending, bank, regularPlans, fds, loans, sips, indexMonthly, advanceTax, healthCover, weakFunds, liquidFund] =
    await Promise.all([
      safe('spending', input.fallbackMonthlyExpenses, () => monthlySpendingFor(userId, asOf, consent, input.fallbackMonthlyExpenses), failed),
      safe('bank', { balanceMonths: [], latestBalance: null, savingsRatePct: TYPICAL_SAVINGS_RATE_PCT, savingsRateAssumed: true }, () => bankFacts(userId, asOf), failed),
      safe('regularPlans', [], () => regularPlanFacts(input.holdings), failed),
      safe('fds', [], () => fdFacts(userId), failed),
      safe('loans', [], () => loanFacts(userId, asOf), failed),
      safe('sips', [], () => sipFacts(userId, asOf), failed),
      safe('index', [], () => indexFacts(asOf), failed),
      safe('advanceTax', null, () => advanceTaxFacts(userId, asOf), failed),
      safe('health', { sumInsured: new Decimal(0), policies: 0 }, () => healthFacts(userId), failed),
      safe('weakFunds', [], () => weakFundFacts(userId, input.holdings), failed),
      safe('liquidFund', null, () => liquidFundFact(), failed),
    ]);

  const equityIsins = new Set(input.holdings.filter((h) => h.bucket === 'EQUITY_DOMESTIC' && h.isin).map((h) => h.isin));
  const equityNames = new Set(input.holdings.filter((h) => h.bucket === 'EQUITY_DOMESTIC').map((h) => h.assetName));
  const rows = input.harvest.rows
    .filter((r) => r.classification === 'LTCG_GAIN' && ((r.isin && equityIsins.has(r.isin)) || equityNames.has(r.assetName)))
    .filter((r) => d(r.unrealisedPnL).greaterThan(0));
  const candidates = await safe('ltcgLots', [] as ActOnItFacts['ltcg']['candidates'], () => ltcgLots(userId, asOf, rows), failed);
  const ltcg = {
    fy: financialYearOf(asOf),
    realised: d(input.harvest.totals.realisedLtcgInFy),
    exemption: d(input.harvest.savings.ltcgExemption),
    candidates,
  };

  return { spendingConsent: consent, monthlySpending, bank, regularPlans, fds, loans, sips, indexMonthly, ltcg, advanceTax, healthCover, weakFunds, liquidFund, unavailable: failed };
}

/**
 * Each candidate's open lots in FIFO sale order, with whether each would be
 * long-term if sold today, so gain booking is sized on the lots a sale would
 * really take, not on the holding's average gain.
 */
async function ltcgLots(
  userId: string,
  asOf: Date,
  rows: ActOnItFactInputs['harvest']['rows'],
): Promise<ActOnItFacts['ltcg']['candidates']> {
  const out: ActOnItFacts['ltcg']['candidates'] = [];
  for (const r of rows) {
    const txs = await prisma.transaction.findMany({
      where: { portfolioId: r.portfolioId, portfolio: { userId }, ...(r.isin ? { isin: r.isin } : { assetName: r.assetName }) },
      orderBy: { tradeDate: 'asc' },
    });
    const position = computeOpenLots(txs)[0];
    if (!position) continue;
    const quantity = position.lots.reduce((s, l) => s.plus(l.quantity), new Decimal(0));
    const value = d(r.currentValue);
    out.push({
      portfolioId: r.portfolioId, assetName: r.assetName, isin: r.isin, gain: d(r.unrealisedPnL), value,
      price: quantity.greaterThan(0) ? value.dividedBy(quantity) : null,
      lots: position.lots.map((l) => ({ buyDate: l.buyDate, quantity: l.quantity, costPerUnit: l.costPerUnit, longTerm: lotTaxStatus(position, l.buyDate, asOf).longTerm })),
    });
  }
  return out;
}

async function monthlySpendingFor(userId: string, asOf: Date, consent: boolean, fallback: Decimal | null): Promise<Decimal | null> {
  if (!consent) return fallback;
  const months = monthsBack(asOf, 3);
  const rows = await prisma.spendMonthlyCategory.findMany({ where: { userId, month: { in: months } }, select: { month: true, category: true, amount: true } });
  const byMonth = new Map<string, Decimal>();
  for (const r of rows) {
    if (NOT_SPENDING.has(r.category)) continue;
    byMonth.set(r.month, (byMonth.get(r.month) ?? new Decimal(0)).plus(d(r.amount)));
  }
  if (byMonth.size < 3) return fallback;
  return [...byMonth.values()].reduce((s, v) => s.plus(v), new Decimal(0)).dividedBy(byMonth.size);
}

async function bankFacts(userId: string, asOf: Date): Promise<ActOnItFacts['bank']> {
  const accounts = await prisma.bankAccount.findMany({
    where: { userId, status: 'ACTIVE', accountType: { in: ['SAVINGS', 'SALARY', 'CURRENT'] } },
    select: { id: true, interestRatePct: true, currentBalance: true, snapshots: { where: { asOfDate: { lte: asOf } }, orderBy: { asOfDate: 'asc' }, select: { asOfDate: true, balance: true } } },
  });
  const months = monthsBack(asOf, 12);
  const balanceMonths: { month: string; balance: Decimal }[] = [];
  for (const m of months) {
    const end = new Date(`${m}-01T00:00:00Z`);
    const next = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1));
    let total = new Decimal(0);
    let seen = 0;
    for (const a of accounts) {
      // The last balance read inside that month. An older reading is not carried
      // forward: one snapshot must not stand in for months nobody looked.
      const last = [...a.snapshots].reverse().find((s) => s.asOfDate < next && s.asOfDate >= end);
      if (last) {
        total = total.plus(d(last.balance));
        seen += 1;
      }
    }
    if (seen > 0 && seen === accounts.length) balanceMonths.push({ month: m, balance: total });
  }
  const rated = accounts.filter((a) => a.interestRatePct !== null);
  const latestBalance = accounts.length > 0 && accounts.every((a) => a.currentBalance !== null)
    ? accounts.reduce((s, a) => s.plus(d(a.currentBalance)), new Decimal(0))
    : null;
  return {
    balanceMonths,
    latestBalance,
    savingsRatePct: rated.length === accounts.length && rated.length > 0
      ? Math.min(...rated.map((a) => Number.parseFloat(a.interestRatePct!.toString())))
      : TYPICAL_SAVINGS_RATE_PCT,
    savingsRateAssumed: !(rated.length === accounts.length && rated.length > 0),
  };
}

async function latestTer(schemeCodes: string[]): Promise<Map<string, number>> {
  if (schemeCodes.length === 0) return new Map();
  const rows = await prisma.mfSchemeTer.findMany({
    where: { schemeCode: { in: schemeCodes } },
    orderBy: { effectiveFrom: 'desc' },
    select: { schemeCode: true, terPct: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) if (!out.has(r.schemeCode)) out.set(r.schemeCode, Number.parseFloat(r.terPct.toString()));
  return out;
}

async function regularPlanFacts(holdings: AdvisorHoldingFact[]): Promise<ActOnItFacts['regularPlans']> {
  const mf = holdings.filter((h) => h.fundId && !h.priceStale && h.currentValue.greaterThan(0));
  if (mf.length === 0) return [];
  const funds = await prisma.mutualFundMaster.findMany({
    where: { id: { in: mf.map((h) => h.fundId!) } },
    select: { id: true, schemeCode: true, schemeName: true, amcName: true, planType: true, optionType: true },
  });
  const regular = funds.filter((f) => (f.planType ?? '').toLowerCase().startsWith('regular'));
  if (regular.length === 0) return [];
  const siblings = await prisma.mutualFundMaster.findMany({
    where: { isActive: true, planType: { startsWith: 'Direct' }, OR: regular.map((f) => ({ amcName: f.amcName, schemeName: f.schemeName })) },
    select: { id: true, schemeCode: true, schemeName: true, amcName: true, optionType: true },
  });
  const ter = await latestTer([...regular.map((f) => f.schemeCode), ...siblings.map((s) => s.schemeCode)]);
  const out: ActOnItFacts['regularPlans'] = [];
  for (const h of mf) {
    const f = regular.find((r) => r.id === h.fundId);
    if (!f) continue;
    const direct = siblings.find((s) => s.amcName === f.amcName && s.schemeName === f.schemeName && s.optionType === f.optionType);
    const rTer = ter.get(f.schemeCode);
    const dTer = direct ? ter.get(direct.schemeCode) : undefined;
    if (!direct || rTer === undefined || dTer === undefined || dTer >= rTer) continue;
    out.push({
      holdingKey: h.holdingKey, portfolioId: h.portfolioId, fundId: f.id, schemeName: h.assetName, valueInr: h.currentValue, bucket: h.bucket,
      regularTerPct: rTer, directFundId: direct.id, directSchemeCode: direct.schemeCode, directName: `${f.schemeName} - Direct`, directTerPct: dTer,
    });
  }
  return out;
}

async function fdFacts(userId: string): Promise<ActOnItFacts['fds']> {
  const open = await prisma.holdingProjection.findMany({ where: { assetClass: 'FIXED_DEPOSIT', portfolio: { userId } }, select: { portfolioId: true, assetKey: true } });
  if (open.length === 0) return [];
  const openKeys = new Set(open.map((h) => `${h.portfolioId}|${h.assetKey}`));
  const txs = await prisma.transaction.findMany({
    where: { portfolio: { userId }, assetClass: 'FIXED_DEPOSIT', transactionType: { in: ['DEPOSIT', 'BUY'] }, maturityDate: { not: null }, assetKey: { not: null } },
    select: { portfolioId: true, assetKey: true, assetName: true, maturityDate: true, netAmount: true, interestRate: true },
    orderBy: { tradeDate: 'desc' },
  });
  const seen = new Set<string>();
  const out: ActOnItFacts['fds'] = [];
  for (const t of txs) {
    const key = `${t.portfolioId}|${t.assetKey}`;
    if (seen.has(key) || !openKeys.has(key)) continue;
    seen.add(key);
    out.push({
      key, issuer: t.assetName?.trim() || 'your bank', amount: d(t.netAmount),
      ratePct: t.interestRate ? Number.parseFloat(t.interestRate.toString()) : null, maturityDate: t.maturityDate!,
    });
  }
  return out;
}

async function loanFacts(userId: string, asOf: Date): Promise<ActOnItFacts['loans']> {
  const loans = await prisma.loan.findMany({ where: { userId, status: 'ACTIVE' }, include: { payments: { orderBy: { paidOn: 'asc' } } } });
  const out: ActOnItFacts['loans'] = [];
  for (const loan of loans) {
    const type = rateLoanTypeForLoan(loan.loanType);
    if (type === null) continue;
    const market = await bestMarketRate(type, asOf);
    if (!market) continue;
    const current = d(loan.interestRate);
    const best = new Decimal(market.minRatePct);
    if (current.minus(best).lessThan(REFINANCE_MIN_GAP_PP)) continue;
    const position = loanPosition(loan as unknown as StoredLoan, asOf);
    const cost = switchingCost(position.outstanding, new Decimal(DEFAULT_SWITCHING_COSTS.processingPct), new Decimal(DEFAULT_SWITCHING_COSTS.otherCharges));
    const cmp = compareWithMarket({ outstanding: position.outstanding, remainingMonths: position.remainingMonths, currentRatePct: current, marketRatePct: best, switchingCost: cost });
    if (!cmp || !cmp.netSaving.greaterThan(0)) continue;
    out.push({
      loanId: loan.id, lender: loan.lenderName, loanType: loan.loanType, currentRatePct: current.toNumber(), marketRatePct: best.toNumber(),
      marketLender: market.lender, outstanding: position.outstanding, remainingMonths: position.remainingMonths,
      netSaving: cmp.netSaving, breakEvenMonth: cmp.breakEvenMonth ?? null,
    });
  }
  return out;
}

async function sipFacts(userId: string, asOf: Date): Promise<ActOnItFacts['sips']> {
  const plans = await prisma.sipPlan.findMany({ where: { userId, isActive: true, frequency: 'MONTHLY' }, select: { id: true, fundId: true, assetName: true, amount: true, startDate: true } });
  if (plans.length === 0) return [];
  const months = monthsBack(asOf, 3);
  const txns = await prisma.transaction.findMany({
    // CAS imports label an instalment SIP only when the line says so; a BUY in the plan's fund counts too.
    where: { portfolio: { userId }, transactionType: { in: ['SIP', 'BUY'] }, tradeDate: { gte: new Date(`${months[0]}-01T00:00:00Z`) } },
    select: { fundId: true, assetName: true, tradeDate: true },
  });
  const fundIds = plans.map((p) => p.fundId).filter((x): x is string => !!x);
  const names = new Map((fundIds.length ? await prisma.mutualFundMaster.findMany({ where: { id: { in: fundIds } }, select: { id: true, schemeName: true } }) : []).map((f) => [f.id, f.schemeName]));
  return plans.map((p) => {
    const paid = new Set(txns.filter((t) => (p.fundId ? t.fundId === p.fundId : t.assetName === p.assetName)).map((t) => monthOf(t.tradeDate)));
    return {
      sipId: p.id, name: p.assetName ?? (p.fundId ? names.get(p.fundId) ?? '' : ''), fundId: p.fundId, monthlyAmount: d(p.amount),
      missedMonths: months.filter((m) => m >= monthOf(p.startDate) && !paid.has(m)),
    };
  });
}

async function indexFacts(asOf: Date): Promise<ActOnItFacts['indexMonthly']> {
  const months = monthsBack(asOf, 7);
  const rows = await prisma.benchmarkIndexPrice.findMany({
    where: { indexCode: INDEX_CODE, date: { gte: new Date(`${months[0]}-01T00:00:00Z`), lte: asOf } },
    orderBy: { date: 'asc' },
    select: { date: true, value: true },
  });
  const last = new Map<string, number>();
  for (const r of rows) last.set(monthOf(r.date), Number.parseFloat(r.value.toString()));
  return months.filter((m) => last.has(m)).map((m) => ({ month: m, close: last.get(m)! }));
}

async function advanceTaxFacts(userId: string, asOf: Date): Promise<ActOnItFacts['advanceTax']> {
  const report = await advanceTaxReport(userId, financialYearOf(asOf), undefined, asOf);
  if (report.belowThreshold) return null;
  const next = report.instalments.find((i) => i.status !== 'met' && new Date(i.dueDate) >= asOf && new Decimal(i.shortfall).greaterThan(0));
  return next ? { label: next.label, dueDate: new Date(next.dueDate), shortfall: new Decimal(next.shortfall), interest: new Decimal(next.interest) } : null;
}

async function healthFacts(userId: string): Promise<ActOnItFacts['healthCover']> {
  const policies = await prisma.insurancePolicy.findMany({ where: { userId, status: 'ACTIVE', type: 'HEALTH' }, select: { sumAssured: true } });
  return { sumInsured: policies.reduce((s, p) => s.plus(d(p.sumAssured)), new Decimal(0)), policies: policies.length };
}

async function weakFundFacts(userId: string, holdings: AdvisorHoldingFact[]): Promise<ActOnItFacts['weakFunds']> {
  const run = await prisma.mfAnalysisRun.findFirst({ where: { userId, status: 'COMPLETED' }, orderBy: { startedAt: 'desc' }, select: { id: true } });
  if (!run) return [];
  const findings = await prisma.mfFinding.findMany({
    where: { runId: run.id, userId, severity: 'CRITICAL', schemeCode: { not: null }, confidence: { gte: 0.8 } },
    select: { schemeCode: true, code: true, headline: true, confidence: true },
  });
  if (findings.length === 0) return [];
  const funds = await prisma.mutualFundMaster.findMany({ where: { schemeCode: { in: findings.map((f) => f.schemeCode!) } }, select: { id: true, schemeCode: true } });
  const out: ActOnItFacts['weakFunds'] = [];
  for (const f of findings) {
    const fundId = funds.find((x) => x.schemeCode === f.schemeCode)?.id;
    const h = holdings.find((x) => x.fundId === fundId && x.currentValue.greaterThan(0));
    if (!h || out.some((o) => o.schemeCode === f.schemeCode)) continue;
    out.push({ holdingKey: h.holdingKey, schemeCode: f.schemeCode!, schemeName: h.assetName, valueInr: h.currentValue, bucket: h.bucket, findingCode: f.code, headline: f.headline, confidence: Number.parseFloat(f.confidence.toString()) });
  }
  return out;
}

/** The largest direct-plan growth liquid fund by latest AUM: the reference the idle-cash advice names and is measured on. */
async function liquidFundFact(): Promise<ActOnItFacts['liquidFund']> {
  const schemes = await prisma.mfSchemeMeta.findMany({
    where: { sebiSubCategory: 'Liquid Fund', planType: 'DIRECT', optionType: 'GROWTH', status: 'ACTIVE' },
    select: { schemeCode: true, schemeName: true, aumHistory: { orderBy: { asOf: 'desc' }, take: 1, select: { aum: true } } },
  });
  const ranked = schemes
    .filter((s) => s.aumHistory.length > 0)
    .sort((a, b) => d(b.aumHistory[0]!.aum).comparedTo(d(a.aumHistory[0]!.aum)));
  const top = ranked[0];
  if (!top) return null;
  const fund = await prisma.mutualFundMaster.findFirst({ where: { schemeCode: top.schemeCode }, select: { id: true } });
  return { schemeCode: top.schemeCode, name: top.schemeName, fundId: fund?.id ?? null };
}
