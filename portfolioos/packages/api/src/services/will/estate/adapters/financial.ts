import { Decimal, istCalendarDate, toAmount2 } from '@everypaisa/shared';
import { prisma } from '../../../../lib/prisma.js';
import { ASSET_CLASS_LABELS } from '../../../analytics/dashboard.service.js';
import { clip, SOLE, type EstateAdapter, type EstateCandidate } from '../types.js';

const ZERO = new Decimal(0);

export const CASH_MAY_DUPLICATE_NOTE = 'May duplicate your bank accounts - include it only if it is separate cash';
const dec = (v: { toString(): string } | null | undefined): Decimal | null => (v == null ? null : new Decimal(v.toString()));

/** One item per (portfolio, asset class); PF-backed holdings are left to the PF adapter. */
export const holdingsAdapter: EstateAdapter = {
  id: 'holdings',
  version: '1',
  async collect({ userId, today }) {
    const pf = await prisma.providentFundAccount.findMany({ where: { userId }, select: { assetKey: true } });
    // A bank statement import mirrors each account as a CASH holding (see healthScore liquidParts),
    // so with a funded bank account on file (the same accounts bankAccountsAdapter lists)
    // the CASH groups are offered but left out by default.
    const fundedBank = await prisma.bankAccount.findFirst({
      where: { userId, status: { not: 'CLOSED' }, accountType: { not: 'OD' }, currentBalance: { gt: 0 } },
      select: { id: true },
    });
    const pfKeys = new Set(pf.map((p) => p.assetKey));
    const rows = await prisma.holdingProjection.findMany({
      where: { portfolio: { userId } },
      select: {
        portfolioId: true, assetKey: true, assetClass: true, currentValue: true, totalCost: true, quantity: true,
        portfolio: { select: { name: true } },
      },
    });
    const groups = new Map<string, { label: string; value: Decimal; cash: boolean }>();
    for (const r of rows) {
      if (pfKeys.has(r.assetKey)) continue;
      // Same effective value as the dashboard: live value, else cost.
      const value = dec(r.currentValue) ?? dec(r.totalCost) ?? ZERO;
      if (value.isZero() && new Decimal(r.quantity.toString()).isZero()) continue;
      const key = `holdings:${r.portfolioId}:${r.assetClass}`;
      const g = groups.get(key) ?? { label: `${ASSET_CLASS_LABELS[r.assetClass] ?? r.assetClass} - ${r.portfolio.name}`, value: ZERO, cash: r.assetClass === 'CASH' };
      g.value = g.value.plus(value);
      groups.set(key, g);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sourceKey, g]): EstateCandidate => {
        const negative = g.value.isNegative();
        const base = {
          sourceKey, side: 'ASSET' as const, kind: 'HOLDING' as const, label: clip(g.label, 160), ref: null,
          value: toAmount2(negative ? ZERO : g.value), valueAsOf: today, ownership: SOLE,
        };
        if (g.cash && fundedBank) {
          return { ...base, review: 'EXCLUDED', note: CASH_MAY_DUPLICATE_NOTE };
        }
        return {
          ...base,
          review: negative ? 'NEEDS_REVIEW' : 'CONFIRMED',
          note: negative ? 'These positions are worth less than nothing today (for example open derivatives). Check them.' : null,
        };
      });
  },
};

/** Open accounts; an overdraft is a debt, not an asset, so it is skipped. */
export const bankAccountsAdapter: EstateAdapter = {
  id: 'bankAccounts',
  version: '1',
  async collect({ userId }) {
    const rows = await prisma.bankAccount.findMany({
      where: { userId, status: { not: 'CLOSED' }, accountType: { not: 'OD' } },
      orderBy: [{ bankName: 'asc' }, { last4: 'asc' }],
      select: { id: true, bankName: true, accountType: true, last4: true, currentBalance: true, balanceAsOf: true, jointHolders: true, nomineeName: true },
    });
    return rows.map((b): EstateCandidate => {
      const balance = dec(b.currentBalance);
      const joint = b.jointHolders.length > 0;
      return {
        sourceKey: `bank:${b.id}`, side: 'ASSET', kind: 'BANK_ACCOUNT',
        label: clip(`${b.bankName} ${b.accountType.toLowerCase()} account`, 160),
        ref: `XXXX${b.last4}`,
        value: toAmount2(balance && balance.greaterThan(0) ? balance : ZERO),
        valueAsOf: b.balanceAsOf ? istCalendarDate(b.balanceAsOf) : null,
        ownership: joint
          ? { type: 'JOINT', sharePct: new Decimal(100).dividedBy(b.jointHolders.length + 1).toFixed(2, Decimal.ROUND_DOWN) }
          : SOLE,
        review: joint || !balance ? 'NEEDS_REVIEW' : 'CONFIRMED',
        note: b.nomineeName ? 'A nominee is registered for this account.' : null,
      };
    });
  },
};

export const pfAccountsAdapter: EstateAdapter = {
  id: 'pfAccounts',
  version: '1',
  async collect({ userId, today }) {
    const rows = await prisma.providentFundAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, type: true, institution: true, identifierLast4: true, currentBalance: true, assetKey: true },
    });
    if (rows.length === 0) return [];
    const holdings = await prisma.holdingProjection.findMany({
      where: { portfolio: { userId }, assetKey: { in: rows.map((r) => r.assetKey) } },
      select: { assetKey: true, currentValue: true, totalCost: true },
    });
    const fromHoldings = new Map<string, Decimal>();
    for (const h of holdings) {
      fromHoldings.set(h.assetKey, (fromHoldings.get(h.assetKey) ?? ZERO).plus(dec(h.currentValue) ?? dec(h.totalCost) ?? ZERO));
    }
    return rows.map((r): EstateCandidate => {
      const value = dec(r.currentBalance) ?? fromHoldings.get(r.assetKey) ?? null;
      return {
        sourceKey: `pf:${r.id}`, side: 'ASSET', kind: 'PROVIDENT_FUND',
        label: `${r.type} account - ${r.institution}`, ref: `XXXX${r.identifierLast4}`,
        value: toAmount2(value ?? ZERO), valueAsOf: today, ownership: SOLE,
        review: value ? 'CONFIRMED' : 'NEEDS_REVIEW',
        note: 'A PF nominee may receive this directly - check your nomination.',
      };
    });
  },
};
