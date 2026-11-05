/**
 * Decides whether a bank credit or debit is the kind Safe-to-Invest should
 * count. Bank alerts are uncategorised: a transfer from the user's own other
 * account, a refund or a fund redemption all arrive as UPI/NEFT credits, and
 * would make income look higher than it is. These rules are deliberately
 * conservative and every exclusion carries a reason the user can see and
 * overrule, credit by credit.
 */

export type CreditExclusion = 'own_transfer' | 'refund' | 'loan' | 'investment' | 'foreign_currency';

export const CREDIT_EXCLUSION_LABEL: Record<CreditExclusion, string> = {
  own_transfer: 'Looks like a transfer from your own account',
  refund: 'Looks like a refund or reversal',
  loan: 'Looks like a loan payout',
  investment: 'Looks like investment money (redemption, dividend, interest)',
  foreign_currency: 'Not in rupees',
};

export interface MoneyEventText {
  counterparty: string | null;
  parserNotes: string | null;
  instrumentName: string | null;
  currency: string;
}

const OWN_TRANSFER = /\b(self|own (a\/?c|acc(ount)?)|sweep[- ]?(in|out)?|to self|from self)\b/;
const REFUND = /\b(refund(ed)?|reversal|reversed|revers(e|ed) (of|for)|cash ?back|chargeback|returned|rtn)\b/;
const LOAN = /\b(loan (disb(ursal|ursement)?|credit|amount)|disbursal|disbursement)\b/;
const INVESTMENT =
  /\b(redemption|redeem(ed)?|mutual fund|\bmf\b|amc|dividend|interest|int\.? ?(cr|credit|pd|paid)|fd (closure|matur\w*)|maturity|nse clearing|bse|iccl|nsccl|zerodha|groww|upstox|angel one|clearing corp\w*)\b/;

/** Debits that are investing, paying a card bill, an EMI or a self transfer, not everyday spend. */
const NOT_SPEND =
  /\b(sip|mutual fund|\bmf\b|amc|bse star|nse|iccl|nsccl|zerodha|groww|upstox|angel one|credit card|card (bill|payment|dues)|cc payment|emi|loan|self|own (a\/?c|acc(ount)?)|sweep|fixed deposit|\bfd\b|\brd\b|ppf|nps)\b/;

function text(e: MoneyEventText): string {
  return [e.counterparty, e.parserNotes, e.instrumentName].filter(Boolean).join(' ').toLowerCase();
}

/**
 * Name tokens that identify the user as a counterparty (words of three
 * letters or more). Matching needs the first AND last name, so a friend who
 * shares a first name does not read as the user, while "RAHUL V SHARMA" or
 * "SHARMA RAHUL" still does.
 */
export function nameTokens(fullName: string | null | undefined): string[] {
  return (fullName ?? '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 3);
}

function isOwnName(t: string, tokens: readonly string[]): boolean {
  if (tokens.length < 2) return false;
  const has = (tok: string) => new RegExp(`\\b${tok}\\b`).test(t);
  return has(tokens[0]!) && has(tokens[tokens.length - 1]!);
}

/** A transfer between the user's own accounts ("self", "own a/c", their own name). */
export function isOwnTransfer(e: MoneyEventText, userTokens: readonly string[]): boolean {
  const t = text(e);
  return OWN_TRANSFER.test(t) || isOwnName(t, userTokens);
}

/** Should this credit count as income? Null = yes; otherwise the reason it does not. */
export function classifyCredit(e: MoneyEventText, userTokens: readonly string[]): CreditExclusion | null {
  if (e.currency !== 'INR') return 'foreign_currency';
  const t = text(e);
  if (OWN_TRANSFER.test(t) || isOwnName(t, userTokens)) return 'own_transfer';
  if (REFUND.test(t)) return 'refund';
  if (LOAN.test(t)) return 'loan';
  if (INVESTMENT.test(t)) return 'investment';
  return null;
}

/** Should this debit count as everyday spending? */
export function isEverydaySpend(e: MoneyEventText, userTokens: readonly string[]): boolean {
  if (e.currency !== 'INR') return false;
  const t = text(e);
  return !NOT_SPEND.test(t) && !isOwnName(t, userTokens);
}
