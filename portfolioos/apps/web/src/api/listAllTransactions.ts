import type { TransactionListResponse } from '@everypaisa/shared';
import { transactionsApi, type ListTransactionsParams } from './transactions.api';

/** The server's per-page maximum (MAX_TRANSACTION_PAGE_SIZE in the API). */
const PAGE_SIZE = 1000;
/** Backstop against a server that never reports its last page. */
const MAX_PAGES = 50;

/**
 * Every transaction matching `params`, fetched a page at a time.
 *
 * Asset-class pages derive totals, installment counts and per-holding
 * histories from "all" transactions; a single capped request silently
 * dropped everything past the cap (it was clipped to 200 server-side), so a
 * long SIP or RD history lost its oldest rows without any sign.
 */
export async function listAllTransactions(
  params: Omit<ListTransactionsParams, 'page' | 'pageSize'> = {},
): Promise<TransactionListResponse> {
  const first = await transactionsApi.list({ ...params, page: 1, pageSize: PAGE_SIZE });
  const items = [...(first.items ?? [])];
  const totalPages = Math.min(first.pagination?.totalPages ?? 1, MAX_PAGES);
  for (let page = 2; page <= totalPages; page++) {
    const next = await transactionsApi.list({ ...params, page, pageSize: PAGE_SIZE });
    items.push(...(next.items ?? []));
  }
  return {
    ...first,
    items,
    // `total` stays the server's count: fewer items than that means the
    // MAX_PAGES backstop cut the list, and a caller can say so.
    pagination: { page: 1, pageSize: items.length, total: first.pagination?.total ?? items.length, totalPages: 1 },
  };
}
