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
 * The tables behind these routes are shared market data with no RLS and no
 * owner (see the header of `mfAnalytics.controller.ts`). Auth and entitlement
 * here gate WHO MAY ASK; they are not, and must not be mistaken for, tenant
 * isolation — there is no tenant to isolate.
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
