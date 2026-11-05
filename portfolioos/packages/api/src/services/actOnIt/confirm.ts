import { Decimal } from 'decimal.js';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

/**
 * "Seen in your data" (spec §6.2): for each recommendation that has not been
 * confirmed, look for the action in the user's own records after it was
 * given. Deterministic and versioned; a match moves it to DONE with
 * confirmedBy DATA and records what was matched. Skipped advice the user
 * acted on anyway is confirmed too.
 */

export const MATCHER_VERSION = 1;
const DAY_MS = 86_400_000;
/** How long after the advice a matching move still counts. */
export const CONFIRM_WINDOW_DAYS = 45;
const LIQUID_SUBCATEGORIES = ['Liquid Fund', 'Overnight Fund'];
const UNDECIDED_OR_SKIPPED = ['OPEN', 'SNOOZED', 'ACCEPTED', 'DISMISSED', 'EXPIRED'] as const;

type Baseline = Record<string, unknown>;
interface Candidate {
  id: string;
  createdAt: Date;
  measurement: Prisma.JsonValue;
}

interface Match {
  at: Date;
  detail: Record<string, unknown>;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

async function txns(userId: string, from: Date, to: Date, where: Prisma.TransactionWhereInput) {
  return prisma.transaction.findMany({
    where: { portfolio: { userId }, tradeDate: { gte: from, lte: to }, ...where },
    select: { id: true, tradeDate: true, netAmount: true, fundId: true, isin: true, assetName: true, transactionType: true },
    orderBy: { tradeDate: 'asc' },
  });
}

async function matchOne(userId: string, rec: Candidate, b: Baseline, method: string, now: Date): Promise<Match | null> {
  const from = rec.createdAt;
  const to = new Date(Math.min(now.getTime(), rec.createdAt.getTime() + CONFIRM_WINDOW_DAYS * DAY_MS));

  if (method === 'NAV_VS_CASH') {
    const amount = new Decimal(str(b.amountInr) ?? '0');
    if (amount.lessThanOrEqualTo(0)) return null;
    const buys = await txns(userId, from, to, { transactionType: { in: ['BUY', 'SIP', 'SWITCH_IN'] }, fundId: { not: null } });
    let eligible = buys;
    if (b.fundKind === 'LIQUID') {
      const liquid = await prisma.mutualFundMaster.findMany({
        where: { id: { in: buys.map((t) => t.fundId!) }, subCategory: { in: LIQUID_SUBCATEGORIES } },
        select: { id: true },
      });
      const ids = new Set(liquid.map((f) => f.id));
      eligible = buys.filter((t) => ids.has(t.fundId!));
    }
    let total = new Decimal(0);
    for (const t of eligible) {
      total = total.plus(t.netAmount.toString());
      // At least 80% of the suggested amount moved: the advice was followed.
      if (total.greaterThanOrEqualTo(amount.times(0.8))) {
        const first = eligible[0]!;
        return { at: t.tradeDate, detail: { kind: 'purchase', fundId: first.fundId, amountInr: total.toFixed(2), transactionIds: eligible.slice(0, eligible.indexOf(t) + 1).map((x) => x.id), startDate: first.tradeDate.toISOString().slice(0, 10) } };
      }
    }
    return null;
  }

  if (method === 'DIRECT_VS_REGULAR') {
    const direct = str(b.directFundId);
    if (!direct) return null;
    const [t] = await txns(userId, from, to, { transactionType: { in: ['BUY', 'SWITCH_IN', 'SIP'] }, fundId: direct });
    return t ? { at: t.tradeDate, detail: { kind: 'direct_purchase', transactionId: t.id, startDate: t.tradeDate.toISOString().slice(0, 10) } } : null;
  }

  if (method === 'SIP_UNITS') {
    const fundId = str(b.fundId);
    if (!fundId) return null;
    const [t] = await txns(userId, from, to, { transactionType: 'SIP', fundId });
    return t ? { at: t.tradeDate, detail: { kind: 'sip_resumed', transactionId: t.id, startDate: t.tradeDate.toISOString().slice(0, 10) } } : null;
  }

  if (method === 'TAX_SAVED' && b.kind !== 'ADVANCE_TAX') {
    const isin = str(b.isin);
    const name = str(b.assetName);
    // A sale of that very holding; without one to name, nothing can be matched.
    if (!isin && !name) return null;
    const sells = await txns(userId, from, to, { transactionType: { in: ['SELL', 'REDEMPTION', 'SWITCH_OUT'] }, ...(isin ? { isin } : { assetName: name! }) });
    const t = sells[0];
    return t ? { at: t.tradeDate, detail: { kind: 'sold', transactionId: t.id, startDate: t.tradeDate.toISOString().slice(0, 10) } } : null;
  }

  if (method === 'RATE_DIFF' && b.kind === 'LOAN') {
    const loanId = str(b.loanId);
    const was = num(b.ratePct);
    if (!loanId || was === null) return null;
    const loan = await prisma.loan.findFirst({ where: { id: loanId, userId }, select: { interestRate: true, status: true, updatedAt: true } });
    if (!loan || loan.updatedAt < from) return null;
    const rate = Number.parseFloat(loan.interestRate.toString());
    if (rate < was || loan.status === 'CLOSED') {
      return { at: loan.updatedAt, detail: { kind: loan.status === 'CLOSED' ? 'loan_closed' : 'rate_lowered', newRatePct: rate, startDate: loan.updatedAt.toISOString().slice(0, 10) } };
    }
    return null;
  }

  if (method === 'FUND_VS_ALT') {
    const code = str(b.heldSchemeCode);
    if (!code) return null;
    const fund = await prisma.mutualFundMaster.findFirst({ where: { schemeCode: code }, select: { id: true } });
    if (!fund) return null;
    const [t] = await txns(userId, from, to, { transactionType: { in: ['SELL', 'REDEMPTION', 'SWITCH_OUT'] }, fundId: fund.id });
    return t ? { at: t.tradeDate, detail: { kind: 'sold', transactionId: t.id, startDate: t.tradeDate.toISOString().slice(0, 10) } } : null;
  }

  return null;
}

/** Look for the advised action in the user's data. Returns how many were confirmed. */
export async function confirmFromData(userId: string, now: Date = new Date()): Promise<number> {
  const recs = await prisma.advisorRecommendation.findMany({
    where: {
      userId,
      supersededById: null,
      confirmedAt: null,
      status: { in: [...UNDECIDED_OR_SKIPPED] },
      outcomeStatus: 'PENDING',
      createdAt: { gte: new Date(now.getTime() - 180 * DAY_MS) },
    },
    select: { id: true, createdAt: true, measurement: true },
  });
  let confirmed = 0;
  for (const rec of recs) {
    const m = (rec.measurement ?? {}) as { method?: string; baseline?: Baseline };
    if (!m.method || m.method === 'NOT_MEASURED') continue;
    const hit = await matchOne(userId, rec, m.baseline ?? {}, m.method, now);
    if (!hit) continue;
    await prisma.advisorRecommendation.update({
      where: { id: rec.id },
      data: {
        status: 'DONE',
        confirmedAt: hit.at,
        confirmedBy: 'DATA',
        confirmation: { ...hit.detail, matcherVersion: MATCHER_VERSION } as Prisma.InputJsonValue,
        statusChangedAt: now,
        snoozedUntil: null,
      },
    });
    confirmed += 1;
  }
  return confirmed;
}
