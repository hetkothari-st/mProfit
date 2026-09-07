import { api, unwrap } from './client';
import type {
  ApiResponse,
  MfCurrentProfile,
  MfFundAnalyticsDto,
  MfHorizonMetrics,
  MfHorizonYears,
  MfPeerPercentiles,
  MfPortfolioAnalysisDto,
  MfSchemeMetaDto,
  MfSchemeScoreDto,
} from '@portfolioos/shared';

/**
 * Client for `/api/mf-analytics` (`07-IMPLEMENTATION-PLAN.md` Task 3.1/3.2).
 *
 * **Every type in this file is imported from `@portfolioos/shared`. Nothing is
 * redeclared here, and nothing may be.** This is not stylistic. The `/advisor`
 * page crashed on first load because the client declared its own version of a
 * server shape — the API returned `{ profile, history }` while the UI destructured
 * a bare profile, with wholesale field-name drift underneath — and `tsc` had
 * nothing to compare the two against, so the drift shipped (CONTEXT.md §11, §16
 * rule 6). A locally-declared interface here would turn the compiler from the
 * thing that catches contract drift into the thing that certifies it.
 *
 * Two consequences worth stating explicitly:
 *
 *  1. **Numerics are Decimal strings, not numbers.** `Money`, `Ratio` and `Pct`
 *     are branded strings. Hand them to `formatINR` / the local ratio
 *     formatters; `Number(x)` and `parseFloat(x)` are lint errors repo-wide
 *     (`portfolioos/no-money-coercion`) and would reintroduce the IEEE-754
 *     round trip the brands exist to prevent.
 *
 *  2. **`null` means "we could not compute this", never zero.** Each null has a
 *     status beside it — `MfHorizonMetrics.fieldStatus`, `MfCurrentProfile
 *     .fieldStatus`, `MfPillarInput.status`. Consumers render the status, not a
 *     dash and never a 0 (`02-METRICS.md §1`, `06 §6`).
 *
 * All six routes sit behind `authenticate` + `requireFeature('MF_ANALYTICS')`
 * (PLUS, `06 §4`), so a FREE-plan caller gets a 403 rather than an empty body.
 * Gate the UI with `useEntitlement('MF_ANALYTICS')` so the page never fires a
 * request it knows will be refused.
 */

const base = '/api/mf-analytics/schemes';

/** The user-scoped read lives beside the scheme routes, not under them. */
const portfolioPath = '/api/mf-analytics/portfolio';

export const mfAnalyticsApi = {
  /** `GET /schemes/:schemeCode` → scheme metadata, including the risk-o-meter. */
  async meta(schemeCode: string): Promise<MfSchemeMetaDto> {
    const { data } = await api.get<ApiResponse<MfSchemeMetaDto>>(
      `${base}/${encodeURIComponent(schemeCode)}`,
    );
    return unwrap(data);
  },

  /**
   * `GET /schemes/:schemeCode/metrics` → metrics **keyed by horizon**.
   *
   * The map is `Partial<Record<'1'|'3'|'5'|'7'|'10', MfHorizonMetrics>>`, not an
   * array, matching `MfFundAnalyticsDto.metrics` exactly so the piecemeal read
   * and the composed read cannot diverge. An absent key means the metrics job
   * has not produced that horizon — which is a real, renderable state ("no
   * 10-year history"), not an error.
   */
  async metrics(
    schemeCode: string,
    horizon?: MfHorizonYears,
  ): Promise<Partial<Record<`${MfHorizonYears}`, MfHorizonMetrics>>> {
    const { data } = await api.get<
      ApiResponse<Partial<Record<`${MfHorizonYears}`, MfHorizonMetrics>>>
    >(`${base}/${encodeURIComponent(schemeCode)}/metrics`, {
      params: horizon === undefined ? undefined : { horizon: String(horizon) },
    });
    return unwrap(data);
  },

  /**
   * `GET /schemes/:schemeCode/score` → the latest score, or `null`.
   *
   * `null` with a 200 is "this scheme exists but has not been scored"; a 404
   * only ever comes back when `version` was supplied and names a methodology
   * version that was never run. The two are deliberately distinguishable, so
   * do not collapse them into one error path here.
   */
  async score(schemeCode: string, version?: string): Promise<MfSchemeScoreDto | null> {
    const { data } = await api.get<ApiResponse<MfSchemeScoreDto | null>>(
      `${base}/${encodeURIComponent(schemeCode)}/score`,
      { params: version === undefined ? undefined : { version } },
    );
    return unwrap(data);
  },

  /** `GET /schemes/:schemeCode/peers` → percentiles + category medians per horizon. */
  async peers(
    schemeCode: string,
    horizon?: MfHorizonYears,
  ): Promise<Partial<Record<`${MfHorizonYears}`, MfPeerPercentiles>>> {
    const { data } = await api.get<
      ApiResponse<Partial<Record<`${MfHorizonYears}`, MfPeerPercentiles>>>
    >(`${base}/${encodeURIComponent(schemeCode)}/peers`, {
      params: horizon === undefined ? undefined : { horizon: String(horizon) },
    });
    return unwrap(data);
  },

  /**
   * `GET /schemes/:schemeCode/holdings` → `MfCurrentProfile` (the horizon-0 row).
   *
   * This is the reduced profile — top ten holdings, sector/market-cap/credit
   * splits, structural facts — not the full per-security snapshot, which has no
   * shared DTO. `snapshotAsOf` on it is what drives the amber "Portfolio as of
   * {date}" badge (`06 §6`); it commonly trails `asOf` by ~40 days because AMCs
   * disclose monthly.
   */
  async holdings(schemeCode: string): Promise<MfCurrentProfile | null> {
    const { data } = await api.get<ApiResponse<MfCurrentProfile | null>>(
      `${base}/${encodeURIComponent(schemeCode)}/holdings`,
    );
    return unwrap(data);
  },

  /**
   * `GET /schemes/:schemeCode/analytics` → `MfFundAnalyticsDto`. **Prefer this.**
   *
   * One round trip instead of five, and it makes `06 §4`'s "risk-o-meter
   * alongside any score" structural rather than conventional: `meta.riskometer`
   * and `score` arrive in the same payload, so a page physically cannot render
   * the rating without holding the risk disclosure that must sit beside it.
   *
   * Note the scope boundary the controller documents: `held`, `findings` and
   * `verdict` come back null/empty today because the user-scoped analysis
   * engine (Phase 4/5) does not exist yet. `findings: []` therefore means "no
   * analysis has run", NOT "nothing is wrong with this fund", and the UI must
   * not phrase it as a clean bill of health.
   */
  async analytics(schemeCode: string): Promise<MfFundAnalyticsDto> {
    const { data } = await api.get<ApiResponse<MfFundAnalyticsDto>>(
      `${base}/${encodeURIComponent(schemeCode)}/analytics`,
    );
    return unwrap(data);
  },

  /**
   * `GET /api/mf-analytics/portfolio` → `MfPortfolioAnalysisDto`
   * (`04-PORTFOLIO-ANALYSIS.md`, Task 4.3).
   *
   * The only USER-SCOPED read in this module. Everything above is shared market
   * data that happens to be entitlement-gated; this one returns the caller's
   * own holdings, computed under their RLS context and — in a household view —
   * fanned out across `readableUserIds` and filtered by their caps.
   *
   * No `familyId` argument: the family selection travels on the
   * `X-Viewing-As-Family` header that `api/client.ts` attaches from
   * `familyScope.store`, exactly as every other household-aware read does. It
   * does mean the response changes when the user switches households without
   * the URL changing, so the React Query key must be namespaced by family scope
   * — `mfAnalyticsKeys.portfolio(familyId)` exists for that and callers must
   * pass the active scope into it.
   *
   * Three fields on the response are honesty states the UI may not smooth over,
   * and they are called out here because they are the ones a caller is most
   * likely to `?? 0`:
   *
   *  - `totals.weightedTerPct` / `totals.annualCostInr` are `null` when no held
   *    fund has disclosed a TER. Rendering `0` there tells the user their
   *    portfolio is free.
   *  - `lookThrough.fundsWithoutHoldings` non-empty means every look-through
   *    aggregate is a FLOOR, not a total.
   *  - `scope.partial` means the same of every figure on the page.
   */
  async portfolio(): Promise<MfPortfolioAnalysisDto> {
    const { data } = await api.get<ApiResponse<MfPortfolioAnalysisDto>>(portfolioPath);
    return unwrap(data);
  },
};
