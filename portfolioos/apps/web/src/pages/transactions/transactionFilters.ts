import type { ListTransactionsParams } from '@/api/transactions.api';

export type SortKey = NonNullable<ListTransactionsParams['sort']>;
export type SortDir = NonNullable<ListTransactionsParams['dir']>;

export interface TransactionFilters {
  q: string;
  assetClass: string;
  transactionType: string;
  from: string;
  to: string;
}

export const EMPTY_FILTERS: TransactionFilters = { q: '', assetClass: '', transactionType: '', from: '', to: '' };

/** Types a user can filter by, in the order people think about them, with plain-English labels. */
export const TRANSACTION_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'BUY', label: 'Buy' },
  { value: 'SELL', label: 'Sell' },
  { value: 'SIP', label: 'SIP' },
  { value: 'REDEMPTION', label: 'Redemption' },
  { value: 'SWITCH_IN', label: 'Switch in' },
  { value: 'SWITCH_OUT', label: 'Switch out' },
  { value: 'DIVIDEND_PAYOUT', label: 'Dividend' },
  { value: 'DIVIDEND_REINVEST', label: 'Dividend reinvested' },
  { value: 'INTEREST_RECEIVED', label: 'Interest' },
  { value: 'DEPOSIT', label: 'Deposit' },
  { value: 'WITHDRAWAL', label: 'Withdrawal' },
  { value: 'MATURITY', label: 'Maturity' },
  { value: 'BONUS', label: 'Bonus' },
  { value: 'SPLIT', label: 'Split' },
  { value: 'RIGHTS_ISSUE', label: 'Rights issue' },
  { value: 'MERGER_IN', label: 'Merger in' },
  { value: 'MERGER_OUT', label: 'Merger out' },
  { value: 'DEMERGER_IN', label: 'Demerger in' },
  { value: 'DEMERGER_OUT', label: 'Demerger out' },
  { value: 'OPENING_BALANCE', label: 'Opening balance' },
];

export function hasActiveFilters(f: TransactionFilters, portfolioId: string): boolean {
  return Boolean(portfolioId || f.q.trim() || f.assetClass || f.transactionType || f.from || f.to);
}

/** The API parameters for the current filters (blank fields are left out). */
export function toListParams(
  f: TransactionFilters,
  portfolioId: string,
  sort: SortKey,
  dir: SortDir,
): ListTransactionsParams {
  return {
    portfolioId: portfolioId || undefined,
    assetClass: f.assetClass || undefined,
    transactionType: f.transactionType || undefined,
    from: f.from || undefined,
    to: f.to || undefined,
    q: f.q.trim() || undefined,
    sort,
    dir,
  };
}

/** A column's first click sorts this way: text columns A-Z, numbers and dates biggest/newest first. */
export const DEFAULT_DIR: Record<SortKey, SortDir> = {
  date: 'desc',
  amount: 'desc',
  quantity: 'desc',
  asset: 'asc',
  type: 'asc',
};
