/**
 * `/api/mf-analytics` — the mutual-fund analytics reference reads
 * (`docs/mf-analytics/07-IMPLEMENTATION-PLAN.md` Task 3.1).
 *
 * Two middlewares are applied with `router.use` rather than repeated on each
 * line, matching `advisor.routes.ts`. That is the safer construction, not the
 * lazier one: a per-route list is a list you can forget to extend, and the one
 * route that then loses `requireFeature` is a silently ungated PLUS feature.
 * `use` makes the gate structural — a route added below is gated by existing.
 *
 * `asyncHandler` wraps EVERY handler, without exception (CONTEXT.md §4). An
 * async Express handler without it turns a rejected promise into an unhandled
 * rejection that kills the Node process. In production that surfaced as a
 * phantom CORS error in the browser, because the server died before it could
 * write the CORS headers and the browser reported the wrong cause. All 17 PF
 * routes once lacked it; that was the bug. Every handler in this file performs
 * database I/O and can reject, so there is no route here for which the wrapper
 * is optional.
 *
 * The `/schemes/*` tables are shared market data with no RLS and no owner (see
 * the header of `mfAnalytics.controller.ts`). For those routes, auth and
 * entitlement gate WHO MAY ASK; they are not, and must not be mistaken for,
 * tenant isolation — there is no tenant to isolate.
 *
 * **The findings block at the bottom of this file is the opposite.**
 * `MfAnalysisRun`, `MfFinding` and `MfFundVerdict` are user data: they are in
 * `USER_SCOPED_MODELS` and carry RLS policies, and their handlers live in
 * `mfFindings.controller.ts` precisely so the reference controller's header
 * stays true. One router, two ownership models — which is why the distinction
 * is spelled out here rather than left to be inferred from a path.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireFeature } from '../middleware/requirePlan.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  getSchemeMeta,
  getSchemeMetrics,
  getSchemeScore,
  getSchemePeers,
  getSchemeHoldings,
  getFundAnalytics,
} from '../controllers/mfAnalytics.controller.js';
import {
  getLatestRun,
  getFundFindings,
  getFundVerdict,
  postAnalysisRefresh,
} from '../controllers/mfFindings.controller.js';

export const mfAnalyticsRouter = Router();

mfAnalyticsRouter.use(authenticate);
// PLUS tier (`06-QUALITY-COMPLIANCE.md §4`): scores, metrics, category ranks
// and cost are *research*, available to anyone entitled to MF_ANALYTICS. The
// regulated *advice* layer — SWITCH_CANDIDATE verdicts naming a replacement —
// rides on the separate ADVICE_ENGINE flag plus the RIA_VERDICTS_ENABLED env
// gate, and none of it is served from this router.
mfAnalyticsRouter.use(requireFeature('MF_ANALYTICS'));

// Scheme metadata. Also the risk-o-meter's home, which is why the fund page
// fetches it beside any score (`06 §4`).
mfAnalyticsRouter.get('/schemes/:schemeCode', asyncHandler(getSchemeMeta));

// Return/risk metrics for every reporting horizon; `?horizon=1|3|5|7|10` narrows.
mfAnalyticsRouter.get('/schemes/:schemeCode/metrics', asyncHandler(getSchemeMetrics));

// Composite score and pillar derivation. `?version=` pins a methodology version
// so the admin methodology page can diff two of them (`03 §9`).
mfAnalyticsRouter.get('/schemes/:schemeCode/score', asyncHandler(getSchemeScore));

// Category percentiles and medians per horizon, at the latest ranked asOf.
mfAnalyticsRouter.get('/schemes/:schemeCode/peers', asyncHandler(getSchemePeers));

// The horizon-0 row: latest portfolio disclosure plus the structural block.
mfAnalyticsRouter.get('/schemes/:schemeCode/holdings', asyncHandler(getSchemeHoldings));

// The composed view the fund detail page consumes in one round trip. Declared
// last only for readability; none of the paths above overlap it.
mfAnalyticsRouter.get('/schemes/:schemeCode/analytics', asyncHandler(getFundAnalytics));

// ---------------------------------------------------------------------------
// Findings, verdicts and refresh — USER-SCOPED (Task 5.6)
// ---------------------------------------------------------------------------
//
// These four read and write the caller's own `MfAnalysisRun` / `MfFinding` /
// `MfFundVerdict` rows, under the caller's RLS context. They are namespaced
// `/runs`, `/funds` and `/refresh` rather than hung off `/schemes/:schemeCode`
// so that the path itself says whose data it is: everything under `/schemes` is
// the same for every caller, and nothing under these three is.
//
// The router-level `authenticate` + `requireFeature('MF_ANALYTICS')` above
// covers them. `06 §4` also describes the verdict layer as riding on the
// `ADVICE_ENGINE` flag; both flags are PLUS today, so a second `requireFeature`
// would change no behaviour while making `/runs/latest` (which carries findings
// AND verdicts) gated differently from `/funds/:code/verdict`. The compliance
// control that actually does the work is `RIA_VERDICTS_ENABLED`, applied in the
// controller — see its header.
//
// `asyncHandler` on all four, same rule as above: every one of them awaits the
// database, and the refresh handler additionally awaits a full analysis run.

// The caller's latest COMPLETED/PARTIAL run: portfolio analysis, findings,
// standing verdicts, the rule-version snapshot and the missing categories a
// PARTIAL banner names. `null` (200) means no analysis has ever completed.
mfAnalyticsRouter.get('/runs/latest', asyncHandler(getLatestRun));

// Findings from that run for one scheme. Portfolio-level findings are excluded.
mfAnalyticsRouter.get('/funds/:schemeCode/findings', asyncHandler(getFundFindings));

// The standing verdict head for one scheme, RIA-gated on the way out.
mfAnalyticsRouter.get('/funds/:schemeCode/verdict', asyncHandler(getFundVerdict));

// Re-run the engine now. Rate-limited to 1/hour by `requestMfAnalysisRefresh`
// against `MfAnalysisRun.startedAt`, not by a second limiter here — a limit
// enforced in two places is a limit with two answers.
mfAnalyticsRouter.post('/refresh', asyncHandler(postAnalysisRefresh));
