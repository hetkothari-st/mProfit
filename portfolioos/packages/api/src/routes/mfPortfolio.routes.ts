/**
 * The two `/api/mf-analytics` reads that are not reference data
 * (`07-IMPLEMENTATION-PLAN.md` Tasks 4.3 and 3.3).
 *
 * **Middleware is per-route here, not `router.use`.** That is the opposite of
 * `mfAnalytics.routes.ts`, and for a specific reason rather than a stylistic
 * one. This router is mounted on the SAME path as that one, ahead of it, so a
 * request for `/schemes/:schemeCode` passes through here on its way to the
 * reference routes. A `router.use(authenticate)` at the top of this file would
 * therefore run the auth middleware twice on every reference read, and — much
 * worse — a `router.use(requireFeature(...))` would 403 a request destined for
 * a route in the *other* router before it ever got there. Per-route middleware
 * means a non-matching request falls straight through with no side effects.
 *
 * `asyncHandler` wraps every handler, without exception (CONTEXT.md §16.4). An
 * async Express handler without it turns a rejected promise into an unhandled
 * rejection that kills the process; in production that surfaced as a phantom
 * CORS error, because the server died before it could write the CORS headers.
 *
 * The two routes are gated differently, and that difference is the point:
 *
 *  - `/portfolio` reads the caller's own holdings, so it needs both
 *    `authenticate` (whose data) and `requireFeature('MF_ANALYTICS')` (the PLUS
 *    entitlement, `06 §4`). Tenant isolation itself is RLS's job, not this
 *    line's — `getEffectiveScope` and the ambient user context do that.
 *  - `/methodology` returns constants and no user data at all. `06 §5` calls
 *    the page that consumes it *public*: it is how someone decides whether a
 *    rating is worth trusting, which they must be able to do before buying the
 *    plan that shows them ratings. Gating it on `MF_ANALYTICS` would publish
 *    the methodology only to people who already have the scores.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireFeature } from '../middleware/requirePlan.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  getPortfolioAnalysis,
  getScoringMethodology,
} from '../controllers/mfPortfolio.controller.js';

export const mfPortfolioRouter = Router();

// The caller's own MF book: totals, per-fund XIRR, overlap, look-through,
// cost, tax lots, goal fit, and the family-scope honesty block.
mfPortfolioRouter.get(
  '/portfolio',
  authenticate,
  requireFeature('MF_ANALYTICS'),
  asyncHandler(getPortfolioAnalysis),
);

// Model tables, direction table, rating buckets and horizon blend, read out of
// the scorer's own frozen constants. See the controller for why this is not
// entitlement-gated.
mfPortfolioRouter.get('/methodology', authenticate, asyncHandler(getScoringMethodology));
