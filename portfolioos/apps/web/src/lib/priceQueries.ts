import type { QueryClient } from '@tanstack/react-query';

/**
 * Every cached query whose numbers move when prices move. A price refresh
 * started from one page used to invalidate only that page's own queries — the
 * dashboard's even named a key no query used — so the next page opened showed
 * the previous price snapshot beside a page showing the new one.
 */
export const PRICE_DERIVED_QUERY_PREFIXES: readonly string[] = [
  'portfolio-holdings',
  'portfolio-summary',
  'portfolio',
  'portfolios',
  'portfolio-group',
  'portfolio-groups',
  'dashboard',
  'user-xirr',
  'analytics',
  'advisor',
  'families',
];

/** Refetch everything a price change affects, from whichever page triggered it. */
export function invalidatePriceViews(queryClient: QueryClient): Promise<void> {
  return Promise.all(
    PRICE_DERIVED_QUERY_PREFIXES.map((prefix) => queryClient.invalidateQueries({ queryKey: [prefix] })),
  ).then(() => undefined);
}
