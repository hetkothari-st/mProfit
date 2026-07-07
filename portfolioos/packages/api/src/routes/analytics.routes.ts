import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireFeature } from '../middleware/requirePlan.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  getSnapshot,
  getBenchmark,
  getRisk,
  getInsightsLatest,
  generateInsights,
  getInsightsSpend,
  getDeterministicInsights,
  getMfOverlapHandler,
  postWhatIf,
} from '../controllers/analytics.controller.js';

export const analyticsRouter = Router();

analyticsRouter.use(authenticate);

// Aggregated snapshot of all "cheap" widgets in one call.
analyticsRouter.get('/snapshot', asyncHandler(getSnapshot));

// Index benchmark series (NIFTY 50 + Sensex), rebased to 100.
analyticsRouter.get('/benchmark', asyncHandler(getBenchmark));

// Risk metrics (volatility, Sharpe, max drawdown, beta).
analyticsRouter.get('/risk', asyncHandler(getRisk));

// AI Insights — read latest cached, force/generate. Budget surface stays
// ungated (it's just a spend readout, not a feature).
analyticsRouter.get('/insights', requireFeature('AI_INSIGHTS'), asyncHandler(getInsightsLatest));
analyticsRouter.post('/insights/generate', requireFeature('AI_INSIGHTS'), asyncHandler(generateInsights));
analyticsRouter.get('/insights/spend', asyncHandler(getInsightsSpend));

// Deterministic (non-LLM, no cost, always-current) rule-based insight cards —
// additive alongside the LLM insights above, not a replacement. Still part
// of the same AI_INSIGHTS feature per the pricing tiers ("AI insights
// (rule-based + LLM)" under Plus).
analyticsRouter.get(
  '/insights/deterministic',
  requireFeature('AI_INSIGHTS'),
  asyncHandler(getDeterministicInsights),
);

// Phase 2g — MF direct/regular + portfolio overlap.
analyticsRouter.get('/mf-overlap', asyncHandler(getMfOverlapHandler));

// 3c — what-if sale simulator (read-only).
analyticsRouter.post('/what-if', asyncHandler(postWhatIf));
