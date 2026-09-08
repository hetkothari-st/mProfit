import { api, unwrap } from './client';
import type { MfAlternativesDto } from '@portfolioos/shared';
import type {
  ApiResponse,
  MfAnalysisRunDto,
  MfCurrentProfile,
  MfFinding,
  MfFundAnalyticsDto,
  MfFundVerdictDto,
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

/** Root for the user-scoped analysis reads: runs, findings, verdicts, refresh. */
const analysisPath = '/api/mf-analytics';

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
   * `GET /schemes/:schemeCode/alternatives` → better-scoring funds in the same
   * category. Reference data, not a recommendation — see the DTO's own note.
   */
  async alternatives(schemeCode: string): Promise<MfAlternativesDto> {
    const { data } = await api.get<ApiResponse<MfAlternativesDto>>(
      `${base}/${encodeURIComponent(schemeCode)}/alternatives`,
    );
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

  // -------------------------------------------------------------------------
  // Findings, verdicts and refresh (Task 5.6) — USER-SCOPED
  // -------------------------------------------------------------------------
  //
  // Everything below returns the CALLER's own analysis. The three reads are
  // served under the caller's RLS context, so a second user asking for the same
  // scheme code gets `null` / `[]`, not somebody else's conclusion.
  //
  // The gate that matters lives on the server: with `RIA_VERDICTS_ENABLED`
  // false a stored `SWITCH_CANDIDATE` arrives as `REVIEW` with
  // `advisoryGated: true` and no replacement (`06 §4`). **Do not re-derive that
  // here.** The client's job is to render `advisoryGated` honestly — "analysis
  // only" — not to reconstruct what the engine originally said.

  /**
   * `GET /api/mf-analytics/runs/latest` → the caller's latest analysis run.
   *
   * `null` means no analysis has ever COMPLETED for this user — a real state
   * (the engine is trigger-driven; a user who has never imported a fund and
   * never pressed refresh has no run), not an error. RUNNING and FAILED runs
   * are deliberately invisible: their payload columns are still the engine's
   * `{}` placeholder, and rendering one would show an empty book to a user who
   * holds twelve funds.
   *
   * On a `PARTIAL` run, `missingCategories` names the finding categories a
   * failed rule would have covered. The page MUST surface them (`06 §6`) —
   * silently omitting a section is the failure this field exists to prevent.
   */
  async latestRun(): Promise<MfAnalysisRunDto | null> {
    const { data } = await api.get<ApiResponse<MfAnalysisRunDto | null>>(`${analysisPath}/runs/latest`);
    return unwrap(data);
  },

  /**
   * `GET /api/mf-analytics/funds/:schemeCode/findings` → the latest run's
   * findings for one scheme.
   *
   * Portfolio-level findings are excluded server-side: they are statements
   * about the book, and repeating one on each of twelve fund pages turns a
   * single observation into twelve accusations.
   *
   * `[]` is ambiguous on its own — "the run found nothing here" and "no run has
   * happened" both produce it — and is disambiguated by `latestRun()`. It is
   * NEVER a clean bill of health, and the UI must not phrase it as one.
   */
  async fundFindings(schemeCode: string): Promise<MfFinding[]> {
    const { data } = await api.get<ApiResponse<MfFinding[]>>(
      `${analysisPath}/funds/${encodeURIComponent(schemeCode)}/findings`,
    );
    return unwrap(data);
  },

  /**
   * `GET /api/mf-analytics/funds/:schemeCode/verdict` → the STANDING verdict.
   *
   * Standing, not "the latest run's": a run that reaches the same conclusion
   * for the same reasons writes no new row (`05 §5`), so a fund the engine has
   * been consistently comfortable with has its verdict attached to an older
   * run. `runId` on the response points at whichever run produced it.
   */
  async fundVerdict(schemeCode: string): Promise<MfFundVerdictDto | null> {
    const { data } = await api.get<ApiResponse<MfFundVerdictDto | null>>(
      `${analysisPath}/funds/${encodeURIComponent(schemeCode)}/verdict`,
    );
    return unwrap(data);
  },

  /**
   * `POST /api/mf-analytics/refresh` → the run it just produced.
   *
   * Synchronous — seconds of CPU over facts already in memory — so there is no
   * job id to poll. **Rate-limited to one per hour per user**, enforced on the
   * server against `MfAnalysisRun.startedAt`; a second call inside the window
   * rejects with a 429 whose message names the time the next one is allowed.
   * Surface that message rather than a generic failure: a button that fails
   * silently teaches the user nothing.
   */
  async refreshAnalysis(): Promise<MfAnalysisRunDto> {
    const { data } = await api.post<ApiResponse<MfAnalysisRunDto>>(`${analysisPath}/refresh`);
    return unwrap(data);
  },
};
