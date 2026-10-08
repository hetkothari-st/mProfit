/**
 * "Add my share to Cash Activity" (spec §6). One SplitShareLink per (expense,
 * user); the CashFlow it points at is derived from the expense and rewritten on
 * every sync. Sync runs as system because a co-member's edit must update MY
 * cash flow, which only my RLS context could otherwise write. Callers check
 * membership under their own context before any system-context work.
 */
import { Decimal } from 'decimal.js';
import type { SplitShareLinkDto } from '@everypaisa/shared';
import { serializeMoney } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { getLatestFxRate } from '../../priceFeeds/fx.service.js';
import { requireMember } from './groups.service.js';

type Desired = { portfolioId: string; date: Date; amount: Decimal; currency: string | null; inrEquivalent: Decimal | null; description: string } | null;

async function myShare(expenseId: string, userId: string) {
  const e = await prisma.splitExpense.findUnique({
    where: { id: expenseId },
    include: { shares: true, group: { select: { name: true, baseCurrency: true, members: { select: { id: true, userId: true } } } } },
  });
  if (!e) return null;
  const memberIds = new Set(e.group.members.filter((m) => m.userId === userId).map((m) => m.id));
  const share = e.shares.filter((s) => memberIds.has(s.memberId)).reduce((a, s) => a.plus(s.baseAmount.toString()), new Decimal(0));
  return { e, share };
}

async function desiredFor(link: { expenseId: string; userId: string; portfolioId: string }): Promise<Desired> {
  const r = await myShare(link.expenseId, link.userId);
  if (!r || r.e.deletedAt || r.share.lte(0)) return null;
  const base = r.e.group.baseCurrency;
  let inr: Decimal | null = null;
  let suffix = '';
  if (base !== 'INR') {
    const rate = await getLatestFxRate(base, 'INR');
    if (rate) inr = r.share.mul(rate.toString()).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
    else suffix = ' (rate unavailable)';
  }
  return {
    portfolioId: link.portfolioId, date: r.e.date, amount: r.share, currency: base === 'INR' ? null : base, inrEquivalent: inr,
    description: `Split: ${r.e.description} (${r.e.group.name})${suffix}`.slice(0, 250),
  };
}

/** Bring one link's CashFlow in line with the expense. Returns true when something changed. Runs as system. */
async function syncOne(link: { id: string; expenseId: string; userId: string; cashFlowId: string; portfolioId: string }): Promise<boolean> {
  const want = await desiredFor(link);
  const have = link.cashFlowId ? await prisma.cashFlow.findUnique({ where: { id: link.cashFlowId } }) : null;
  if (!want) {
    if (!have) {
      if (link.cashFlowId) await prisma.splitShareLink.update({ where: { id: link.id }, data: { cashFlowId: '' } });
      return false;
    }
    await prisma.cashFlow.delete({ where: { id: have.id } });
    await prisma.splitShareLink.update({ where: { id: link.id }, data: { cashFlowId: '' } });
    return true;
  }
  const data = {
    portfolioId: want.portfolioId, date: want.date, type: 'OUTFLOW' as const, amount: want.amount.toFixed(4),
    currency: want.currency, inrEquivalent: want.inrEquivalent?.toFixed(4) ?? null, description: want.description,
  };
  if (!have) {
    const cf = await prisma.cashFlow.create({ data, select: { id: true } });
    await prisma.splitShareLink.update({ where: { id: link.id }, data: { cashFlowId: cf.id } });
    return true;
  }
  const eqDec = (a: { toString(): string } | null, b: Decimal | null) =>
    a === null || b === null ? a === b : new Decimal(a.toString()).eq(b);
  const same = have.portfolioId === data.portfolioId && have.date.getTime() === data.date.getTime()
    && have.type === 'OUTFLOW' && eqDec(have.amount, want.amount) && (have.currency ?? null) === data.currency
    && eqDec(have.inrEquivalent, want.inrEquivalent) && have.description === data.description;
  if (same) return false;
  await prisma.cashFlow.update({ where: { id: have.id }, data });
  return true;
}

export async function syncShareLinks(expenseId: string): Promise<void> {
  await runAsSystem(async () => {
    const links = await prisma.splitShareLink.findMany({ where: { expenseId } });
    for (const l of links) await syncOne(l);
  });
}

/**
 * Called after expense writes commit. Deliberate catch-and-log: a sync failure
 * must not undo the user's already-committed edit; the nightly
 * reconcileAllShareLinks repairs any drift.
 */
export async function syncShareLinksSafely(expenseId: string): Promise<void> {
  try {
    await syncShareLinks(expenseId);
  } catch (err) {
    logger.error({ err, expenseId }, '[split] share-link sync failed; nightly reconcile will repair');
  }
}

export async function reconcileAllShareLinks(): Promise<{ checked: number; fixed: number }> {
  return runAsSystem(async () => {
    const links = await prisma.splitShareLink.findMany();
    let fixed = 0;
    for (const l of links) if (await syncOne(l)) fixed += 1;
    return { checked: links.length, fixed };
  });
}

async function toDto(userId: string, expenseId: string): Promise<SplitShareLinkDto> {
  const r = await myShare(expenseId, userId);
  if (!r) throw new NotFoundError('Expense not found');
  const link = await prisma.splitShareLink.findUnique({ where: { expenseId_userId: { expenseId, userId } } });
  return {
    expenseId, enabled: !!link, portfolioId: link?.portfolioId ?? null, cashFlowId: link?.cashFlowId || null,
    myShare: serializeMoney(r.share), currency: r.e.group.baseCurrency,
  };
}

export async function getShareLink(userId: string, expenseId: string): Promise<SplitShareLinkDto> {
  const e = await prisma.splitExpense.findUnique({ where: { id: expenseId }, select: { groupId: true } });
  if (!e) throw new NotFoundError('Expense not found');
  await requireMember(userId, e.groupId);
  return toDto(userId, expenseId);
}

export async function setShareLink(userId: string, expenseId: string, input: { enabled: boolean; portfolioId?: string | null }): Promise<SplitShareLinkDto> {
  const e = await prisma.splitExpense.findUnique({ where: { id: expenseId }, select: { groupId: true } });
  if (!e) throw new NotFoundError('Expense not found');
  await requireMember(userId, e.groupId);
  const existing = await prisma.splitShareLink.findUnique({ where: { expenseId_userId: { expenseId, userId } } });

  if (!input.enabled) {
    if (existing) {
      await runAsSystem(async () => {
        if (existing.cashFlowId) await prisma.cashFlow.deleteMany({ where: { id: existing.cashFlowId } });
        await prisma.splitShareLink.delete({ where: { id: existing.id } });
      });
    }
    return toDto(userId, expenseId);
  }

  const r = await myShare(expenseId, userId);
  if (!r || r.share.lte(0)) throw new BadRequestError("SPLIT_NOT_IN_SPLIT: you're not part of this expense");
  const settings = await prisma.splitSettings.findUnique({ where: { userId }, select: { defaultPortfolioId: true } });
  const portfolioId = input.portfolioId ?? existing?.portfolioId ?? settings?.defaultPortfolioId ?? null;
  const owned = portfolioId ? await prisma.portfolio.findFirst({ where: { id: portfolioId, userId }, select: { id: true } }) : null;
  if (!owned) throw new BadRequestError('Pick one of your portfolios for Cash Activity');

  const link = existing
    ? await prisma.splitShareLink.update({ where: { id: existing.id }, data: { portfolioId: owned.id } })
    : await prisma.splitShareLink.create({ data: { expenseId, userId, portfolioId: owned.id, cashFlowId: '' } });
  await runAsSystem(() => syncOne(link));
  return toDto(userId, expenseId);
}
