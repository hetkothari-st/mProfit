import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireFeature } from '../middleware/requirePlan.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  getTaxSummary,
  getUserStcg,
  getUserLtcg,
  getUserIntraday,
  getUserSchedule112A,
  getUserSchedule112,
  getUserIncome,
  getUserSchedule43,
  getTaxHarvest,
  downloadSchedule112ACsv,
  getAvailableFys,
  downloadCapitalGainsTaxReport,
} from '../controllers/tax.controller.js';
import {
  getTaxGrandfathering,
  getFmvOverrides,
  putFmvOverride,
  deleteFmvOverride,
  downloadGrandfatheringCsv,
} from '../controllers/fmv.controller.js';

export const taxRouter = Router();
taxRouter.use(authenticate);

taxRouter.get('/available-fys', asyncHandler(getAvailableFys));
taxRouter.get('/summary', asyncHandler(getTaxSummary));
taxRouter.get('/stcg', asyncHandler(getUserStcg));
taxRouter.get('/ltcg', asyncHandler(getUserLtcg));
taxRouter.get('/intraday', asyncHandler(getUserIntraday));
taxRouter.get('/schedule-112a', asyncHandler(getUserSchedule112A));
taxRouter.get('/schedule-112', asyncHandler(getUserSchedule112));
taxRouter.get('/schedule-43', requireFeature('FNO_SCHEDULE_43'), asyncHandler(getUserSchedule43));
taxRouter.get('/income', asyncHandler(getUserIncome));
taxRouter.get('/harvest', asyncHandler(getTaxHarvest));
taxRouter.get('/schedule-112a.csv', asyncHandler(downloadSchedule112ACsv));
taxRouter.get('/capital-gains-report', asyncHandler(downloadCapitalGainsTaxReport));
taxRouter.get('/grandfathering', asyncHandler(getTaxGrandfathering));
taxRouter.get('/fmv-overrides', asyncHandler(getFmvOverrides));
taxRouter.put('/fmv-overrides/:isin', asyncHandler(putFmvOverride));
taxRouter.delete('/fmv-overrides/:isin', asyncHandler(deleteFmvOverride));
taxRouter.get('/grandfathering.csv', asyncHandler(downloadGrandfatheringCsv));
