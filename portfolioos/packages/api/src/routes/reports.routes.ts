import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  getSummary,
  getIntraday,
  getStcg,
  getLtcg,
  get112A,
  getIncome,
  getUnrealised,
  getXirr,
  getUserXirr,
  getHistoricalValuation,
  rebuildCapitalGains,
} from '../controllers/reports.controller.js';

export const reportsRouter = Router();

reportsRouter.use(authenticate);
reportsRouter.get('/summary', asyncHandler(getSummary));
reportsRouter.get('/intraday', asyncHandler(getIntraday));
reportsRouter.get('/stcg', asyncHandler(getStcg));
reportsRouter.get('/ltcg', asyncHandler(getLtcg));
reportsRouter.get('/schedule-112a', asyncHandler(get112A));
reportsRouter.get('/income', asyncHandler(getIncome));
reportsRouter.get('/unrealised', asyncHandler(getUnrealised));
reportsRouter.get('/xirr', asyncHandler(getXirr));
reportsRouter.get('/xirr/user', asyncHandler(getUserXirr));
reportsRouter.get('/historical-valuation', asyncHandler(getHistoricalValuation));
reportsRouter.post('/rebuild-capital-gains', asyncHandler(rebuildCapitalGains));
