/**
 * React Query key factory for `/api/mf-analytics`.
 *
 * A separate module, not an export on `mfAnalytics.api.ts`, because
 * `07-IMPLEMENTATION-PLAN.md` Task 3.2 requires the keys to be importable
 * without pulling in the fetchers: an invalidation from a *writer* (the
 * methodology admin page, a future re-score mutation, the portfolio-analysis
 * run in Phase 4) has to name the exact same tuple the reader subscribed
 * with, and the way that guarantee gets lost is a second module inventing
 * `['mf', schemeCode, 'score']` by hand. CONTEXT.md §11 records the same rule
 * for `familyDashboardKeys`, which exists so invalidations reach the sidebar
 * tree as well as the page that triggered them.
 *
 * Every key starts with the literal `'mf-analytics'` so a caller can drop the
 * entire namespace with a single prefix invalidation, and `scheme()` sits
 * between the namespace and the leaves so invalidating one fund does not
 * refetch every other fund in the cache.
 *
 * `as const` throughout: React Query compares keys structurally, but the
 * literal types are what let TypeScript reject a typo'd leaf at the call site.
 */

import type { MfHorizonYears } from '@portfolioos/shared';

export const mfAnalyticsKeys = {
  /** Whole namespace — `invalidateQueries({ queryKey: mfAnalyticsKeys.all })`. */
  all: ['mf-analytics'] as const,

  /** Everything cached for one scheme. */
  scheme: (schemeCode: string) => ['mf-analytics', 'scheme', schemeCode] as const,

  meta: (schemeCode: string) => ['mf-analytics', 'scheme', schemeCode, 'meta'] as const,

  /**
   * `horizon` is part of the key because the endpoint returns the whole keyed
   * map when it is omitted and a single-entry map when it is not. Two shapes
   * behind one key would make the second response overwrite the first with a
   * strictly smaller object, and the page would silently lose four horizons.
   */
  metrics: (schemeCode: string, horizon?: MfHorizonYears) =>
    ['mf-analytics', 'scheme', schemeCode, 'metrics', horizon ?? 'all'] as const,

  /**
   * `version` pins a `methodologyVersion` (`03 §9`). Same reasoning: the
   * latest score and a pinned historical score are different resources and
   * must not share a cache entry, or the methodology-comparison view would
   * show one version's numbers under the other's label.
   */
  score: (schemeCode: string, version?: string) =>
    ['mf-analytics', 'scheme', schemeCode, 'score', version ?? 'latest'] as const,

  peers: (schemeCode: string, horizon?: MfHorizonYears) =>
    ['mf-analytics', 'scheme', schemeCode, 'peers', horizon ?? 'all'] as const,

  holdings: (schemeCode: string) =>
    ['mf-analytics', 'scheme', schemeCode, 'holdings'] as const,

  /** The composed read the fund detail page uses (one round trip, not five). */
  analytics: (schemeCode: string) =>
    ['mf-analytics', 'scheme', schemeCode, 'analytics'] as const,
} as const;
