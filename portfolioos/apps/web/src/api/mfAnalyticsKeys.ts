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

  /**
   * The caller's own MF book (`04-PORTFOLIO-ANALYSIS.md`, Task 4.3).
   *
   * Deliberately NOT parameterised by family id, even though the response
   * changes entirely when the user switches household. `main.tsx` installs a
   * `queryKeyHashFn` that prefixes EVERY query's cache hash with the active
   * `viewingAsFamilyId`, so each scope already gets its own cache entry and a
   * stale cross-scope read is unrepresentable. Threading the family id through
   * this key as well would namespace it twice — harmless for reads, but it
   * would silently break `invalidateQueries({ queryKey: mfAnalyticsKeys.all })`
   * from a writer that does not know the caller's current scope.
   *
   * Sits outside `scheme()` because it is not about one scheme: a prefix
   * invalidation of a single fund must not drop the portfolio-wide analysis,
   * and re-running the analysis must not drop every cached fund page.
   */
  portfolio: () => ['mf-analytics', 'portfolio'] as const,

  // -------------------------------------------------------------------------
  // Findings, verdicts and runs (Task 5.6) — USER-SCOPED
  // -------------------------------------------------------------------------

  /**
   * The caller's latest analysis run.
   *
   * Outside `scheme()` for the same reason `portfolio()` is: it is not about
   * one fund. A prefix invalidation of a single scheme must not drop the run,
   * and a refresh — which changes findings and verdicts for every held fund —
   * must invalidate `all` rather than pretend it touched one.
   *
   * Not parameterised by family id: `main.tsx`'s `queryKeyHashFn` already
   * prefixes every cache hash with the active `viewingAsFamilyId`. Runs are
   * per-user anyway (`MfAnalysisRun.familyId` is provenance, not scope), but
   * the hash prefix means a household switch cannot serve a stale one.
   */
  latestRun: () => ['mf-analytics', 'runs', 'latest'] as const,

  /**
   * One fund's findings and standing verdict.
   *
   * Under `scheme()` so that invalidating a single fund reaches them, and kept
   * as two entries rather than one because the two endpoints have genuinely
   * different lifetimes: a verdict can stand across many runs while the
   * findings beneath it are rewritten on every one.
   */
  findings: (schemeCode: string) =>
    ['mf-analytics', 'scheme', schemeCode, 'findings'] as const,

  verdict: (schemeCode: string) =>
    ['mf-analytics', 'scheme', schemeCode, 'verdict'] as const,

  /**
   * The scoring methodology tables (`06 §5`, Task 3.3).
   *
   * Reference constants with no user dimension at all — the same bytes for
   * every caller, changing only when a model file changes — so it is keyed
   * flat and is the one entry here whose scope-prefixed hash is redundant
   * rather than load-bearing.
   */
  methodology: () => ['mf-analytics', 'methodology'] as const,

  /**
   * Admin-curated qualitative facts (`Task 6.2`).
   *
   * Kept OUTSIDE `scheme()` even though every row names a scheme, because the
   * admin list is filtered by scheme, AMC or fact type in any combination and
   * is never "the facts for scheme X" the way `meta()` is. Filing it under one
   * scheme would make a list of forty AMC-wide rows invalidate — and refetch —
   * forty unrelated fund pages.
   *
   * The filter object is part of the key: two filters are two resources, and
   * sharing an entry would let a scheme-filtered list overwrite the unfiltered
   * one with a strictly smaller array.
   */
  qualitativeFacts: (filters?: Record<string, string | boolean | undefined>) =>
    ['mf-analytics', 'qualitative-facts', filters ?? {}] as const,

  qualitativeFactCatalog: () =>
    ['mf-analytics', 'qualitative-facts', 'catalog'] as const,
} as const;
