/**
 * The app's records, as a Tally book.
 *
 * Pure: the loader (tallySources.ts) reads the database into `TallySources`,
 * and everything here is a function of that — so every booking rule is tested
 * without a database.
 *
 * Rules:
 *  - One ledger per real account and holding, grouped under Tally's own
 *    groups (investments in sub-groups such as "Equity Shares").
 *  - Only Payment, Receipt, Journal and Contra vouchers.
 *  - Money whose bank the app does not know — trades, EMIs, rent, premiums —
 *    is booked against "Unallocated Funds", a Suspense ledger, rather than
 *    guessed. Bank-attributed cash flows use the real bank ledger.
 *  - Each bank ledger opens at the balance that makes Tally close on the
 *    balance the app shows; "Owner's Capital" takes the other side, so the
 *    opening trial balance balances.
 *  - Amounts are exact decimals, merged per ledger within a voucher and
 *    rounded to two places, with any rounding residue absorbed by the
 *    largest line so every voucher balances to the paisa.
 */
import { Decimal } from 'decimal.js';
import { financialYearFromDate, formatINR } from '@everypaisa/shared';
import { TallyNamer } from './tallyNames.js';

// ─── Output ──────────────────────────────────────────────────────

export type TallyVoucherType = 'Payment' | 'Receipt' | 'Journal' | 'Contra';

/** amount: positive = debit, negative = credit. */
export interface TallyVoucherLine {
  ledger: string;
  amount: Decimal;
}

export interface TallyVoucher {
  type: TallyVoucherType;
  number: string;
  /** YYYY-MM-DD */
  date: string;
  narration: string;
  lines: TallyVoucherLine[];
}

export interface TallyGroup {
  name: string;
  parent: string;
}

export interface TallyLedger {
  name: string;
  parent: string;
  /** Positive = debit, negative = credit. */
  openingBalance: Decimal;
  isCashOrBank: boolean;
}

export interface TallyYear {
  /** e.g. "2024-25" */
  fy: string;
  vouchers: TallyVoucher[];
}

export interface TallyIssue {
  severity: 'error' | 'warning';
  message: string;
}

export interface TallyBook {
  /** First day of the earliest financial year — the Tally company's "books beginning from". */
  booksBeginning: string;
  groups: TallyGroup[];
  ledgers: TallyLedger[];
  years: TallyYear[];
  issues: TallyIssue[];
}

// ─── Input ───────────────────────────────────────────────────────

/** Money as decimal strings, in rupees; dates YYYY-MM-DD. */
export interface TallySources {
  bankAccounts: Array<{ id: string; label: string; last4: string; isOverdraft: boolean; currentBalance: string | null }>;
  cashFlows: Array<{
    id: string;
    date: string;
    direction: 'IN' | 'OUT';
    amount: string;
    description: string | null;
    bankAccountId: string | null;
  }>;
  trades: Array<{
    id: string;
    date: string;
    /** The app's TransactionType. */
    kind: string;
    assetClass: string;
    holdingKey: string;
    holdingName: string;
    quantity: string;
    price: string;
    gross: string;
    charges: string;
    /** Cost of what was sold, from the capital-gains records; null when not yet computed. */
    cost: string | null;
    shortTermGain: string;
    longTermGain: string;
  }>;
  loans: Array<{ id: string; label: string; principal: string; disbursedOn: string }>;
  loanPayments: Array<{
    id: string;
    loanId: string;
    date: string;
    amount: string;
    principal: string | null;
    interest: string | null;
    /** EMI | PREPAYMENT | FORECLOSURE | PROCESSING_FEE */
    kind: string;
  }>;
  cards: Array<{ id: string; label: string }>;
  cardStatements: Array<{
    id: string;
    cardId: string;
    date: string;
    statementAmount: string;
    paid: string | null;
    paidOn: string | null;
  }>;
  rent: Array<{
    id: string;
    date: string;
    property: string;
    tenant: string;
    kind: 'PAYMENT' | 'DEPOSIT' | 'DEPOSIT_REFUND';
    amount: string;
  }>;
  propertyExpenses: Array<{ id: string; date: string; property: string; description: string; amount: string }>;
  premiums: Array<{ id: string; date: string; policy: string; amount: string }>;
}

export function emptyTallySources(): TallySources {
  return {
    bankAccounts: [],
    cashFlows: [],
    trades: [],
    loans: [],
    loanPayments: [],
    cards: [],
    cardStatements: [],
    rent: [],
    propertyExpenses: [],
    premiums: [],
  };
}

// ─── Chart ───────────────────────────────────────────────────────

const FIXED_LEDGERS = {
  unallocated: { name: 'Unallocated Funds', parent: 'Suspense A/c' },
  capital: { name: "Owner's Capital", parent: 'Capital Account' },
  unclassifiedIn: { name: 'Unclassified Receipts', parent: 'Suspense A/c' },
  unclassifiedOut: { name: 'Unclassified Payments', parent: 'Suspense A/c' },
  charges: { name: 'Brokerage & Charges', parent: 'Indirect Expenses' },
  stcg: { name: 'Short-term Capital Gains', parent: 'Indirect Incomes' },
  ltcg: { name: 'Long-term Capital Gains', parent: 'Indirect Incomes' },
  capitalLoss: { name: 'Capital Losses', parent: 'Indirect Expenses' },
  dividend: { name: 'Dividend Income', parent: 'Indirect Incomes' },
  interest: { name: 'Interest Income', parent: 'Indirect Incomes' },
  loanInterest: { name: 'Loan Interest', parent: 'Indirect Expenses' },
  loanCharges: { name: 'Loan Charges', parent: 'Indirect Expenses' },
  cardSpends: { name: 'Credit Card Spends', parent: 'Suspense A/c' },
  corporateAction: { name: 'Corporate Action Clearing', parent: 'Suspense A/c' },
} as const;
type FixedLedger = keyof typeof FIXED_LEDGERS;

/** Investment sub-groups by the app's AssetClass. */
const INVESTMENT_GROUPS: Array<{ name: string; parent: string; classes: string[] }> = [
  { name: 'Equity Shares', parent: 'Investments', classes: ['EQUITY', 'ETF'] },
  { name: 'Mutual Funds', parent: 'Investments', classes: ['MUTUAL_FUND'] },
  { name: 'Bonds & Debentures', parent: 'Investments', classes: ['BOND', 'GOVT_BOND', 'CORPORATE_BOND'] },
  { name: 'Fixed Deposits', parent: 'Deposits (Asset)', classes: ['FIXED_DEPOSIT', 'RECURRING_DEPOSIT'] },
  { name: 'Gold & Silver', parent: 'Investments', classes: ['PHYSICAL_GOLD', 'GOLD_BOND', 'GOLD_ETF', 'PHYSICAL_SILVER'] },
  { name: 'Crypto Assets', parent: 'Investments', classes: ['CRYPTOCURRENCY'] },
  { name: 'Foreign Investments', parent: 'Investments', classes: ['FOREIGN_EQUITY', 'FOREX_PAIR'] },
  { name: 'NPS', parent: 'Investments', classes: ['NPS'] },
  { name: 'Provident Funds', parent: 'Investments', classes: ['PPF', 'EPF'] },
  {
    name: 'Post Office Schemes',
    parent: 'Investments',
    classes: ['NSC', 'KVP', 'SCSS', 'SSY', 'POST_OFFICE_MIS', 'POST_OFFICE_RD', 'POST_OFFICE_TD', 'POST_OFFICE_SAVINGS'],
  },
  { name: 'REITs & InvITs', parent: 'Investments', classes: ['REIT', 'INVIT'] },
  { name: 'F&O Positions', parent: 'Current Assets', classes: ['FUTURES', 'OPTIONS'] },
];
const OTHER_INVESTMENTS = { name: 'Other Investments', parent: 'Investments', classes: [] as string[] };

function investmentGroupFor(assetClass: string) {
  return INVESTMENT_GROUPS.find((g) => g.classes.includes(assetClass)) ?? OTHER_INVESTMENTS;
}

const BUY_KINDS: Record<string, string> = {
  BUY: 'Buy',
  SIP: 'SIP',
  SWITCH_IN: 'Switch in',
  RIGHTS_ISSUE: 'Rights issue',
  DEPOSIT: 'Deposit',
};
const SELL_KINDS: Record<string, string> = {
  SELL: 'Sell',
  SWITCH_OUT: 'Switch out',
  REDEMPTION: 'Redemption',
  MATURITY: 'Maturity',
  WITHDRAWAL: 'Withdrawal',
};

const LOAN_PAYMENT_LABELS: Record<string, string> = {
  EMI: 'EMI',
  PREPAYMENT: 'Prepayment',
  FORECLOSURE: 'Foreclosure',
  PROCESSING_FEE: 'Processing fee',
};

// ─── Builder ─────────────────────────────────────────────────────

const ZERO = new Decimal(0);
const dec = (v: string | null | undefined): Decimal => (v ? new Decimal(v) : ZERO);
const rs = (v: string | Decimal) => `Rs. ${formatINR(v.toString(), { showSymbol: false })}`;
const qty = (v: string) => new Decimal(v).toString();

interface DraftLine {
  ledgerKey: string;
  amount: Decimal;
}

interface Draft {
  date: string;
  type: TallyVoucherType;
  narration: string;
  lines: DraftLine[];
}

interface LedgerSlot {
  name: string;
  parent: string;
  groupKey: string | null;
  isCashOrBank: boolean;
  opening: Decimal;
  used: boolean;
}

export function buildTallyBook(sources: TallySources, opts: { today?: string } = {}): TallyBook {
  const namer = new TallyNamer();
  const issues: TallyIssue[] = [];
  const ledgers = new Map<string, LedgerSlot>();
  const groups = new Map<string, TallyGroup>();
  const drafts: Draft[] = [];

  // Fixed names first, so a holding that happens to share one is the one renamed.
  for (const [key, def] of Object.entries(FIXED_LEDGERS)) namer.name(`fixed:${key}`, def.name);
  for (const g of [...INVESTMENT_GROUPS, OTHER_INVESTMENTS]) namer.name(`group:${g.name}`, g.name);

  function defineLedger(key: string, base: string, parent: string, extra: Partial<LedgerSlot> = {}): string {
    if (!ledgers.has(key)) {
      ledgers.set(key, {
        name: namer.name(key, base),
        parent,
        groupKey: null,
        isCashOrBank: false,
        opening: ZERO,
        used: false,
        ...extra,
      });
    }
    return key;
  }

  function fixed(which: FixedLedger): string {
    const def = FIXED_LEDGERS[which];
    return defineLedger(`fixed:${which}`, def.name, def.parent);
  }

  function holding(trade: TallySources['trades'][number]): string {
    const g = investmentGroupFor(trade.assetClass);
    const groupName = namer.name(`group:${g.name}`, g.name);
    return defineLedger(`holding:${trade.holdingKey}`, trade.holdingName, groupName, { groupKey: g.name });
  }

  function add(date: string, type: TallyVoucherType, narration: string, lines: Array<[string, Decimal]>) {
    drafts.push({ date, type, narration, lines: lines.map(([ledgerKey, amount]) => ({ ledgerKey, amount })) });
  }

  // ── Bank accounts and their cash flows ─────────────────────────
  const bankKeys = new Map<string, string>();
  for (const b of sources.bankAccounts) {
    bankKeys.set(
      b.id,
      defineLedger(`bank:${b.id}`, `${b.label} ${b.last4}`, b.isOverdraft ? 'Bank OD A/c' : 'Bank Accounts', {
        isCashOrBank: true,
        used: true,
      }),
    );
  }
  const netFlowByBank = new Map<string, Decimal>();

  for (const cf of sources.cashFlows) {
    const amount = dec(cf.amount);
    if (amount.isZero()) continue;
    const bankKey = cf.bankAccountId ? bankKeys.get(cf.bankAccountId) : undefined;
    if (bankKey) {
      const signed = cf.direction === 'IN' ? amount : amount.negated();
      netFlowByBank.set(cf.bankAccountId!, (netFlowByBank.get(cf.bankAccountId!) ?? ZERO).plus(signed));
    }
    if (cf.direction === 'IN') {
      const narration = cf.description?.trim() || 'Money received';
      if (bankKey) add(cf.date, 'Receipt', narration, [[bankKey, amount], [fixed('unclassifiedIn'), amount.negated()]]);
      else add(cf.date, 'Journal', narration, [[fixed('unallocated'), amount], [fixed('unclassifiedIn'), amount.negated()]]);
    } else {
      const narration = cf.description?.trim() || 'Money paid out';
      if (bankKey) add(cf.date, 'Payment', narration, [[fixed('unclassifiedOut'), amount], [bankKey, amount.negated()]]);
      else add(cf.date, 'Journal', narration, [[fixed('unclassifiedOut'), amount], [fixed('unallocated'), amount.negated()]]);
    }
  }

  // Each bank opens at the balance that makes Tally close on the app's balance.
  let capitalOpening = ZERO;
  for (const b of sources.bankAccounts) {
    const slot = ledgers.get(bankKeys.get(b.id)!)!;
    if (b.currentBalance === null) {
      issues.push({
        severity: 'warning',
        message: `No balance is on file for ${slot.name}, so its opening balance is left at zero.`,
      });
      continue;
    }
    slot.opening = dec(b.currentBalance).minus(netFlowByBank.get(b.id) ?? ZERO);
    capitalOpening = capitalOpening.minus(slot.opening);
  }
  if (!capitalOpening.isZero()) {
    const capital = ledgers.get(fixed('capital'))!;
    capital.opening = capitalOpening;
    capital.used = true;
  }

  // ── Investments ────────────────────────────────────────────────
  for (const t of sources.trades) {
    const gross = dec(t.gross);
    const charges = dec(t.charges);
    const name = t.holdingName;

    if (BUY_KINDS[t.kind]) {
      if (gross.plus(charges).isZero()) continue;
      const narration = `${BUY_KINDS[t.kind]} ${qty(t.quantity)} ${name} @ ${rs(t.price)}`;
      add(t.date, 'Journal', narration, [
        [holding(t), gross],
        [fixed('charges'), charges],
        [fixed('unallocated'), gross.plus(charges).negated()],
      ]);
    } else if (SELL_KINDS[t.kind]) {
      if (gross.isZero()) continue;
      const narration = `${SELL_KINDS[t.kind]} ${qty(t.quantity)} ${name} @ ${rs(t.price)}`;
      const proceeds = gross.minus(charges);
      if (t.cost === null) {
        issues.push({
          severity: 'warning',
          message:
            `${SELL_KINDS[t.kind]} of ${name} on ${t.date}: its cost is not computed yet, so no capital gain is ` +
            `booked and the holding is reduced by the sale value.`,
        });
        add(t.date, 'Journal', narration, [
          [fixed('unallocated'), proceeds],
          [fixed('charges'), charges],
          [holding(t), gross.negated()],
        ]);
      } else {
        const lines: Array<[string, Decimal]> = [
          [fixed('unallocated'), proceeds],
          [holding(t), dec(t.cost).negated()],
        ];
        for (const [gain, ledger] of [
          [dec(t.shortTermGain), 'stcg'],
          [dec(t.longTermGain), 'ltcg'],
        ] as const) {
          if (gain.greaterThan(0)) lines.push([fixed(ledger), gain.negated()]);
          else if (gain.lessThan(0)) lines.push([fixed('capitalLoss'), gain.abs()]);
        }
        // Whatever the gains records leave over is the sale's charges.
        const residue = lines.reduce((s, [, a]) => s.plus(a), ZERO);
        if (!residue.isZero()) lines.push([fixed('charges'), residue.negated()]);
        add(t.date, 'Journal', narration, lines);
      }
    } else if (t.kind === 'DIVIDEND_PAYOUT' || t.kind === 'INTEREST_RECEIVED') {
      const amount = gross.minus(charges);
      if (amount.isZero()) continue;
      const income = t.kind === 'DIVIDEND_PAYOUT' ? 'dividend' : 'interest';
      const label = t.kind === 'DIVIDEND_PAYOUT' ? 'Dividend' : 'Interest';
      add(t.date, 'Journal', `${label} - ${name}`, [
        [fixed('unallocated'), amount],
        [fixed(income), amount.negated()],
      ]);
    } else if (t.kind === 'DIVIDEND_REINVEST') {
      if (gross.isZero()) continue;
      add(t.date, 'Journal', `Dividend reinvested ${qty(t.quantity)} ${name}`, [
        [holding(t), gross],
        [fixed('dividend'), gross.negated()],
      ]);
    } else if (t.kind === 'OPENING_BALANCE') {
      if (gross.isZero()) continue;
      add(t.date, 'Journal', `Opening balance ${qty(t.quantity)} ${name}`, [
        [holding(t), gross],
        [fixed('capital'), gross.negated()],
      ]);
    } else if (t.kind === 'MERGER_IN' || t.kind === 'DEMERGER_IN' || t.kind === 'MERGER_OUT' || t.kind === 'DEMERGER_OUT') {
      if (gross.isZero()) continue;
      const incoming = t.kind.endsWith('_IN');
      const label = `${t.kind.startsWith('DEMERGER') ? 'Demerger' : 'Merger'} ${incoming ? 'in' : 'out'}`;
      add(t.date, 'Journal', `${label} ${qty(t.quantity)} ${name}`, [
        [holding(t), incoming ? gross : gross.negated()],
        [fixed('corporateAction'), incoming ? gross.negated() : gross],
      ]);
    }
    // BONUS and SPLIT move no money: quantities only, shown in the holdings report.
  }

  // ── Loans ──────────────────────────────────────────────────────
  const loanKeys = new Map<string, { key: string; label: string }>();
  for (const l of sources.loans) {
    const key = defineLedger(`loan:${l.id}`, l.label, 'Loans (Liability)');
    loanKeys.set(l.id, { key, label: l.label });
    const principal = dec(l.principal);
    if (!principal.isZero()) {
      add(l.disbursedOn, 'Journal', `Loan disbursed - ${l.label}`, [
        [fixed('unallocated'), principal],
        [key, principal.negated()],
      ]);
    }
  }
  for (const p of sources.loanPayments) {
    const loan = loanKeys.get(p.loanId);
    if (!loan) {
      issues.push({ severity: 'warning', message: `A loan payment on ${p.date} belongs to a loan that is not on file; it was left out.` });
      continue;
    }
    const amount = dec(p.amount);
    const label = `${LOAN_PAYMENT_LABELS[p.kind] ?? p.kind} - ${loan.label}`;
    if (p.kind === 'PROCESSING_FEE') {
      add(p.date, 'Journal', label, [[fixed('loanCharges'), amount], [fixed('unallocated'), amount.negated()]]);
      continue;
    }
    // No split on file: the whole payment is principal. One part on file:
    // the other is what remains of the payment.
    const givenPrincipal = p.principal === null ? null : dec(p.principal);
    const givenInterest = p.interest === null ? null : dec(p.interest);
    const principal = givenPrincipal ?? (givenInterest === null ? amount : amount.minus(givenInterest));
    const interest = givenInterest ?? amount.minus(principal);
    add(p.date, 'Journal', label, [
      [loan.key, principal],
      [fixed('loanInterest'), interest],
      [fixed('unallocated'), principal.plus(interest).negated()],
    ]);
  }

  // ── Credit cards ───────────────────────────────────────────────
  const cardKeys = new Map<string, { key: string; label: string }>();
  for (const c of sources.cards) {
    cardKeys.set(c.id, { key: defineLedger(`card:${c.id}`, c.label, 'Current Liabilities'), label: c.label });
  }
  const statementsByCard = new Map<string, TallySources['cardStatements']>();
  for (const s of sources.cardStatements) {
    const list = statementsByCard.get(s.cardId) ?? [];
    list.push(s);
    statementsByCard.set(s.cardId, list);
  }
  for (const [cardId, statements] of statementsByCard) {
    const card = cardKeys.get(cardId);
    if (!card) continue;
    const ordered = [...statements].sort((a, b) => a.date.localeCompare(b.date));
    let carried = ZERO;
    for (const s of ordered) {
      // A statement's total includes whatever was left unpaid last time.
      const billed = dec(s.statementAmount);
      const spends = billed.minus(carried);
      if (!spends.isZero()) {
        add(s.date, 'Journal', `Card spends - ${card.label}`, [
          [fixed('cardSpends'), spends],
          [card.key, spends.negated()],
        ]);
      }
      const paid = dec(s.paid);
      if (paid.greaterThan(0) && s.paidOn) {
        add(s.paidOn, 'Journal', `Card payment - ${card.label}`, [
          [card.key, paid],
          [fixed('unallocated'), paid.negated()],
        ]);
      }
      carried = Decimal.max(billed.minus(paid), ZERO);
    }
  }

  // ── Rent, property expenses, premiums ──────────────────────────
  for (const r of sources.rent) {
    const amount = dec(r.amount);
    if (amount.isZero()) continue;
    const who = `${r.property} / ${r.tenant}`;
    if (r.kind === 'PAYMENT') {
      const rent = defineLedger(`rent:${r.property}`, `Rent - ${r.property}`, 'Indirect Incomes');
      add(r.date, 'Journal', `Rent received - ${who}`, [[fixed('unallocated'), amount], [rent, amount.negated()]]);
    } else {
      const deposit = defineLedger(
        `deposit:${r.property}:${r.tenant}`,
        `Security Deposit - ${r.tenant} (${r.property})`,
        'Current Liabilities',
      );
      if (r.kind === 'DEPOSIT') {
        add(r.date, 'Journal', `Security deposit received - ${who}`, [[fixed('unallocated'), amount], [deposit, amount.negated()]]);
      } else {
        add(r.date, 'Journal', `Security deposit refunded - ${who}`, [[deposit, amount], [fixed('unallocated'), amount.negated()]]);
      }
    }
  }
  for (const e of sources.propertyExpenses) {
    const amount = dec(e.amount);
    if (amount.isZero()) continue;
    const expense = defineLedger(`propexp:${e.property}`, `Property Expenses - ${e.property}`, 'Indirect Expenses');
    add(e.date, 'Journal', `${e.description} - ${e.property}`, [[expense, amount], [fixed('unallocated'), amount.negated()]]);
  }
  for (const p of sources.premiums) {
    const amount = dec(p.amount);
    if (amount.isZero()) continue;
    const premium = defineLedger(`premium:${p.policy}`, `Insurance Premium - ${p.policy}`, 'Indirect Expenses');
    add(p.date, 'Journal', `Premium - ${p.policy}`, [[premium, amount], [fixed('unallocated'), amount.negated()]]);
  }

  // ── Finalise: merge, round, number, split by year ──────────────
  const finals: Array<Omit<TallyVoucher, 'number'>> = [];
  for (const draft of [...drafts].sort((a, b) => a.date.localeCompare(b.date))) {
    const merged = new Map<string, Decimal>();
    for (const line of draft.lines) merged.set(line.ledgerKey, (merged.get(line.ledgerKey) ?? ZERO).plus(line.amount));
    const lines = [...merged]
      .map(([ledgerKey, amount]) => ({ ledgerKey, amount: amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP) }))
      .filter((l) => !l.amount.isZero());
    if (lines.length < 2) continue;
    const residue = lines.reduce((s, l) => s.plus(l.amount), ZERO);
    if (!residue.isZero()) {
      const largest = lines.reduce((a, b) => (b.amount.abs().greaterThan(a.amount.abs()) ? b : a));
      largest.amount = largest.amount.minus(residue);
    }
    for (const l of lines) ledgers.get(l.ledgerKey)!.used = true;
    finals.push({
      date: draft.date,
      type: draft.type,
      narration: draft.narration,
      lines: lines.map((l) => ({ ledger: ledgers.get(l.ledgerKey)!.name, amount: l.amount })),
    });
  }

  const years: TallyYear[] = [];
  const counters = new Map<string, number>();
  for (const v of finals) {
    const fy = financialYearFromDate(v.date);
    let year = years[years.length - 1];
    if (!year || year.fy !== fy) {
      year = { fy, vouchers: [] };
      years.push(year);
    }
    const counterKey = `${fy}:${v.type}`;
    const n = (counters.get(counterKey) ?? 0) + 1;
    counters.set(counterKey, n);
    year.vouchers.push({ ...v, number: String(n) });
  }

  const firstFy = years[0]?.fy ?? financialYearFromDate(opts.today ?? new Date().toISOString().slice(0, 10));
  const booksBeginning = `${firstFy.slice(0, 4)}-04-01`;

  const outLedgers: TallyLedger[] = [];
  const usedGroups = new Set<string>();
  for (const slot of ledgers.values()) {
    if (!slot.used && slot.opening.isZero()) continue;
    if (slot.groupKey) usedGroups.add(slot.groupKey);
    outLedgers.push({
      name: slot.name,
      parent: slot.parent,
      openingBalance: slot.opening.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
      isCashOrBank: slot.isCashOrBank,
    });
  }
  for (const g of [...INVESTMENT_GROUPS, OTHER_INVESTMENTS]) {
    if (usedGroups.has(g.name)) groups.set(g.name, { name: namer.name(`group:${g.name}`, g.name), parent: g.parent });
  }

  return { booksBeginning, groups: [...groups.values()], ledgers: outLedgers, years, issues };
}
