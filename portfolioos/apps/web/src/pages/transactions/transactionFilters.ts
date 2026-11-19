import { TRANSACTION_TYPE_LABELS } from '@everypaisa/shared';
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

/** Types a user can filter by, with the same plain wording used everywhere else. */
export const TRANSACTION_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = Object.entries(
  TRANSACTION_TYPE_LABELS,
).map(([value, label]) => ({ value, label }));

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
