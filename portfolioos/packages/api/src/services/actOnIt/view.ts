import { Decimal } from 'decimal.js';
import type {
  ActOnItView,
  AdviceCardView,
  AdviceHistoryRow,
  AdviceOutcome,
  AdviceFact,
  AdviceState,
  AdviceWhyNow,
  AdviceWhyView,
} from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';
import { complianceText, inaNumber } from './compliance.js';

/**
 * The Act on it page (spec §8): the advice to act on now, what is waiting,
 * the track record and the history. Read-only; built from AdvisorRecommendation.
 */

const select = {
  id: true, category: true, headline: true, rationale: true, promise: true, measurement: true, inputsSnapshot: true,
  status: true, snoozedUntil: true, urgentUntil: true, expiresAt: true, createdAt: true, priority: true,
  confirmedBy: true, outcomeStatus: true, outcomeInr: true, outcomeDetail: true, statusNote: true,
} as const;

type Row = Awaited<ReturnType<typeof loadRows>>[number];
async function loadRows(userId: string) {
  return prisma.advisorRecommendation.findMany({
    where: { userId, supersededById: null },
    orderBy: { createdAt: 'desc' },
    take: 300,
    select,
  });
}

export function stateOf(r: { status: string; confirmedBy: string | null; outcomeStatus: string; snoozedUntil: Date | null }, now: Date): AdviceState {
  if (r.outcomeStatus === 'BEFORE_TRACKING') return 'BEFORE_TRACKING';
  switch (r.status) {
    case 'OPEN':
      return 'OPEN';
    case 'SNOOZED':
      return r.snoozedUntil && r.snoozedUntil > now ? 'SNOOZED' : 'OPEN';
    case 'ACCEPTED':
      return 'ACCEPTED';
    case 'DONE':
      return r.confirmedBy === 'DATA' ? 'CONFIRMED' : 'CONFIRMED_BY_USER';
    case 'DISMISSED':
    case 'EXPIRED':
      return 'SKIPPED';
    default:
      return 'WITHDRAWN';
  }
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const s = (v: unknown): string | null => (typeof v === 'string' ? v : null);

const LABELS: Record<string, string> = {
  monthlySpending: 'Monthly spending', bufferInr: '3 months of spending', latestBalance: 'Bank balance now', monthsAboveBuffer: 'Months above that',
  savingsRatePct: 'Savings rate', liquidYieldPct: 'Liquid fund yield', valueInr: 'Value', regularTerPct: 'Regular plan cost',
  directTerPct: 'Direct plan cost', realised: 'Gains booked this year', exemption: 'Tax-free limit', bookInr: 'Gain to book',
  amountInr: 'Amount', ratePct: 'Rate', maturityDate: 'Matures on', currentRatePct: 'Your rate', marketRatePct: 'Best rate',
  outstanding: 'Outstanding', remainingMonths: 'Months left', netSaving: 'Saving after costs', dueDate: 'Due on', shortfall: 'Short by',
  interest: 'Interest avoided', liquidAssets: 'Liquid money', sumInsured: 'Health cover', confidence: 'Confidence', missedMonths: 'Missed months',
  fallPct: 'Market fall', totalPortfolioValue: 'Portfolio value',
};
/** Facts that are rupee amounts; keys ending in Pct are percentages. */
const MONEY_KEYS = new Set([
  'monthlySpending', 'bufferInr', 'latestBalance', 'valueInr', 'realised', 'exemption', 'bookInr', 'amountInr', 'outstanding',
  'netSaving', 'shortfall', 'interest', 'liquidAssets', 'sumInsured', 'totalPortfolioValue',
]);
const NUMERIC = /^-?\d+(\.\d+)?$/;

/** A title for advice given before headlines existed, from its kind. */
const FALLBACK_HEADLINE: Record<string, string> = {
  CONCENTRATION_TRIM: 'Trim a holding that has grown too big',
  REBALANCE: 'Bring your mix back to target',
  CASH_DEPLOYMENT: 'Put your spare cash to work',
  TAX_HARVEST: 'Book a loss to cut your tax',
  GOAL_SHORTFALL_SIP: 'Top up a goal that is falling behind',
  RISK_PROFILE_REVIEW: 'Tell us how much risk suits you',
  IDLE_CASH_PARKING: 'Put your resting savings to work',
  REGULAR_TO_DIRECT: 'Move to the direct plan',
  LTCG_BOOKING: 'Book gains while they are tax-free',
  STOPPED_SIP: 'Restart your SIP while prices are down',
  FD_MATURITY: 'Decide what your maturing FD does next',
  LOAN_REFINANCE: 'Ask for a lower loan rate',
  ADVANCE_TAX: 'Pay your advance tax on time',
  EMERGENCY_FUND: 'Build up your safety net',
  HEALTH_COVER: 'Raise your health cover',
  FUND_UNDERPERFORMING: 'Replace a fund that keeps lagging',
};
export const fallbackHeadline = (category: string) => FALLBACK_HEADLINE[category] ?? 'Advice for you';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-08' → 'Aug 2026'; anything else unchanged. */
const readable = (v: string) => (/^\d{4}-\d{2}$/.test(v) ? `${MONTHS[Number.parseInt(v.slice(5), 10) - 1]} ${v.slice(0, 4)}` : v);

function factItems(inputs: unknown): AdviceFact[] {
  const out: AdviceFact[] = [];
  for (const [k, v] of Object.entries(obj(inputs))) {
    const label = LABELS[k];
    if (!label) continue;
    if (typeof v === 'string' || typeof v === 'number') {
      const raw = String(v);
      if (NUMERIC.test(raw) && MONEY_KEYS.has(k)) out.push({ label, value: new Decimal(raw).toFixed(2), kind: 'inr' });
      else if (NUMERIC.test(raw) && k.endsWith('Pct')) out.push({ label, value: new Decimal(raw).toString(), kind: 'pct' });
      else out.push({ label, value: readable(raw), kind: 'text' });
    } else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
      out.push({ label, value: (v as string[]).map(readable).join(', '), kind: 'text' });
    }
  }
  return out;
}

function whyNow(r: Row): AdviceWhyNow | null {
  const i = obj(r.inputsSnapshot);
  if (r.category === 'IDLE_CASH_PARKING' && Array.isArray(i.balanceMonths)) {
    return {
      kind: 'BALANCE',
      months: (i.balanceMonths as { month: string; balance: string }[]).map((m) => ({ month: m.month, balance: new Decimal(m.balance).toFixed(2) })),
      bufferInr: s(i.bufferInr) ? new Decimal(s(i.bufferInr)!).toFixed(2) : null,
    };
  }
  const items = factItems(i);
  return items.length ? { kind: 'FACTS', items } : null;
}

function card(r: Row, now: Date): AdviceCardView {
  const p = obj(r.promise);
  const m = obj(r.measurement);
  const b = obj(m.baseline);
  const twoPaths = m.method === 'NAV_VS_CASH' && s(b.amountInr) && typeof b.savingsRatePct === 'number' && typeof b.expectedYieldPct === 'number'
    ? { amountInr: s(b.amountInr)!, doNothingRatePct: b.savingsRatePct, actRatePct: b.expectedYieldPct, doNothingLabel: 'Savings account', actLabel: 'Liquid fund' }
    : null;
  return {
    id: r.id,
    category: r.category,
    headline: r.headline ?? fallbackHeadline(r.category),
    rationale: r.rationale,
    gainInr: s(p.gainInr),
    riskBand: (s(p.riskBand) ?? 'MEDIUM') as AdviceCardView['riskBand'],
    costInr: s(p.costInr),
    liquidity: s(p.liquidity),
    confidence: p.confidence === 'MEDIUM' ? 'MEDIUM' : 'HIGH',
    urgent: !!r.urgentUntil && r.urgentUntil >= now,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    state: stateOf(r, now),
    whyNow: whyNow(r),
    twoPaths,
  };
}

function outcomeOf(r: Row, state: AdviceState): AdviceOutcome {
  if (state === 'BEFORE_TRACKING') return 'BEFORE_TRACKING';
  if (r.outcomeStatus === 'NOT_MEASURED') return 'NOT_MEASURED';
  if (r.outcomeStatus === 'MEASURED' && r.outcomeInr !== null) {
    // Stored signed from the user's side: acted = acting minus doing nothing;
    // skipped = minus what acting would have earned.
    const negative = new Decimal(r.outcomeInr.toString()).isNegative();
    if (state === 'SKIPPED') return negative ? 'MISSED' : 'AVOIDED';
    return negative ? 'LOST' : 'GAINED';
  }
  if (state === 'ACCEPTED') return 'WAITING';
  if (state === 'CONFIRMED' || state === 'SKIPPED') return 'PENDING';
  return 'NONE';
}

export async function getActOnItView(userId: string, now: Date = new Date()): Promise<ActOnItView> {
  const [rows, ina] = await Promise.all([loadRows(userId), inaNumber()]);
  const open = rows
    .filter((r) => stateOf(r, now) === 'OPEN' && r.outcomeStatus !== 'BEFORE_TRACKING')
    .sort((a, b) => (b.urgentUntil && b.urgentUntil >= now ? 1 : 0) - (a.urgentUntil && a.urgentUntil >= now ? 1 : 0) || a.priority - b.priority)
    .map((r) => card(r, now));

  const tracked = rows.filter((r) => r.outcomeStatus !== 'BEFORE_TRACKING');
  const states = tracked.map((r) => ({ r, st: stateOf(r, now) }));
  let total = new Decimal(0);
  let missed = new Decimal(0);
  let measured = 0;
  for (const { r, st } of states) {
    if (r.outcomeStatus !== 'MEASURED' || r.outcomeInr === null) continue;
    const v = new Decimal(r.outcomeInr.toString());
    // Only what the data proves counts: confirmed results and skipped ones.
    if (st === 'CONFIRMED') {
      total = total.plus(v);
      measured += 1;
    } else if (st === 'SKIPPED') {
      // Only skips that would have earned are missed; a skip that saved money is not.
      if (v.isNegative()) missed = missed.plus(v.abs());
      measured += 1;
    }
  }
  const history: AdviceHistoryRow[] = rows
    .filter((r) => !['OPEN', 'SNOOZED'].includes(stateOf(r, now)))
    .map((r) => {
      const st = stateOf(r, now);
      return {
        id: r.id,
        date: r.createdAt.toISOString().slice(0, 10),
        category: r.category,
        headline: r.headline ?? fallbackHeadline(r.category),
        state: st,
        outcome: outcomeOf(r, st),
        outcomeInr: r.outcomeStatus === 'MEASURED' && r.outcomeInr !== null ? new Decimal(r.outcomeInr.toString()).toFixed(2) : null,
        promisedGainInr: s(obj(r.promise).gainInr),
        note: s(obj(r.outcomeDetail).reason) ?? r.statusNote,
      };
    });

  return {
    compliance: { inaNumber: ina, line: complianceText(ina) },
    current: open[0] ?? null,
    waiting: open.slice(1),
    record: {
      given: states.filter(({ st }) => st !== 'WITHDRAWN').length,
      acted: states.filter(({ st }) => st === 'ACCEPTED' || st === 'CONFIRMED' || st === 'CONFIRMED_BY_USER').length,
      confirmed: states.filter(({ st }) => st === 'CONFIRMED').length,
      skipped: states.filter(({ st }) => st === 'SKIPPED').length,
      totalInr: total.toFixed(2),
      missedInr: missed.toFixed(2),
      measured,
    },
    history,
  };
}

const METHOD_TEXT: Record<string, string> = {
  NAV_VS_CASH: "After a year, we compare what the money earned in the fund (from its real daily prices) with what your savings account would have paid.",
  DIRECT_VS_REGULAR: "After a year, we compare the direct plan's real growth with the regular plan's on the same money.",
  TAX_SAVED: 'At the end of the financial year, we count the tax the step saved.',
  SIP_UNITS: 'After a year, we value the instalments bought during the dip at the fund’s real price.',
  RATE_DIFF: 'After a year, we count the interest the lower rate saved on what you owe.',
  FUND_VS_ALT: "After a year, we compare the alternative's real growth with the fund you held.",
  PORTFOLIO_VS_HELD: 'We record it; rebalancing results are not priced yet.',
  NOT_MEASURED: 'This kind of advice cannot be priced, so it is not counted in your track record.',
};

export async function getAdviceWhy(userId: string, id: string): Promise<AdviceWhyView> {
  const r = await prisma.advisorRecommendation.findFirst({ where: { id, userId }, select: { id: true, category: true, headline: true, rationale: true, inputsSnapshot: true, measurement: true, outcomeStatus: true, createdAt: true } });
  if (!r) throw new NotFoundError('Recommendation not found');
  const method = s(obj(r.measurement).method) ?? 'NOT_MEASURED';
  return {
    id: r.id,
    headline: r.headline ?? fallbackHeadline(r.category),
    category: r.category,
    rationale: r.rationale,
    facts: factItems(r.inputsSnapshot),
    measuredBy: r.outcomeStatus === 'MEASURED' && method === 'NOT_MEASURED' ? 'Priced against doing nothing, using real prices.' : (METHOD_TEXT[method] ?? METHOD_TEXT.NOT_MEASURED!),
    // A result already priced counts, whatever the method on file says.
    tracked: r.outcomeStatus === 'MEASURED' || (method !== 'NOT_MEASURED' && method !== 'PORTFOLIO_VS_HELD'),
    givenAt: r.createdAt.toISOString(),
  };
}
