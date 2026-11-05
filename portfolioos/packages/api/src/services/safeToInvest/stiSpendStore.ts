import { Decimal } from 'decimal.js';
import { BASKET_CATEGORIES, SPENDING_CONSENT_VERSION } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { classifyCredit, type CreditExclusion } from './creditClassifier.js';
import { dateMonth, monthStart, shiftMonth } from './safeToInvestMath.js';

/**
 * Safe to Invest read from the spending store (SpendTxn and its monthly
 * totals), the same data Personal Inflation uses, so both pages agree:
 * duplicates across sources and own-account transfers are already removed,
 * credits and debits are categorised, one-offs are set aside and refunds
 * netted. Used only for users who agreed to the spending notice and whose
 * store has rows in the window; everyone else keeps the alert-based figures.
 */

const ZERO = new Decimal(0);
const dec = (v: { toString(): string }) => new Decimal(v.toString());

/** Debit categories that are spending money, for the buffer. */
const EVERYDAY = new Set<string>([...BASKET_CATEGORIES, 'uncategorised', 'cash_withdrawal']);

/** Why a credit is not income, from its store row. Null = income. */
export function storeCreditVerdict(row: {
  category: string | null;
  excludeReason: string | null;
  duplicateOfId: string | null;
  currency: string;
  counterparty: string | null;
  narration: string | null;
}): CreditExclusion | null {
  if (row.duplicateOfId) return 'duplicate';
  if (row.currency !== 'INR') return 'foreign_currency';
  if (row.excludeReason === 'self_transfer' || row.category === 'self_transfer') return 'own_transfer';
  if (row.category === 'refund') return 'refund';
  if (row.category === 'investment') return 'investment';
  if (row.category !== null && row.category !== 'income') return 'not_income';
  // The categoriser has no loan-payout rule; keep Safe to Invest's.
  const loan = classifyCredit({ counterparty: row.counterparty, parserNotes: row.narration, instrumentName: null, currency: 'INR' }, []);
  return loan === 'loan' ? 'loan' : null;
}

export interface StoreMonths {
  /** Credits per month: sum of those counted, how many there were, how many counted. */
  credits: Map<string, { sum: Decimal; credits: number; included: number }>;
  /** Everyday spend per month, less fixed payments already listed as fixed costs. */
  spend: Map<string, Decimal>;
  /** Canonical event id → verdict, for the month drill-down. */
  verdictByEvent: Map<string, CreditExclusion | null>;
}

export async function hasSpendingConsent(userId: string): Promise<boolean> {
  const p = await prisma.inflationProfile.findUnique({
    where: { userId },
    select: { spendingConsentAt: true, spendingConsentVersion: true },
  });
  return !!p?.spendingConsentAt && p.spendingConsentVersion === SPENDING_CONSENT_VERSION;
}

/**
 * Store-based months for `months` (plus the current month for credits), or
 * null when the store should not be used. `decided` holds the user's own
 * include/exclude choices, keyed by canonical event id.
 */
export async function loadStoreMonths(
  userId: string,
  months: readonly string[],
  decided: ReadonlyMap<string, boolean>,
): Promise<StoreMonths | null> {
  if (!(await hasSpendingConsent(userId))) return null;
  const from = monthStart(months[0]!);
  const to = monthStart(shiftMonth(months[months.length - 1]!, 2)); // through the current month
  const credits = await prisma.spendTxn.findMany({
    where: { userId, direction: 'CREDIT', txnDate: { gte: from, lt: to } },
    select: {
      source: true, sourceRef: true, txnDate: true, amount: true, category: true, excludeReason: true,
      duplicateOfId: true, currency: true, counterparty: true, narration: true,
    },
  });
  const anyDebit = await prisma.spendTxn.findFirst({ where: { userId, direction: 'DEBIT', txnDate: { gte: from, lt: to } }, select: { id: true } });
  if (credits.length === 0 && !anyDebit) return null;

  const out: StoreMonths = { credits: new Map(), spend: new Map(), verdictByEvent: new Map() };
  const touch = (m: string) => {
    let c = out.credits.get(m);
    if (!c) out.credits.set(m, (c = { sum: ZERO, credits: 0, included: 0 }));
    return c;
  };

  for (const r of credits) {
    const verdict = storeCreditVerdict(r);
    const eventId = r.source === 'canonical_event' ? r.sourceRef : null;
    if (eventId) out.verdictByEvent.set(eventId, verdict);
    const c = touch(dateMonth(r.txnDate));
    c.credits += 1;
    // A duplicate is counted through its other row, whatever the user chose for it.
    const include = verdict !== 'duplicate' && ((eventId ? decided.get(eventId) : undefined) ?? verdict === null);
    if (include) {
      c.sum = c.sum.plus(dec(r.amount));
      c.included += 1;
    }
  }

  // Everyday spend from the monthly totals (one-offs out, refunds netted).
  const [totals, cardPurchases, fixedItems] = await Promise.all([
    prisma.spendMonthlyCategory.findMany({
      where: { userId, month: { in: [...months] } },
      select: { month: true, category: true, amount: true },
    }),
    prisma.spendTxn.count({ where: { userId, eventType: 'CARD_PURCHASE', duplicateOfId: null, txnDate: { gte: from, lt: to } } }),
    prisma.inflationBasketItem.findMany({
      where: { userId, isFixed: true, matchedSeriesId: { not: null } },
      select: { matchedSeriesId: true },
    }),
  ]);
  // Card bills stand in for card spending only when the card's own purchases are not seen.
  const everyday = (c: string) => EVERYDAY.has(c) || (c === 'credit_card_bill' && cardPurchases === 0);
  for (const t of totals) {
    if (!everyday(t.category)) continue;
    touch(t.month);
    out.spend.set(t.month, (out.spend.get(t.month) ?? ZERO).plus(dec(t.amount)));
  }

  // A fixed expense the user listed (rent) that the bank also shows is
  // already in fixed costs: take its actual payments out of that month.
  const seriesIds = [...new Set(fixedItems.map((i) => i.matchedSeriesId!))];
  if (seriesIds.length > 0) {
    const paid = await prisma.spendTxn.findMany({
      where: { userId, seriesId: { in: seriesIds }, direction: 'DEBIT', duplicateOfId: null, excludeReason: null, txnDate: { gte: from, lt: to } },
      select: { txnDate: true, amount: true },
    });
    for (const p of paid) {
      const m = dateMonth(p.txnDate);
      const s = out.spend.get(m);
      if (s) out.spend.set(m, Decimal.max(ZERO, s.minus(dec(p.amount))));
    }
  }
  return out;
}
