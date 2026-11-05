import { Decimal } from 'decimal.js';
import { prisma } from '../../lib/prisma.js';
import {
  bankBasis,
  categoryDivisionMap,
  engineParams,
  windowMonths,
  type BankBasis,
  type EngineParams,
  type SeriesPayments,
} from './pirEngine.js';

/**
 * Reads what the rate engine needs from the derived spending store
 * (SpendMonthlyCategory, SpendRecurringSeries, SpendTxn) and runs it. Never
 * touches raw files or the user's manual items. Runs in the user's context.
 */

export const CATEGORY_MAP_SETTING = 'personalInflation.categoryCpiMap';
export const ENGINE_SETTING = 'personalInflation.engine';

const dec = (v: { toString(): string }) => new Decimal(v.toString());
const monthStart = (m: string) => new Date(`${m}-01T00:00:00Z`);
const monthAfter = (m: string) => {
  const d = monthStart(m);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
};

export interface LoadedBankBasis extends BankBasis {
  params: EngineParams;
}

/** The bank-based picture, or null when the window holds no spending at all. */
export async function loadBankBasis(
  userId: string,
  cpi: ReadonlyMap<string, Decimal>,
  now: Date = new Date(),
): Promise<LoadedBankBasis | null> {
  const [mapRow, paramsRow] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: CATEGORY_MAP_SETTING } }),
    prisma.appSetting.findUnique({ where: { key: ENGINE_SETTING } }),
  ]);
  const params = engineParams(paramsRow?.value);
  const current = windowMonths(now, params.windowMonths);
  const previous = windowMonths(now, params.windowMonths, params.windowMonths);
  const from = monthStart(current[0]!);
  const to = monthAfter(current[current.length - 1]!);
  const prevFrom = monthStart(previous[0]!);

  const months = await prisma.spendMonthlyCategory.findMany({
    where: { userId, month: { in: current } },
    select: { month: true, category: true, amount: true },
  });
  if (!months.some((m) => dec(m.amount).greaterThan(0))) return null;

  const counted = { userId, duplicateOfId: null, excludeReason: null } as const;
  const [fixedSeries, incomeRows, cardPurchases] = await Promise.all([
    prisma.spendRecurringSeries.findMany({
      where: { userId, isFixed: true },
      select: { id: true, payeeKey: true, category: true, cadence: true, isFixed: true, acceptOwnRate: true },
    }),
    prisma.spendTxn.findMany({
      where: { ...counted, direction: 'CREDIT', category: 'income', txnDate: { gte: from, lt: to } },
      select: { txnDate: true },
    }),
    prisma.spendTxn.count({ where: { ...counted, eventType: 'CARD_PURCHASE', txnDate: { gte: from, lt: to } } }),
  ]);

  const payments = fixedSeries.length === 0
    ? []
    : await prisma.spendTxn.findMany({
        where: { ...counted, direction: 'DEBIT', seriesId: { in: fixedSeries.map((s) => s.id) }, txnDate: { gte: prevFrom, lt: to } },
        select: { seriesId: true, txnDate: true, amount: true },
      });
  const series: SeriesPayments[] = fixedSeries.map((s) => ({ ...s, current: [], previous: [] }));
  const byId = new Map(series.map((s) => [s.id, s]));
  for (const p of payments) {
    const s = byId.get(p.seriesId!);
    if (!s) continue;
    (p.txnDate >= from ? s.current : s.previous).push(dec(p.amount));
  }

  const basis = bankBasis({
    months: months.map((m) => ({ month: m.month, category: m.category, amount: dec(m.amount) })),
    series,
    incomeMonths: new Set(incomeRows.map((r) => r.txnDate.toISOString().slice(0, 7))).size,
    cardPurchases,
    cpi,
    categoryDivision: categoryDivisionMap(mapRow?.value),
    params,
  });
  return { ...basis, params };
}
