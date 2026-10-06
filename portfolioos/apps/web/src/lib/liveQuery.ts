/**
 * Options for a query that another person's session changes.
 *
 * Account access is two people in two browsers: the account holder changes a
 * professional's permissions, and the professional's screen has to follow.
 * There is no push channel between them, so these views poll — and polling
 * alone was not enough, for two reasons that compound:
 *
 *  - The app-wide `staleTime` is 30 seconds. React Query only refetches on
 *    focus when data is STALE, so returning to a window within 30 seconds of
 *    its last fetch showed the old answer.
 *  - Polling pauses while a tab is hidden (another tab in front, window
 *    minimised or covered). So the professional's tab had stopped polling
 *    entirely while the account holder was making the change.
 *
 * Together: switch to the professional's tab and nothing happened until the
 * next tick, up to 20 seconds later. Which is exactly the "I have to
 * refresh" report.
 *
 * `staleTime: 0` with `'always'` makes the tab fetch the moment it becomes
 * visible again, every time. React Query listens for visibility, not window
 * focus, so two windows both on screen side by side rely on the interval
 * instead. These lists are a handful of rows, so polling them this often
 * costs nothing.
 */
export const LIVE_QUERY = {
  staleTime: 0,
  refetchOnWindowFocus: 'always',
  refetchOnReconnect: 'always',
  refetchOnMount: 'always',
} as const;

/** How often a visible live view checks, in milliseconds. */
export const LIVE_INTERVAL_MS = 5_000;
