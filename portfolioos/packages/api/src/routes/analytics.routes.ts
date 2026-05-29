import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  getSnapshot,
  getBenchmark,
  getRisk,
  getInsightsLatest,
  generateInsights,
  getInsightsSpend,
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

// AI Insights — read latest cached, force/generate, and budget surface.
analyticsRouter.get('/insights', asyncHandler(getInsightsLatest));
analyticsRouter.post('/insights/generate', asyncHandler(generateInsights));
analyticsRouter.get('/insights/spend', asyncHandler(getInsightsSpend));

// Phase 2g — MF direct/regular + portfolio overlap.
analyticsRouter.get('/mf-overlap', asyncHandler(getMfOverlapHandler));

// 3c — what-if sale simulator (read-only).
analyticsRouter.post('/what-if', asyncHandler(postWhatIf));
