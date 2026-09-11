/**
 * Reads everything the Tally export needs from the database, into
 * `TallySources` (tallyBook.ts). The rules that turn rows into sources are
 * pure functions exported for tests; `loadTallySources` only fetches.
 *
 * Double counting is the thing to avoid here:
 *  - Marking rent received, and every money-moving rent-ledger entry, also
 *    writes a CashFlow. Rent is taken from the rent ledger, so those linked
 *    CashFlows are left out.
 *  - A premium imported from an insurance statement is also an insurance
 *    Transaction (PremiumPayment.sourceTransactionId). The premium is kept;
 *    the linked Transaction is left out.
 */
import { Decimal } from 'decimal.js';
import { prisma } from '../../lib/prisma.js';
import type { TallyIssue, TallySources } from './tallyBook.js';

type Num = { toString(): string };

const d = (v: Num | null | undefined): Decimal => (v === null || v === undefined ? new Decimal(0) : new Decimal(v.toString()));
const iso = (date: Date): string => date.toISOString().slice(0, 10);
const title = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// ─── Trades ──────────────────────────────────────────────────────

export interface TradeRow {
  id: string;
  assetClass: string;
  transactionType: string;
  tradeDate: Date;
  quantity: Num;
  price: Num;
  grossAmount: Num;
  brokerage: Num;
  stt: Num;
  stampDuty: Num;
  exchangeCharges: Num;
  gst: Num;
  sebiCharges: Num;
  otherCharges: Num;
  currency: string | null;
  fxRateAtTrade: Num | null;
  assetKey: string | null;
  stockId: string | null;
  fundId: string | null;
  assetName: string | null;
  stock: { name: string } | null;
  fund: { schemeName: string } | null;
  capitalGains: Array<{ buyAmount: Num; gainLoss: Num; capitalGainType: string }>;
}

function holdingKeyOf(t: TradeRow): string {
  if (t.assetKey) return t.assetKey;
  if (t.stockId) return `stock:${t.stockId}`;
  if (t.fundId) return `fund:${t.fundId}`;
  return `name:${(t.assetName ?? '').trim().toLowerCase()}`;
}

function holdingNameOf(t: TradeRow): string {
  return t.stock?.name ?? t.fund?.schemeName ?? (t.assetName?.trim() || 'Unnamed holding');
}

/** One Transaction as a trade in rupees, or the reason it was left out. */
export function mapTrade(t: TradeRow): { trade: TallySources['trades'][number] } | { skip: string } {
  const name = holdingNameOf(t);
  const foreign = t.currency !== null && t.currency.toUpperCase() !== 'INR';
  if (foreign && t.fxRateAtTrade === null) {
    return { skip: `${name} on ${iso(t.tradeDate)} is in ${t.currency} with no exchange rate on file, so it was left out.` };
  }
  const rate = foreign ? d(t.fxRateAtTrade) : new Decimal(1);
  const charges = [t.brokerage, t.stt, t.stampDuty, t.exchangeCharges, t.gst, t.sebiCharges, t.otherCharges].reduce<Decimal>(
    (s, c) => s.plus(d(c)),
    new Decimal(0),
  );

  // Capital-gains records carry the cost and the gain. For a foreign trade
  // their currency is not certain, so the sale is booked at its value and the
  // export says so, rather than risk a wrong conversion.
  const gains = foreign ? [] : t.capitalGains;
  const sumOf = (rows: typeof gains, pick: (g: (typeof gains)[number]) => Num) =>
    rows.reduce<Decimal>((s, g) => s.plus(d(pick(g))), new Decimal(0));
  const longTerm = gains.filter((g) => g.capitalGainType === 'LONG_TERM');
  const shortTerm = gains.filter((g) => g.capitalGainType !== 'LONG_TERM');

  return {
    trade: {
      id: t.id,
      date: iso(t.tradeDate),
      kind: t.transactionType,
      assetClass: t.assetClass,
      holdingKey: holdingKeyOf(t),
      holdingName: name,
      quantity: d(t.quantity).toString(),
      price: d(t.price).times(rate).toString(),
      gross: d(t.grossAmount).times(rate).toString(),
      charges: charges.times(rate).toString(),
      cost: gains.length > 0 ? sumOf(gains, (g) => g.buyAmount).toString() : null,
      shortTermGain: sumOf(shortTerm, (g) => g.gainLoss).toString(),
      longTermGain: sumOf(longTerm, (g) => g.gainLoss).toString(),
    },
  };
}

// ─── Cards ───────────────────────────────────────────────────────

/** A statement for "YYYY-MM", dated on the card's statement day (clamped to the month). */
export function cardStatementDate(forMonth: string, statementDay: number): string {
  const [y, m] = forMonth.split('-').map((s) => Number.parseInt(s, 10)) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(Math.max(statementDay, 1), lastDay);
  return `${forMonth}-${String(day).padStart(2, '0')}`;
}

// ─── Rent ────────────────────────────────────────────────────────

export interface RentLedgerRow {
  id: string;
  tenancyId: string;
  entryType: string;
  amount: Num;
  entryDate: Date;
  property: string;
  tenant: string;
}

export interface RentReceiptRow {
  id: string;
  tenancyId: string;
  receivedAmount: Num | null;
  receivedOn: Date | null;
  property: string;
  tenant: string;
}

const RENT_MONEY = new Set(['PAYMENT', 'DEPOSIT', 'DEPOSIT_REFUND']);

/**
 * Money moved for rent. The rent ledger is the record; a tenancy that has no
 * ledger payments at all (legacy data never backfilled into the ledger) falls
 * back to its received rent receipts, so nothing is lost or counted twice.
 * Discounts, late fees and other charges move no money and are left out.
 */
export function rentFromLedger(ledger: RentLedgerRow[], receipts: RentReceiptRow[]): TallySources['rent'] {
  const out: TallySources['rent'] = [];
  const hasLedgerPayments = new Set(ledger.filter((e) => e.entryType === 'PAYMENT').map((e) => e.tenancyId));
  for (const e of ledger) {
    if (!RENT_MONEY.has(e.entryType)) continue;
    out.push({
      id: e.id,
      date: iso(e.entryDate),
      property: e.property,
      tenant: e.tenant,
      kind: e.entryType as 'PAYMENT' | 'DEPOSIT' | 'DEPOSIT_REFUND',
      amount: d(e.amount).toString(),
    });
  }
  for (const r of receipts) {
    if (hasLedgerPayments.has(r.tenancyId) || r.receivedAmount === null || r.receivedOn === null) continue;
    const amount = d(r.receivedAmount);
    if (!amount.greaterThan(0)) continue;
    out.push({ id: r.id, date: iso(r.receivedOn), property: r.property, tenant: r.tenant, kind: 'PAYMENT', amount: amount.toString() });
  }
  return out;
}

// ─── Loader ──────────────────────────────────────────────────────

const LOAN_TYPE_LABEL: Record<string, string> = {
  HOME: 'Home Loan',
  CAR: 'Car Loan',
  PERSONAL: 'Personal Loan',
  EDUCATION: 'Education Loan',
  BUSINESS: 'Business Loan',
  GOLD: 'Gold Loan',
  LAS: 'Loan Against Securities',
  OTHER: 'Loan',
};

function lastFour(value: string | null): string {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? ` ${digits.slice(-4)}` : '';
}

export async function loadTallySources(userId: string): Promise<{ sources: TallySources; issues: TallyIssue[] }> {
  const tenancyNames = { select: { tenantName: true, property: { select: { name: true } } } } as const;
  const [banks, cashFlows, transactions, premiums, loans, cards, ledgerRows, receipts, expenses] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, bankName: true, accountType: true, last4: true, currentBalance: true },
    }),
    prisma.cashFlow.findMany({
      where: { portfolio: { userId } },
      orderBy: { date: 'asc' },
      select: { id: true, date: true, type: true, amount: true, description: true, currency: true, inrEquivalent: true, bankAccountId: true },
    }),
    prisma.transaction.findMany({
      where: { portfolio: { userId } },
      orderBy: { tradeDate: 'asc' },
      select: {
        id: true,
        assetClass: true,
        transactionType: true,
        tradeDate: true,
        quantity: true,
        price: true,
        grossAmount: true,
        brokerage: true,
        stt: true,
        stampDuty: true,
        exchangeCharges: true,
        gst: true,
        sebiCharges: true,
        otherCharges: true,
        currency: true,
        fxRateAtTrade: true,
        assetKey: true,
        stockId: true,
        fundId: true,
        assetName: true,
        stock: { select: { name: true } },
        fund: { select: { schemeName: true } },
        capitalGains: { select: { buyAmount: true, gainLoss: true, capitalGainType: true } },
      },
    }),
    prisma.premiumPayment.findMany({
      where: { policy: { userId } },
      orderBy: { paidOn: 'asc' },
      select: { id: true, paidOn: true, amount: true, sourceTransactionId: true, policy: { select: { insurer: true, type: true, planName: true } } },
    }),
    prisma.loan.findMany({
      where: { userId },
      orderBy: { disbursementDate: 'asc' },
      select: {
        id: true,
        lenderName: true,
        loanType: true,
        accountNumber: true,
        principalAmount: true,
        disbursementDate: true,
        payments: {
          orderBy: { paidOn: 'asc' },
          select: { id: true, paidOn: true, amount: true, principalPart: true, interestPart: true, paymentType: true },
        },
      },
    }),
    prisma.creditCard.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        issuerBank: true,
        cardName: true,
        last4: true,
        statementDay: true,
        statements: { select: { id: true, forMonth: true, statementAmount: true, paidAmount: true, paidOn: true } },
      },
    }),
    prisma.rentLedgerEntry.findMany({
      where: { tenancy: { property: { userId } } },
      orderBy: { entryDate: 'asc' },
      select: { id: true, tenancyId: true, entryType: true, amount: true, entryDate: true, cashFlowId: true, tenancy: tenancyNames },
    }),
    prisma.rentReceipt.findMany({
      where: { tenancy: { property: { userId } }, receivedAmount: { not: null } },
      orderBy: { receivedOn: 'asc' },
      select: { id: true, tenancyId: true, receivedAmount: true, receivedOn: true, cashFlowId: true, tenancy: tenancyNames },
    }),
    prisma.propertyExpense.findMany({
      where: { property: { userId } },
      orderBy: { paidOn: 'asc' },
      select: { id: true, expenseType: true, amount: true, paidOn: true, description: true, property: { select: { name: true } } },
    }),
  ]);

  const issues: TallyIssue[] = [];

  const rentCashFlows = new Set(
    [...ledgerRows, ...receipts].map((r) => r.cashFlowId).filter((id): id is string => id !== null),
  );
  const premiumTransactions = new Set(premiums.map((p) => p.sourceTransactionId).filter((id): id is string => id !== null));

  const trades: TallySources['trades'] = [];
  for (const t of transactions) {
    if (premiumTransactions.has(t.id)) continue;
    const mapped = mapTrade(t);
    if ('skip' in mapped) issues.push({ severity: 'warning', message: mapped.skip });
    else trades.push(mapped.trade);
  }

  const flows: TallySources['cashFlows'] = [];
  for (const cf of cashFlows) {
    if (rentCashFlows.has(cf.id)) continue;
    const foreign = cf.currency !== null && cf.currency.toUpperCase() !== 'INR';
    if (foreign && cf.inrEquivalent === null) {
      issues.push({
        severity: 'warning',
        message: `A ${cf.currency} cash movement on ${iso(cf.date)} has no rupee value on file, so it was left out.`,
      });
      continue;
    }
    flows.push({
      id: cf.id,
      date: iso(cf.date),
      direction: cf.type === 'INFLOW' ? 'IN' : 'OUT',
      amount: d(foreign ? cf.inrEquivalent : cf.amount).abs().toString(),
      description: cf.description,
      bankAccountId: cf.bankAccountId,
    });
  }

  const sources: TallySources = {
    bankAccounts: banks.map((b) => ({
      id: b.id,
      label: `${b.bankName} ${title(b.accountType)}`,
      last4: b.last4,
      isOverdraft: b.accountType === 'OD',
      currentBalance: b.currentBalance === null ? null : b.currentBalance.toString(),
    })),
    cashFlows: flows,
    trades,
    loans: loans.map((l) => ({
      id: l.id,
      label: `${l.lenderName} ${LOAN_TYPE_LABEL[l.loanType] ?? 'Loan'}${lastFour(l.accountNumber)}`,
      principal: l.principalAmount.toString(),
      disbursedOn: iso(l.disbursementDate),
    })),
    loanPayments: loans.flatMap((l) =>
      l.payments.map((p) => ({
        id: p.id,
        loanId: l.id,
        date: iso(p.paidOn),
        amount: p.amount.toString(),
        principal: p.principalPart === null ? null : p.principalPart.toString(),
        interest: p.interestPart === null ? null : p.interestPart.toString(),
        kind: p.paymentType,
      })),
    ),
    cards: cards.map((c) => ({ id: c.id, label: `${c.issuerBank} ${c.cardName} ${c.last4}` })),
    cardStatements: cards.flatMap((c) =>
      c.statements.map((s) => ({
        id: s.id,
        cardId: c.id,
        date: cardStatementDate(s.forMonth, c.statementDay),
        statementAmount: s.statementAmount.toString(),
        paid: s.paidAmount === null ? null : s.paidAmount.toString(),
        paidOn: s.paidOn === null ? null : iso(s.paidOn),
      })),
    ),
    rent: rentFromLedger(
      ledgerRows.map((e) => ({
        id: e.id,
        tenancyId: e.tenancyId,
        entryType: e.entryType,
        amount: e.amount,
        entryDate: e.entryDate,
        property: e.tenancy.property.name,
        tenant: e.tenancy.tenantName,
      })),
      receipts.map((r) => ({
        id: r.id,
        tenancyId: r.tenancyId,
        receivedAmount: r.receivedAmount,
        receivedOn: r.receivedOn,
        property: r.tenancy.property.name,
        tenant: r.tenancy.tenantName,
      })),
    ),
    propertyExpenses: expenses.map((e) => ({
      id: e.id,
      date: iso(e.paidOn),
      property: e.property.name,
      description: e.description?.trim() || title(e.expenseType),
      amount: e.amount.toString(),
    })),
    premiums: premiums.map((p) => ({
      id: p.id,
      date: iso(p.paidOn),
      policy: `${p.policy.insurer} ${p.policy.planName?.trim() || title(p.policy.type)}`,
      amount: p.amount.toString(),
    })),
  };

  return { sources, issues };
}
