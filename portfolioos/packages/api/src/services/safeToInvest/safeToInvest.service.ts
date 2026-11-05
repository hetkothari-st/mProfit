import { Decimal } from 'decimal.js';
import {
  premiumToAnnual,
  serializeMoney,
  type SafeToInvestCreditView,
  type SafeToInvestFixedItem,
  type SafeToInvestMonthView,
  type SafeToInvestSummary,
} from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import {
  BUFFER_PERCENTILE,
  ESTIMATED_BUFFER_SHARE,
  LEAN_PERCENTILE,
  MIN_BANK_MONTHS,
  MIN_DEBIT_MONTHS,
  dateMonth,
  declaredLeanIncome,
  istMonth,
  lastTwelveMonths,
  missedSipMonths,
  monthStart,
  monthlySip,
  percentile,
  safeAmount,
  shiftMonth,
  stabilityLabel,
  stabilityScore,
  topUp,
} from './safeToInvestMath.js';
import {
  CREDIT_EXCLUSION_LABEL,
  classifyCredit,
  isEverydaySpend,
  nameTokens,
} from './creditClassifier.js';
import { loadStoreMonths } from './stiSpendStore.js';

/**
 * Safe-to-Invest: a monthly SIP sized on the user's lean-month income so it
 * never has to be paused. Everything is computed on read from bank-alert
 * events, so a newly approved credit or debit shows up the next time the
 * page loads. The user's corrections (month totals, per-credit decisions,
 * buffer, top-up share) live in the SafeToInvest* tables.
 */

const ZERO = new Decimal(0);
const COUNTED_STATUSES = ['CONFIRMED', 'PROJECTED'] as const;
const CREDIT_TYPES = ['UPI_CREDIT', 'NEFT_CREDIT'] as const;
const DEBIT_TYPES = ['CARD_PURCHASE', 'UPI_DEBIT', 'NEFT_DEBIT'] as const;
const DEFAULT_TOP_UP_SHARE = new Decimal('0.5');

const dec = (v: { toString(): string }) => new Decimal(v.toString());
const money = (d: Decimal) => serializeMoney(d);

const LOAN_LABEL: Record<string, string> = {
  HOME: 'Home loan EMI', CAR: 'Car loan EMI', PERSONAL: 'Personal loan EMI', EDUCATION: 'Education loan EMI',
};
const INSURANCE_LABEL: Record<string, string> = {
  HEALTH: 'Health insurance', TERM: 'Term insurance', MOTOR: 'Motor insurance', HOME: 'Home insurance',
};

interface MoneyEvent {
  id: string;
  eventType: string;
  eventDate: Date;
  amount: Decimal;
  counterparty: string | null;
  parserNotes: string | null;
  instrumentName: string | null;
  currency: string;
}

async function loadEvents(userId: string, from: Date, types: readonly string[]): Promise<MoneyEvent[]> {
  const rows = await prisma.canonicalEvent.findMany({
    where: {
      userId,
      eventType: { in: [...types] as never },
      status: { in: [...COUNTED_STATUSES] },
      eventDate: { gte: from },
      amount: { not: null },
    },
    select: {
      id: true, eventType: true, eventDate: true, amount: true, counterparty: true,
      parserNotes: true, instrumentName: true, currency: true,
    },
    orderBy: { eventDate: 'asc' },
  });
  return rows.map((r) => ({ ...r, eventType: r.eventType as string, amount: dec(r.amount!) }));
}

async function userNameTokens(userId: string): Promise<string[]> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return nameTokens(u?.name);
}

// ---------------------------------------------------------------------------
// Fixed costs
// ---------------------------------------------------------------------------

async function fixedCosts(userId: string): Promise<{ total: Decimal; items: SafeToInvestFixedItem[]; expenseMonthly: Decimal }> {
  const [loans, policies, homes, expenses] = await Promise.all([
    prisma.loan.findMany({
      where: { userId, status: { in: ['ACTIVE', 'DEFAULT'] } },
      select: { id: true, lenderName: true, loanType: true, emiAmount: true },
    }),
    prisma.insurancePolicy.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { id: true, insurer: true, type: true, premiumAmount: true, premiumFrequency: true },
    }),
    prisma.ownedProperty.findMany({
      where: { userId, isActive: true, status: { in: ['SELF_OCCUPIED', 'SECOND_HOME'] }, monthlyMaintenance: { gt: 0 } },
      select: { id: true, name: true, monthlyMaintenance: true },
    }),
    prisma.inflationBasketItem.findMany({
      where: { userId, isFixed: true },
      select: { name: true, amount: true, frequency: true, sourceRef: true },
    }),
  ]);

  const items: (SafeToInvestFixedItem & { ref: string })[] = [];
  for (const l of loans) {
    const emi = dec(l.emiAmount);
    if (emi.greaterThan(0)) {
      items.push({ ref: `loan:${l.id}`, kind: 'loan', label: `${LOAN_LABEL[l.loanType] ?? 'Loan EMI'} · ${l.lenderName}`, monthly: money(emi) });
    }
  }
  for (const p of policies) {
    const monthly = premiumToAnnual(dec(p.premiumAmount), p.premiumFrequency).dividedBy(12);
    if (monthly.greaterThan(0)) {
      items.push({ ref: `insurance:${p.id}`, kind: 'insurance', label: `${INSURANCE_LABEL[p.type] ?? 'Insurance'} · ${p.insurer}`, monthly: money(monthly) });
    }
  }
  for (const h of homes) {
    items.push({ ref: `property:${h.id}`, kind: 'property', label: `Maintenance · ${h.name}`, monthly: money(dec(h.monthlyMaintenance!)) });
  }

  // Expenses marked fixed on Personal Inflation. One added from a loan or
  // policy above is already counted, so it is skipped rather than doubled.
  const auto = new Set(items.map((i) => i.ref));
  let expenseMonthly = ZERO;
  for (const e of expenses) {
    if (e.sourceRef && auto.has(e.sourceRef)) continue;
    const monthly = e.frequency === 'MONTHLY' ? dec(e.amount) : dec(e.amount).dividedBy(12);
    expenseMonthly = expenseMonthly.plus(monthly);
    items.push({ ref: `expense:${e.name}`, kind: 'expense', label: e.name, monthly: money(monthly) });
  }

  const total = items.reduce((s, i) => s.plus(i.monthly), ZERO);
  return { total, items: items.map(({ ref: _ref, ...rest }) => rest), expenseMonthly };
}

// ---------------------------------------------------------------------------
// Current SIPs
// ---------------------------------------------------------------------------

async function currentSips(userId: string, months: readonly string[]): Promise<SafeToInvestSummary['currentSip']> {
  const [plans, txns] = await Promise.all([
    prisma.sipPlan.findMany({ where: { userId, isActive: true }, select: { amount: true, frequency: true } }),
    prisma.transaction.findMany({
      where: { portfolio: { userId }, transactionType: 'SIP', tradeDate: { gte: monthStart(months[0]!) } },
      select: { tradeDate: true, netAmount: true },
    }),
  ]);
  const withSip = new Set(txns.map((t) => dateMonth(t.tradeDate)));
  const missedMonths = missedSipMonths(months, withSip);

  if (plans.length > 0) {
    const total = plans.reduce((s, p) => s.plus(monthlySip(dec(p.amount), p.frequency)), ZERO);
    return { monthly: money(total), source: 'PLANS', missedMonths };
  }
  // No SIP plans recorded: the average of the last three complete months of SIP purchases.
  const recent = new Set(months.slice(-3));
  const recentTotal = txns.filter((t) => recent.has(dateMonth(t.tradeDate))).reduce((s, t) => s.plus(dec(t.netAmount)), ZERO);
  if (recentTotal.isZero()) return { monthly: null, source: 'NONE', missedMonths };
  return { monthly: money(recentTotal.dividedBy(3)), source: 'TRANSACTIONS', missedMonths };
}

// ---------------------------------------------------------------------------
// Why bank data may be missing
// ---------------------------------------------------------------------------

async function bankDataStatus(userId: string, from: Date): Promise<SafeToInvestSummary['dataStatus']> {
  const bankTypes = [...CREDIT_TYPES, ...DEBIT_TYPES] as never;
  const [gmail, senders, awaitingReview, overBudget] = await Promise.all([
    prisma.mailboxAccount.count({ where: { userId, provider: 'GMAIL_OAUTH', isActive: true } }),
    prisma.monitoredSender.count({ where: { userId, isActive: true } }),
    prisma.canonicalEvent.count({
      where: { userId, eventType: { in: bankTypes }, status: { in: ['PARSED', 'PENDING_REVIEW'] }, eventDate: { gte: from } },
    }),
    prisma.canonicalEvent.count({ where: { userId, status: 'ARCHIVED', eventDate: { gte: from } } }),
  ]);
  return { gmailConnected: gmail > 0, monitoredSenders: senders, awaitingReview, overBudget };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export async function getSummary(userId: string, now: Date = new Date()): Promise<SafeToInvestSummary> {
  const months = lastTwelveMonths(now);
  const current = istMonth(now);
  const from = monthStart(months[0]!);

  const [credits, debits, decisions, overrides, plan, incomes, tokens, fixed, sips, dataStatus] = await Promise.all([
    loadEvents(userId, from, CREDIT_TYPES),
    loadEvents(userId, from, DEBIT_TYPES),
    prisma.safeToInvestCreditDecision.findMany({ where: { userId }, select: { canonicalEventId: true, include: true } }),
    prisma.safeToInvestMonth.findMany({ where: { userId, month: { in: months } }, select: { month: true, inflow: true } }),
    prisma.safeToInvestPlan.findUnique({ where: { userId } }),
    prisma.income.findMany({ where: { userId, isActive: true }, select: { type: true, monthlyAmount: true } }),
    userNameTokens(userId),
    fixedCosts(userId),
    currentSips(userId, lastTwelveMonths(now)),
    bankDataStatus(userId, from),
  ]);

  const decided = new Map(decisions.map((d) => [d.canonicalEventId, d.include]));
  const override = new Map(overrides.map((o) => [o.month, dec(o.inflow)]));
  const store = await loadStoreMonths(userId, months, decided);

  // Income per month: counted credits, unless the user typed the month's total.
  const counted = store?.credits ?? new Map<string, { sum: Decimal; credits: number; included: number }>();
  const touch = (m: string) => {
    let c = counted.get(m);
    if (!c) counted.set(m, (c = { sum: ZERO, credits: 0, included: 0 }));
    return c;
  };
  for (const e of store ? [] : credits) {
    const c = touch(dateMonth(e.eventDate));
    c.credits += 1;
    const include = decided.get(e.id) ?? classifyCredit(e, tokens) === null;
    if (include) {
      c.sum = c.sum.plus(e.amount);
      c.included += 1;
    }
  }
  // Everyday spend per month.
  const spend = store?.spend ?? new Map<string, Decimal>();
  for (const e of store ? [] : debits) {
    const m = dateMonth(e.eventDate);
    touch(m); // a month with any bank activity has data, even if no income came in
    if (isEverydaySpend(e, tokens)) spend.set(m, (spend.get(m) ?? ZERO).plus(e.amount));
  }

  const monthInflow = (m: string): { inflow: Decimal | null; source: SafeToInvestMonthView['source'] } => {
    const o = override.get(m);
    if (o) return { inflow: o, source: 'OVERRIDE' };
    const c = counted.get(m);
    return c ? { inflow: c.sum, source: 'BANK' } : { inflow: null, source: 'GAP' };
  };

  const series = months.map((m) => ({ month: m, ...monthInflow(m) }));
  const usable = series.filter((s) => s.inflow !== null).map((s) => s.inflow!);

  let basis: SafeToInvestSummary['basis'] = 'NONE';
  let lean: Decimal | null = null;
  let typical: Decimal | null = null;
  if (usable.length >= MIN_BANK_MONTHS) {
    basis = 'BANK';
    lean = percentile(usable, LEAN_PERCENTILE);
    typical = percentile(usable, 50);
  } else {
    const declared = declaredLeanIncome(incomes.map((i) => ({ type: i.type, monthly: dec(i.monthlyAmount) })));
    if (declared.greaterThan(0)) {
      basis = 'DECLARED';
      lean = declared;
    }
  }
  const score = basis === 'BANK' && lean && typical ? stabilityScore(lean, typical) : null;

  // Buffer: a heavy-but-normal month of everyday spend. Fixed expenses the
  // user listed (rent, fees) are usually paid from the same account, so they
  // are taken out of the debit figure rather than counted twice.
  let buffer: SafeToInvestSummary['buffer'];
  if (plan?.bufferOverride) {
    buffer = { monthly: money(dec(plan.bufferOverride)), source: 'OVERRIDE' };
  } else {
    const spendMonths = months.filter((m) => spend.has(m)).map((m) => spend.get(m)!);
    if (spendMonths.length >= MIN_DEBIT_MONTHS) {
      const p = percentile(spendMonths, BUFFER_PERCENTILE)!;
      // The store already took out the fixed payments it can see, month by month.
      buffer = { monthly: money(Decimal.max(ZERO, store ? p : p.minus(fixed.expenseMonthly))), source: 'DEBITS' };
    } else {
      buffer = { monthly: money((lean ?? ZERO).times(ESTIMATED_BUFFER_SHARE)), source: 'ESTIMATE' };
    }
  }

  const share = plan ? dec(plan.topUpShare) : DEFAULT_TOP_UP_SHARE;
  const soFar = counted.get(current)?.sum ?? ZERO;
  const up = lean ? topUp(soFar, lean, share) : { surplus: ZERO, topUp: ZERO };

  return {
    safeAmount: lean ? money(safeAmount(lean, fixed.total, dec(buffer.monthly))) : null,
    basis,
    monthsUsed: usable.length,
    months: series.map((s) => {
      const c = counted.get(s.month);
      return {
        month: s.month,
        inflow: s.inflow ? money(s.inflow) : null,
        source: s.source,
        lean: !!(lean && s.inflow && basis === 'BANK' && s.inflow.lessThan(lean)),
        creditCount: c?.credits ?? 0,
        includedCount: c?.included ?? 0,
      };
    }),
    leanInflow: lean ? money(lean) : null,
    typicalInflow: typical ? money(typical) : null,
    stabilityScore: score,
    stabilityLabel: stabilityLabel(score),
    fixed: { total: money(fixed.total), items: fixed.items },
    buffer,
    currentSip: sips,
    thisMonth: { month: current, inflowSoFar: money(soFar), surplus: money(up.surplus), topUp: money(up.topUp) },
    dataSource: store ? 'SPENDING' : 'ALERTS',
    dataStatus,
    plan: {
      topUpShare: share.toFixed(4),
      bufferOverride: plan?.bufferOverride ? money(dec(plan.bufferOverride)) : null,
      savedAmount: plan?.savedAmount ? money(dec(plan.savedAmount)) : null,
      savedAt: plan?.savedAt ? plan.savedAt.toISOString() : null,
    },
  };
}

// ---------------------------------------------------------------------------
// One month's credits, for the drill-down
// ---------------------------------------------------------------------------

function assertMonth(month: string, now: Date, allowCurrent: boolean): void {
  const window = lastTwelveMonths(now);
  if (allowCurrent) window.push(istMonth(now));
  if (!window.includes(month)) throw new BadRequestError('Pick one of the last twelve months');
}

export async function listCredits(userId: string, month: string, now: Date = new Date()): Promise<SafeToInvestCreditView[]> {
  assertMonth(month, now, true);
  const start = monthStart(month);
  const end = monthStart(shiftMonth(month, 1));
  const [events, decisions, tokens] = await Promise.all([
    prisma.canonicalEvent.findMany({
      where: {
        userId,
        eventType: { in: [...CREDIT_TYPES] },
        status: { in: [...COUNTED_STATUSES] },
        eventDate: { gte: start, lt: end },
        amount: { not: null },
      },
      select: { id: true, eventDate: true, amount: true, counterparty: true, parserNotes: true, instrumentName: true, currency: true },
      orderBy: [{ eventDate: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.safeToInvestCreditDecision.findMany({ where: { userId }, select: { canonicalEventId: true, include: true } }),
    userNameTokens(userId),
  ]);
  const decided = new Map(decisions.map((d) => [d.canonicalEventId, d.include]));
  // Same verdicts as the totals: the store's when the user's spending is read from it.
  const store = await loadStoreMonths(userId, [month], decided);
  return events.map((e) => {
    const reason = store?.verdictByEvent.has(e.id) ? store.verdictByEvent.get(e.id)! : classifyCredit(e, tokens);
    const decision = decided.get(e.id) ?? null;
    return {
      id: e.id,
      date: e.eventDate.toISOString().slice(0, 10),
      amount: money(dec(e.amount!)),
      counterparty: e.counterparty,
      autoInclude: reason === null,
      autoReason: reason ? CREDIT_EXCLUSION_LABEL[reason] : null,
      decision,
      included: decision ?? reason === null,
    };
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function updatePlan(
  userId: string,
  input: { topUpShare?: string; bufferOverride?: string | null },
): Promise<void> {
  const data = {
    ...(input.topUpShare !== undefined && { topUpShare: input.topUpShare }),
    ...(input.bufferOverride !== undefined && { bufferOverride: input.bufferOverride }),
  };
  await prisma.safeToInvestPlan.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

/** Commit to the current Safe-to-Invest amount as the user's SIP plan. */
export async function savePlan(userId: string, now: Date = new Date()): Promise<void> {
  const s = await getSummary(userId, now);
  if (!s.safeAmount) throw new BadRequestError('Add income data first: there is no amount to save yet');
  await prisma.safeToInvestPlan.upsert({
    where: { userId },
    create: { userId, savedAmount: s.safeAmount, savedAt: now },
    update: { savedAmount: s.safeAmount, savedAt: now },
  });
}

export async function setMonthInflow(userId: string, month: string, inflow: string | null, now: Date = new Date()): Promise<void> {
  assertMonth(month, now, false);
  if (inflow === null) {
    await prisma.safeToInvestMonth.deleteMany({ where: { userId, month } });
    return;
  }
  await prisma.safeToInvestMonth.upsert({
    where: { userId_month: { userId, month } },
    create: { userId, month, inflow },
    update: { inflow },
  });
}

export async function setCreditDecision(userId: string, eventId: string, include: boolean | null): Promise<void> {
  const event = await prisma.canonicalEvent.findFirst({
    where: { id: eventId, userId, eventType: { in: [...CREDIT_TYPES] } },
    select: { id: true },
  });
  if (!event) throw new NotFoundError('Credit not found');
  if (include === null) {
    await prisma.safeToInvestCreditDecision.deleteMany({ where: { userId, canonicalEventId: eventId } });
    return;
  }
  await prisma.safeToInvestCreditDecision.upsert({
    where: { userId_canonicalEventId: { userId, canonicalEventId: eventId } },
    create: { userId, canonicalEventId: eventId, include },
    update: { include },
  });
}
