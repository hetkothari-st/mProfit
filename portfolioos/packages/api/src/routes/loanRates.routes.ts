import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { listLoanRatesHandler } from '../controllers/loanRates.controller.js';

/** Indicative market rates: readable by any signed-in user (spec s8); writes live under /api/admin/loan-rates. */
export const loanRatesRouter = Router();
loanRatesRouter.use(authenticate);
loanRatesRouter.get('/', asyncHandler(listLoanRatesHandler));
