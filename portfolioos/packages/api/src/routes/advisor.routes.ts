import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireFeature } from '../middleware/requirePlan.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  getRiskProfile,
  postRiskProfile,
  getAllocation,
  listRecommendations,
  getRecommendation,
  postRegenerate,
  patchRecommendationStatus,
  getProse,
  postProse,
  listApprovedProducts,
  postApprovedProduct,
  deleteApprovedProduct,
  putApprovedProductOrder,
  listModelPortfolios,
  putModelPortfolioTargets,
  getRuns,
  getLlmStatus,
} from '../controllers/advisor.controller.js';

export const advisorRouter = Router();
advisorRouter.use(authenticate);
advisorRouter.use(requireFeature('ADVICE_ENGINE'));

// Risk profile — the questionnaire that everything downstream depends on.
advisorRouter.get('/risk-profile', asyncHandler(getRiskProfile));
advisorRouter.post('/risk-profile', asyncHandler(postRiskProfile));

// Current vs target allocation, with the drift the rebalance rule sees.
advisorRouter.get('/allocation', asyncHandler(getAllocation));

// Engine runs. `/regenerate` is the user-facing "refresh my advice" button;
// `/runs` is the audit trail of every execution, including empty ones.
advisorRouter.post('/regenerate', asyncHandler(postRegenerate));
advisorRouter.get('/runs', asyncHandler(getRuns));

// Whether the optional narration layer is available at all. Declared before
// the `/recommendations/:id` routes only for readability — the paths do not
// overlap.
advisorRouter.get('/llm-status', asyncHandler(getLlmStatus));

// Recommendations.
advisorRouter.get('/recommendations', asyncHandler(listRecommendations));
advisorRouter.get('/recommendations/:id', asyncHandler(getRecommendation));
advisorRouter.patch('/recommendations/:id/status', asyncHandler(patchRecommendationStatus));
// GET reads whatever narration is already stored and never spends; POST is the
// only path that can call the model.
advisorRouter.get('/recommendations/:id/prose', asyncHandler(getProse));
advisorRouter.post('/recommendations/:id/prose', asyncHandler(postProse));

// Adviser-curated buy-side universe.
advisorRouter.get('/approved-products', asyncHandler(listApprovedProducts));
advisorRouter.post('/approved-products', asyncHandler(postApprovedProduct));
advisorRouter.put('/approved-products/order', asyncHandler(putApprovedProductOrder));
advisorRouter.delete('/approved-products/:id', asyncHandler(deleteApprovedProduct));

// Model portfolios. Editing targets is a PUT that inserts a new version rather
// than mutating the current one, so the URL addresses the portfolio, not a
// version.
advisorRouter.get('/model-portfolios', asyncHandler(listModelPortfolios));
advisorRouter.put('/model-portfolios/:id/targets', asyncHandler(putModelPortfolioTargets));
