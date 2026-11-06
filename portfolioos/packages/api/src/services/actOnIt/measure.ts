import { Decimal } from 'decimal.js';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { cashGrowth, directVsRegular, loanInterestSaved, navGrowth, navVsCash, sipDipGain } from './measureMath.js';
import { taxHarvestReport } from '../tax/tax.service.js';

/**
 * The result against doing nothing (spec §6.3), once a recommendation's
 * horizon has passed. Acted on (confirmed in the data): what acting earned
 * over the do-nothing path. Skipped (dismissed or expired, not done anyway):
 * what acting would have earned, recorded as a negative — the amount missed.
 * Real NAVs and rates only; any missing price leaves it PENDING for the next
 * run. Advice confirmed only by the user's own say-so is listed but never
 * priced (it never counts in the ₹ total).
 */

const DAY_MS = 86_400_000;
/** A NAV this many days before the date still stands for that date (weekends, holidays). */
const NAV_SLACK_DAYS = 7;

type Baseline = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const day = (dt: Date) => dt.toISOString().slice(0, 10);

async function navOn(fundId: string, date: Date): Promise<Decimal | null> {
  const row = await prisma.mFNav.findFirst({
    where: { fundId, date: { lte: date, gte: new Date(date.getTime() - NAV_SLACK_DAYS * DAY_MS) } },
    orderBy: { date: 'desc' },
    select: { nav: true },
  });
  return row ? new Decimal(row.nav.toString()) : null;
}

async function path(fundId: string | null, start: Date, end: Date) {
  if (!fundId) return null;
  const [s, e] = await Promise.all([navOn(fundId, start), navOn(fundId, end)]);
  return s && e ? { start: s, end: e } : null;
}

type Outcome = { kind: 'MEASURED'; value: Decimal; detail: Record<string, unknown> } | { kind: 'NOT_MEASURED'; reason: string } | { kind: 'PENDING' };

async function measureOne(userId: string, method: string, b: Baseline, acted: boolean, confirmation: Record<string, unknown>, start: Date, end: Date): Promise<Outcome> {
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));

  switch (method) {
    case 'NAV_VS_CASH': {
      const fundId = acted ? str(confirmation.fundId) : str(b.referenceFundId);
      const amount = new Decimal((acted ? str(confirmation.amountInr) : null) ?? str(b.amountInr) ?? '0');
      const rate = num(b.savingsRatePct) ?? 0;
      const p = await path(fundId, start, end);
      if (!p || amount.lessThanOrEqualTo(0)) return fundId ? { kind: 'PENDING' } : { kind: 'NOT_MEASURED', reason: 'no fund to price' };
      const v = navVsCash(amount, p.start, p.end, rate, days);
      return { kind: 'MEASURED', value: v, detail: { fundId, amountInr: amount.toFixed(2), navStart: p.start.toString(), navEnd: p.end.toString(), fundGain: navGrowth(amount, p.start, p.end).toFixed(2), cashGain: cashGrowth(amount, rate, days).toFixed(2) } };
    }
    case 'DIRECT_VS_REGULAR': {
      const value = new Decimal(str(b.valueInr) ?? '0');
      const [reg, dir] = await Promise.all([path(str(b.regularFundId), start, end), path(str(b.directFundId), start, end)]);
      if (!reg || !dir) return { kind: 'PENDING' };
      return { kind: 'MEASURED', value: directVsRegular(value, reg, dir), detail: { valueInr: value.toFixed(2), regular: { start: reg.start.toString(), end: reg.end.toString() }, direct: { start: dir.start.toString(), end: dir.end.toString() } } };
    }
    case 'SIP_UNITS': {
      const fundId = str(b.fundId);
      if (!fundId) return { kind: 'NOT_MEASURED', reason: 'SIP fund unknown' };
      const monthly = new Decimal(str(b.monthlyAmountInr) ?? '0');
      const count = Array.isArray(b.missedMonths) ? b.missedMonths.length : 1;
      const navEnd = await navOn(fundId, end);
      if (!navEnd) return { kind: 'PENDING' };
      const buys: { amount: Decimal; nav: Decimal }[] = [];
      for (let i = 0; i < count; i++) {
        const at = new Date(start.getTime() + i * 30 * DAY_MS);
        const nav = await navOn(fundId, at);
        if (!nav) return { kind: 'PENDING' };
        buys.push({ amount: monthly, nav });
      }
      return { kind: 'MEASURED', value: sipDipGain(buys, navEnd), detail: { fundId, instalments: count, monthlyAmountInr: monthly.toFixed(2), navEnd: navEnd.toString() } };
    }
    case 'TAX_SAVED': {
      if (b.kind === 'ADVANCE_TAX') return { kind: 'NOT_MEASURED', reason: 'tax payments are not visible to the app' };
      if (b.kind !== 'LTCG_BOOKING') {
        // A harvested loss saves tax only against gains we cannot see in full (other brokers, carry-forward).
        return { kind: 'NOT_MEASURED', reason: 'the tax saved depends on gains outside the app' };
      }
      const rate = num(b.ratePct);
      const book = new Decimal(str(b.bookInr) ?? '0');
      const fy = str(b.fy);
      if (rate === null || book.lessThanOrEqualTo(0) || !fy) return { kind: 'NOT_MEASURED', reason: 'no tax rate on record' };
      const realisedNow = new Decimal((await taxHarvestReport(userId, fy)).totals.realisedLtcgInFy);
      const atAdvice = new Decimal(str(b.realisedAtAdvice) ?? '0');
      const exemption = new Decimal(str(b.exemptionInr) ?? '125000');
      // Acted: the tax-free gain really booked since the advice, up to what was advised.
      // Skipped: the tax-free room left unused at year end, up to what was advised.
      const used = acted
        ? Decimal.min(book, Decimal.max(0, realisedNow.minus(atAdvice)))
        : Decimal.min(book, Decimal.max(0, exemption.minus(realisedNow)));
      return { kind: 'MEASURED', value: used.times(rate).dividedBy(100), detail: { bookedInr: used.toFixed(2), ratePct: rate, realisedAtYearEnd: realisedNow.toFixed(2) } };
    }
    case 'RATE_DIFF': {
      if (b.kind !== 'LOAN') return { kind: 'NOT_MEASURED', reason: 'the alternative rate is not known' };
      const outstanding = new Decimal(str(b.outstandingInr) ?? '0');
      const was = num(b.ratePct);
      const to = acted ? num(confirmation.newRatePct) : num(b.marketRatePct);
      if (was === null || to === null || to >= was) return { kind: 'NOT_MEASURED', reason: 'no lower rate to compare' };
      return { kind: 'MEASURED', value: loanInterestSaved(outstanding, was, to, days), detail: { outstandingInr: outstanding.toFixed(2), fromPct: was, toPct: to } };
    }
    case 'FUND_VS_ALT': {
      const code = str(b.heldSchemeCode);
      const alt = str(b.altFundId);
      if (!alt || !code) return { kind: 'NOT_MEASURED', reason: 'no named alternative to compare' };
      const held = await prisma.mutualFundMaster.findFirst({ where: { schemeCode: code }, select: { id: true } });
      const value = new Decimal(str(b.valueInr) ?? '0');
      const [h, a] = await Promise.all([path(held?.id ?? null, start, end), path(alt, start, end)]);
      if (!h || !a) return { kind: 'PENDING' };
      return { kind: 'MEASURED', value: navGrowth(value, a.start, a.end).minus(navGrowth(value, h.start, h.end)), detail: { valueInr: value.toFixed(2) } };
    }
    default:
      // Whole-portfolio comparisons (rebalancing) need a replay of every holding; not measured in v1.
      return { kind: 'NOT_MEASURED', reason: 'not priced in this version' };
  }
}

/** Measure every recommendation whose horizon has passed. Returns how many got a result. */
export async function measureDue(userId: string, now: Date = new Date()): Promise<number> {
  const recs = await prisma.advisorRecommendation.findMany({
    where: { userId, supersededById: null, outcomeStatus: 'PENDING', status: { in: ['DONE', 'DISMISSED', 'EXPIRED'] } },
    select: { id: true, ruleId: true, dedupeKey: true, status: true, createdAt: true, confirmedAt: true, confirmedBy: true, confirmation: true, measurement: true, promise: true },
  });
  let measured = 0;
  for (const r of recs) {
    const m = (r.measurement ?? {}) as { method?: string; horizonDays?: number; baseline?: Baseline };
    if (!m.method) continue;
    if (r.status === 'DONE' && r.confirmedBy === 'USER') {
      await prisma.advisorRecommendation.update({ where: { id: r.id }, data: { outcomeStatus: 'NOT_MEASURED', outcomeDetail: { reason: 'confirmed by you, not seen in your data' }, measuredAt: now } });
      continue;
    }
    const acted = r.status === 'DONE';
    if (!acted) {
      const newer = await prisma.advisorRecommendation.findFirst({
        where: { userId, ruleId: r.ruleId, dedupeKey: r.dedupeKey, createdAt: { gt: r.createdAt, lt: new Date(r.createdAt.getTime() + (m.horizonDays ?? 365) * DAY_MS) } },
        select: { id: true },
      });
      if (newer) {
        await prisma.advisorRecommendation.update({ where: { id: r.id }, data: { outcomeStatus: 'NOT_MEASURED', outcomeDetail: { reason: 'replaced by newer advice for the same money' }, measuredAt: now } });
        continue;
      }
    }
    const start = acted && r.confirmedAt ? r.confirmedAt : r.createdAt;
    const due = new Date(r.createdAt.getTime() + (m.horizonDays ?? 365) * DAY_MS);
    if (due > now) continue;
    const end = new Date(Math.min(now.getTime(), start.getTime() + (m.horizonDays ?? 365) * DAY_MS));
    const confirmation = (r.confirmation ?? {}) as Record<string, unknown>;
    const out = await measureOne(userId, m.method, m.baseline ?? {}, acted, confirmation, start, end);
    if (out.kind === 'PENDING') continue;
    if (out.kind === 'NOT_MEASURED') {
      await prisma.advisorRecommendation.update({ where: { id: r.id }, data: { outcomeStatus: 'NOT_MEASURED', outcomeDetail: { reason: out.reason }, measuredAt: now } });
      continue;
    }
    // Skipped advice: what acting would have earned is what was missed.
    const value = acted ? out.value : out.value.negated();
    const promisedGain = str((r.promise as Record<string, unknown> | null)?.gainInr);
    await prisma.advisorRecommendation.update({
      where: { id: r.id },
      data: {
        outcomeStatus: 'MEASURED',
        outcomeInr: value.toFixed(2),
        outcomeDetail: { method: m.method, acted, start: day(start), end: day(end), promisedGainInr: promisedGain, ...out.detail } as Prisma.InputJsonValue,
        measuredAt: now,
      },
    });
    measured += 1;
  }
  return measured;
}
