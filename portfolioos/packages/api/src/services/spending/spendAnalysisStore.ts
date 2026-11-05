import { Decimal } from 'decimal.js';
import { prisma } from '../../lib/prisma.js';
import { isOutsideBasket } from '../personalInflation/personalInflationMath.js';
import { payeeKey } from './categorise.js';
import {
  detectSeries,
  findOneOffs,
  matchManualItems,
  matchRefunds,
  monthlyTotals,
  type AnalysisRow,
} from './spendAnalysis.js';

/**
 * Writes the step-5 analysis for one user: recurring series, one-off and
 * refund marks on SpendTxn, monthly totals per category, and which manual
 * Personal Inflation items a bank series already covers. Everything here is
 * derived and rebuilt in full; manual items only get `matchedSeriesId` set or
 * cleared, never their amounts or anything the user typed.
 */

export interface AnalysisResult {
  series: number;
  oneOffs: number;
  refunds: number;
  months: number;
  matchedItems: number;
}

const dec = (v: { toString(): string }) => new Decimal(v.toString());

export async function analyseSpending(userId: string): Promise<AnalysisResult> {
  const txns = await prisma.spendTxn.findMany({
    where: { userId },
    select: {
      id: true, txnDate: true, amount: true, direction: true, category: true, counterparty: true, narration: true,
      duplicateOfId: true, excludeReason: true, seriesId: true, isOneOff: true, refundOfId: true,
    },
  });
  const rows: AnalysisRow[] = txns.map((t) => ({
    id: t.id,
    txnDate: t.txnDate,
    amount: dec(t.amount),
    direction: t.direction,
    category: t.category,
    payeeKey: payeeKey(t.counterparty, t.narration),
    ignored: t.duplicateOfId !== null || t.excludeReason !== null,
  }));

  // Recurring series: upsert by (payee, cadence), drop the ones no longer seen.
  const detected = detectSeries(rows);
  const seriesIdOf = new Map<string, string>();
  const keepIds: string[] = [];
  for (const s of detected) {
    const data = {
      category: s.category, firstSeen: s.firstSeen, lastSeen: s.lastSeen, occurrences: s.occurrences,
      latestAmount: s.latestAmount.toFixed(2), isFixed: s.isFixed,
    };
    const row = await prisma.spendRecurringSeries.upsert({
      where: { userId_payeeKey_cadence: { userId, payeeKey: s.payeeKey, cadence: s.cadence } },
      create: { userId, payeeKey: s.payeeKey, cadence: s.cadence, ...data },
      update: data,
      select: { id: true },
    });
    keepIds.push(row.id);
    for (const m of s.memberIds) seriesIdOf.set(m, row.id);
  }
  await prisma.spendRecurringSeries.deleteMany({ where: { userId, id: { notIn: keepIds } } });

  const oneOffs = findOneOffs(rows, new Set(seriesIdOf.keys()));
  const refundOf = matchRefunds(rows);

  for (const t of txns) {
    const want = { seriesId: seriesIdOf.get(t.id) ?? null, isOneOff: oneOffs.has(t.id), refundOfId: refundOf.get(t.id) ?? null };
    if (t.seriesId !== want.seriesId || t.isOneOff !== want.isOneOff || t.refundOfId !== want.refundOfId) {
      await prisma.spendTxn.update({ where: { id: t.id }, data: want });
    }
  }

  const totals = monthlyTotals(rows, oneOffs, refundOf);
  await prisma.spendMonthlyCategory.deleteMany({ where: { userId } });
  if (totals.length > 0) {
    await prisma.spendMonthlyCategory.createMany({
      data: totals.map((t) => ({
        userId, month: t.month, category: t.category, amount: t.amount.toFixed(2),
        oneOffAmount: t.oneOffAmount.toFixed(2), txnCount: t.count,
      })),
    });
  }

  // Decision 1: which manual expenses a recurring bank payment already covers.
  const items = await prisma.inflationBasketItem.findMany({
    where: { userId },
    select: { id: true, divisionCode: true, amount: true, frequency: true, sourceRef: true, rateMode: true, customRate: true, matchedSeriesId: true },
  });
  const inBasket = items.filter(
    (i) => !isOutsideBasket({ sourceRef: i.sourceRef, rateMode: i.rateMode, customRate: i.customRate ? dec(i.customRate) : null }),
  );
  const seriesById = new Map(detected.map((s, idx) => [keepIds[idx]!, s]));
  const matches = matchManualItems(
    inBasket.map((i) => ({ id: i.id, divisionCode: i.divisionCode, amount: dec(i.amount), frequency: i.frequency })),
    [...seriesById].map(([key, s]) => ({ key, category: s.category, cadence: s.cadence, latestAmount: s.latestAmount })),
  );
  for (const i of items) {
    const want = matches.get(i.id) ?? null;
    if (i.matchedSeriesId !== want) {
      await prisma.inflationBasketItem.update({ where: { id: i.id }, data: { matchedSeriesId: want } });
    }
  }

  return { series: detected.length, oneOffs: oneOffs.size, refunds: refundOf.size, months: new Set(totals.map((t) => t.month)).size, matchedItems: matches.size };
}
