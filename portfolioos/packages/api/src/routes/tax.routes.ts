import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
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
} from '../controllers/tax.controller.js';

export const taxRouter = Router();
taxRouter.use(authenticate);

taxRouter.get('/summary', asyncHandler(getTaxSummary));
taxRouter.get('/stcg', asyncHandler(getUserStcg));
taxRouter.get('/ltcg', asyncHandler(getUserLtcg));
taxRouter.get('/intraday', asyncHandler(getUserIntraday));
taxRouter.get('/schedule-112a', asyncHandler(getUserSchedule112A));
taxRouter.get('/schedule-112', asyncHandler(getUserSchedule112));
taxRouter.get('/schedule-43', asyncHandler(getUserSchedule43));
taxRouter.get('/income', asyncHandler(getUserIncome));
taxRouter.get('/harvest', asyncHandler(getTaxHarvest));
taxRouter.get('/schedule-112a.csv', asyncHandler(downloadSchedule112ACsv));
