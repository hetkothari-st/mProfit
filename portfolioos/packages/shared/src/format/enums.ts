import { ASSET_CLASS_LABELS } from '../constants/index.js';

/**
 * Words that stay upper-case when an enum value is turned into display text
 * ("MUTUAL_FUND" -> "Mutual Fund", but "NPS_TIER_1" -> "NPS Tier 1").
 */
const ACRONYMS: ReadonlySet<string> = new Set([
  'AIF', 'AMC', 'CAS', 'CSV', 'EMI', 'MF', 'PDF', 'TSV', 'XLS', 'XLSX', 'EPF', 'EPFO', 'ETF', 'GST', 'HUF', 'ID', 'IPO', 'ISIN', 'KVP', 'KYC',
  'LTCG', 'MIS', 'NAV', 'NPS', 'NSC', 'NRI', 'OTP', 'PAN', 'PF', 'PMS', 'PPF', 'RD', 'REIT', 'SCSS', 'SEBI',
  'SIP', 'SSY', 'STCG', 'STT', 'TD', 'TDS', 'ULIP', 'UPI', 'XIRR', 'FD', 'AI', 'CA',
]);

/** Acronyms with a conventional mixed-case spelling. */
const SPECIAL_CASE: Readonly<Record<string, string>> = { INVIT: 'InvIT' };

/**
 * An enum value as people read it: "BANK_ACCOUNT" -> "Bank Account", "DIVIDEND_PAYOUT" -> "Dividend Payout",
 * "NPS" stays "NPS". Use this wherever a stored code would otherwise reach the screen; prefer a hand-written
 * label map where wording matters (ASSET_CLASS_LABELS, TRANSACTION_TYPE_LABELS).
 */
export function humanizeEnum(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => {
      const up = w.toUpperCase();
      if (SPECIAL_CASE[up]) return SPECIAL_CASE[up]!;
      if (ACRONYMS.has(up)) return up;
      return up.charAt(0) + up.slice(1).toLowerCase();
    })
    .join(' ');
}

/** Every TransactionType, in the order people think about them, with plain wording. */
export const TRANSACTION_TYPE_LABELS: Readonly<Record<string, string>> = {
  BUY: 'Buy',
  SELL: 'Sell',
  SIP: 'SIP',
  REDEMPTION: 'Redemption',
  SWITCH_IN: 'Switch in',
  SWITCH_OUT: 'Switch out',
  DIVIDEND_PAYOUT: 'Dividend',
  DIVIDEND_REINVEST: 'Dividend reinvested',
  INTEREST_RECEIVED: 'Interest',
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdrawal',
  MATURITY: 'Maturity',
  BONUS: 'Bonus',
  SPLIT: 'Split',
  RIGHTS_ISSUE: 'Rights issue',
  MERGER_IN: 'Merger in',
  MERGER_OUT: 'Merger out',
  DEMERGER_IN: 'Demerger in',
  DEMERGER_OUT: 'Demerger out',
  OPENING_BALANCE: 'Opening balance',
};

export function transactionTypeLabel(type: string | null | undefined): string {
  if (!type) return '';
  return TRANSACTION_TYPE_LABELS[type] ?? humanizeEnum(type);
}

/** An asset class, or a net-worth bucket such as BANK_ACCOUNT / LOAN_GIVEN, as display text. */
export function assetClassLabel(key: string | null | undefined): string {
  if (!key) return '';
  return ASSET_CLASS_LABELS[key] ?? humanizeEnum(key);
}
